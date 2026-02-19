package com.example.kaybeewear.presentation

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

@Composable
fun RunScreen(
    heartRate: Int,
    steps: Int,
    calories: Int,
    isRunning: Boolean,
    onToggleRun: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBg),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(8.dp)
        ) {
            Text(
                "COURSE",
                color = GreenAccent,
                fontWeight = FontWeight.Black,
                fontSize = 12.sp
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                RunStatItem("BPM", heartRate.toString(), Color.Red)
                RunStatItem("PAS", steps.toString(), GreenAccent)
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            Text(
                if (isRunning) "EN COURS..." else "ARRÊTÉ",
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Black
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Button(
                onClick = onToggleRun,
                modifier = Modifier.size(44.dp),
                colors = ButtonDefaults.buttonColors(backgroundColor = if (isRunning) Color.Red else GreenAccent)
            ) {
                if (isRunning) {
                    Text("■", color = Color.White, fontSize = 20.sp)
                } else {
                    Text("▶", color = Color.Black, fontSize = 20.sp)
                }
            }
        }
    }
}

@Composable
fun RunStatItem(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = color, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text(label, color = Color.Gray, fontSize = 8.sp)
    }
}
