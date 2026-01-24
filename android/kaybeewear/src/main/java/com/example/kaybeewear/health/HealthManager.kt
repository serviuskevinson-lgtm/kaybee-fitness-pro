package com.example.kaybeewear.health

import android.content.Context
import android.util.Log
import androidx.concurrent.futures.await
import androidx.health.services.client.HealthServices
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DeltaDataType
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
    private val scope = CoroutineScope(Dispatchers.IO)
    
    private var database: DatabaseReference? = null
    private var userId: String? = null

    init {
        try {
            if (FirebaseApp.getApps(context).isNotEmpty()) {
                database = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/").reference
            } else {
                Log.w("HealthManager", "Firebase not initialized. Realtime Database sync disabled.")
            }
        } catch (e: Exception) {
            Log.e("HealthManager", "Failed to initialize Firebase Database", e)
        }
    }

    fun setUserId(id: String) {
        this.userId = id
        Log.d("HealthManager", "User ID set: $id")
    }

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
                syncToFirebase("heart_rate", bpm)
            }
        }
    }

    fun syncToFirebase(key: String, value: Any) {
        val uid = userId ?: return
        val db = database ?: return
        db.child("users").child(uid).child("live_data").child(key).setValue(value)
            .addOnFailureListener { e -> Log.e("HealthManager", "Firebase sync failed", e) }
    }

    fun resetStats() {
        val uid = userId ?: return
        val db = database ?: return
        val updates = mapOf(
            "steps" to 0,
            "calories" to 0,
            "distance" to 0
        )
        db.child("users").child(uid).child("live_data").updateChildren(updates)
    }

    fun startHeartRateMonitoring() {
        measureClient.registerMeasureCallback(DataType.HEART_RATE_BPM, heartRateCallback)
    }

    fun stopHeartRateMonitoring() {
        measureClient.unregisterMeasureCallbackAsync(DataType.HEART_RATE_BPM, heartRateCallback)
    }

    fun startPassiveMonitoring() {
        val config = PassiveListenerConfig.builder()
            .setDataTypes(setOf(
                DataType.STEPS_DAILY,
                DataType.CALORIES_TOTAL,
                DataType.DISTANCE_TOTAL
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
