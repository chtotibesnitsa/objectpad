package com.rork.tagstock.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.rork.tagstock.data.Chain
import com.rork.tagstock.data.Format
import com.rork.tagstock.data.TickerItem
import com.rork.tagstock.ui.theme.CasepadColors
import com.rork.tagstock.ui.theme.Mono

val CardShape = RoundedCornerShape(12.dp)

fun Context.openUrl(url: String) {
    runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

fun Context.copyText(label: String, value: String) {
    (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(label, value))
}

@Composable
fun Eyebrow(text: String, color: Color = CasepadColors.Muted, modifier: Modifier = Modifier) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = color, modifier = modifier)
}

@Composable
fun Card(modifier: Modifier = Modifier, raised: Boolean = false, padding: Int = 14, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = modifier.fillMaxWidth().clip(CardShape).background(if (raised) CasepadColors.CardRaised else CasepadColors.Card).padding(padding.dp),
        content = content,
    )
}

@Composable
fun Wordmark(size: Int = 22, modifier: Modifier = Modifier) {
    Row(modifier = modifier.semantics { contentDescription = "CasePad" }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        AsyncImage(model = com.rork.tagstock.R.drawable.case_mark, contentDescription = null, modifier = Modifier.size((size * 1.5).dp))
        Row {
            Text("casepad", fontSize = size.sp, fontWeight = FontWeight.Black, letterSpacing = (-1.2).sp, color = CasepadColors.Foreground)
            Text(".", fontSize = size.sp, fontWeight = FontWeight.Black, color = CasepadColors.Gold)
        }
    }
}

@Composable
fun CoinImage(image: String, ticker: String, size: Int = 48, modifier: Modifier = Modifier) {
    Box(modifier.size(size.dp).clip(RoundedCornerShape((size * 0.25).dp)).background(CasepadColors.Secondary), contentAlignment = Alignment.Center) {
        if (image.isNotEmpty()) {
            AsyncImage(model = image, contentDescription = "$ticker logo", contentScale = ContentScale.Crop, modifier = Modifier.size(size.dp))
        } else {
            Text(ticker.take(2).uppercase(), fontSize = (size * 0.42).sp, fontWeight = FontWeight.Black, color = Color.White.copy(alpha = 0.8f))
        }
    }
}

@Composable
fun StatCell(label: String, value: String, modifier: Modifier = Modifier, tint: Color = CasepadColors.Foreground, end: Boolean = false) {
    Column(modifier, horizontalAlignment = if (end) Alignment.End else Alignment.Start, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Eyebrow(label)
        Text(value, fontFamily = Mono, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = tint, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun CopyChip(label: String, value: String, onCopied: (String) -> Unit, modifier: Modifier = Modifier, display: String? = null) {
    val ctx = LocalContext.current
    val haptic = LocalHapticFeedback.current
    Row(
        modifier.clip(RoundedCornerShape(8.dp)).background(CasepadColors.Secondary)
            .clickable { ctx.copyText(label, value); haptic.performHapticFeedback(HapticFeedbackType.LongPress); onCopied("$label copied") }
            .padding(horizontal = 12.dp).height(36.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(label, fontFamily = Mono, fontSize = 11.sp, color = CasepadColors.Muted)
        Text(display ?: Format.shortAddress(value), fontFamily = Mono, fontSize = 11.sp, color = CasepadColors.Foreground)
        Icon(Icons.Default.ContentCopy, contentDescription = "Copy $label", modifier = Modifier.size(11.dp), tint = CasepadColors.Muted)
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(
        onClick = onClick, enabled = enabled, modifier = modifier.height(46.dp), shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(containerColor = CasepadColors.Foreground, contentColor = CasepadColors.Background, disabledContainerColor = CasepadColors.Foreground.copy(alpha = 0.4f), disabledContentColor = CasepadColors.Background),
    ) { Text(text, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(
        onClick = onClick, modifier = modifier.height(42.dp), shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(containerColor = CasepadColors.Secondary, contentColor = CasepadColors.Foreground),
    ) { Text(text, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
}

@Composable
fun Skeleton(height: Int, modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "skeleton")
    val a by t.animateFloat(1f, 0.55f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "alpha")
    Box(modifier.fillMaxWidth().height(height.dp).alpha(a).clip(CardShape).background(CasepadColors.Card))
}

@Composable
fun EmptyState(title: String, body: String, modifier: Modifier = Modifier) {
    Card(modifier, padding = 28) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontSize = 17.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(6.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = CasepadColors.Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
fun ErrorState(message: String, retry: () -> Unit, modifier: Modifier = Modifier) {
    Card(modifier, padding = 24) {
        Text("Market connection unavailable", style = MaterialTheme.typography.titleMedium, fontSize = 17.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(6.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = CasepadColors.Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text("No prices or launches have been fabricated.", fontFamily = Mono, fontSize = 11.sp, color = CasepadColors.Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        Spacer(Modifier.height(12.dp))
        SecondaryButton("Reconnect", retry, Modifier.align(Alignment.CenterHorizontally))
    }
}

@Composable
fun SectionHead(title: String, eyebrow: String? = null, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        if (eyebrow != null) Eyebrow(eyebrow)
    }
}

@Composable
fun ProgressBar(value: Double, modifier: Modifier = Modifier, tint: Color = CasepadColors.Up) {
    LinearProgressIndicator(
        progress = { value.coerceIn(0.0, 1.0).toFloat() }, modifier = modifier.fillMaxWidth().height(4.dp).clip(CircleShape),
        color = tint, trackColor = Color.White.copy(alpha = 0.1f), drawStopIndicator = {},
    )
}

@Composable
fun ModeBadge(mode: String) {
    if (mode == "demo") Text(
        "PRACTICE", fontFamily = Mono, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = CasepadColors.Gold,
        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(CasepadColors.Gold.copy(alpha = 0.18f)).padding(horizontal = 6.dp, vertical = 3.dp),
    )
}

@Composable
fun Divider() { Box(Modifier.fillMaxWidth().height(1.dp).background(CasepadColors.Border)) }

@Composable
fun TapeRow(item: TickerItem, onToken: (String) -> Unit) {
    val ctx = LocalContext.current
    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(item.label, fontFamily = Mono, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (item.isSell) CasepadColors.Down else CasepadColors.Up, modifier = Modifier.width(62.dp))
        Text("$" + (item.tokenInfo?.ticker ?: Format.shortAddress(item.token)), fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.clickable { onToken(item.token) })
        Spacer(Modifier.weight(1f))
        Text(item.amountWei?.let { Format.eth(it, 4) } ?: "—", fontFamily = Mono, fontSize = 11.sp)
        item.txHash?.let { h ->
            Icon(Icons.Default.OpenInNew, contentDescription = "Open transaction on Blockscout", tint = CasepadColors.Muted, modifier = Modifier.size(14.dp).clickable { ctx.openUrl(Chain.txUrl(h)) })
        }
        Text(Format.timeAgo(item.createdAt), fontSize = 10.sp, color = CasepadColors.Muted, modifier = Modifier.width(52.dp), textAlign = TextAlign.End)
    }
}

@Composable
fun StatusDot(ok: Boolean) { Box(Modifier.size(8.dp).clip(CircleShape).background(if (ok) CasepadColors.Up else CasepadColors.Down)) }

@Composable
fun Bullet(text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.padding(top = 6.dp).size(5.dp).clip(CircleShape).background(CasepadColors.Gold))
        Text(text, style = MaterialTheme.typography.bodySmall, fontSize = 12.sp, color = CasepadColors.Muted)
    }
}

fun Modifier.outlined(color: Color) = this.border(1.dp, color, CardShape)
