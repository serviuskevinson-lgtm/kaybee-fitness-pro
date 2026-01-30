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

    // Initialisation Lazy de Firebase pour éviter les soucis de démarrage du service
    private val database by lazy {
        val fb = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/")
        try { fb.setPersistenceEnabled(true) } catch (e: Exception) {}
        fb.goOnline()
        fb.reference
    }

    override fun onNewDataPointsReceived(dataPoints: DataPointContainer) {
        // Cette méthode est appelée par le système en background
        processDataPoints(dataPoints)
    }

    private fun processDataPoints(dataPoints: DataPointContainer) {
        // Récupération des dernières valeurs connues
        val steps = dataPoints.getData(DataType.STEPS_DAILY).lastOrNull()?.value
        val calories = dataPoints.getData(DataType.CALORIES_TOTAL)?.total
        val distance = dataPoints.getData(DataType.DISTANCE_TOTAL)?.total
        val heartRate = dataPoints.getData(DataType.HEART_RATE_BPM).lastOrNull()?.value

        if (steps != null || calories != null || heartRate != null) {
            Log.d("KaybeeSync", "⌚ WATCH DATA: Pas: $steps | BPM: $heartRate")

            // 1. Envoi direct au téléphone via Bluetooth (si à portée) pour mise à jour UI rapide
            sendUpdateToPhone(steps, calories, distance, heartRate?.toInt())

            // 2. Écriture directe dans Firebase (Fonctionne via Wi-Fi/LTE même si téléphone loin)
            syncToFirebase(steps, calories, distance, heartRate?.toInt())
        }
    }

    private fun syncToFirebase(steps: Long?, calories: Double?, distance: Double?, heartRate: Int?) {
        val prefs = getSharedPreferences("kaybee_prefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("userId", null)

        if (userId == null) return

        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
        val updates = mutableMapOf<String, Any>()

        // On force la source "watch" pour que l'app sache que c'est la donnée prioritaire
        updates["source"] = "watch"
        updates["last_update"] = System.currentTimeMillis()
        updates["date"] = today

        steps?.let { updates["steps"] = it }
        calories?.let { updates["calories_burned"] = it }
        heartRate?.let { updates["heart_rate"] = it } // Le BPM vient toujours de la montre

        database.child("users").child(userId).child("live_data").updateChildren(updates)
            .addOnFailureListener { e -> Log.e("KaybeeSync", "Erreur Firebase Watch: ${e.message}") }
    }

    private fun sendUpdateToPhone(steps: Long?, calories: Double?, distance: Double?, heartRate: Int?) {
        scope.launch {
            try {
                // Vérifier si connecté avant d'essayer d'envoyer
                val nodeClient = Wearable.getNodeClient(this@PassiveDataReceiver)
                val nodes = Tasks.await(nodeClient.connectedNodes)
                if (nodes.isEmpty()) return@launch

                val json = JSONObject().apply {
                    put("type", "passive_update")
                    steps?.let { put("steps", it) }
                    heartRate?.let { put("heart_rate", it) }
                    put("timestamp", System.currentTimeMillis())
                }

                // Broadcast à tous les nœuds connectés
                for (node in nodes) {
                    Wearable.getMessageClient(this@PassiveDataReceiver)
                        .sendMessage(node.id, "/health-data", json.toString().toByteArray())
                }
            } catch (e: Exception) {
                Log.e("KaybeeSync", "Erreur Bluetooth: ${e.message}")
            }
        }
    }
}