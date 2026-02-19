package com.kaybeefitness.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.time.Instant;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.time.ZoneId;

import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.records.ExerciseSessionRecord;
import androidx.health.connect.client.records.ExerciseRoute;
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord;
import androidx.health.connect.client.records.DistanceRecord;
import androidx.health.connect.client.records.StepsRecord;
import androidx.health.connect.client.records.HeartRateRecord;
import androidx.health.connect.client.records.MindfulnessSessionRecord;
import androidx.health.connect.client.records.SkinTemperatureRecord;
import androidx.health.connect.client.records.SleepSessionRecord;
import androidx.health.connect.client.records.metadata.Metadata;
import androidx.health.connect.client.request.ReadRecordsRequest;
import androidx.health.connect.client.time.TimeRangeFilter;
import androidx.health.connect.client.units.Length;
import androidx.health.connect.client.units.Energy;
import androidx.health.connect.client.units.Temperature;

@CapacitorPlugin(
    name = "WearPlugin",
    permissions = {
        @Permission(
            alias = "activity",
            strings = { Manifest.permission.ACTIVITY_RECOGNITION }
        )
    }
)
public class WearPlugin extends Plugin implements MessageClient.OnMessageReceivedListener, SensorEventListener {

    private DatabaseReference firebaseDb;
    private SensorManager sensorManager;
    private Sensor stepCounterSensor;
    
    private String currentUserId = null;
    private boolean isWatchConnected = false;
    private ValueEventListener firebaseListener;
    
    private long lastFirebaseSteps = 0;
    private String firebaseDate = "";

    private SharedPreferences prefs;
    private static final String PREF_NAME = "KaybeePhoneSteps";
    private static final String KEY_OFFSET = "day_offset_steps";
    private static final String KEY_DATE = "last_step_date";
    private static final String KEY_WATCH_ACTIVE = "watch_app_active";

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

    private void startListeningToFirebase() {
        if (currentUserId == null || firebaseDb == null || firebaseListener != null) return;

        firebaseListener = new ValueEventListener() {
            @Override
            public void onDataChange(DataSnapshot snapshot) {
                try {
                    firebaseDate = snapshot.child("date").getValue(String.class);
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
        if (event.sensor.getType() == Sensor.TYPE_STEP_COUNTER) {
            long rawSensorSteps = (long) event.values[0];
            long todaySteps = calculateDailySteps(rawSensorSteps);
            syncPhoneStepsToFirebase(todaySteps);
        }
    }

    private void syncPhoneStepsToFirebase(long steps) {
        if (currentUserId == null || firebaseDb == null) return;

        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
        boolean isNewDay = !today.equals(firebaseDate);
        
        if (!isNewDay && steps <= lastFirebaseSteps && lastFirebaseSteps > 0) {
            return; 
        }

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
        if (stepCounterSensor != null) {
            sensorManager.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_UI);
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
                isWatchConnected = !nodes.isEmpty() && prefs.getBoolean(KEY_WATCH_ACTIVE, false);
                startPhoneStepCounting();
            });
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (!prefs.getBoolean(KEY_WATCH_ACTIVE, false)) {
            prefs.edit().putBoolean(KEY_WATCH_ACTIVE, true).apply();
        }
        isWatchConnected = true;
        
        String path = messageEvent.getPath();
        if (path.equals("/request-pair")) {
            if (this.currentUserId != null) replyWithUserId(messageEvent.getSourceNodeId());
            else notifyListeners("onRequestPair", new JSObject());
        }
    }

    @PluginMethod
    public void setUserId(PluginCall call) {
        this.currentUserId = call.getString("userId");
        checkWatchConnection();
        startListeningToFirebase();
        call.resolve();
    }

    @PluginMethod
    public void pairWatch(PluginCall call) {
        String userId = call.getString("userId");
        if (userId == null) { call.reject("ID requis"); return; }
        this.currentUserId = userId; 
        prefs.edit().putBoolean(KEY_WATCH_ACTIVE, true).apply();
        isWatchConnected = true;
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

    @PluginMethod
    public void writeRunToHealthConnect(PluginCall call) {
        if (HealthConnectClient.getSdkStatus(getContext(), "com.google.android.apps.healthdata") != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("Health Connect non disponible");
            return;
        }

        HealthConnectClient client = HealthConnectClient.getOrCreate(getContext());
        
        try {
            String startTimeStr = call.getString("startTime");
            String endTimeStr = call.getString("endTime");
            double distanceKm = call.getDouble("distance", 0.0);
            double calories = call.getDouble("calories", 0.0);
            JSArray routeArray = call.getArray("route");

            Instant start = Instant.parse(startTimeStr);
            Instant end = Instant.parse(endTimeStr);

            List<ExerciseRoute.Location> locations = new ArrayList<>();
            if (routeArray != null) {
                for (int i = 0; i < routeArray.length(); i++) {
                    JSObject point = routeArray.getObject(i);
                    locations.add(new ExerciseRoute.Location(
                        Instant.ofEpochMilli(point.getLong("timestamp")),
                        point.getDouble("lat"),
                        point.getDouble("lng"),
                        point.getDouble("altitude", null),
                        null,
                        null
                    ));
                }
            }

            ExerciseRoute route = null;
            if (!locations.isEmpty()) {
                route = new ExerciseRoute(locations);
            }

            ExerciseSessionRecord session = new ExerciseSessionRecord(
                start,
                null, 
                end,
                null,
                ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
                "Kaybee Run",
                null,
                Metadata.EMPTY,
                route
            );

            TotalCaloriesBurnedRecord caloriesRecord = new TotalCaloriesBurnedRecord(
                start,
                null,
                end,
                null,
                Energy.kilocalories(calories),
                Metadata.EMPTY
            );

            DistanceRecord distanceRecord = new DistanceRecord(
                start,
                null,
                end,
                null,
                Length.kilometers(distanceKm),
                Metadata.EMPTY
            );

            new Thread(() -> {
                try {
                    Tasks.await(client.insertRecords(Arrays.asList(session, caloriesRecord, distanceRecord)));
                    call.resolve();
                } catch (Exception e) {
                    call.reject(e.getMessage());
                }
            }).start();

        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void writeHealthData(PluginCall call) {
        HealthConnectClient client = HealthConnectClient.getOrCreate(getContext());
        try {
            String type = call.getString("type");
            Instant now = Instant.now();
            
            if ("steps".equals(type)) {
                long count = call.getLong("value", 0L);
                StepsRecord record = new StepsRecord(now.minus(Duration.ofMinutes(1)), null, now, null, count, Metadata.EMPTY);
                new Thread(() -> {
                    try { Tasks.await(client.insertRecords(Collections.singletonList(record))); call.resolve(); }
                    catch (Exception e) { call.reject(e.getMessage()); }
                }).start();
            } else if ("mindfulness".equals(type)) {
                MindfulnessSessionRecord record = new MindfulnessSessionRecord(now.minus(Duration.ofMinutes(10)), null, now, null, MindfulnessSessionRecord.MINDFULNESS_SESSION_TYPE_MEDITATION, "Méditation Kaybee", null, Metadata.EMPTY);
                new Thread(() -> {
                    try { Tasks.await(client.insertRecords(Collections.singletonList(record))); call.resolve(); }
                    catch (Exception e) { call.reject(e.getMessage()); }
                }).start();
            } else if ("skin_temperature".equals(type)) {
                double temp = call.getDouble("value", 36.6);
                SkinTemperatureRecord record = new SkinTemperatureRecord(now, null, Temperature.celsius(temp), SkinTemperatureRecord.MEASUREMENT_LOCATION_WRIST, Metadata.EMPTY);
                new Thread(() -> {
                    try { Tasks.await(client.insertRecords(Collections.singletonList(record))); call.resolve(); }
                    catch (Exception e) { call.reject(e.getMessage()); }
                }).start();
            } else if ("sleep".equals(type)) {
                SleepSessionRecord record = new SleepSessionRecord(now.minus(Duration.ofHours(8)), null, now, null, "Sommeil Kaybee", null, Metadata.EMPTY);
                new Thread(() -> {
                    try { Tasks.await(client.insertRecords(Collections.singletonList(record))); call.resolve(); }
                    catch (Exception e) { call.reject(e.getMessage()); }
                }).start();
            }
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void getRunHistory(PluginCall call) {
        if (HealthConnectClient.getSdkStatus(getContext(), "com.google.android.apps.healthdata") != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("Health Connect non disponible");
            return;
        }

        HealthConnectClient client = HealthConnectClient.getOrCreate(getContext());
        
        new Thread(() -> {
            try {
                ReadRecordsRequest<ExerciseSessionRecord> request = new ReadRecordsRequest<>(
                    ExerciseSessionRecord.class,
                    TimeRangeFilter.after(Instant.now().minus(Duration.ofDays(30))),
                    Collections.emptySet(),
                    false
                );
                
                List<ExerciseSessionRecord> records = Tasks.await(client.readRecords(request)).getRecords();
                
                JSArray results = new JSArray();
                for (ExerciseSessionRecord record : records) {
                    if (record.getExerciseType() == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING) {
                        JSObject obj = new JSObject();
                        obj.put("startTime", record.getStartTime().toString());
                        obj.put("endTime", record.getEndTime().toString());
                        obj.put("title", record.getTitle());
                        
                        ExerciseRoute route = record.getExerciseRoute();
                        if (route != null) {
                            JSArray path = new JSArray();
                            for (ExerciseRoute.Location loc : route.getRoute()) {
                                JSObject p = new JSObject();
                                p.put("lat", loc.getLatitude());
                                p.put("lng", loc.getLongitude());
                                p.put("timestamp", loc.getTime().toEpochMilli());
                                path.put(p);
                            }
                            obj.put("route", path);
                        }
                        results.put(obj);
                    }
                }
                
                JSObject ret = new JSObject();
                ret.put("history", results);
                call.resolve(ret);
                
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        }).start();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
