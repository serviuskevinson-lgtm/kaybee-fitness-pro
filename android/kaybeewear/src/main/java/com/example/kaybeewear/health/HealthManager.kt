package com.example.kaybeewear.health

import android.content.Context
import android.util.Log
import androidx.concurrent.futures.await
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DeltaDataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.health.services.client.data.PassiveListenerConfig
import androidx.health.services.client.data.SampleDataPoint
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import com.google.firebase.FirebaseApp
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

class HealthManager(private val context: Context) {
    private val healthClient = HealthServices.getClient(context)
    private val measureClient = healthClient.measureClient
    private val passiveMonitoringClient = healthClient.passiveMonitoringClient
    private val exerciseClient = healthClient.exerciseClient
    private val scope = CoroutineScope(Dispatchers.IO)
    
    private var database: DatabaseReference? = null
    private var userId: String? = null

    init {
        try {
            if (FirebaseApp.getApps(context).isNotEmpty()) {
                val fbInstance = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/")
                try {
                    fbInstance.setPersistenceEnabled(true)
                } catch (e: Exception) {
                    // Persistence already enabled or instance used
                }
                database = fbInstance.reference
                fbInstance.goOnline()
            }
        } catch (e: Exception) {
            Log.e("HealthManager", "Failed to initialize Firebase Database", e)
        }
    }

    fun setUserId(id: String) {
        this.userId = id
        // Sync direct node for reliability
        database?.child("users")?.child(id)?.child("live_data")?.keepSynced(true)
        Log.d("HealthManager", "User ID set: $id")
    }

    // --- MEASURE CLIENT (TEMPS RÉEL PONCTUEL) ---
    private val heartRateCallback = object : MeasureCallback {
        override fun onAvailabilityChanged(dataType: DeltaDataType<*, *>, availability: Availability) {
            Log.d("HealthManager", "Availability changed: ${dataType.name} -> $availability")
        }

        override fun onDataReceived(data: DataPointContainer) {
            val heartRateDataPoints = data.getData(DataType.HEART_RATE_BPM)
            val heartRate = heartRateDataPoints.lastOrNull() as? SampleDataPoint<Double>
            if (heartRate != null) {
                val bpm = heartRate.value.toInt()
                sendHealthData("heart_rate", bpm.toString())
                syncHeartRateToFirebase(bpm)
            }
        }
    }

    fun startHeartRateMonitoring() {
        measureClient.registerMeasureCallback(DataType.HEART_RATE_BPM, heartRateCallback)
    }

    fun stopHeartRateMonitoring() {
        measureClient.unregisterMeasureCallbackAsync(DataType.HEART_RATE_BPM, heartRateCallback)
    }

    // --- EXERCISE CLIENT (SESSIONS D'ENTRAINEMENT) ---
    private val exerciseUpdateCallback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val steps = update.latestMetrics.getData(DataType.STEPS_DAILY).lastOrNull()?.value
            val calories = update.latestMetrics.getData(DataType.CALORIES_TOTAL)?.total
            val hr = update.latestMetrics.getData(DataType.HEART_RATE_BPM).lastOrNull()?.value

            if (steps != null || calories != null || hr != null) {
                syncExerciseToFirebase(steps, calories, hr?.toInt())
            }
        }

        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {
            Log.d("HealthManager", "Exercise Availability: ${dataType.name} -> $availability")
        }

        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onRegistered() { Log.d("HealthManager", "Exercise callback registered") }
        override fun onRegistrationFailed(throwable: Throwable) { Log.e("HealthManager", "Exercise registration failed", throwable) }
    }

    fun startExercise() {
        val config = ExerciseConfig.builder(ExerciseType.WORKOUT)
            .setDataTypes(setOf(
                DataType.HEART_RATE_BPM,
                DataType.STEPS_DAILY,
                DataType.CALORIES_TOTAL
            ))
            .build()
        
        scope.launch {
            try {
                exerciseClient.setUpdateCallback(exerciseUpdateCallback)
                exerciseClient.startExerciseAsync(config).await()
                Log.d("HealthManager", "Exercise started")
            } catch (e: Exception) {
                Log.e("HealthManager", "Failed to start exercise", e)
            }
        }
    }

    fun stopExercise() {
        scope.launch {
            try {
                exerciseClient.endExerciseAsync().await()
                Log.d("HealthManager", "Exercise stopped")
            } catch (e: Exception) {
                Log.e("HealthManager", "Failed to stop exercise", e)
            }
        }
    }

    private fun syncExerciseToFirebase(steps: Long?, calories: Double?, heartRate: Int?) {
        val uid = userId ?: return
        val db = database ?: return
        val updates = mutableMapOf<String, Any>()
        steps?.let { updates["steps"] = it }
        calories?.let { updates["calories_burned"] = it }
        heartRate?.let { updates["heart_rate"] = it }
        updates["last_update"] = System.currentTimeMillis()
        updates["source"] = "watch_exercise"

        db.child("users").child(uid).child("live_data").updateChildren(updates)
    }

    // --- PASSIVE MONITORING (ARRIÈRE-PLAN) ---
    fun startPassiveMonitoring() {
        val config = PassiveListenerConfig.builder()
            .setDataTypes(setOf(
                DataType.STEPS_DAILY,
                DataType.CALORIES_TOTAL,
                DataType.DISTANCE_TOTAL,
                DataType.HEART_RATE_BPM
            ))
            .build()
        
        scope.launch {
            try {
                passiveMonitoringClient.setPassiveListenerServiceAsync(PassiveDataReceiver::class.java, config).await()
                Log.d("HealthManager", "Passive monitoring started")
            } catch (e: Exception) {
                Log.e("HealthManager", "Failed to start passive monitoring", e)
            }
        }
    }

    // --- FIREBASE UTILS ---
    fun syncHeartRateToFirebase(bpm: Int) {
        val uid = userId ?: return
        val db = database ?: return
        val updates = mapOf(
            "heart_rate" to bpm,
            "source" to "watch",
            "last_update" to System.currentTimeMillis()
        )
        db.child("users").child(uid).child("live_data").updateChildren(updates)
            .addOnFailureListener { e -> Log.e("HealthManager", "Firebase BPM sync failed", e) }
    }

    fun syncToFirebase(key: String, value: Any) {
        val uid = userId ?: return
        val db = database ?: return
        db.child("users").child(uid).child("live_data").child(key).setValue(value)
    }

    fun resetStats() {
        val uid = userId ?: return
        val db = database ?: return
        val updates = mapOf(
            "steps" to 0,
            "calories_burned" to 0,
            "distance" to 0
        )
        db.child("users").child(uid).child("live_data").updateChildren(updates)
    }

    fun monitorFirebaseConnection(onStatusChange: (Boolean) -> Unit) {
        val connectedRef = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/").getReference(".info/connected")
        connectedRef.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val connected = snapshot.getValue(Boolean::class.java) ?: false
                onStatusChange(connected)
            }
            override fun onCancelled(error: DatabaseError) {}
        })
    }

    fun listenToUserData(onDataChange: (DataSnapshot) -> Unit) {
        val uid = userId ?: return
        val db = database ?: return
        db.child("users").child(uid).addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                onDataChange(snapshot)
            }
            override fun onCancelled(error: DatabaseError) {
                Log.e("HealthManager", "Database error: ${error.message}")
            }
        })
    }

    private fun sendHealthData(type: String, value: String) {
        scope.launch {
            try {
                val nodes = Tasks.await(Wearable.getNodeClient(context).connectedNodes)
                val json = JSONObject().apply {
                    put("type", type)
                    put("value", value)
                    put("timestamp", System.currentTimeMillis())
                }
                val data = json.toString().toByteArray()
                
                for (node in nodes) {
                    Tasks.await(
                        Wearable.getMessageClient(context)
                            .sendMessage(node.id, "/health-data", data)
                    )
                }
            } catch (e: Exception) {
                Log.e("HealthManager", "Error sending data", e)
            }
        }
    }
}
