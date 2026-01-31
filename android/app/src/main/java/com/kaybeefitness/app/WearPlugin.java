package com.kaybeefitness.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import com.google.firebase.FirebaseApp;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@CapacitorPlugin(name = "WearPlugin")
public class WearPlugin extends Plugin implements MessageClient.OnMessageReceivedListener, SensorEventListener {

    private DatabaseReference firebaseDb;
    private SensorManager sensorManager;
    private Sensor stepCounterSensor;
    
    private String currentUserId = null;
    private boolean isWatchConnected = false;
    
    // Pour la logique de calcul journalier
    private SharedPreferences prefs;
    private static final String PREF_NAME = "KaybeePhoneSteps";
    private static final String KEY_OFFSET = "day_offset_steps";
    private static final String KEY_DATE = "last_step_date";
    private static final String KEY_USER_ID = "userId";

    @Override
    public void load() {
        super.load();
        
        // 1. Init Firebase
        try {
            if (FirebaseApp.getApps(getContext()).isEmpty()) {
                FirebaseApp.initializeApp(getContext());
            }
            firebaseDb = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/").getReference();
        } catch (Exception e) {
            Log.e("WearPlugin", "Firebase init error", e);
        }

        // 2. Init SharedPreferences pour sauvegarder les pas
        prefs = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        this.currentUserId = prefs.getString(KEY_USER_ID, null);

        // 3. Init Capteurs
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        
        Wearable.getMessageClient(getContext()).addListener(this);
        checkWatchConnection();
        
        Log.d("WearPlugin", "Plugin Loaded. Step Sensor available: " + (stepCounterSensor != null));
    }

    // --- MESSAGERIE (C'est ici que la magie opère) ---

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (!isWatchConnected) {
            isWatchConnected = true;
            stopPhoneStepCounting();
        }
        
        String path = messageEvent.getPath();

        // CAS 1 : La montre demande "C'est qui l'utilisateur ?"
        if (path.equals("/request-pair")) {
            if (this.currentUserId != null) {
                // On répond immédiatement
                replyWithUserId(messageEvent.getSourceNodeId());
            } else {
                // On dit au JS qu'il faut se connecter
                notifyListeners("onRequestPair", new JSObject());
            }
        }
        // CAS 2 : Données de session
        else if (path.equals("/start-session")) {
             String dataString = new String(messageEvent.getData());
             JSObject ret = new JSObject();
             ret.put("sessionData", dataString); 
             notifyListeners("onSessionStart", ret);
        }
        // CAS 3 : Données Santé
        else if (path.equals("/health-data")) {
            try {
                String dataString = new String(messageEvent.getData());
                JSObject ret = new JSObject(dataString);
                notifyListeners("onHealthUpdate", ret);
            } catch (Exception e) {}
        }
    }

    // Petite fonction d'aide pour répondre à la montre
    private void replyWithUserId(String nodeId) {
        JSObject data = new JSObject();
        data.put("userId", this.currentUserId);
        String dataString = data.toString();

        new Thread(() -> {
            try {
                Tasks.await(Wearable.getMessageClient(getContext())
                        .sendMessage(nodeId, "/pair", dataString.getBytes()));
                Log.d("WearPlugin", "Auto-paired sent to watch: " + this.currentUserId);
            } catch (Exception e) { Log.e("WearPlugin", "Pair error", e); }
        }).start();
    }

    // --- LOGIQUE PODOMÈTRE TÉLÉPHONE ---

    private void startPhoneStepCounting() {
        if (stepCounterSensor != null) {
            sensorManager.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_NORMAL);
        }
    }

    private void stopPhoneStepCounting() {
        if (sensorManager != null) {
            sensorManager.unregisterListener(this);
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_STEP_COUNTER) {
            long rawSensorSteps = (long) event.values[0];
            long todaySteps = calculateDailySteps(rawSensorSteps);
            syncPhoneStepsToFirebase(todaySteps);
        }
    }

    private long calculateDailySteps(long rawSteps) {
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
        String savedDate = prefs.getString(KEY_DATE, "");
        long offset = prefs.getLong(KEY_OFFSET, -1);

        if (!today.equals(savedDate) || offset == -1) {
            offset = rawSteps;
            prefs.edit().putString(KEY_DATE, today).putLong(KEY_OFFSET, rawSteps).apply();
            return 0;
        }
        if (rawSteps < offset) {
            offset = rawSteps; 
            prefs.edit().putLong(KEY_OFFSET, offset).apply();
            return 0;
        }
        return rawSteps - offset;
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    // --- FIREBASE SYNC ---

    private void syncPhoneStepsToFirebase(long steps) {
        if (currentUserId == null || firebaseDb == null) return;
        if (isWatchConnected) return; 

        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
        Map<String, Object> updates = new HashMap<>();
        updates.put("steps", steps);
        updates.put("source", "phone");
        updates.put("date", today);
        updates.put("last_update", System.currentTimeMillis());

        firebaseDb.child("users").child(currentUserId).child("live_data").updateChildren(updates);
    }

    // --- GESTION CONNEXION ---

    private void checkWatchConnection() {
        Wearable.getNodeClient(getContext()).getConnectedNodes()
            .addOnSuccessListener(nodes -> {
                boolean wasConnected = isWatchConnected;
                isWatchConnected = !nodes.isEmpty();
                
                if (wasConnected && !isWatchConnected) {
                    startPhoneStepCounting();
                    resetFirebaseBpm();
                } else if (!wasConnected && isWatchConnected) {
                    stopPhoneStepCounting();
                } else if (!isWatchConnected && currentUserId != null) {
                    startPhoneStepCounting();
                }
            });
    }

    private void resetFirebaseBpm() {
        if (currentUserId == null || firebaseDb == null) return;
        Map<String, Object> updates = new HashMap<>();
        updates.put("heart_rate", 0); 
        updates.put("source", "phone_fallback");
        firebaseDb.child("users").child(currentUserId).child("live_data").updateChildren(updates);
    }

    // --- EXPORTS POUR JS ---

    @PluginMethod
    public void setUserId(PluginCall call) {
        String userId = call.getString("userId");
        if (userId != null) {
            this.currentUserId = userId;
            prefs.edit().putString(KEY_USER_ID, userId).apply();
        }
        call.resolve();
        checkWatchConnection(); 
    }
    
    @PluginMethod
    public void pairWatch(PluginCall call) {
        String userId = call.getString("userId");
        if (userId == null) { call.reject("User ID required"); return; }
        
        this.currentUserId = userId; 
        prefs.edit().putString(KEY_USER_ID, userId).apply();
        
        JSObject data = new JSObject();
        data.put("userId", userId);
        String dataString = data.toString();

        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                if (nodes.isEmpty()) { call.reject("No watch"); return; }
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(getContext())
                            .sendMessage(node.getId(), "/pair", dataString.getBytes()));
                }
                call.resolve();
            } catch (Exception e) { call.reject(e.getMessage()); }
        }).start();
    }
    
    @PluginMethod
    public void sendDataToWatch(PluginCall call) {
        String path = call.getString("path");
        String data = call.getString("data");
        if (path == null || data == null) { call.reject("Args missing"); return; }

        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(getContext())
                            .sendMessage(node.getId(), path, data.getBytes()));
                }
                call.resolve();
            } catch (Exception e) { call.reject(e.getMessage()); }
        }).start();
    }
}
