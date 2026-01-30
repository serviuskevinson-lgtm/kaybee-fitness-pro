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

    init {
        try {
            if (FirebaseApp.getApps(context).isNotEmpty()) {
                val fbInstance = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/")
                database = fbInstance.reference
                fbInstance.goOnline()
            }
        } catch (e: Exception) {
            Log.e("HealthManager", "Failed to initialize Firebase Database", e)
        }
    }

    fun setUserId(id: String) {
        this.userId = id
        // On laisse Firebase gérer la connexion normalement sans forcer le mode de synchro brute
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
