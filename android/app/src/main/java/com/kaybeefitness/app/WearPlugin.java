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
import java.time.ZoneOffset;

import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.records.ExerciseSessionRecord;
import androidx.health.connect.client.records.ExerciseRoute;
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord;
import androidx.health.connect.client.records.DistanceRecord;
import androidx.health.connect.client.records.StepsRecord;
import androidx.health.connect.client.records.MindfulnessSessionRecord;
import androidx.health.connect.client.records.SkinTemperatureRecord;
import androidx.health.connect.client.records.SleepSessionRecord;
import androidx.health.connect.client.records.metadata.Metadata;
import androidx.health.connect.client.request.ReadRecordsRequest;
import androidx.health.connect.client.time.TimeRangeFilter;
import androidx.health.connect.client.units.Length;
import androidx.health.connect.client.units.Energy;
import androidx.health.connect.client.units.Temperature;

import org.json.JSONObject;

import kotlin.coroutines.Continuation;
import kotlin.coroutines.CoroutineContext;
import kotlin.coroutines.EmptyCoroutineContext;
import org.jetbrains.annotations.NotNull;

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
                    try {
                        JSONObject pointJson = routeArray.getJSONObject(i);
                        locations.add(new ExerciseRoute.Location(
                            Instant.ofEpochMilli(pointJson.getLong("timestamp")),
                            pointJson.getDouble("lat"),
                            pointJson.getDouble("lng"),
                            pointJson.isNull("altitude") ? null : Length.meters(pointJson.getDouble("altitude")),
                            null,
                            null
                        ));
                    } catch (Exception e) {
                        Log.e("WearPlugin", "Error parsing route point", e);
                    }
                }
            }

            ExerciseRoute route = null;
            if (!locations.isEmpty()) {
                route = new ExerciseRoute(locations);
            }

            ExerciseSessionRecord session = new ExerciseSessionRecord(
                start,
                ZoneOffset.UTC,
                end,
                ZoneOffset.UTC,
                Metadata.manualEntry(),
                ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
                "Kaybee Run",
                null, // notes
                Collections.emptyList(), // segments
                Collections.emptyList(), // laps
                route, // route
                null // exerciseSessionId
            );

            TotalCaloriesBurnedRecord caloriesRecord = new TotalCaloriesBurnedRecord(
                start,
                ZoneOffset.UTC,
                end,
                ZoneOffset.UTC,
                Energy.kilocalories(calories),
                Metadata.manualEntry()
            );

            DistanceRecord distanceRecord = new DistanceRecord(
                start,
                ZoneOffset.UTC,
                end,
                ZoneOffset.UTC,
                Length.kilometers(distanceKm),
                Metadata.manualEntry()
            );

            new Thread(() -> {
                try {
                    client.insertRecords(Arrays.asList(session, caloriesRecord, distanceRecord), new Continuation<androidx.health.connect.client.response.InsertRecordsResponse>() {
                        @NotNull
                        @Override
                        public CoroutineContext getContext() { return EmptyCoroutineContext.INSTANCE; }
                        @Override
                        public void resumeWith(@NotNull Object o) { call.resolve(); }
                    });
                } catch (Exception e) {
                    call.reject(e.getMessage());
                }
            }).start();

        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    @androidx.health.connect.client.feature.ExperimentalMindfulnessSessionApi
    public void writeHealthData(PluginCall call) {
        HealthConnectClient client = HealthConnectClient.getOrCreate(getContext());
        try {
            String type = call.getString("type");
            Instant now = Instant.now();
            
            if ("steps".equals(type)) {
                long count = call.getLong("value", 0L);
                StepsRecord record = new StepsRecord(now.minus(Duration.ofMinutes(1)), ZoneOffset.UTC, now, ZoneOffset.UTC, count, Metadata.manualEntry());
                new Thread(() -> {
                    try { 
                        client.insertRecords(Collections.singletonList(record), new Continuation<androidx.health.connect.client.response.InsertRecordsResponse>() {
                            @NotNull
                            @Override
                            public CoroutineContext getContext() { return EmptyCoroutineContext.INSTANCE; }
                            @Override
                            public void resumeWith(@NotNull Object o) { call.resolve(); }
                        });
                    } catch (Exception e) { call.reject(e.getMessage()); }
                }).start();
            } else if ("mindfulness".equals(type)) {
                MindfulnessSessionRecord record = new MindfulnessSessionRecord(now.minus(Duration.ofMinutes(10)), ZoneOffset.UTC, now, ZoneOffset.UTC, Metadata.manualEntry(), MindfulnessSessionRecord.MINDFULNESS_SESSION_TYPE_MEDITATION, "Méditation Kaybee", null);
                new Thread(() -> {
                    try { 
                        client.insertRecords(Collections.singletonList(record), new Continuation<androidx.health.connect.client.response.InsertRecordsResponse>() {
                            @NotNull
                            @Override
                            public CoroutineContext getContext() { return EmptyCoroutineContext.INSTANCE; }
                            @Override
                            public void resumeWith(@NotNull Object o) { call.resolve(); }
                        });
                    } catch (Exception e) { call.reject(e.getMessage()); }
                }).start();
            } else if ("skin_temperature".equals(type)) {
                double temp = call.getDouble("value", 36.6);
                SkinTemperatureRecord record = new SkinTemperatureRecord(now, ZoneOffset.UTC, now, ZoneOffset.UTC, Metadata.manualEntry(), Collections.emptyList(), Temperature.celsius(temp), SkinTemperatureRecord.MEASUREMENT_LOCATION_WRIST);
                new Thread(() -> {
                    try { 
                        client.insertRecords(Collections.singletonList(record), new Continuation<androidx.health.connect.client.response.InsertRecordsResponse>() {
                            @NotNull
                            @Override
                            public CoroutineContext getContext() { return EmptyCoroutineContext.INSTANCE; }
                            @Override
                            public void resumeWith(@NotNull Object o) { call.resolve(); }
                        });
                    } catch (Exception e) { call.reject(e.getMessage()); }
                }).start();
            } else if ("sleep".equals(type)) {
                SleepSessionRecord record = new SleepSessionRecord(now.minus(Duration.ofHours(8)), ZoneOffset.UTC, now, ZoneOffset.UTC, Metadata.manualEntry(), "Sommeil Kaybee", null, Collections.emptyList());
                new Thread(() -> {
                    try { 
                        client.insertRecords(Collections.singletonList(record), new Continuation<androidx.health.connect.client.response.InsertRecordsResponse>() {
                            @NotNull
                            @Override
                            public CoroutineContext getContext() { return EmptyCoroutineContext.INSTANCE; }
                            @Override
                            public void resumeWith(@NotNull Object o) { call.resolve(); }
                        });
                    } catch (Exception e) { call.reject(e.getMessage()); }
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
                    kotlin.jvm.JvmClassMappingKt.getKotlinClass(ExerciseSessionRecord.class),
                    TimeRangeFilter.after(Instant.now().minus(Duration.ofDays(30))),
                    Collections.emptySet(),
                    false,
                    1000,
                    null
                );
                
                client.readRecords(request, new Continuation<androidx.health.connect.client.response.ReadRecordsResponse<ExerciseSessionRecord>>() {
                    @NotNull
                    @Override
                    public CoroutineContext getContext() { return EmptyCoroutineContext.INSTANCE; }
                    @Override
                    public void resumeWith(@NotNull Object o) {
                        if (o instanceof androidx.health.connect.client.response.ReadRecordsResponse) {
                            @SuppressWarnings("unchecked")
                            List<ExerciseSessionRecord> records = ((androidx.health.connect.client.response.ReadRecordsResponse<ExerciseSessionRecord>) o).getRecords();
                            JSArray results = new JSArray();
                            for (ExerciseSessionRecord record : records) {
                                if (record.getExerciseType() == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING) {
                                    JSObject obj = new JSObject();
                                    obj.put("startTime", record.getStartTime().toString());
                                    obj.put("endTime", record.getEndTime().toString());
                                    obj.put("title", record.getTitle());
                                    
                                    // Health Connect 1.1.0 changes: getExerciseRoute() might not be directly available or named differently
                                    // Based on documentation, ExerciseSessionRecord has exerciseRoute field or getter.
                                    // In some versions it was getRoute().
                                    results.put(obj);
                                }
                            }
                            JSObject ret = new JSObject();
                            ret.put("history", results);
                            call.resolve(ret);
                        } else {
                            call.reject("Failed to read records");
                        }
                    }
                });
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        }).start();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
