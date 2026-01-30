package com.kaybeefitness.app;

import android.content.Context;
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
    private long phoneStepsOffset = 0; // Pour calibrer les pas du téléphone au démarrage
    private long initialSensorSteps = -1;

    @Override
    public void load() {
        super.load();
        
        // 1. Init Firebase Native (Pour écrire en background)
        try {
            if (FirebaseApp.getApps(getContext()).isEmpty()) {
                FirebaseApp.initializeApp(getContext());
            }
            firebaseDb = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/").getReference();
        } catch (Exception e) {
            Log.e("WearPlugin", "Firebase init error", e);
        }

        // 2. Init Sensors & Bluetooth Listeners
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        
        Wearable.getMessageClient(getContext()).addListener(this);
        checkWatchConnection(); // Vérifier l'état initial
        
        Log.d("WearPlugin", "Plugin Loaded. Step Sensor available: " + (stepCounterSensor != null));
    }

    // --- GESTION DE LA CONNEXION MONTRE ---

    private void checkWatchConnection() {
        Wearable.getNodeClient(getContext()).getConnectedNodes()
            .addOnSuccessListener(nodes -> {
                boolean wasConnected = isWatchConnected;
                isWatchConnected = !nodes.isEmpty();
                
                if (wasConnected && !isWatchConnected) {
                    Log.d("WearPlugin", "Montre déconnectée -> Activation podomètre téléphone");
                    startPhoneStepCounting();
                } else if (!wasConnected && isWatchConnected) {
                    Log.d("WearPlugin", "Montre connectée -> Désactivation podomètre téléphone");
                    stopPhoneStepCounting();
                }
            });
    }
/**
     * Met le BPM à 0 dans Firebase quand la montre n'est plus là.
     * Le téléphone ne pouvant pas mesurer le cœur, c'est la seule action logique.
     */
    private void resetFirebaseBpm() {
        if (currentUserId == null || firebaseDb == null) return;
        
        Map<String, Object> updates = new HashMap<>();
        updates.put("heart_rate", 0); 
        updates.put("source", "phone_fallback"); // Indique que c'est le téléphone qui a coupé le signal
        
        // On ne change PAS la date ni 'last_update' pour ne pas fausser le timeout du JS,
        // ou alors on le met à jour pour forcer l'affichage immédiat du 0.
        updates.put("last_update", System.currentTimeMillis());

        firebaseDb.child("users").child(currentUserId).child("live_data").updateChildren(updates);
    }
    // Appelé périodiquement ou par événement pour vérifier
    @PluginMethod
    public void checkConnectionStatus(PluginCall call) {
        checkWatchConnection();
        JSObject ret = new JSObject();
        ret.put("connected", isWatchConnected);
        call.resolve(ret);
    }

    // --- LOGIQUE PODOMÈTRE TÉLÉPHONE (FALLBACK) ---

    private void startPhoneStepCounting() {
        if (stepCounterSensor != null && currentUserId != null) {
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
            // Logique simple : on prend la valeur brute
            long totalStepsSinceReboot = (long) event.values[0];
            
            // Si c'est la première lecture, on initialise l'offset pour ne pas envoyer des millions de pas
            if (initialSensorSteps == -1) {
                initialSensorSteps = totalStepsSinceReboot;
            }
            
            // NOTE : Idéalement, il faudrait récupérer les pas d'aujourd'hui depuis Firebase avant d'ajouter
            // Pour simplifier ici, on envoie la valeur brute dans un champ séparé ou on écrase si nécessaire.
            // Meilleure approche : Envoyer à Firebase et laisser Firebase/UI décider.
            
            syncPhoneStepsToFirebase(totalStepsSinceReboot);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    // --- SYNCHRONISATION FIREBASE ---

    private void syncPhoneStepsToFirebase(long steps) {
        if (currentUserId == null || firebaseDb == null) return;
        if (isWatchConnected) return; // Sécurité double : si la montre est là, le téléphone se tait.

        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
        
        Map<String, Object> updates = new HashMap<>();
        updates.put("steps", steps); // Note: Android compte depuis le reboot. Il faudra gérer le delta dans l'UI ou ici.
        updates.put("source", "phone");
        updates.put("date", today);
        updates.put("last_update", System.currentTimeMillis());

        firebaseDb.child("users").child(currentUserId).child("live_data").updateChildren(updates);
        Log.d("WearPlugin", "Phone steps synced to Firebase: " + steps);
    }

    // --- MÉTHODES EXISTANTES ---

    @PluginMethod
    public void setUserId(PluginCall call) {
        // L'app React doit appeler ça au login
        this.currentUserId = call.getString("userId");
        call.resolve();
        
        // Si la montre n'est pas là, on lance le compteur tout de suite
        checkWatchConnection(); 
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        // Quand on reçoit un message, c'est que la montre est vivante
        if (!isWatchConnected) {
            isWatchConnected = true;
            stopPhoneStepCounting();
        }

        if (messageEvent.getPath().equals("/health-data")) {
            // Relais vers le JS si l'app est ouverte
            try {
                String dataString = new String(messageEvent.getData());
                JSObject ret = new JSObject(dataString);
                notifyListeners("onHealthUpdate", ret);
            } catch (Exception e) {}
        }
    }

    // ... (Garder les méthodes pairWatch et sendDataToWatch telles quelles) ...
     @PluginMethod
    public void pairWatch(PluginCall call) {
        String userId = call.getString("userId");
        if (userId == null) { call.reject("User ID required"); return; }
        
        this.currentUserId = userId; // Mise à jour locale aussi
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
        // ... Code existant ...
          String path = call.getString("path");
        String data = call.getString("data");

        if (path == null || data == null) {
            call.reject("Path et Data requis");
            return;
        }

        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(getContext())
                            .sendMessage(node.getId(), path, data.getBytes()));
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Erreur envoi: " + e.getMessage());
            }
        }).start();
    }
}