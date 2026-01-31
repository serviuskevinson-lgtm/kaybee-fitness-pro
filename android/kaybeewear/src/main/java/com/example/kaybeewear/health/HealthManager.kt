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
import com.google.firebase.database.ServerValue
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
    
    private var lastAccelSync = 0L
    private val ACCEL_SYNC_INTERVAL_MS = 200L

    init {
        try {
            // CORRECTION : Si Firebase n'est pas initialisé, on le force !
            if (FirebaseApp.getApps(context).isEmpty()) {
                FirebaseApp.initializeApp(context)
            }

            // Maintenant on est sûr que ça existe, on se connecte
            val fbInstance = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/")
            database = fbInstance.reference
            fbInstance.goOnline()

            Log.d("HealthManager", "Firebase initialisé avec succès")
        } catch (e: Exception) {
            Log.e("HealthManager", "Erreur critique Firebase", e)
        }
    }

    fun setUserId(id: String) {
        this.userId = id
    }

    private val heartRateCallback = object : MeasureCallback {
        override fun onAvailabilityChanged(dataType: DeltaDataType<*, *>, availability: Availability) {}
        override fun onDataReceived(data: DataPointContainer) {
            val heartRateDataPoints = data.getData(DataType.HEART_RATE_BPM)
            val heartRate = heartRateDataPoints.lastOrNull() as? SampleDataPoint<Double>
            if (heartRate != null) {
                syncHeartRateToFirebase(heartRate.value.toInt())
            }
        }
    }

    fun startHeartRateMonitoring() {
        measureClient.registerMeasureCallback(DataType.HEART_RATE_BPM, heartRateCallback)
    }

    fun syncHeartRateToFirebase(bpm: Int) {
        val uid = userId ?: return
        val updates = mapOf(
            "heart_rate" to bpm,
            "source" to "watch",
            "timestamp" to ServerValue.TIMESTAMP
        )
        database?.child("users")?.child(uid)?.child("live_data")?.updateChildren(updates)
    }

    fun syncAccelerometerToFirebase(x: Float, y: Float, z: Float) {
        val uid = userId ?: return
        val now = System.currentTimeMillis()
        if (now - lastAccelSync < ACCEL_SYNC_INTERVAL_MS) return
        
        lastAccelSync = now
        val updates = mapOf(
            "accel_x" to x,
            "accel_y" to y,
            "accel_z" to z,
            "last_update" to ServerValue.TIMESTAMP
        )
        database?.child("users")?.child(uid)?.child("live_data")?.updateChildren(updates)
    }

    fun syncStepsToFirebase(steps: Long) {
        val uid = userId ?: return
        val updates = mapOf(
            "steps" to steps,
            "source" to "watch",
            "last_update" to ServerValue.TIMESTAMP
        )
        database?.child("users")?.child(uid)?.child("live_data")?.updateChildren(updates)
    }

    fun addWater(amount: Double) {
        val uid = userId ?: return
        val ref = database?.child("users")?.child(uid)?.child("live_data")?.child("water")
        ref?.get()?.addOnSuccessListener {
            val current = (it.value as? Number)?.toDouble() ?: 0.0
            ref.setValue(current + amount)
        }
    }

    fun startPassiveMonitoring() {
        val config = PassiveListenerConfig.builder()
            .setDataTypes(setOf(DataType.STEPS_DAILY, DataType.CALORIES_TOTAL, DataType.HEART_RATE_BPM))
            .build()
        scope.launch {
            try {
                passiveMonitoringClient.setPassiveListenerServiceAsync(PassiveDataReceiver::class.java, config).await()
            } catch (e: Exception) { Log.e("HealthManager", "Passive error", e) }
        }
    }

    fun listenToUserData(onDataChange: (DataSnapshot) -> Unit) {
        val uid = userId ?: return
        database?.child("users")?.child(uid)?.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) = onDataChange(snapshot)
            override fun onCancelled(error: DatabaseError) {}
        })
    }

    fun monitorFirebaseConnection(onStatusChange: (Boolean) -> Unit) {
        database?.root?.child(".info/connected")?.addValueEventListener(object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                onStatusChange(snapshot.getValue(Boolean::class.java) ?: false)
            }
            override fun onCancelled(error: DatabaseError) {}
        })
    }
}
