package com.example.kaybeewear.presentation

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
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
import androidx.compose.material.LinearProgressIndicator
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.itemsIndexed
import androidx.wear.compose.material.*
import com.example.kaybeewear.health.HealthManager
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.ServerValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

val PurplePrimary = Color(0xFF9d4edd)
val GreenAccent = Color(0xFF00f5d4)
val DarkBg = Color(0xFF0a0a0f)
val CardBg = Color(0xFF1a1a20)
val WaterBlue = Color(0xFF3b82f6)

class MainActivity : ComponentActivity(), MessageClient.OnMessageReceivedListener, SensorEventListener {

    private var heartRate by mutableIntStateOf(0)
    private var stepCount by mutableLongStateOf(0L)
    private var caloriesBurned by mutableDoubleStateOf(0.0)
    private var waterLevel by mutableDoubleStateOf(0.0)
    private var todayNutrition by mutableStateOf(NutritionData())

    private var accelX by mutableFloatStateOf(0f)
    private var accelY by mutableFloatStateOf(0f)
    private var accelZ by mutableFloatStateOf(0f)
    
    private var isPhoneConnected by mutableStateOf(false)
    private var lastFirebaseSync by mutableStateOf("Jamais")
    private var firebaseSocketConnected by mutableStateOf(false)
    private var firebaseDataFound by mutableStateOf(false)

    private val defaultWeekly = listOf(
        ScheduleDay("Lundi", "Repos"), ScheduleDay("Mardi", "Repos"), ScheduleDay("Mercredi", "Repos"),
        ScheduleDay("Jeudi", "Repos"), ScheduleDay("Vendredi", "Repos"), ScheduleDay("Samedi", "Repos"), ScheduleDay("Dimanche", "Repos")
    )
    private var weeklySummary by mutableStateOf(defaultWeekly)
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

        setContent {
            WearApp(
                heartRate = heartRate, stepCount = stepCount.toInt(), calories = caloriesBurned.toInt(),
                nutrition = todayNutrition, water = waterLevel,
                weeklySummary = weeklySummary,
                isCoach = isCoach,
                activeSession = activeSession, sessionDuration = sessionDurationSeconds,
                restTime = restTimeLeft, isResting = isResting,
                isPhoneConnected = isPhoneConnected, firebaseSocketConnected = firebaseSocketConnected,
                firebaseDataFound = firebaseDataFound, lastSync = lastFirebaseSync, currentUid = currentUserId ?: "N/A",
                accel = Triple(accelX, accelY, accelZ),
                onAddWater = { amount -> healthManager.addWater(amount) },
                onStartRest = { duration -> startRestTimer(duration) },
                onStopSession = { stopSessionLocally() },
                onUpdateSet = { groupIdx, exoIdx, setIdx, weight, reps, done -> updateSetData(groupIdx, exoIdx, setIdx, weight, reps, done) },
                onAdjustWeight = { groupIdx, exoIdx, setIdx, delta -> adjustWeight(groupIdx, exoIdx, setIdx, delta) },
                onRetryPair = { requestAutoPairing() }
            )
        }
        checkAndRequestPermissions()
    }

    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf(Manifest.permission.BODY_SENSORS, Manifest.permission.ACTIVITY_RECOGNITION)
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
            
            // Sync Agenda from Firebase
            val scheduleSnap = snapshot.child("schedule")
            if (scheduleSnap.exists()) {
                val newSchedule = mutableListOf<ScheduleDay>()
                scheduleSnap.children.forEach { daySnap ->
                    val dayName = daySnap.key ?: "Jour"
                    val workout = daySnap.child("workout").getValue(String::class.java) ?: "Repos"
                    newSchedule.add(ScheduleDay(dayName, workout))
                }
                if (newSchedule.isNotEmpty()) weeklySummary = newSchedule
            }

            val sessionSnap = liveData.child("session")
            if (sessionSnap.exists() && sessionSnap.child("active").getValue(Boolean::class.java) == true) {
                isSessionRunning = true
                sessionDurationSeconds = (sessionSnap.child("elapsedSeconds").value as? Number)?.toLong() ?: 0L
                
                val workoutName = sessionSnap.child("workoutName").getValue(String::class.java) ?: "Séance"
                val groupsSnap = sessionSnap.child("groups")
                val logsSnap = sessionSnap.child("logs")
                
                val groupsList = mutableListOf<SessionGroup>()
                
                if (groupsSnap.exists()) {
                    groupsSnap.children.forEachIndexed { groupIdx, gSnap ->
                        val setType = gSnap.child("setType").getValue(String::class.java) ?: "straight"
                        val setsCount = (gSnap.child("sets").value as? Number)?.toInt() ?: 3
                        val restDefault = (gSnap.child("rest").value as? Number)?.toInt() ?: 60
                        
                        val exercisesList = mutableListOf<SessionExercise>()
                        gSnap.child("exercises").children.forEachIndexed { exoIdx, eSnap ->
                            val exoName = eSnap.child("name").getValue(String::class.java) ?: "Exo"
                            val repsDefault = (eSnap.child("reps").value as? Number)?.toInt() ?: 10
                            val weightDefault = (eSnap.child("weight").value as? Number)?.toFloat() ?: 0f
                            
                            val setsList = mutableListOf<SessionSet>()
                            for (setIdx in 0 until setsCount) {
                                val logKey = "$groupIdx-$exoIdx-$setIdx"
                                val logSnap = logsSnap.child(logKey)
                                val isDone = logSnap.child("done").getValue(Boolean::class.java) ?: false
                                val weight = (logSnap.child("weight").value as? Number)?.toFloat() ?: weightDefault
                                val reps = (logSnap.child("reps").value as? Number)?.toInt() ?: repsDefault
                                setsList.add(SessionSet(weight, reps, isDone))
                            }
                            exercisesList.add(SessionExercise(exoName, setsList, restDefault))
                        }
                        groupsList.add(SessionGroup(setType, exercisesList, setsCount, restDefault))
                    }
                } else {
                    val exosSnap = sessionSnap.child("exercises")
                    exosSnap.children.forEachIndexed { exoIdx, eSnap ->
                        val setsCount = (eSnap.child("sets").value as? Number)?.toInt() ?: 3
                        val repsDefault = (eSnap.child("reps").value as? Number)?.toInt() ?: 10
                        val weightDefault = (eSnap.child("weight").value as? Number)?.toFloat() ?: 0f
                        
                        val setsList = mutableListOf<SessionSet>()
                        for (setIdx in 0 until setsCount) {
                            val logKey = "$exoIdx-$setIdx"
                            val logSnap = logsSnap.child(logKey)
                            val isDone = logSnap.child("done").getValue(Boolean::class.java) ?: false
                            val weight = (logSnap.child("weight").value as? Number)?.toFloat() ?: weightDefault
                            val reps = (logSnap.child("reps").value as? Number)?.toInt() ?: repsDefault
                            setsList.add(SessionSet(weight, reps, isDone))
                        }
                        val exo = SessionExercise(eSnap.child("name").getValue(String::class.java) ?: "Exo", setsList, (eSnap.child("rest").value as? Number)?.toInt() ?: 60)
                        groupsList.add(SessionGroup("straight", listOf(exo), setsCount, exo.rest))
                    }
                }
                activeSession = SessionData(workoutName, groupsList)
            } else if (isSessionRunning) {
                stopSessionLocally()
            }

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
        sensors.forEach { type -> sensorManager.getDefaultSensor(type)?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) } }
        checkConnection()
    }

    override fun onPause() {
        super.onPause()
        Wearable.getMessageClient(this).removeListener(this)
        sensorManager.unregisterListener(this)
    }

    private fun checkConnection() {
        Wearable.getNodeClient(this).connectedNodes.addOnSuccessListener { nodes -> isPhoneConnected = nodes.isNotEmpty() }
    }

    private fun requestAutoPairing() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val nodes = Tasks.await(Wearable.getNodeClient(this@MainActivity).connectedNodes)
                for (node in nodes) Wearable.getMessageClient(this@MainActivity).sendMessage(node.id, "/request-pair", null)
            } catch (e: Exception) { Log.e("KaybeeWear", "Pair Error", e) }
        }
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        isPhoneConnected = true
        when (messageEvent.path) {
            "/pair" -> {
                try {
                    val uid = JSONObject(String(messageEvent.data)).getString("userId")
                    if (uid.isNotEmpty()) {
                        currentUserId = uid
                        getSharedPreferences("kaybee_prefs", Context.MODE_PRIVATE).edit().putString("userId", uid).apply()
                        healthManager.setUserId(uid)
                        startFirebaseSync()
                    }
                } catch (e: Exception) { Log.e("KaybeeWear", "Pair Error", e) }
            }
            "/start-session" -> { /* Sync via RTDB */ }
            "/stop-session" -> stopSessionLocally()
        }
    }

    private fun updateSetData(groupIdx: Int, exoIdx: Int, setIdx: Int, weight: Float, reps: Int, done: Boolean) {
        val uid = currentUserId ?: return
        val logKey = if (groupIdx >= 0) "$groupIdx-$exoIdx-$setIdx" else "$exoIdx-$setIdx"
        val updates = mapOf(
            "done" to done,
            "weight" to weight,
            "reps" to reps,
            "timestamp" to ServerValue.TIMESTAMP
        )
        healthManager.updateSessionLog(uid, logKey, updates)
        
        if (done) {
            val group = activeSession?.groups?.getOrNull(groupIdx)
            val isLastExo = group != null && exoIdx == group.exercises.size - 1
            if (isLastExo || groupIdx < 0) {
                val restDuration = group?.rest ?: 60
                startRestTimer(restDuration)
            }
        }
    }

    private fun adjustWeight(groupIdx: Int, exoIdx: Int, setIdx: Int, delta: Float) {
        val group = activeSession?.groups?.getOrNull(groupIdx) ?: return
        val set = group.exercises.getOrNull(exoIdx)?.sets?.getOrNull(setIdx) ?: return
        updateSetData(groupIdx, exoIdx, setIdx, (set.weight + delta).coerceAtLeast(0f), set.reps, set.isDone)
    }

    private fun startRestTimer(duration: Int) {
        restTimer?.cancel()
        isResting = true
        restTimeLeft = duration
        restTimer = object : CountDownTimer((duration * 1000).toLong(), 1000) {
            override fun onTick(ms: Long) { restTimeLeft = (ms / 1000).toInt() }
            override fun onFinish() { 
                isResting = false; restTimeLeft = 0
                vibrate(500)
            }
        }.start()
    }

    @SuppressLint("MissingPermission")
    private fun vibrate(duration: Long) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(duration)
        }
    }

    private fun stopSessionLocally() {
        isSessionRunning = false
        activeSession = null
        restTimer?.cancel()
        isResting = false
    }

   override fun onSensorChanged(event: SensorEvent?) {
        when (event?.sensor?.type) {
            Sensor.TYPE_HEART_RATE -> if (event.values.isNotEmpty()) {
                heartRate = event.values[0].toInt()
                healthManager.syncHeartRateToFirebase(heartRate) 
            }
            Sensor.TYPE_STEP_DETECTOR -> {
                stepCount++
                healthManager.syncStepsToFirebase(stepCount)
            }
            Sensor.TYPE_ACCELEROMETER -> if (event.values.size >= 3) {
                accelX = event.values[0]; accelY = event.values[1]; accelZ = event.values[2]
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}

data class ScheduleDay(val day: String, val workout: String)
data class NutritionData(val calories: Int = 0, val protein: Int = 0, val carbs: Int = 0, val fats: Int = 0)
data class SessionData(val name: String, val groups: List<SessionGroup>)
data class SessionGroup(val type: String, val exercises: List<SessionExercise>, val sets: Int, val rest: Int)
data class SessionExercise(val name: String, val sets: List<SessionSet>, val rest: Int = 60)
data class SessionSet(val weight: Float, val reps: Int, val isDone: Boolean = false)

@Composable
fun WearApp(
    heartRate: Int, stepCount: Int, calories: Int, nutrition: NutritionData, water: Double,
    weeklySummary: List<ScheduleDay>, isCoach: Boolean,
    activeSession: SessionData?, sessionDuration: Long, restTime: Int, isResting: Boolean,
    isPhoneConnected: Boolean, firebaseSocketConnected: Boolean, firebaseDataFound: Boolean,
    lastSync: String, currentUid: String, accel: Triple<Float, Float, Float>,
    onAddWater: (Double) -> Unit, onStartRest: (Int) -> Unit, onStopSession: () -> Unit,
    onUpdateSet: (Int, Int, Int, Float, Int, Boolean) -> Unit,
    onAdjustWeight: (Int, Int, Int, Float) -> Unit,
    onRetryPair: () -> Unit
) {
    val pagerState = rememberPagerState(pageCount = { 5 })
    var showDebug by remember { mutableStateOf(false) }

    Scaffold(timeText = { TimeText() }) {
        Box(modifier = Modifier.fillMaxSize()) {
            HorizontalPager(state = pagerState) { page ->
                when (page) {
                    0 -> DashboardPage(heartRate, stepCount, calories, water, onAddWater, onLongClick = { showDebug = true })
                    1 -> RunScreen(heartRate, stepCount, calories)
                    2 -> SessionPage(activeSession, sessionDuration, restTime, isResting, onUpdateSet, onAdjustWeight)
                    3 -> NutritionPage(nutrition)
                    4 -> AgendaScreen(weeklySummary)
                }
            }
            if (showDebug) {
                Box(modifier = Modifier.fillMaxSize().background(DarkBg)) {
                    ConnectionDebugPage(isPhoneConnected, firebaseSocketConnected, firebaseDataFound, lastSync, currentUid, onRetryPair, onClose = { showDebug = false })
                }
            }
        }
    }
}

@Composable
fun DashboardPage(hr: Int, steps: Int, calories: Int, water: Double, onAddWater: (Double) -> Unit, onLongClick: () -> Unit) {
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize().background(DarkBg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 20.dp)
    ) {
        item {
            Text("KAYBEE", color = PurplePrimary, fontWeight = FontWeight.Black, fontSize = 12.sp,
                modifier = Modifier.pointerInput(Unit) { detectTapGestures(onLongPress = { onLongClick() }) })
        }
        
        // Calories & Heart Rate Row
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                WidgetCard(
                    modifier = Modifier.weight(1f),
                    label = "CALORIES",
                    value = "$calories",
                    unit = "KCAL",
                    icon = Icons.Default.LocalFireDepartment,
                    iconColor = Color(0xFFFFB703)
                )
                WidgetCard(
                    modifier = Modifier.weight(1f),
                    label = "POULS",
                    value = if (hr > 0) "$hr" else "--",
                    unit = "BPM",
                    icon = Icons.Default.Favorite,
                    iconColor = Color(0xFFF94144)
                )
            }
        }

        // Steps Card
        item {
            StepWidget(steps = steps, target = 10000)
        }

        // Hydration Card
        item {
            HydrationWidget(water = water, target = 2.5, onAddWater = onAddWater)
        }
        
        item { Spacer(modifier = Modifier.height(20.dp)) }
    }
}

@Composable
fun WidgetCard(modifier: Modifier, label: String, value: String, unit: String, icon: ImageVector, iconColor: Color) {
    Box(modifier = modifier.clip(RoundedCornerShape(12.dp)).background(CardBg).padding(8.dp)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(label, color = Color.Gray, fontSize = 7.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.weight(1f))
                Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(12.dp))
            }
            Row(verticalAlignment = Alignment.Bottom) {
                Text(value, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Black)
                Text(" $unit", color = Color.Gray, fontSize = 7.sp, modifier = Modifier.padding(bottom = 2.dp))
            }
        }
    }
}

@Composable
fun StepWidget(steps: Int, target: Int) {
    val progress = (steps.toFloat() / target.toFloat()).coerceIn(0f, 1f)
    Box(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(CardBg).padding(8.dp)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Filled.DirectionsWalk, contentDescription = null, tint = PurplePrimary, modifier = Modifier.size(14.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("PAS", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.weight(1f))
                Text("${(progress * 100).toInt()}%", color = PurplePrimary, fontSize = 8.sp, fontWeight = FontWeight.Bold)
            }
            Text("$steps", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
            Spacer(modifier = Modifier.height(4.dp))
            LinearProgressIndicator(
                progress = progress,
                modifier = Modifier.fillMaxWidth().height(4.dp).clip(CircleShape),
                color = PurplePrimary,
                backgroundColor = Color.DarkGray
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("BUT: $target", color = Color.Gray, fontSize = 7.sp)
                Text(String.format(Locale.getDefault(), "%.2f KM", steps * 0.00076), color = Color.Gray, fontSize = 7.sp)
            }
        }
    }
}

@Composable
fun HydrationWidget(water: Double, target: Double, onAddWater: (Double) -> Unit) {
    val progress = (water.toFloat() / target.toFloat()).coerceIn(0f, 1f)
    var increment by remember { mutableStateOf(0.25) }

    Box(modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(CardBg).padding(8.dp)) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("HYDRATATION", color = Color.Gray, fontSize = 7.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.weight(1f))
                Box(modifier = Modifier.clip(CircleShape).background(WaterBlue.copy(alpha = 0.2f)).padding(horizontal = 4.dp, vertical = 2.dp)) {
                    Text("${(progress * 100).toInt()}% DU BUT", color = WaterBlue, fontSize = 7.sp, fontWeight = FontWeight.Bold)
                }
            }
            Text("QUOTIDIENNE", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black)
            
            Spacer(modifier = Modifier.height(4.dp))
            
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
                Text(String.format(Locale.getDefault(), "%.2f", water), color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Text(" L", color = Color.Gray, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
            }
            Text("OBJECTIF: ${target}L", color = Color.Gray, fontSize = 7.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())

            Spacer(modifier = Modifier.height(4.dp))
            LinearProgressIndicator(
                progress = progress,
                modifier = Modifier.fillMaxWidth().height(6.dp).clip(CircleShape),
                color = WaterBlue,
                backgroundColor = Color.DarkGray
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(20.dp)).background(Color.Black.copy(alpha = 0.3f)).padding(2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Button(onClick = { increment = (increment - 0.05).coerceAtLeast(0.05) }, modifier = Modifier.size(24.dp), colors = ButtonDefaults.buttonColors(backgroundColor = Color.Transparent)) {
                        Text("-", color = Color.White, fontSize = 14.sp)
                    }
                    Text("${(increment * 1000).toInt()} ml", fontSize = 8.sp, color = Color.White)
                    Button(onClick = { increment = (increment + 0.05).coerceAtMost(1.0) }, modifier = Modifier.size(24.dp), colors = ButtonDefaults.buttonColors(backgroundColor = Color.Transparent)) {
                        Text("+", color = Color.White, fontSize = 14.sp)
                    }
                }
                Spacer(modifier = Modifier.width(4.dp))
                Button(
                    onClick = { onAddWater(increment) },
                    modifier = Modifier.height(28.dp).weight(0.6f),
                    colors = ButtonDefaults.buttonColors(backgroundColor = WaterBlue),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.LocalDrink, contentDescription = null, modifier = Modifier.size(10.dp))
                        Spacer(modifier = Modifier.width(2.dp))
                        Text("AJOUTER", fontSize = 7.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
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
fun SessionPage(
    session: SessionData?, duration: Long, restTime: Int, isResting: Boolean,
    onUpdateSet: (Int, Int, Int, Float, Int, Boolean) -> Unit,
    onAdjustWeight: (Int, Int, Int, Float) -> Unit
) {
    if (session == null) {
        Box(modifier = Modifier.fillMaxSize().background(DarkBg), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(imageVector = Icons.Default.Timer, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(32.dp))
                Spacer(modifier = Modifier.height(8.dp))
                Text("SÉANCE EN ATTENTE", color = Color.Gray, textAlign = TextAlign.Center, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text("Lancez la séance sur le téléphone", color = Color.Gray, textAlign = TextAlign.Center, fontSize = 8.sp)
            }
        }
    } else {
        ScalingLazyColumn(modifier = Modifier.fillMaxSize().background(DarkBg)) {
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text(session.name.uppercase(), color = PurplePrimary, fontWeight = FontWeight.Black, fontSize = 11.sp)
                    Text(formatDuration(duration), color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
                    if (isResting) {
                        Box(modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(GreenAccent).padding(horizontal = 12.dp, vertical = 4.dp)) {
                            Text("REPOS: ${restTime}s", color = Color.Black, fontWeight = FontWeight.Black, fontSize = 14.sp)
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }
            itemsIndexed(session.groups) { groupIdx, group ->
                val typeName = when(group.type) {
                    "superset_antagonist", "superset_agonist" -> "SUPERSET"
                    "triset" -> "TRI-SET"
                    "giant_set" -> "SÉRIE GÉANTE"
                    "dropset" -> "DROP SET"
                    else -> null
                }
                
                if (typeName != null) {
                    Text(typeName, color = PurplePrimary, fontSize = 8.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 8.dp))
                }
                
                group.exercises.forEachIndexed { exoIdx, exo ->
                    Text(exo.name.uppercase(), color = GreenAccent, fontSize = 10.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
                    for (setIdx in 0 until group.sets) {
                        val set = exo.sets.getOrNull(setIdx) ?: SessionSet(0f, 10, false)
                        SetCard(groupIdx, exoIdx, setIdx, set, onUpdateSet, onAdjustWeight)
                    }
                }
            }
        }
    }
}

@Composable
fun SetCard(groupIdx: Int, exoIdx: Int, setIdx: Int, set: SessionSet, onUpdateSet: (Int, Int, Int, Float, Int, Boolean) -> Unit, onAdjustWeight: (Int, Int, Int, Float) -> Unit) {
    Box(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(16.dp)).background(if (set.isDone) Color(0xFF065f46) else CardBg).padding(8.dp)) {
        Column {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("SÉRIE ${setIdx + 1}", color = if (set.isDone) Color.White else Color.Gray, fontSize = 9.sp, fontWeight = FontWeight.Black)
                Checkbox(checked = set.isDone, onCheckedChange = { onUpdateSet(groupIdx, exoIdx, setIdx, set.weight, set.reps, it) }, modifier = Modifier.size(24.dp))
            }
            Spacer(modifier = Modifier.height(4.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = { onAdjustWeight(groupIdx, exoIdx, setIdx, -5f) }, modifier = Modifier.size(32.dp)) { Text("-", color = Color.White, fontSize = 20.sp) }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("${set.weight.toInt()}", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                    Text("LBS", color = Color.Gray, fontSize = 8.sp)
                }
                Button(onClick = { onAdjustWeight(groupIdx, exoIdx, setIdx, 5f) }, modifier = Modifier.size(32.dp)) { Text("+", color = Color.White, fontSize = 20.sp) }
                
                Spacer(modifier = Modifier.width(8.dp))
                
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("${set.reps}", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                    Text("REPS", color = Color.Gray, fontSize = 8.sp)
                }
            }
        }
    }
}

@Composable
fun ConnectionDebugPage(isPhone: Boolean, firebaseSocketConnected: Boolean, firebaseDataFound: Boolean, lastSync: String, currentUid: String, onRetryPair: () -> Unit, onClose: () -> Unit) {
    ScalingLazyColumn(modifier = Modifier.fillMaxSize().background(DarkBg).padding(8.dp)) {
        item { Text("DEBUG CONNEXION", color = GreenAccent, fontWeight = FontWeight.Bold, fontSize = 10.sp) }
        item { DebugRow("Téléphone", isPhone) }
        item { DebugRow("Socket Firebase", firebaseSocketConnected) }
        item { DebugRow("Data Firebase", firebaseDataFound) }
        item { Text("Last Sync: $lastSync", fontSize = 8.sp, color = Color.Gray) }
        item { Text("UID: ${currentUid.take(10)}...", fontSize = 8.sp, color = Color.Gray) }
        item { Button(onClick = onRetryPair, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), colors = ButtonDefaults.buttonColors(backgroundColor = PurplePrimary)) { Text("RE-PAIRER", fontSize = 10.sp) } }
        item { Button(onClick = onClose, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) { Text("FERMER", fontSize = 10.sp) } }
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
    return if (h > 0) String.format(Locale.getDefault(), "%02d:%02d:%02d", h, m, s) else String.format(Locale.getDefault(), "%02d:%02d", m, s)
}
