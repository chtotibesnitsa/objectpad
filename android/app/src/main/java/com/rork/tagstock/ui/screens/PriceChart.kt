package com.rork.tagstock.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rork.tagstock.data.Format
import com.rork.tagstock.data.PricePoint
import com.rork.tagstock.ui.theme.CasepadColors
import com.rork.tagstock.ui.theme.Mono
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class ChartRange(val label: String, val ms: Long?) { H1("1H", 3_600_000), H6("6H", 21_600_000), D1("1D", 86_400_000), ALL("ALL", null) }

/** Real trade history + live spot, drawn on Canvas with touch scrubbing. No synthetic points. */
@Composable
fun PriceChart(points: List<PricePoint>, range: ChartRange, markers: List<Pair<Long, String>>, modifier: Modifier = Modifier) {
    val haptic = LocalHapticFeedback.current
    val data = remember(points, range) {
        val ms = range.ms
        if (ms == null) points else {
            val cutoff = System.currentTimeMillis() - ms
            val inRange = points.filter { it.t >= cutoff }
            if (inRange.size >= 2) inRange else points.takeLast(2)
        }
    }
    var selected by remember { mutableStateOf<PricePoint?>(null) }
    val first = data.firstOrNull()?.price ?: 0.0
    val last = data.lastOrNull()?.price ?: 0.0
    val tint = if (last >= first) CasepadColors.Up else CasepadColors.Down

    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(Format.usd(selected?.price ?: last), fontFamily = Mono, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            selected?.let { Text(SimpleDateFormat("MMM d, HH:mm", Locale.US).format(Date(it.t)), fontFamily = Mono, fontSize = 10.sp, color = CasepadColors.Muted) }
            Spacer(Modifier.weight(1f))
            if (first > 0) Text(Format.pct((last - first) / first * 100), fontFamily = Mono, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = tint)
        }
        if (data.size < 2) {
            Text("Not enough trades for a chart yet.", fontSize = 12.sp, color = CasepadColors.Muted, modifier = Modifier.height(180.dp))
        } else {
            val minP = data.minOf { it.price }; val maxP = data.maxOf { it.price }
            val t0 = data.first().t; val t1 = data.last().t
            Canvas(
                Modifier.fillMaxWidth().height(200.dp)
                    .pointerInput(data) {
                        detectDragGestures(onDragEnd = { selected = null }, onDragCancel = { selected = null }) { change, _ ->
                            val frac = (change.position.x / size.width).coerceIn(0f, 1f)
                            val t = t0 + ((t1 - t0) * frac).toLong()
                            val n = data.minByOrNull { kotlin.math.abs(it.t - t) }
                            if (n != selected) { selected = n; haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
                        }
                    }
                    .pointerInput(data) { detectTapGestures(onPress = { selected = null }) },
            ) {
                val w = size.width; val h = size.height
                val span = (maxP - minP).takeIf { it > 0 } ?: 1.0
                fun x(t: Long) = if (t1 == t0) 0f else ((t - t0).toFloat() / (t1 - t0)) * w
                fun y(p: Double) = (h - 12f) - (((p - minP) / span) * (h - 24f)).toFloat()
                // grid
                for (i in 0..3) { val gy = 12f + (h - 24f) * i / 3; drawLine(CasepadColors.Border, Offset(0f, gy), Offset(w, gy), 1f) }
                val line = Path(); val area = Path()
                data.forEachIndexed { i, p ->
                    val px = x(p.t); val py = y(p.price)
                    if (i == 0) { line.moveTo(px, py); area.moveTo(px, h); area.lineTo(px, py) } else { line.lineTo(px, py); area.lineTo(px, py) }
                }
                area.lineTo(x(t1), h); area.close()
                drawPath(area, Brush.verticalGradient(listOf(tint.copy(alpha = 0.28f), Color.Transparent)))
                drawPath(line, tint, style = Stroke(width = 4f, cap = StrokeCap.Round))
                markers.filter { it.first in t0..t1 }.forEach { (t, _) ->
                    drawLine(CasepadColors.Gold.copy(alpha = 0.5f), Offset(x(t), 0f), Offset(x(t), h), 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
                }
                selected?.let { s ->
                    drawLine(CasepadColors.Foreground.copy(alpha = 0.4f), Offset(x(s.t), 0f), Offset(x(s.t), h), 2f)
                    drawCircle(tint, 8f, Offset(x(s.t), y(s.price)))
                    drawCircle(CasepadColors.Background, 4f, Offset(x(s.t), y(s.price)))
                }
            }
            Row { Text(Format.usd(minP), fontFamily = Mono, fontSize = 9.sp, color = CasepadColors.Muted); Spacer(Modifier.weight(1f)); Text(Format.usd(maxP), fontFamily = Mono, fontSize = 9.sp, color = CasepadColors.Muted) }
        }
    }
}
