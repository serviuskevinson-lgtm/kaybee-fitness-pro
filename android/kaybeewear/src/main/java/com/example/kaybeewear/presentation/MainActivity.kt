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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.wear.compose.material.*
import com.example.kaybeewear.health.HealthManager
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.firebase.database.DataSnapshot
import org.json.JSONObject
import java.time.LocalDate
import kotlin.random.Random

// --- COULEURS FIDÈLES AU DESIGN ---
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
    
    private val defaultWeekly = listOf(
        ScheduleDay("Lundi", "Repos"),
        ScheduleDay("Mardi", "Repos"),
        ScheduleDay("Mercredi", "Repos"),
        ScheduleDay("Jeudi", "Repos"),
        ScheduleDay("Vendredi", "Repos"),
        ScheduleDay("Samedi", "Repos"),
        ScheduleDay("Dimanche", "Repos")
    )

    private var weeklySummary by mutableStateOf<List<ScheduleDay>>(defaultWeekly)
    private var monthlySummary by mutableStateOf<List<ScheduleDay>>(emptyList())
    private var activeWorkout by mutableStateOf<WorkoutData?>(null)
    private var isCoach by mutableStateOf(false)

    // État pour le "Gate" de connexion
    private var currentUserId by mutableStateOf<String?>(null)
    private var pairingCode by mutableStateOf("")

    private lateinit var sensorManager: SensorManager
    private lateinit var healthManager: HealthManager

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.all { it.value }) {
            startHealthMonitoring()
        }
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

        setContent {
            val userId = currentUserId
            if (userId == null) {
                PairingScreen(pairingCode)
            } else {
                WearApp(
                    heartRate = heartRate,
                    stepCount = stepCount,
                    calories = caloriesBurned,
                    weeklySummary = weeklySummary,
                    monthlySummary = monthlySummary,
                    activeWorkout = activeWorkout,
                    isCoach = isCoach
                )
            }
        }

        checkAndRequestPermissions()
        requestSyncFromPhone()
    }

    private fun generatePairingCode() {
        pairingCode = (100000..999999).random().toString()
    }

    private fun requestSyncFromPhone() {
        Wearable.getNodeClient(this).connectedNodes.addOnSuccessListener { nodes ->
            for (node in nodes) {
                Wearable.getMessageClient(this).sendMessage(node.id, "/request-sync", byteArrayOf())
            }
        }
    }

    @Composable
    fun PairingScreen(code: String) {
        Column(
            modifier = Modifier.fillMaxSize().background(DarkBg).padding(10.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                "KAYBEE FITNESS", 
                color = PurplePrimary, 
                fontWeight = FontWeight.Black, 
                fontSize = 14.sp
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                "CODE DE JUMELAGE",
                color = Color.White,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                code,
                color = GreenAccent,
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 4.sp
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                "Entrez ce code sur votre téléphone",
                color = TextGray,
                fontSize = 9.sp,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = { generatePairingCode(); requestSyncFromPhone() },
                colors = ButtonDefaults.buttonColors(backgroundColor = CardBg),
                modifier = Modifier.height(24.dp)
            ) {
                Text("NOUVEAU CODE", fontSize = 7.sp, color = PurplePrimary)
            }
        }
    }

    private fun startFirebaseSync() {
        healthManager.listenToUserData { snapshot ->
            updateUIFromSnapshot(snapshot)
        }
    }

    private fun updateUIFromSnapshot(snapshot: DataSnapshot) {
        try {
            val liveData = snapshot.child("live_data")
            stepCount = (liveData.child("steps").value as? Number)?.toInt() ?: 0
            caloriesBurned = (liveData.child("calories").value as? Number)?.toInt() ?: 0
            
            isCoach = snapshot.child("role").getValue(String::class.java) == "coach"

            // Agenda Hebdo
            val weeklySnap = snapshot.child("calendar").child("weekly_summary")
            if (weeklySnap.exists()) {
                val newList = mutableListOf<ScheduleDay>()
                for (daySnap in weeklySnap.children) {
                    val day = daySnap.child("day").getValue(String::class.java) ?: ""
                    val workout = daySnap.child("workout").getValue(String::class.java) ?: ""
                    newList.add(ScheduleDay(day, workout))
                }
                if (newList.isNotEmpty()) {
                    weeklySummary = newList
                }
            }

            // Agenda Mensuel (pour Coachs)
            val monthlySnap = snapshot.child("monthly_calendar")
            if (monthlySnap.exists()) {
                val newMonthly = mutableListOf<ScheduleDay>()
                for (daySnap in monthlySnap.children) {
                    val day = daySnap.child("day").getValue(String::class.java) ?: ""
                    val workout = daySnap.child("workout").getValue(String::class.java) ?: ""
                    newMonthly.add(ScheduleDay(day, workout))
                }
                monthlySummary = newMonthly
            }

            val workoutSnap = snapshot.child("active_workout")
            if (workoutSnap.exists()) {
                val name = workoutSnap.child("name").getValue(String::class.java) ?: "Séance"
                val exercises = mutableListOf<ExerciseData>()
                for (exoSnap in workoutSnap.child("exercises").children) {
                    val exo = ExerciseData(
                        name = exoSnap.child("name").getValue(String::class.java) ?: "",
                        sets = exoSnap.child("sets").getValue(Int::class.java) ?: 0,
                        reps = exoSnap.child("reps").getValue(Int::class.java) ?: 0,
                        weight = (exoSnap.child("weight").value as? Number)?.toFloat() ?: 0f
                    )
                    exercises.add(exo)
                }
                activeWorkout = WorkoutData(name, exercises)
            } else {
                activeWorkout = null
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Error updating UI from Firebase", e)
        }
    }

    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf(Manifest.permission.BODY_SENSORS, Manifest.permission.ACTIVITY_RECOGNITION)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.BODY_SENSORS_BACKGROUND)
        }
        val missingPermissions = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missingPermissions.isEmpty()) {
            startHealthMonitoring()
        } else {
            requestPermissionLauncher.launch(missingPermissions.toTypedArray())
        }
    }

    private fun startHealthMonitoring() {
        healthManager.startHeartRateMonitoring()
        healthManager.startPassiveMonitoring()
    }

    override fun onResume() {
        super.onResume()
        Wearable.getMessageClient(this).addListener(this)
        val hrSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE)
        hrSensor?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
    }

    override fun onPause() {
        super.onPause()
        Wearable.getMessageClient(this).removeListener(this)
        sensorManager.unregisterListener(this)
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        val jsonString = String(messageEvent.data)
        val path = messageEvent.path
        Log.d("MainActivity", "Message received: $path")
        
        when (path) {
            "/pair" -> {
                try {
                    val json = JSONObject(jsonString)
                    val receivedCode = json.getString("pairingCode")
                    val userId = json.getString("userId")
                    
                    if (receivedCode == pairingCode) {
                        currentUserId = userId
                        healthManager.setUserId(userId)
                        getSharedPreferences("kaybee_prefs", Context.MODE_PRIVATE)
                            .edit().putString("userId", userId).apply()
                        
                        startFirebaseSync()
                        
                        // Notify success back to phone
                        Wearable.getMessageClient(this).sendMessage(
                            messageEvent.sourceNodeId, "/pair-success", byteArrayOf()
                        )
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Pairing error", e)
                }
            }
            "/set-user-id" -> {
                val userId = jsonString
                currentUserId = userId
                healthManager.setUserId(userId)
                getSharedPreferences("kaybee_prefs", Context.MODE_PRIVATE).edit().putString("userId", userId).apply()
                startFirebaseSync()
            }
            "/update-complex-data" -> {
                try {
                    val json = JSONObject(jsonString)
                    val calendarArr = json.optJSONArray("calendar")
                    if (calendarArr != null) {
                        val newList = mutableListOf<ScheduleDay>()
                        for (i in 0 until calendarArr.length()) {
                            val obj = calendarArr.getJSONObject(i)
                            newList.add(ScheduleDay(
                                obj.getString("day"),
                                obj.getString("workout")
                            ))
                        }
                        if (newList.isNotEmpty()) {
                            weeklySummary = newList
                        }
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error parsing complex data", e)
                }
            }
            "/reset-stats" -> {
                healthManager.resetStats()
            }
        }
    }

    override fun onSensorChanged(event: SensorEvent?) {
        event ?: return
        if (event.sensor.type == Sensor.TYPE_HEART_RATE) {
            heartRate = event.values[0].toInt()
        }
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}

// --- MODÈLES ---
data class ScheduleDay(val day: String, val workout: String)
data class WorkoutData(val name: String, val exercises: List<ExerciseData>)
data class ExerciseData(val name: String, val sets: Int, val reps: Int, val weight: Float)

// --- UI PRINCIPALE ---
@Composable
fun WearApp(
    heartRate: Int, stepCount: Int, calories: Int,
    weeklySummary: List<ScheduleDay>, monthlySummary: List<ScheduleDay>,
    activeWorkout: WorkoutData?, isCoach: Boolean
) {
    val pageCount = if (isCoach) 4 else 3
    val pagerState = rememberPagerState(pageCount = { pageCount })

    Scaffold(
        timeText = { TimeText() }
    ) {
        HorizontalPager(state = pagerState) { page ->
            when (page) {
                0 -> DashboardPage(heartRate, stepCount, calories)
                1 -> SessionPage(activeWorkout)
                2 -> SchedulePage("AGENDA HEBDO", weeklySummary)
                3 -> SchedulePage("AGENDA MENSUEL", monthlySummary)
            }
        }
    }
}

// --- PAGE 1 : DASHBOARD ---
@Composable
fun DashboardPage(hr: Int, steps: Int, calories: Int) {
    Box(modifier = Modifier.fillMaxSize().background(DarkBg)) {
        Box(modifier = Modifier.fillMaxSize().background(Brush.verticalGradient(
            colors = listOf(PurpleDark.copy(alpha = 0.2f), Color.Transparent)
        )))

        Column(
            modifier = Modifier.fillMaxSize().padding(8.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
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
fun StatItem(icon: String, value: String, label: String, color: Color) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(CardBg).padding(vertical = 8.dp, horizontal = 12.dp).width(60.dp)
    ) {
        Text(icon, fontSize = 16.sp)
        Text(value, color = color, fontSize = 14.sp, fontWeight = FontWeight.Black)
        Text(label, fontSize = 8.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
    }
}

// --- PAGE 2 : SÉANCE ---
@Composable
fun SessionPage(workout: WorkoutData?) {
    if (workout == null) {
        Column(
            modifier = Modifier.fillMaxSize().background(DarkBg),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("AUCUNE SÉANCE", color = Color.Gray, fontWeight = FontWeight.Bold)
            Text("Lancez depuis le téléphone", color = PurplePrimary, fontSize = 10.sp, textAlign = TextAlign.Center)
        }
    } else {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize().background(DarkBg),
            anchorType = ScalingLazyListAnchorType.ItemStart
        ) {
            item { Text(workout.name, color = GreenAccent, fontWeight = FontWeight.Black, fontSize = 16.sp) }
            items(workout.exercises) { exo ->
                Card(
                    onClick = {},
                    modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    backgroundPainter = CardDefaults.cardBackgroundPainter(startBackgroundColor = CardBg)
                ) {
                    Column {
                        Text(exo.name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        Text("${exo.sets}x${exo.reps} @ ${exo.weight}kg", color = PurplePrimary, fontSize = 10.sp)
                    }
                }
            }
        }
    }
}

// --- PAGE 3 & 4 : PLANNING (FIDÈLE AU SCREENSHOT) ---
@Composable
fun SchedulePage(title: String, summary: List<ScheduleDay>) {
    val currentDay = LocalDate.now().dayOfWeek.value // 1 (Mon) to 7 (Sun)
    val dayInitialMap = mapOf(
        "Lundi" to "L", "Mardi" to "M", "Mercredi" to "M", 
        "Jeudi" to "J", "Vendredi" to "V", "Samedi" to "S", "Dimanche" to "D"
    )

    Box(modifier = Modifier.fillMaxSize().background(DarkBg)) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
            anchorType = ScalingLazyListAnchorType.ItemStart
        ) {
            item {
                Column(modifier = Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("📅", fontSize = 12.sp, color = GreenAccent)
                            Spacer(modifier = Modifier.width(4.dp))
                            Column {
                                Text("AGENDA", color = Color.White, fontWeight = FontWeight.Black, fontSize = 12.sp, lineHeight = 12.sp)
                                Text(title.split(" ").last(), color = Color.White, fontWeight = FontWeight.Black, fontSize = 12.sp, lineHeight = 12.sp)
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("VOIR PERFORMANCE", color = PurplePrimary, fontSize = 8.sp, fontWeight = FontWeight.Black)
                            Spacer(modifier = Modifier.width(2.dp))
                            Text("↗", color = PurplePrimary, fontSize = 10.sp)
                        }
                    }
                }
            }
            
            if (summary.isEmpty()) {
                item { 
                    Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                        Text("Aucune donnée", color = Color.Gray, fontSize = 10.sp)
                    }
                }
            } else {
                itemsIndexed(summary) { index, day ->
                    val isToday = (index + 1) == currentDay
                    AgendaItem(
                        letter = dayInitialMap[day.day] ?: day.day.take(1).uppercase(),
                        workout = day.workout,
                        isToday = isToday
                    )
                }
            }
        }
    }
}

@Composable
fun AgendaItem(letter: String, workout: String, isToday: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(if (isToday) Color.Transparent else CardBg)
            .then(
                if (isToday) Modifier.border(1.5.dp, PurplePrimary, RoundedCornerShape(10.dp))
                else Modifier
            )
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(22.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(if (isToday) PurplePrimary else Color(0xFF2d2d35)),
            contentAlignment = Alignment.Center
        ) {
            Text(letter, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black)
        }
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            workout, 
            color = Color.White, 
            fontSize = 13.sp, 
            fontWeight = FontWeight.Bold, 
            modifier = Modifier.weight(1f),
            maxLines = 1
        )
        // Dot indicator
        Box(
            modifier = Modifier
                .size(5.dp)
                .clip(CircleShape)
                .background(if (isToday) GreenAccent else Color(0xFF40404a))
        )
    }
}
