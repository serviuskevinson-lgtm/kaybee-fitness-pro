package com.example.kaybeewear.presentation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

val PurplePrimary = Color(0xFF9d4edd)
val GreenAccent = Color(0xFF00f5d4)
val DarkBg = Color(0xFF0a0a0f)
val CardBg = Color(0xFF1a1a20)

class MainActivity : ComponentActivity(), MessageClient.OnMessageReceivedListener, SensorEventListener {

    // Données Santé
    private var heartRate by mutableIntStateOf(0)
    private var stepCount by mutableLongStateOf(0L)
    private var caloriesBurned by mutableDoubleStateOf(0.0)
    private var waterLevel by mutableDoubleStateOf(0.0)
    private var todayNutrition by mutableStateOf(NutritionData())

    // Accéléromètre (Debug)
    private var accelX by mutableFloatStateOf(0f)
    private var accelY by mutableFloatStateOf(0f)
    private var accelZ by mutableFloatStateOf(0f)
    
    // État Connexion
    private var isPhoneConnected by mutableStateOf(false)
    private var lastFirebaseSync by mutableStateOf("Jamais")
    private var firebaseSocketConnected by mutableStateOf(false)
    private var firebaseDataFound by mutableStateOf(false)

    // Agenda
    private val defaultWeekly = listOf(
        ScheduleDay("Lundi", "Repos"), ScheduleDay("Mardi", "Repos"), ScheduleDay("Mercredi", "Repos"),
        ScheduleDay("Jeudi", "Repos"), ScheduleDay("Vendredi", "Repos"), ScheduleDay("Samedi", "Repos"), ScheduleDay("Dimanche", "Repos")
    )
    private var weeklySummary by mutableStateOf<List<ScheduleDay>>(defaultWeekly)
    private var monthlySummary by mutableStateOf<List<ScheduleDay>>(emptyList())
    private var isCoach by mutableStateOf(false)
    private var currentUserId by mutableStateOf<String?>(null)

    // Session Active
    private var activeSession by mutableStateOf<SessionData?>(null)
    private var sessionDurationSeconds by mutableLongStateOf(0L)
    private var isSessionRunning by mutableStateOf(false)
    private var restTimeLeft by mutableIntStateOf(0)
    private var isResting by mutableStateOf(false)
    private var restTimer: CountDownTimer? = null

    private lateinit var sensorManager: SensorManager
    private lateinit var healthManager: HealthManager

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.values.all { it }) startHealthMonitoring()
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
            requestAutoPairing()
        }

        healthManager.monitorFirebaseConnection { connected -> firebaseSocketConnected = connected }
        checkConnection()

        // Timer de session
        CoroutineScope(Dispatchers.Default).launch {
            while (true) {
                delay(1000)
                if (isSessionRunning) sessionDurationSeconds++
            }
        }

        setContent {
            WearApp(
                heartRate = heartRate, stepCount = stepCount.toInt(), calories = caloriesBurned.toInt(),
                nutrition = todayNutrition, water = waterLevel,
                weeklySummary = weeklySummary, monthlySummary = monthlySummary,
                isCoach = isCoach,
                activeSession = activeSession, sessionDuration = sessionDurationSeconds,
                restTime = restTimeLeft, isResting = isResting,
                isPhoneConnected = isPhoneConnected, firebaseSocketConnected = firebaseSocketConnected,
                firebaseDataFound = firebaseDataFound, lastSync = lastFirebaseSync, currentUid = currentUserId ?: "N/A",
                accel = Triple(accelX, accelY, accelZ),
                onAddWater = { healthManager.addWater(0.25) },
                onStartRest = { duration -> startRestTimer(duration) },
                onStopSession = { stopSession() },
                onUpdateSet = { exoIdx, setIdx, weight, reps, done -> updateSetData(exoIdx, setIdx, weight, reps, done) },
                onRetryPair = { requestAutoPairing() }
            )
        }
        checkAndRequestPermissions()
    }

    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.BODY_SENSORS,
            Manifest.permission.ACTIVITY_RECOGNITION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.BODY_SENSORS_BACKGROUND)
        }
        val missing = permissions.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) startHealthMonitoring() else requestPermissionLauncher.launch(missing.toTypedArray())
    }

    private fun startHealthMonitoring() {
        healthManager.startHeartRateMonitoring()
        healthManager.startPassiveMonitoring()
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
            stepCount = (liveData.child("steps").value as? Number)?.toLong() ?: stepCount
            caloriesBurned = (liveData.child("calories_burned").value as? Number)?.toDouble() ?: caloriesBurned
            heartRate = (liveData.child("heart_rate").value as? Number)?.toInt() ?: heartRate
            waterLevel = (liveData.child("water").value as? Number)?.toDouble() ?: waterLevel
            
            val nutrition = liveData.child("nutrition")
            if (nutrition.exists()) {
                todayNutrition = NutritionData(
                    calories = (nutrition.child("calories").value as? Number)?.toInt() ?: 0,
                    protein = (nutrition.child("protein").value as? Number)?.toInt() ?: 0,
                    carbs = (nutrition.child("carbs").value as? Number)?.toInt() ?: 0,
                    fats = (nutrition.child("fats").value as? Number)?.toInt() ?: 0
                )
            }
            isCoach = snapshot.child("role").getValue(String::class.java) == "coach"
        } catch (e: Exception) { Log.e("KaybeeWear", "UI Sync Error", e) }
    }

    override fun onResume() {
        super.onResume()
        Wearable.getMessageClient(this).addListener(this)
        
        val sensors = listOf(Sensor.TYPE_HEART_RATE, Sensor.TYPE_STEP_DETECTOR, Sensor.TYPE_ACCELEROMETER)
        sensors.forEach { type ->
            sensorManager.getDefaultSensor(type)?.let { 
                sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) 
            }
        }
        checkConnection()
    }

    override fun onPause() {
        super.onPause()
        Wearable.getMessageClient(this).removeListener(this)
        sensorManager.unregisterListener(this)
    }

    private fun checkConnection() {
        Wearable.getNodeClient(this).connectedNodes.addOnSuccessListener { nodes ->
            isPhoneConnected = nodes.isNotEmpty()
        }
    }

    private fun requestAutoPairing() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val nodes = Tasks.await(Wearable.getNodeClient(this@MainActivity).connectedNodes)
                for (node in nodes) Wearable.getMessageClient(this@MainActivity).sendMessage(node.id, "/request-pair", null)
            } catch (e: Exception) { Log.e("KaybeeWear", "Pair Error", e) }
        }
    }

    // Remplace ta fonction onMessageReceived par celle-ci :
    override fun onMessageReceived(messageEvent: MessageEvent) {
        // LOG 1 : On prouve que le message est physiquement arrivé
        Log.d("KaybeeWear", "📩 MESSAGE REÇU ! Chemin: ${messageEvent.path}")
        
        isPhoneConnected = true
        
        when (messageEvent.path) {
            "/pair" -> {
                try {
                    val rawData = String(messageEvent.data)
                    // LOG 2 : On voit ce que le téléphone a envoyé
                    Log.d("KaybeeWear", "🔑 Données reçues: $rawData")

                    val uid = JSONObject(rawData).getString("userId")
                    
                    if (uid.isNotEmpty()) {
                        Log.d("KaybeeWear", "✅ UID trouvé: $uid")
                        currentUserId = uid
                        
                        // Sauvegarde
                        getSharedPreferences("kaybee_prefs", Context.MODE_PRIVATE)
                            .edit().putString("userId", uid).apply()
                            
                        healthManager.setUserId(uid)
                        startFirebaseSync()
                    }
                } catch (e: Exception) { 
                    Log.e("KaybeeWear", "❌ Erreur lecture UID", e) 
                }
            }
            "/start-session" -> {
                Log.d("KaybeeWear", "🏋️ Session reçue")
                parseSessionData(String(messageEvent.data))
            }
            "/stop-session" -> stopSession()
        }
    }

    private fun parseSessionData(json: String) {
        try {
            val root = JSONObject(json)
            val exercisesList = mutableListOf<SessionExercise>()
            val exosArray = root.getJSONArray("exercises")
            for (i in 0 until exosArray.length()) {
                val exo = exosArray.getJSONObject(i)
                val setsList = mutableListOf<SessionSet>()
                val setsCount = exo.optInt("sets", 3)
                for (j in 0 until setsCount) {
                    setsList.add(SessionSet(exo.optDouble("weight", 0.0).toFloat(), exo.optInt("reps", 10)))
                }
                exercisesList.add(SessionExercise(exo.optString("name", "Exo"), setsList))
            }
            activeSession = SessionData(root.optString("name", "Séance"), exercisesList)
            sessionDurationSeconds = 0
            isSessionRunning = true
        } catch (e: Exception) { Log.e("KaybeeWear", "Session Parse Error", e) }
    }

    private fun updateSetData(exoIdx: Int, setIdx: Int, weight: Float, reps: Int, done: Boolean) {
        activeSession?.let { session ->
            val exo = session.exercises[exoIdx]
            exo.sets[setIdx] = exo.sets[setIdx].copy(weight = weight, reps = reps, isDone = done)
            activeSession = session.copy()
        }
    }

    private fun startRestTimer(duration: Int) {
        restTimer?.cancel()
        isResting = true
        restTimeLeft = duration
        restTimer = object : CountDownTimer((duration * 1000).toLong(), 1000) {
            override fun onTick(ms: Long) { restTimeLeft = (ms / 1000).toInt() }
            override fun onFinish() { isResting = false; restTimeLeft = 0 }
        }.start()
    }

    private fun stopSession() {
        isSessionRunning = false
        activeSession = null
        restTimer?.cancel()
        isResting = false
    }

   override fun onSensorChanged(event: SensorEvent?) {
        when (event?.sensor?.type) {
            Sensor.TYPE_HEART_RATE -> if (event.values.isNotEmpty()) {
                heartRate = event.values[0].toInt()
                // On envoie aussi le rythme cardiaque en direct
                healthManager.syncHeartRateToFirebase(heartRate) 
            }
            
            Sensor.TYPE_STEP_DETECTOR -> {
                stepCount++
                // C'EST ICI LE FIX : On crie le nouveau score à Firebase immédiatement !
                healthManager.syncStepsToFirebase(stepCount)
            }
            
            Sensor.TYPE_ACCELEROMETER -> if (event.values.size >= 3) {
                accelX = event.values[0]
                accelY = event.values[1]
                accelZ = event.values[2]
                // (Optionnel) Evite de saturer le réseau avec l'accéléromètre si tu ne t'en sers pas pour le debug
                // healthManager.syncAccelerometerToFirebase(accelX, accelY, accelZ)
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not used
    }
}

data class ScheduleDay(val day: String, val workout: String)
data class NutritionData(val calories: Int = 0, val protein: Int = 0, val carbs: Int = 0, val fats: Int = 0)
data class SessionData(val name: String, val exercises: List<SessionExercise>)
data class SessionExercise(val name: String, val sets: MutableList<SessionSet>)
data class SessionSet(val weight: Float, val reps: Int, val isDone: Boolean = false)

@Composable
fun WearApp(
    heartRate: Int, stepCount: Int, calories: Int, nutrition: NutritionData, water: Double,
    weeklySummary: List<ScheduleDay>, monthlySummary: List<ScheduleDay>, isCoach: Boolean,
    activeSession: SessionData?, sessionDuration: Long, restTime: Int, isResting: Boolean,
    isPhoneConnected: Boolean, firebaseSocketConnected: Boolean, firebaseDataFound: Boolean,
    lastSync: String, currentUid: String, accel: Triple<Float, Float, Float>,
    onAddWater: () -> Unit, onStartRest: (Int) -> Unit, onStopSession: () -> Unit,
    onUpdateSet: (Int, Int, Float, Int, Boolean) -> Unit,
    onRetryPair: () -> Unit
) {
    val pageCount = if (isCoach) 5 else 4
    val pagerState = rememberPagerState(pageCount = { pageCount })
    var showDebug by remember { mutableStateOf(false) }

    Scaffold(timeText = { TimeText() }) {
        Box(modifier = Modifier.fillMaxSize()) {
            HorizontalPager(state = pagerState) { page ->
                when (page) {
                    0 -> DashboardPage(heartRate, stepCount, calories, water, onAddWater, onLongClick = { showDebug = true })
                    1 -> NutritionPage(nutrition)
                    2 -> SessionPage(activeSession, sessionDuration, restTime, isResting, onStartRest, onStopSession, onUpdateSet)
                    3 -> SchedulePage("AGENDA HEBDO", weeklySummary)
                    4 -> SchedulePage("AGENDA MENSUEL", monthlySummary)
                }
            }
            if (showDebug) {
                Box(modifier = Modifier.fillMaxSize().background(DarkBg)) {
                    ConnectionDebugPage(
                        isPhoneConnected,
                        firebaseSocketConnected,
                        firebaseDataFound,
                        lastSync,
                        currentUid,
                        accel,
                        onRetryPair,
                        onClose = { showDebug = false }
                    )
                }
            }
        }
    }
}

@Composable
fun DashboardPage(hr: Int, steps: Int, calories: Int, water: Double, onAddWater: () -> Unit, onLongClick: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().background(DarkBg), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(4.dp)) {
            Text("KAYBEE", color = PurplePrimary, fontWeight = FontWeight.Black, fontSize = 10.sp,
                modifier = Modifier.pointerInput(Unit) { detectTapGestures(onLongPress = { onLongClick() }) })
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(50.dp).clip(CircleShape).background(CardBg)) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (hr > 0) "$hr" else "--", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                        Text("BPM", fontSize = 8.sp, color = Color.Gray)
                    }
                }
                Spacer(modifier = Modifier.width(8.dp))
                Button(onClick = onAddWater, modifier = Modifier.size(40.dp), colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFF3b82f6))) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("💧", fontSize = 12.sp)
                        Text("${water}L", fontSize = 8.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                StatItem("👣", steps.toString(), "PAS", GreenAccent)
                StatItem("🔥", calories.toString(), "KCAL", PurplePrimary)
            }
        }
    }
}

@Composable
fun StatItem(emoji: String, value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(emoji, fontSize = 14.sp)
        Text(value, color = color, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Text(label, color = Color.Gray, fontSize = 7.sp)
    }
}

@Composable
fun NutritionPage(nutrition: NutritionData) {
    ScalingLazyColumn(modifier = Modifier.fillMaxSize().background(DarkBg)) {
        item { Text("NUTRITION", color = GreenAccent, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(bottom = 8.dp)) }
        item { NutritionCard("Calories", "${nutrition.calories}", "kcal", GreenAccent) }
        item { NutritionCard("Protéines", "${nutrition.protein}", "g", Color(0xFFf43f5e)) }
        item { NutritionCard("Glucides", "${nutrition.carbs}", "g", Color(0xFF3b82f6)) }
        item { NutritionCard("Lipides", "${nutrition.fats}", "g", Color(0xFFeab308)) }
    }
}

@Composable
fun NutritionCard(label: String, value: String, unit: String, color: Color) {
    Box(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp).clip(RoundedCornerShape(8.dp)).background(CardBg).padding(8.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = Color.White, fontSize = 10.sp)
            Row {
                Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 10.sp)
                Text(" $unit", color = Color.Gray, fontSize = 10.sp)
            }
        }
    }
}

@Composable
fun SchedulePage(title: String, schedule: List<ScheduleDay>) {
    ScalingLazyColumn(modifier = Modifier.fillMaxSize().background(DarkBg)) {
        item { Text(title, color = PurplePrimary, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(bottom = 8.dp)) }
        items(schedule) { day ->
            Box(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp).clip(RoundedCornerShape(8.dp)).background(CardBg).padding(8.dp)) {
                Column {
                    Text(day.day, color = GreenAccent, fontWeight = FontWeight.Bold, fontSize = 9.sp)
                    Text(day.workout, color = Color.White, fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
fun SessionPage(
    session: SessionData?, duration: Long, restTime: Int, isResting: Boolean,
    onStartRest: (Int) -> Unit, onStopSession: () -> Unit, onUpdateSet: (Int, Int, Float, Int, Boolean) -> Unit
) {
    if (session == null) {
        Box(modifier = Modifier.fillMaxSize().background(DarkBg), contentAlignment = Alignment.Center) {
            Text("AUCUNE SÉANCE\nACTIVE", color = Color.Gray, textAlign = TextAlign.Center, fontSize = 12.sp)
        }
    } else {
        ScalingLazyColumn(modifier = Modifier.fillMaxSize().background(DarkBg)) {
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text(session.name.uppercase(), color = PurplePrimary, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    Text(formatDuration(duration), color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    if (isResting) {
                        Text("REPOS: ${restTime}s", color = GreenAccent, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }
            itemsIndexed(session.exercises) { exoIdx, exo ->
                Text(exo.name, color = GreenAccent, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
                exo.sets.forEachIndexed { setIdx, set ->
                    SetItem(exoIdx, setIdx, set, onStartRest, onUpdateSet)
                }
            }
            item {
                Button(onClick = onStopSession, modifier = Modifier.fillMaxWidth().padding(top = 16.dp), colors = ButtonDefaults.buttonColors(backgroundColor = Color.Red)) {
                    Text("TERMINER", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun SetItem(exoIdx: Int, setIdx: Int, set: SessionSet, onStartRest: (Int) -> Unit, onUpdateSet: (Int, Int, Float, Int, Boolean) -> Unit) {
    ToggleChip(
        checked = set.isDone,
        onCheckedChange = { 
            onUpdateSet(exoIdx, setIdx, set.weight, set.reps, it)
            if (it) onStartRest(60)
        },
        label = { Text("Série ${setIdx + 1}: ${set.weight}kg x ${set.reps}", fontSize = 10.sp) },
        toggleControl = { Icon(imageVector = if (set.isDone) ToggleChipDefaults.checkboxIcon(true) else ToggleChipDefaults.checkboxIcon(false), contentDescription = null) },
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        colors = ToggleChipDefaults.toggleChipColors(
            checkedStartBackgroundColor = Color(0xFF065f46),
            uncheckedStartBackgroundColor = CardBg
        )
    )
}

@Composable
fun ConnectionDebugPage(
    isPhone: Boolean, 
    firebaseSocket: Boolean, 
    firebaseData: Boolean, 
    lastSync: String, 
    uid: String, 
    accel: Triple<Float, Float, Float>, 
    onRetryPair: () -> Unit,
    onClose: () -> Unit
) {
    ScalingLazyColumn(modifier = Modifier.fillMaxSize().background(DarkBg).padding(8.dp)) {
        item { Text("DEBUG CONNEXION", color = GreenAccent, fontWeight = FontWeight.Bold, fontSize = 10.sp) }
        item { DebugRow("Téléphone", isPhone) }
        item { DebugRow("Socket Firebase", firebaseSocket) }
        item { DebugRow("Data Firebase", firebaseData) }
        item { Text("Last Sync: $lastSync", fontSize = 8.sp, color = Color.Gray) }
        item { Text("UID: ${uid.take(10)}...", fontSize = 8.sp, color = Color.Gray) }
        item { 
            Text(String.format("Accel: %.1f, %.1f, %.1f", accel.first, accel.second, accel.third), 
                fontSize = 8.sp, color = PurplePrimary) 
        }
        item {
            Button(onClick = onRetryPair, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), colors = ButtonDefaults.buttonColors(backgroundColor = PurplePrimary)) {
                Text("RE-PAIRER", fontSize = 10.sp)
            }
        }
        item {
            Button(onClick = onClose, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
                Text("FERMER", fontSize = 10.sp)
            }
        }
    }
}

@Composable
fun DebugRow(label: String, ok: Boolean) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 9.sp, color = Color.White)
        Text(if (ok) "OK" else "KO", fontSize = 9.sp, color = if (ok) Color.Green else Color.Red, fontWeight = FontWeight.Bold)
    }
}

fun formatDuration(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) String.format("%02d:%02d:%02d", h, m, s) else String.format("%02d:%02d", m, s)
}
