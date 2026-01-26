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

        if (steps != null || calories != null || distance != null || heartRate != null) {
            Log.d("KaybeeSync", "--- NOUVELLES DONNÉES MONTRE ---")
            Log.d("KaybeeSync", "Pas: $steps | BPM: $heartRate | Cal: $calories")
            
            sendUpdateToPhone(steps, calories, distance, heartRate?.toInt())
            syncToFirebase(steps, calories, distance, heartRate?.toInt())
        }
    }

    private fun syncToFirebase(steps: Long?, calories: Double?, distance: Double?, heartRate: Int?) {
        val prefs = getSharedPreferences("kaybee_prefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("userId", null)

        if (userId == null) {
            Log.e("KaybeeSync", "ERREUR: Synchronisation Firebase annulée : userId est NULL dans SharedPreferences.")
            return
        }

        val updates = mutableMapOf<String, Any>()
        steps?.let { updates["steps"] = it }
        calories?.let { updates["calories_burned"] = it }
        distance?.let { updates["distance"] = it }
        heartRate?.let { updates["heart_rate"] = it }
        updates["last_update"] = System.currentTimeMillis()
        updates["source"] = "watch"

        database.child("users").child(userId).child("live_data").updateChildren(updates)
            .addOnSuccessListener { 
                Log.d("KaybeeSync", "✅ Firebase : Données mises à jour pour l'utilisateur $userId") 
            }
            .addOnFailureListener { e -> 
                Log.e("KaybeeSync", "❌ Firebase : Échec de la mise à jour : ${e.message}") 
            }
    }

    private fun sendUpdateToPhone(steps: Long?, calories: Double?, distance: Double?, heartRate: Int?) {
        scope.launch {
            try {
                val nodes = Tasks.await(Wearable.getNodeClient(this@PassiveDataReceiver).connectedNodes)
                if (nodes.isEmpty()) {
                    Log.w("KaybeeSync", "⚠️ Bluetooth : Aucun téléphone trouvé à proximité.")
                    return@launch
                }

                val json = JSONObject().apply {
                    put("type", "passive_update")
                    steps?.let { put("steps", it) }
                    calories?.let { put("calories_burned", it) }
                    distance?.let { put("distance", it) }
                    heartRate?.let { put("heart_rate", it) }
                    put("timestamp", System.currentTimeMillis())
                }
                val data = json.toString().toByteArray()

                for (node in nodes) {
                    Wearable.getMessageClient(this@PassiveDataReceiver)
                        .sendMessage(node.id, "/health-data", data)
                    Log.d("KaybeeSync", "📡 Bluetooth : Message envoyé à ${node.displayName}")
                }
            } catch (e: Exception) {
                Log.e("KaybeeSync", "❌ Bluetooth : Erreur d'envoi : ${e.message}")
            }
        }
    }
}
