package com.example.kaybeewear.health

import android.content.Context
import android.util.Log
import androidx.health.services.client.PassiveListenerService
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import com.google.firebase.database.FirebaseDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class PassiveDataReceiver : PassiveListenerService() {
    private val scope = CoroutineScope(Dispatchers.IO)

    private val database by lazy {
        val fb = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/")
        try { fb.setPersistenceEnabled(true) } catch (e: Exception) {}
        fb.goOnline()
        fb.reference
    }

    override fun onNewDataPointsReceived(dataPoints: DataPointContainer) {
        processDataPoints(dataPoints)
    }

    private fun processDataPoints(dataPoints: DataPointContainer) {
        val steps = dataPoints.getData(DataType.STEPS_DAILY).lastOrNull()?.value
        val calories = dataPoints.getData(DataType.CALORIES_TOTAL)?.total
        val distance = dataPoints.getData(DataType.DISTANCE_TOTAL)?.total
        val heartRate = dataPoints.getData(DataType.HEART_RATE_BPM).lastOrNull()?.value

        if (steps != null || calories != null || heartRate != null) {
            Log.d("KaybeeSync", "⌚ WATCH DATA: Steps: $steps | BPM: $heartRate")

            sendUpdateToPhone(steps, calories, distance, heartRate?.toInt())
            syncToFirebase(steps, calories, distance, heartRate?.toInt())
        }
    }

    private fun syncToFirebase(steps: Long?, calories: Double?, distance: Double?, heartRate: Int?) {
        val prefs = getSharedPreferences("kaybee_prefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("userId", null) ?: return

        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
        val updates = mutableMapOf<String, Any>()

        // Force source "watch" & update date for midnight reset
        updates["source"] = "watch"
        updates["last_update"] = System.currentTimeMillis()
        updates["date"] = today

        steps?.let { updates["steps"] = it }
        calories?.let { updates["calories_burned"] = it }
        heartRate?.let { updates["heart_rate"] = it }

        database.child("users").child(userId).child("live_data").updateChildren(updates)
            .addOnFailureListener { e -> Log.e("KaybeeSync", "Firebase Watch Sync Error: ${e.message}") }
    }

    private fun sendUpdateToPhone(steps: Long?, calories: Double?, distance: Double?, heartRate: Int?) {
        scope.launch {
            try {
                val nodeClient = Wearable.getNodeClient(this@PassiveDataReceiver)
                val nodes = Tasks.await(nodeClient.connectedNodes)
                if (nodes.isEmpty()) return@launch

                val json = JSONObject().apply {
                    put("type", "passive_update")
                    steps?.let { put("steps", it) }
                    heartRate?.let { put("heart_rate", it) }
                    put("timestamp", System.currentTimeMillis())
                }

                for (node in nodes) {
                    Wearable.getMessageClient(this@PassiveDataReceiver)
                        .sendMessage(node.id, "/health-data", json.toString().toByteArray())
                }
            } catch (e: Exception) {
                Log.e("KaybeeSync", "Bluetooth Send Error: ${e.message}")
            }
        }
    }
}
