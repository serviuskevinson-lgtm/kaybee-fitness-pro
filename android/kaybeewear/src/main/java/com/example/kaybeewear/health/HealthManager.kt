package com.example.kaybeewear.health

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

class HealthManager(private val context: Context) {
    private val healthClient = HealthServices.getClient(context)
    private val measureClient = healthClient.measureClient
    private val passiveMonitoringClient = healthClient.passiveMonitoringClient
    private val scope = CoroutineScope(Dispatchers.IO)

    private val heartRateCallback = object : MeasureCallback {
        override fun onAvailabilityChanged(dataType: DeltaDataType<*, *>, availability: Availability) {
            Log.d("HealthManager", "Availability changed: ${dataType.name} -> $availability")
        }

        override fun onDataReceived(data: DataPointContainer) {
            val heartRateDataPoints = data.getData(DataType.HEART_RATE_BPM)
            val heartRate = heartRateDataPoints.lastOrNull() as? SampleDataPoint<Double>
            if (heartRate != null) {
                sendHealthData("heart_rate", heartRate.value.toString())
            }
        }
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
        
        val intent = Intent(context, PassiveDataReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        
        passiveMonitoringClient.setPassiveListenerServiceAsync(config, pendingIntent)
            .addOnSuccessListener { Log.d("HealthManager", "Passive monitoring started") }
            .addOnFailureListener { e: Exception -> Log.e("HealthManager", "Failed to start passive monitoring", e) }
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
