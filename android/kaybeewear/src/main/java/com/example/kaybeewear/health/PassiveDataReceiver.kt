package com.example.kaybeewear.health

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.PassiveMonitoringUpdate
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

class PassiveDataReceiver : BroadcastReceiver() {
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onReceive(context: Context, intent: Intent) {
        val update = PassiveMonitoringUpdate.fromIntent(intent) ?: return
        
        val dataPoints = update.dataPoints
        processDataPoints(context, dataPoints)
    }

    private fun processDataPoints(context: Context, dataPoints: DataPointContainer) {
        // Extraction des différentes métriques
        val steps = dataPoints.getData(DataType.STEPS_DAILY).lastOrNull()?.value
        val calories = dataPoints.getData(DataType.CALORIES_TOTAL).lastOrNull()?.value
        val distance = dataPoints.getData(DataType.DISTANCE_TOTAL).lastOrNull()?.value

        if (steps != null || calories != null || distance != null) {
            sendUpdateToPhone(context, steps, calories, distance)
        }
    }

    private fun sendUpdateToPhone(context: Context, steps: Long?, calories: Double?, distance: Double?) {
        scope.launch {
            try {
                val nodes = Tasks.await(Wearable.getNodeClient(context).connectedNodes)
                val json = JSONObject().apply {
                    put("type", "passive_update")
                    steps?.let { put("steps", it) }
                    calories?.let { put("calories", it) }
                    distance?.let { put("distance", it) }
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
                Log.e("PassiveDataReceiver", "Error sending passive data", e)
            }
        }
    }
}
