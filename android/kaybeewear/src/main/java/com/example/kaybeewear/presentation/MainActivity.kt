package com.example.kaybeewear.presentation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListAnchorType
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.itemsIndexed
import androidx.wear.compose.material.*
import androidx.wear.compose.material.dialog.Dialog
import com.example.kaybeewear.health.HealthManager
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.firebase.database.DataSnapshot
import org.json.JSONObject
import java.time.LocalDate
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

val PurplePrimary = Color(0xFF9d4edd)
val PurpleDark = Color(0xFF7b2cbf)
val GreenAccent = Color(0xFF00f5d4)
val DarkBg = Color(0xFF0a0a0f)
val CardBg = Color(0xFF1a1a20)
val TextGray = Color(0xFF94a3b8)

class MainActivity : ComponentActivity(), MessageClient.OnMessageReceivedListener, SensorEventListener {

    private var heartRate by mutableIntStateOf(0)
    private var stepCount by mutableIntStateOf(0)
    private var caloriesBurned by mutableIntStateOf(0)
    
    private var isPhoneConnected by mutableStateOf(false)
    private var lastFirebaseSync by mutableStateOf("Jamais")
    private var firebaseSocketConnected by mutableStateOf(false)
    private var firebaseDataFound by mutableStateOf(false)

    private val defaultWeekly = listOf(
        ScheduleDay("Lundi", "Repos"), ScheduleDay("Mardi", "Repos"), ScheduleDay("Mercredi", "Repos"),
        ScheduleDay("Jeudi", "Repos"), ScheduleDay("Vendredi", "Repos"), ScheduleDay("Samedi", "Repos"), ScheduleDay("Dimanche", "Repos")
    )

    private var weeklySummary by mutableStateOf<List<ScheduleDay>>(defaultWeekly)
    private var monthlySummary by mutableStateOf<List<ScheduleDay>>(emptyList())
    private var activeWorkout by mutableStateOf<WorkoutData?>(null)
    private var isCoach by mutableStateOf(false)
    private var currentUserId by mutableStateOf<String?>(null)
    private var pairingCode by mutableStateOf("")

    private lateinit var sensorManager: SensorManager
    private lateinit var healthManager: HealthManager

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.all { it.value }) startHealthMonitoring()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        healthManager = HealthManager(this)

        val savedUserId = getSharedPreferences("kaybee_prefs", Context.MODE_PRIVATE).getString("userId", null)
        if (savedUserId != null) {
            currentUserId = savedUserId
            healthManager.setUserId(savedUserId)
            startFirebaseSync()
        } else {
            generatePairingCode()
        }

        healthManager.monitorFirebaseConnection { connected -> firebaseSocketConnected = connected }
        checkConnection()

        setContent {
            val userId = currentUserId
            if (userId == null) {
                PairingScreen(pairingCode)
            } else {
                WearApp(
                    heartRate = heartRate, stepCount = stepCount, calories = caloriesBurned,
                    weeklySummary = weeklySummary, monthlySummary = monthlySummary,
                    activeWorkout = activeWorkout, isCoach = isCoach,
                    isPhoneConnected = isPhoneConnected, firebaseSocketConnected = firebaseSocketConnected,
                    firebaseDataFound = firebaseDataFound, lastSync = lastFirebaseSync, currentUid = currentUserId ?: "N/A"
                )
            }
        }
        checkAndRequestPermissions()
    }

    private fun checkConnection() {
        Wearable.getNodeClient(this).connectedNodes.addOnSuccessListener { nodes ->
            isPhoneConnected = nodes.isNotEmpty()
        }
    }

    private fun generatePairingCode() {
        pairingCode = (100000..999999).random().toString()
    }

    private fun startFirebaseSync() {
        healthManager.listenToUserData { snapshot ->
            if (snapshot.exists()) {
                firebaseDataFound = true
                lastFirebaseSync = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
                updateUIFromSnapshot(snapshot)
            } else {
                firebaseDataFound = false
            }
        }
    }

    private fun updateUIFromSnapshot(snapshot: DataSnapshot) {
        try {
            val liveData = snapshot.child("live_data")
            stepCount = (liveData.child("steps").value as? Number)?.toInt() ?: stepCount
            caloriesBurned = (liveData.child("calories_burned").value as? Number)?.toInt() ?: caloriesBurned
            heartRate = (liveData.child("heart_rate").value as? Number)?.toInt() ?: heartRate
            isCoach = snapshot.child("role").getValue(String::class.java) == "coach"
            
            // ... Agenda Sync (Hebdo/Mensuel) ...
        } catch (e: Exception) { Log.e("MainActivity", "Error update UI", e) }
    }

    @Composable
    fun PairingScreen(code: String) {
        Column(
            modifier = Modifier.fillMaxSize().background(DarkBg).padding(10.dp),
            verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("KAYBEE FITNESS", color = PurplePrimary, fontWeight = FontWeight.Black, fontSize = 14.sp)
            Spacer(modifier = Modifier.height(10.dp))
            Text(code, color = GreenAccent, fontSize = 32.sp, fontWeight = FontWeight.Black, letterSpacing = 4.sp)
            Text("Entrez ce code sur votre téléphone", color = TextGray, fontSize = 9.sp, textAlign = TextAlign.Center)
        }
    }

    private fun startHealthMonitoring() {
        healthManager.startHeartRateMonitoring()
        healthManager.startPassiveMonitoring()
    }

    override fun onResume() {
        super.onResume()
        Wearable.getMessageClient(this).addListener(this)
        sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE)?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
        checkConnection()
    }

    override fun onPause() {
        super.onPause()
        Wearable.getMessageClient(this).removeListener(this)
        sensorManager.unregisterListener(this)
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        isPhoneConnected = true
        // Handle /pair, /set-user-id, /update-complex-data...
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_HEART_RATE) heartRate = event.values[0].toInt()
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}

data class ScheduleDay(val day: String, val workout: String)
data class WorkoutData(val name: String, val exercises: List<ExerciseData>)
data class ExerciseData(val name: String, val sets: Int, val reps: Int, val weight: Float)

@Composable
fun WearApp(
    heartRate: Int, stepCount: Int, calories: Int,
    weeklySummary: List<ScheduleDay>, monthlySummary: List<ScheduleDay>,
    activeWorkout: WorkoutData?, isCoach: Boolean,
    isPhoneConnected: Boolean, firebaseSocketConnected: Boolean,
    firebaseDataFound: Boolean, lastSync: String, currentUid: String
) {
    val pageCount = if (isCoach) 4 else 3
    val pagerState = rememberPagerState(pageCount = { pageCount })
    var showDebug by remember { mutableStateOf(false) }

    Scaffold(timeText = { TimeText() }) {
        HorizontalPager(state = pagerState) { page ->
            when (page) {
                0 -> DashboardPage(heartRate, stepCount, calories, onLongClick = { showDebug = true })
                1 -> SessionPage(activeWorkout)
                2 -> SchedulePage("AGENDA HEBDO", weeklySummary)
                3 -> SchedulePage("AGENDA MENSUEL", monthlySummary)
            }
        }
        
        if (showDebug) {
            Dialog(onDismissRequest = { showDebug = false }) {
                ConnectionDebugPage(isPhoneConnected, firebaseSocketConnected, firebaseDataFound, lastSync, currentUid) {
                    showDebug = false
                }
            }
        }
    }
}

@Composable
fun DashboardPage(hr: Int, steps: Int, calories: Int, onLongClick: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().background(DarkBg)) {
        Column(
            modifier = Modifier.fillMaxSize().padding(8.dp),
            verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                "KAYBEE FITNESS", color = PurplePrimary, fontWeight = FontWeight.Black, fontSize = 10.sp,
                modifier = Modifier.pointerInput(Unit) { detectTapGestures(onLongPress = { onLongClick() }) }
            )
            Spacer(modifier = Modifier.height(10.dp))
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(60.dp).clip(CircleShape).background(CardBg)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("❤️", fontSize = 14.sp)
                    Text(if (hr > 0) "$hr" else "--", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                    Text("BPM", fontSize = 8.sp, color = Color.Gray)
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                StatItem("👣", steps.toString(), "PAS", GreenAccent)
                StatItem("🔥", calories.toString(), "KCAL", Color.Yellow)
            }
        }
    }
}

@Composable
fun ConnectionDebugPage(
    isPhoneConnected: Boolean, firebaseSocketConnected: Boolean, 
    firebaseDataFound: Boolean, lastSync: String, uid: String, onClose: () -> Unit
) {
    ScalingLazyColumn(modifier = Modifier.fillMaxSize().background(DarkBg)) {
        item { Text("DEBUG SYNC", color = PurplePrimary, fontWeight = FontWeight.Black, fontSize = 12.sp) }
        item { StatusRow("Phone", if (isPhoneConnected) "OK" else "OFF", if (isPhoneConnected) GreenAccent else Color.Red) }
        item { StatusRow("RTDB", if (firebaseSocketConnected) "ON" else "OFF", if (firebaseSocketConnected) GreenAccent else Color.Red) }
        item { StatusRow("Data", if (firebaseDataFound) "OUI" else "NON", if (firebaseDataFound) GreenAccent else Color.Red) }
        item { Text("UID: ${uid.take(6)}...", color = Color.Gray, fontSize = 8.sp) }
        item { Text("Sync: $lastSync", color = Color.Gray, fontSize = 8.sp) }
        item { Button(onClick = onClose, modifier = Modifier.height(24.dp)) { Text("FERMER", fontSize = 8.sp) } }
    }
}

@Composable
fun StatusRow(label: String, status: String, color: Color) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = Color.White, fontSize = 10.sp)
        Text(status, color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun StatItem(icon: String, value: String, label: String, color: Color) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(CardBg).padding(vertical = 8.dp).width(55.dp)
    ) {
        Text(icon, fontSize = 14.sp)
        Text(value, color = color, fontSize = 12.sp, fontWeight = FontWeight.Black)
        Text(label, fontSize = 7.sp, color = Color.Gray)
    }
}

@Composable
fun SessionPage(workout: WorkoutData?) { /* ... Identique ... */ }
@Composable
fun SchedulePage(title: String, summary: List<ScheduleDay>) { /* ... Identique ... */ }
