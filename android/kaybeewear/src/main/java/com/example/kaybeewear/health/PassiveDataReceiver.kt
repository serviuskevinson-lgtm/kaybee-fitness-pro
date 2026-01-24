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

class PassiveDataReceiver : PassiveListenerService() {
    private val scope = CoroutineScope(Dispatchers.IO)
    private val database = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/").reference

    override fun onNewDataPointsReceived(dataPoints: DataPointContainer) {
        processDataPoints(dataPoints)
    }

    private fun processDataPoints(dataPoints: DataPointContainer) {
        val steps = dataPoints.getData(DataType.STEPS_DAILY).lastOrNull()?.value
        val calories = dataPoints.getData(DataType.CALORIES_TOTAL)?.total
        val distance = dataPoints.getData(DataType.DISTANCE_TOTAL)?.total

        if (steps != null || calories != null || distance != null) {
            sendUpdateToPhone(steps, calories, distance)
            syncToFirebase(steps, calories, distance)
        }
    }

    private fun syncToFirebase(steps: Long?, calories: Double?, distance: Double?) {
        val prefs = getSharedPreferences("kaybee_prefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("userId", null) ?: return

        val updates = mutableMapOf<String, Any>()
        steps?.let { updates["steps"] = it }
        calories?.let { updates["calories_burned"] = it } // Unifié avec le dashboard
        distance?.let { updates["distance"] = it }
        updates["last_update"] = System.currentTimeMillis()
        updates["source"] = "watch"

        database.child("users").child(userId).child("live_data").updateChildren(updates)
            .addOnFailureListener { e -> Log.e("PassiveDataReceiver", "Firebase sync failed", e) }
    }

    private fun sendUpdateToPhone(steps: Long?, calories: Double?, distance: Double?) {
        scope.launch {
            try {
                val nodes = Tasks.await(Wearable.getNodeClient(this@PassiveDataReceiver).connectedNodes)
                val json = JSONObject().apply {
                    put("type", "passive_update")
                    steps?.let { put("steps", it) }
                    calories?.let { put("calories_burned", it) }
                    distance?.let { put("distance", it) }
                    put("timestamp", System.currentTimeMillis())
                }
                val data = json.toString().toByteArray()

                for (node in nodes) {
                    Tasks.await(
                        Wearable.getMessageClient(this@PassiveDataReceiver)
                            .sendMessage(node.id, "/health-data", data)
                    )
                }
            } catch (e: Exception) {
                Log.e("PassiveDataReceiver", "Error sending passive data", e)
            }
        }
    }
}
