package com.kaybeefitness.app.services;

import android.util.Log;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;
import com.google.firebase.FirebaseApp;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;

public class KaybeeWearableListenerService extends WearableListenerService {
    private static final String TAG = "WearableListener";
    private DatabaseReference firebaseDb;

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this);
            }
            firebaseDb = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/").getReference();
        } catch (Exception e) {
            Log.e(TAG, "Firebase init failed in service", e);
        }
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (messageEvent.getPath().equals("/health-data")) {
            byte[] data = messageEvent.getData();
            processHealthData(new String(data));
        }
    }

    private void processHealthData(String dataString) {
        try {
            JSONObject json = new JSONObject(dataString);
            String userId = getSharedPreferences("KaybeePhoneSteps", MODE_PRIVATE).getString("userId", null);
            
            if (userId != null && firebaseDb != null) {
                Map<String, Object> updates = new HashMap<>();
                
                // POINT 4 FIX : ON NE PREND PLUS LES STEPS DE LA MONTRE
                // On garde uniquement le rythme cardiaque de la montre
                if (json.has("heart_rate")) {
                    updates.put("heart_rate", json.getInt("heart_rate"));
                    updates.put("source", "watch_background");
                    updates.put("last_update", System.currentTimeMillis());
                    firebaseDb.child("users").child(userId).child("live_data").updateChildren(updates);
                    Log.d(TAG, "Heart rate synced from watch (Steps ignored as per request)");
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing background health data", e);
        }
    }
}
