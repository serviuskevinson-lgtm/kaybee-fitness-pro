package com.example.kaybeewear.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import com.example.kaybeewear.health.HealthManager
import java.util.Locale

class RunActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        setContent {
            RunScreen()
        }
    }
}

@Composable
fun RunScreen() {
    var time by remember { mutableLongStateOf(0L) }
    var distance by remember { mutableDoubleStateOf(0.0) }
    var bpm by remember { mutableIntStateOf(0) }
    var isRunning by remember { mutableStateOf(true) }

    // Simuler le chrono (sera relié au HealthManager plus tard)
    LaunchedEffect(isRunning) {
        while (isRunning) {
            kotlinx.coroutines.delay(1000)
            time++
            distance += 0.002
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "KAYBEE RUN",
                color = Color(0xFF00f5d4),
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = formatDuration(time),
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                color = Color.White
            )

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = String.format(Locale.US, "%.2f", distance),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF9d4edd)
                )
                Text(text = " KM", fontSize = 10.sp, color = Color.Gray)
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(text = "❤️ ", fontSize = 14.sp)
                Text(
                    text = if (bpm > 0) "$bpm" else "--",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White
                )
                Text(text = " BPM", fontSize = 10.sp, color = Color.Gray)
            }

            Spacer(modifier = Modifier.height(10.dp))

            Button(
                onClick = { isRunning = !isRunning },
                colors = ButtonDefaults.buttonColors(
                    backgroundColor = if (isRunning) Color(0xFFef4444) else Color(0xFF00f5d4)
                ),
                modifier = Modifier.size(40.dp)
            ) {
                Text(if (isRunning) "II" else "▶", color = Color.Black, fontWeight = FontWeight.Bold)
            }
        }
    }
}
