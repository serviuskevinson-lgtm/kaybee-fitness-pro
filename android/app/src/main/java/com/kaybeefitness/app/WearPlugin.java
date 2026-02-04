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
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

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
    private ValueEventListener firebaseListener;
    
    // --- VARIABLE ANTI-YOYO ---
    private long lastFirebaseSteps = 0; 

    private SharedPreferences prefs;
    private static final String PREF_NAME = "KaybeePhoneSteps";
    private static final String KEY_OFFSET = "day_offset_steps";
    private static final String KEY_DATE = "last_step_date";
    private static final String KEY_WATCH_ACTIVE = "watch_app_active"; // Nouvelle clé

    @Override
    public void load() {
        super.load();
        
        try {
            if (FirebaseApp.getApps(getContext()).isEmpty()) {
                FirebaseApp.initializeApp(getContext());
            }
            firebaseDb = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/").getReference();
        } catch (Exception e) {
            Log.e("WearPlugin", "Firebase init error", e);
        }

        prefs = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        
        Wearable.getMessageClient(getContext()).addListener(this);
        checkWatchConnection();
    }

    // --- ÉCOUTE INTELLIGENTE FIREBASE ---
    private void startListeningToFirebase() {
        if (currentUserId == null || firebaseDb == null || firebaseListener != null) return;

        firebaseListener = new ValueEventListener() {
            @Override
            public void onDataChange(DataSnapshot snapshot) {
                try {
                    Object stepsVal = snapshot.child("steps").getValue();
                    if (stepsVal != null) {
                        lastFirebaseSteps = ((Number) stepsVal).longValue();
                    }

                    Object heartVal = snapshot.child("heart_rate").getValue();
                    JSObject ret = new JSObject();
                    if (stepsVal != null) ret.put("steps", stepsVal);
                    if (heartVal != null) ret.put("heart_rate", heartVal);
                    
                    notifyListeners("onHealthUpdate", ret);
                } catch (Exception e) { Log.e("WearPlugin", "Parse Error", e); }
            }

            @Override
            public void onCancelled(DatabaseError error) {}
        };

        firebaseDb.child("users").child(currentUserId).child("live_data")
                  .addValueEventListener(firebaseListener);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        // Le téléphone continue de compter si la montre n'est pas "Active" (jumelée avec l'app)
        if (isWatchConnected) return; 
        
        if (event.sensor.getType() == Sensor.TYPE_STEP_COUNTER) {
            long rawSensorSteps = (long) event.values[0];
            long todaySteps = calculateDailySteps(rawSensorSteps);
            syncPhoneStepsToFirebase(todaySteps);
        }
    }

    private void syncPhoneStepsToFirebase(long steps) {
        if (currentUserId == null || firebaseDb == null || isWatchConnected) return;

        if (steps < lastFirebaseSteps && lastFirebaseSteps > 100) {
            Log.d("WearPlugin", "⛔ Ignoré: Téléphone (" + steps + ") < Firebase (" + lastFirebaseSteps + ")");
            return;
        }

        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
        Map<String, Object> updates = new HashMap<>();
        updates.put("steps", steps);
        updates.put("source", "phone");
        updates.put("date", today);
        updates.put("last_update", System.currentTimeMillis());

        firebaseDb.child("users").child(currentUserId).child("live_data").updateChildren(updates);
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

    private void startPhoneStepCounting() {
        if (stepCounterSensor != null && !isWatchConnected) {
            sensorManager.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_NORMAL);
        }
    }

    private void stopPhoneStepCounting() {
        if (sensorManager != null) {
            sensorManager.unregisterListener(this);
        }
    }

    private void checkWatchConnection() {
        Wearable.getNodeClient(getContext()).getConnectedNodes()
            .addOnSuccessListener(nodes -> {
                boolean hasNodes = !nodes.isEmpty();
                boolean isAppPaired = prefs.getBoolean(KEY_WATCH_ACTIVE, false);
                
                // On ne considère la montre "Connectée" que si elle est là ET jumelée
                isWatchConnected = hasNodes && isAppPaired;
                
                if (isWatchConnected) {
                    stopPhoneStepCounting();
                } else if (currentUserId != null) {
                    startPhoneStepCounting();
                }
            });
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        // Si on reçoit un message de la montre, c'est qu'elle est active !
        if (!prefs.getBoolean(KEY_WATCH_ACTIVE, false)) {
            prefs.edit().putBoolean(KEY_WATCH_ACTIVE, true).apply();
        }

        if (!isWatchConnected) {
            isWatchConnected = true;
            stopPhoneStepCounting();
        }
        
        String path = messageEvent.getPath();
        if (path.equals("/request-pair")) {
            if (this.currentUserId != null) replyWithUserId(messageEvent.getSourceNodeId());
            else notifyListeners("onRequestPair", new JSObject());
        }
    }

    @PluginMethod
    public void setUserId(PluginCall call) {
        this.currentUserId = call.getString("userId");
        call.resolve();
        checkWatchConnection();
        startListeningToFirebase();
    }

    @PluginMethod
    public void pairWatch(PluginCall call) {
        String userId = call.getString("userId");
        if (userId == null) { call.reject("ID requis"); return; }
        this.currentUserId = userId; 
        
        // Marquer la montre comme active lors du jumelage
        prefs.edit().putBoolean(KEY_WATCH_ACTIVE, true).apply();
        isWatchConnected = true;
        stopPhoneStepCounting();
        
        startListeningToFirebase();
        
        JSObject data = new JSObject();
        data.put("userId", userId);
        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(getContext())
                            .sendMessage(node.getId(), "/pair", data.toString().getBytes()));
                }
                call.resolve();
            } catch (Exception e) { call.reject(e.getMessage()); }
        }).start();
    }
    
    private void replyWithUserId(String nodeId) {
        JSObject data = new JSObject();
        data.put("userId", this.currentUserId);
        new Thread(() -> {
            try {
                Tasks.await(Wearable.getMessageClient(getContext())
                        .sendMessage(nodeId, "/pair", data.toString().getBytes()));
            } catch (Exception e) {}
        }).start();
    }

    @PluginMethod
    public void sendDataToWatch(PluginCall call) {
        String path = call.getString("path");
        String data = call.getString("data");
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

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
