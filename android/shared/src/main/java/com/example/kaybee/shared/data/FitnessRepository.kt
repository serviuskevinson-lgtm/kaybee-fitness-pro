package com.example.kaybee.shared.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.*
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

data class SessionSyncData(
    val total_steps: Int = 0,
    val current_heart_rate: Int = 0,
    val avg_heart_rate: Int = 0,
    val active_step_counter: String = "none",
    val watch_connected: Boolean = false,
    val phone_connected: Boolean = false,
    val last_updated: Long = System.currentTimeMillis()
)

class FitnessRepository {
    private val database = FirebaseDatabase.getInstance("https://kaybee-fitness-default-rtdb.firebaseio.com/")
    private val auth = FirebaseAuth.getInstance()
    
    private val userId: String
        get() = auth.currentUser?.uid ?: "test_user" // Fallback for testing or use a real UID
    
    private val sessionRef: DatabaseReference
        get() = database.getReference("users").child(userId).child("sync_session")
    
    private val fitnessDataRef: DatabaseReference
        get() = database.getReference("users").child(userId).child("fitness_history")
    
    fun observeSession(): Flow<SessionSyncData> = callbackFlow {
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val session = snapshot.getValue(SessionSyncData::class.java) ?: SessionSyncData()
                trySend(session)
            }
            override fun onCancelled(error: DatabaseError) {
                close(error.toException())
            }
        }
        sessionRef.addValueEventListener(listener)
        awaitClose { sessionRef.removeEventListener(listener) }
    }
    
    suspend fun updateDeviceConnection(deviceType: String, connected: Boolean) {
        val updates = mutableMapOf<String, Any>(
            "${deviceType}_connected" to connected,
            "last_updated" to ServerValue.TIMESTAMP
        )
        val snapshot = sessionRef.get().await()
        val currentSession = snapshot.getValue(SessionSyncData::class.java) ?: SessionSyncData()
        
        val watchConnected = if (deviceType == "watch") connected else currentSession.watch_connected
        val phoneConnected = if (deviceType == "phone") connected else currentSession.phone_connected
        
        val activeCounter = when {
            watchConnected -> "watch"
            phoneConnected -> "phone"
            else -> "none"
        }
        updates["active_step_counter"] = activeCounter
        sessionRef.updateChildren(updates).await()
    }
    
    suspend fun addSteps(device: String, stepCount: Int) {
        val stepData = mapOf(
            "device" to device,
            "value" to stepCount,
            "timestamp" to ServerValue.TIMESTAMP
        )
        fitnessDataRef.child("steps").push().setValue(stepData).await()
        
        sessionRef.child("total_steps").runTransaction(object : Transaction.Handler {
            override fun doTransaction(data: MutableData): Transaction.Result {
                val currentSteps = data.getValue(Int::class.java) ?: 0
                data.value = currentSteps + stepCount
                return Transaction.success(data)
            }
            override fun onComplete(error: DatabaseError?, committed: Boolean, snapshot: DataSnapshot?) {}
        })
        sessionRef.child("last_updated").setValue(ServerValue.TIMESTAMP)
    }
    
    suspend fun addHeartRate(heartRate: Int) {
        val hrData = mapOf("value" to heartRate, "timestamp" to ServerValue.TIMESTAMP)
        fitnessDataRef.child("heart_rate").push().setValue(hrData).await()
        
        sessionRef.updateChildren(mapOf(
            "current_heart_rate" to heartRate,
            "last_updated" to ServerValue.TIMESTAMP
        )).await()
        
        calculateAndUpdateAverageHeartRate()
    }
    
    private suspend fun calculateAndUpdateAverageHeartRate() {
        val snapshot = fitnessDataRef.child("heart_rate").orderByChild("timestamp").limitToLast(50).get().await()
        var sum = 0
        var count = 0
        snapshot.children.forEach { child ->
            child.child("value").getValue(Int::class.java)?.let { sum += it; count++ }
        }
        if (count > 0) sessionRef.child("avg_heart_rate").setValue(sum / count)
    }
    
    suspend fun resetSession() {
        sessionRef.updateChildren(mapOf(
            "total_steps" to 0,
            "current_heart_rate" to 0,
            "avg_heart_rate" to 0,
            "last_updated" to ServerValue.TIMESTAMP
        )).await()
        fitnessDataRef.removeValue().await()
    }
}
