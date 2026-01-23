package com.example.kaybeewear.presentation

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.delay
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.example.kaybeewear.health.HealthManager

// --- COULEURS ---
val PurplePrimary = Color(0xFF9d4edd)
val PurpleDark = Color(0xFF7b2cbf)
val GreenAccent = Color(0xFF00f5d4)

class MainActivity : ComponentActivity(), MessageClient.OnMessageReceivedListener, SensorEventListener {

    // --- ÉTATS GLOBAUX (Accessibles par l'UI) ---
    var heartRate by mutableIntStateOf(0)
    var stepCount by mutableIntStateOf(0)
    
    // Données reçues du téléphone (JSON)
    var calendarData by mutableStateOf<List<String>>(emptyList())
    var activeWorkout by mutableStateOf<WorkoutData?>(null)

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

        setContent {
            WearApp(
                heartRate = heartRate,
                stepCount = stepCount,
                calendarData = calendarData,
                activeWorkout = activeWorkout
            )
        }

        checkAndRequestPermissions()
    }

    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.BODY_SENSORS,
            Manifest.permission.ACTIVITY_RECOGNITION
        )
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
        
        // Activer les capteurs pour l'affichage local
        val hrSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE)
        val stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        
        hrSensor?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
        stepSensor?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
    }

    override fun onPause() {
        super.onPause()
        Wearable.getMessageClient(this).removeListener(this)
        sensorManager.unregisterListener(this)
    }

    // --- RÉCEPTION DES DONNÉES DU TÉLÉPHONE ---
    override fun onMessageReceived(messageEvent: MessageEvent) {
        val jsonString = String(messageEvent.data)
        val gson = Gson()

        when (messageEvent.path) {
            "/update-calendar" -> {
                val listType = object : TypeToken<List<String>>() {}.type
                calendarData = gson.fromJson(jsonString, listType)
            }
            "/start-session" -> {
                activeWorkout = gson.fromJson(jsonString, WorkoutData::class.java)
            }
            "/stop-session" -> {
                activeWorkout = null
            }
        }
    }

    // --- CAPTEURS ---
    override fun onSensorChanged(event: SensorEvent?) {
        event ?: return
        if (event.sensor.type == Sensor.TYPE_HEART_RATE) {
            heartRate = event.values[0].toInt()
        } else if (event.sensor.type == Sensor.TYPE_STEP_COUNTER) {
            stepCount = event.values[0].toInt()
        }
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}

// --- MODÈLES DE DONNÉES ---
data class WorkoutData(
    val name: String,
    val exercises: List<ExerciseData>
)

data class ExerciseData(
    val name: String,
    val sets: Int,
    val reps: Int,
    val weight: Float
)

// --- UI PRINCIPALE (SWIPE) ---
@Composable
fun WearApp(
    heartRate: Int, 
    stepCount: Int, 
    calendarData: List<String>, 
    activeWorkout: WorkoutData?
) {
    val pagerState = rememberPagerState(pageCount = { 3 })

    Scaffold(
        timeText = { TimeText() }
    ) {
        HorizontalPager(state = pagerState) { page ->
            when (page) {
                0 -> HealthPage(heartRate, stepCount)
                1 -> SessionPage(activeWorkout)
                2 -> CalendarPage(calendarData)
            }
        }
    }
}

// --- PAGE 1 : SANTÉ ---
@Composable
fun HealthPage(hr: Int, steps: Int) {
    Column(
        modifier = Modifier.fillMaxSize().background(Color.Black),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("MA SANTÉ", color = PurplePrimary, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(10.dp))
        
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("❤️", fontSize = 24.sp)
            Spacer(modifier = Modifier.width(8.dp))
            Text(if (hr > 0) "$hr BPM" else "--", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        
        Spacer(modifier = Modifier.height(8.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("👣", fontSize = 24.sp)
            Spacer(modifier = Modifier.width(8.dp))
            Text("$steps", color = GreenAccent, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text("🔥 ${(steps * 0.04).toInt()} Kcal", color = Color.Yellow, fontSize = 16.sp)
    }
}

// --- PAGE 2 : SÉANCE ---
@Composable
fun SessionPage(workout: WorkoutData?) {
    var sessionDuration by remember { mutableLongStateOf(0L) }
    var isRunning by remember { mutableStateOf(false) }
    
    LaunchedEffect(workout) {
        if (workout != null) {
            isRunning = true
            val startTime = System.currentTimeMillis()
            while (isRunning) {
                sessionDuration = (System.currentTimeMillis() - startTime) / 1000
                delay(1000)
            }
        } else {
            isRunning = false
            sessionDuration = 0
        }
    }

    if (workout == null) {
        Column(
            modifier = Modifier.fillMaxSize().background(Color.Black),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("AUCUNE SÉANCE", color = Color.Gray, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(5.dp))
            Text("Lancez depuis le", color = Color.Gray, fontSize = 10.sp)
            Text("téléphone", color = PurplePrimary, fontSize = 12.sp)
        }
    } else {
        ActiveSessionView(workout, sessionDuration)
    }
}

@Composable
fun ActiveSessionView(workout: WorkoutData, duration: Long) {
    val exercises = workout.exercises
    var currentExoIndex by remember { mutableIntStateOf(0) }
    val currentExo = exercises.getOrNull(currentExoIndex)

    var currentReps by remember(currentExo) { mutableIntStateOf(currentExo?.reps ?: 10) }
    var currentWeight by remember(currentExo) { mutableFloatStateOf(currentExo?.weight ?: 0f) }
    
    var isResting by remember { mutableStateOf(false) }
    var restTime by remember { mutableIntStateOf(0) }

    LaunchedEffect(isResting) {
        if (isResting) {
            while (true) {
                delay(1000)
                restTime++
            }
        } else {
            restTime = 0
        }
    }

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize().background(Color.Black),
        anchorType = ScalingLazyListAnchorType.ItemStart
    ) {
        item {
            val mins = duration / 60
            val secs = duration % 60
            Text(
                text = String.format("%02d:%02d", mins, secs),
                color = GreenAccent,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp
            )
        }

        if (isResting) {
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("REPOS", color = Color.Yellow, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    Text(
                        text = String.format("00:%02d", restTime),
                        color = Color.White,
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Black
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Button(
                        onClick = { isResting = false },
                        colors = ButtonDefaults.buttonColors(backgroundColor = PurplePrimary)
                    ) {
                        Text("REPRENDRE")
                    }
                }
            }
        } else if (currentExo != null) {
            item {
                Text(
                    text = currentExo.name,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 10.dp)
                )
            }

            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Button(onClick = { currentWeight -= 2.5f }, modifier = Modifier.size(32.dp), colors = ButtonDefaults.secondaryButtonColors()) { Text("-") }
                    Text(
                        text = "${currentWeight}kg",
                        color = PurplePrimary,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                    Button(onClick = { currentWeight += 2.5f }, modifier = Modifier.size(32.dp), colors = ButtonDefaults.secondaryButtonColors()) { Text("+") }
                }
            }

            item {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 5.dp)) {
                    Button(onClick = { if (currentReps > 0) currentReps-- }, modifier = Modifier.size(32.dp), colors = ButtonDefaults.secondaryButtonColors()) { Text("-") }
                    Text(
                        text = "$currentReps reps",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                    Button(onClick = { currentReps++ }, modifier = Modifier.size(32.dp), colors = ButtonDefaults.secondaryButtonColors()) { Text("+") }
                }
            }

            item {
                Spacer(modifier = Modifier.height(8.dp))
                Chip(
                    label = { Text("Valider Série") },
                    onClick = { isResting = true },
                    colors = ChipDefaults.primaryChipColors(backgroundColor = PurplePrimary),
                    modifier = Modifier.height(40.dp)
                )
            }

            item {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    if (currentExoIndex > 0) {
                        CompactChip(label = { Text("Préc.") }, onClick = { currentExoIndex-- })
                    } else { Spacer(Modifier.width(10.dp)) }
                    
                    if (currentExoIndex < exercises.size - 1) {
                        CompactChip(label = { Text("Suiv.") }, onClick = { currentExoIndex++ })
                    } else { 
                        CompactChip(label = { Text("Fin") }, onClick = { /* Finir séance */ }, colors = ChipDefaults.secondaryChipColors())
                    }
                }
            }
        }
    }
}

// --- PAGE 3 : CALENDRIER ---
@Composable
fun CalendarPage(calendarData: List<String>) {
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize().background(Color.Black),
        anchorType = ScalingLazyListAnchorType.ItemStart
    ) {
        item { Text("AGENDA", color = PurplePrimary, fontWeight = FontWeight.Bold) }
        
        if (calendarData.isEmpty()) {
            item { Text("Aucune info reçue", color = Color.Gray, fontSize = 12.sp) }
        } else {
            items(calendarData.size) { i ->
                Card(
                    onClick = {},
                    modifier = Modifier.padding(vertical = 2.dp)
                ) {
                    Text(calendarData[i], color = Color.White, fontSize = 12.sp)
                }
            }
        }
    }
}
