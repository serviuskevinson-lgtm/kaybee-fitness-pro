package com.example.kaybeewear.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*

@Composable
fun AgendaScreen(
    weeklySummary: List<ScheduleDay>
) {
    ScalingLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBg)
    ) {
        item {
            Text(
                "AGENDA",
                color = PurplePrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
                modifier = Modifier.padding(bottom = 8.dp)
            )
        }
        
        if (weeklySummary.isEmpty()) {
            item {
                Text(
                    "Aucun événement",
                    color = Color.Gray,
                    fontSize = 10.sp,
                    modifier = Modifier.padding(top = 20.dp)
                )
            }
        } else {
            items(weeklySummary) { day ->
                AgendaCard(day)
            }
        }
    }
}

@Composable
fun AgendaCard(day: ScheduleDay) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(CardBg)
            .padding(8.dp)
    ) {
        Column {
            Text(
                day.day,
                color = GreenAccent,
                fontWeight = FontWeight.Bold,
                fontSize = 9.sp
            )
            Text(
                day.workout,
                color = Color.White,
                fontSize = 11.sp
            )
        }
    }
}
