package com.objectpad.app.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.objectpad.app.ObjectPadApp
import com.objectpad.app.R
import com.objectpad.app.ui.theme.Mono
import com.objectpad.app.ui.theme.Pad
import com.objectpad.app.ui.theme.Sans
import com.objectpad.app.ui.theme.Type

/** The website's rendered liquid-glass icon set. */
enum class Glass(val res: Int) {
    Ai(R.drawable.glass_ai), Burn(R.drawable.glass_burn), Chain(R.drawable.glass_chain), Chart(R.drawable.glass_chart),
    Coins(R.drawable.glass_coins), Diamond(R.drawable.glass_diamond), Fingerprint(R.drawable.glass_fingerprint), Mesh(R.drawable.glass_mesh),
    Qr(R.drawable.glass_qr), Rocket(R.drawable.glass_rocket), Shield(R.drawable.glass_shield), Vault(R.drawable.glass_vault), Wallet(R.drawable.glass_wallet),
}

@Composable
fun GlassIcon(icon: Glass, size: Dp = 40.dp, modifier: Modifier = Modifier, float: Boolean = false) {
    val dy = if (float) {
        val t = rememberInfiniteTransition(label = "float")
        t.animateFloat(0f, -5f, infiniteRepeatable(tween(2600), RepeatMode.Reverse), label = "dy").value
    } else 0f
    Image(painterResource(icon.res), contentDescription = null, modifier = modifier.size(size).graphicsLayer { translationY = dy * density }, contentScale = ContentScale.Fit)
}

/** Haptic + scale press feedback for any tappable surface. */
@Composable
fun Modifier.press(enabled: Boolean = true, onClick: () -> Unit): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.965f else 1f, spring(dampingRatio = 0.55f, stiffness = 900f), label = "press")
    val haptic = LocalHapticFeedback.current
    return this.scale(scale).clickable(source, null, enabled) {
        if (ObjectPadApp.instance.prefs.haptics) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        onClick()
    }
}

/** White, softly lit surface: the website's `.raised`. */
@Composable
fun Raised(modifier: Modifier = Modifier, radius: Dp = 26.dp, padding: Dp = 18.dp, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(radius)
    Column(
        modifier.shadow(14.dp, shape, ambientColor = Pad.Ink.copy(alpha = 0.25f), spotColor = Pad.Ink.copy(alpha = 0.18f))
            .clip(shape).background(Pad.raised).border(1.dp, Pad.Ink.copy(alpha = 0.08f), shape).padding(padding),
        content = content,
    )
}

@Composable
fun Steel(modifier: Modifier = Modifier, radius: Dp = 26.dp, padding: Dp = 16.dp, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(radius)
    Column(modifier.clip(shape).background(Pad.steel).border(1.dp, Color.White.copy(alpha = 0.8f), shape).padding(padding), content = content)
}

@Composable
fun Sunk(modifier: Modifier = Modifier, radius: Dp = 18.dp, padding: Dp = 12.dp, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(radius)
    Column(modifier.clip(shape).background(Pad.sunk).border(1.dp, Pad.Ink.copy(alpha = 0.06f), shape).padding(padding), content = content)
}

@Composable fun Lab(text: String, modifier: Modifier = Modifier, color: Color = Pad.Ink.copy(alpha = 0.72f)) = Text(text.uppercase(), style = Type.lab.copy(color = color), modifier = modifier)

@Composable
fun Display(text: String, size: Int = 34, modifier: Modifier = Modifier, color: Color = Pad.Ink, align: TextAlign = TextAlign.Start) =
    Text(text, style = Type.display(size).copy(color = color), modifier = modifier, textAlign = align)

@Composable fun Body(text: String, modifier: Modifier = Modifier, color: Color = Pad.Ink.copy(alpha = 0.66f), size: Int = 15, weight: Int = 600, align: TextAlign = TextAlign.Start, maxLines: Int = Int.MAX_VALUE) =
    Text(text, style = Type.body.copy(color = color, fontSize = size.sp, fontWeight = FontWeight(weight), lineHeight = (size * 1.4).sp), modifier = modifier, textAlign = align, maxLines = maxLines, overflow = TextOverflow.Ellipsis)

@Composable fun Strong(text: String, modifier: Modifier = Modifier, size: Int = 16, color: Color = Pad.Ink, maxLines: Int = Int.MAX_VALUE) =
    Text(text, style = Type.strong.copy(fontSize = size.sp, color = color), modifier = modifier, maxLines = maxLines, overflow = TextOverflow.Ellipsis)

@Composable fun MonoText(text: String, modifier: Modifier = Modifier, size: Int = 12, color: Color = Pad.Ink.copy(alpha = 0.65f), weight: Int = 700, maxLines: Int = Int.MAX_VALUE) =
    Text(text, style = TextStyle(fontFamily = Mono, fontWeight = FontWeight(weight), fontSize = size.sp, color = color), modifier = modifier, maxLines = maxLines, overflow = TextOverflow.Ellipsis)

enum class BtnStyle { Primary, Glass, Ghost, Buy, Sell, Danger }

/** Pill button with press animation and haptics. Primary is ink; Glass is the website's pearl `.btn`. */
@Composable
fun PadButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier, style: BtnStyle = BtnStyle.Primary, enabled: Boolean = true,
    loading: Boolean = false, icon: ImageVector? = null, glass: Glass? = null, height: Dp = 56.dp,
) {
    val (bg, fg) = when (style) {
        BtnStyle.Primary -> SolidColor(Pad.Ink) to Pad.White
        BtnStyle.Glass -> Pad.raised to Pad.Ink
        BtnStyle.Ghost -> SolidColor(Pad.Ink.copy(alpha = 0.06f)) to Pad.Ink
        BtnStyle.Buy -> SolidColor(Pad.Up) to Pad.White
        BtnStyle.Sell, BtnStyle.Danger -> SolidColor(Pad.Down) to Pad.White
    }
    val shape = RoundedCornerShape(50)
    val base = modifier.heightIn(min = height).clip(shape).background(bg).let { if (style == BtnStyle.Glass) it.border(1.dp, Pad.Ink.copy(alpha = 0.12f), shape) else it }
    Row(
        base.press(enabled && !loading, onClick).padding(start = if (glass != null) 6.dp else 22.dp, end = 22.dp).let { if (!enabled) it.background(Color.White.copy(alpha = 0.35f)) else it },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        if (glass != null) {
            Box(Modifier.size(height - 12.dp).clip(CircleShape).background(Pad.raised), contentAlignment = Alignment.Center) {
                if (loading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = Pad.Ink) else GlassIcon(glass, (height.value * 0.62f).dp)
            }
            Spacer(Modifier.width(12.dp))
        } else if (loading) { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = fg); Spacer(Modifier.width(10.dp)) }
        else if (icon != null) { Icon(icon, null, tint = fg, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)) }
        Text(text, style = TextStyle(fontFamily = Sans, fontWeight = FontWeight(800), fontSize = 15.5.sp, color = fg.copy(alpha = if (enabled) 1f else 0.5f)), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun Chip(text: String, modifier: Modifier = Modifier, selected: Boolean = false, dot: Color? = null, onClick: (() -> Unit)? = null) {
    val shape = RoundedCornerShape(50)
    Row(
        modifier.clip(shape).background(if (selected) SolidColor(Pad.Ink) else Pad.raised).border(1.dp, Pad.Ink.copy(alpha = if (selected) 0f else 0.1f), shape)
            .let { if (onClick != null) it.press(onClick = onClick) else it }.heightIn(min = 36.dp).padding(horizontal = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dot != null) { PulseDot(dot, 7.dp); Spacer(Modifier.width(6.dp)) }
        Text(text.uppercase(), style = Type.lab.copy(fontSize = 10.5.sp, color = if (selected) Pad.White else Pad.Ink.copy(alpha = 0.75f)))
    }
}

@Composable
fun PulseDot(color: Color, size: Dp = 8.dp) {
    val t = rememberInfiniteTransition(label = "pulse")
    val a by t.animateFloat(1f, 0.35f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "a")
    Box(Modifier.size(size).clip(CircleShape).background(color.copy(alpha = a)))
}

@Composable
fun CoinImage(url: String?, size: Dp, modifier: Modifier = Modifier, fallback: String = "") {
    Box(modifier.size(size).clip(CircleShape).background(Pad.raised).border(1.dp, Pad.Ink.copy(alpha = 0.08f), CircleShape), contentAlignment = Alignment.Center) {
        if (!url.isNullOrBlank()) AsyncImage(model = url, contentDescription = fallback, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Text(fallback.take(2), style = Type.lab)
    }
}

@Composable
fun TopBar(title: String, onBack: (() -> Unit)?, modifier: Modifier = Modifier, actions: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) {
            Box(Modifier.size(44.dp).clip(CircleShape).background(Pad.raised).border(1.dp, Pad.Ink08, CircleShape).press(onClick = onBack), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Pad.Ink, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(12.dp))
        }
        Text(title, style = Type.strong.copy(fontSize = 18.sp), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        actions()
    }
}

@Composable
fun IconCircle(icon: ImageVector, desc: String, onClick: () -> Unit, modifier: Modifier = Modifier, dark: Boolean = false, size: Dp = 44.dp) {
    Box(modifier.size(size).clip(CircleShape).background(if (dark) SolidColor(Pad.Ink) else Pad.raised).border(1.dp, Pad.Ink08, CircleShape).press(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, desc, tint = if (dark) Pad.White else Pad.Ink, modifier = Modifier.size(19.dp))
    }
}

@Composable
fun Field(
    value: String, onChange: (String) -> Unit, label: String, placeholder: String, modifier: Modifier = Modifier, error: String? = null,
    hint: String? = null, mono: Boolean = false, singleLine: Boolean = true, enabled: Boolean = true, keyboard: KeyboardType = KeyboardType.Text, minLines: Int = 1,
) {
    Column(modifier) {
        Text(label, style = Type.small.copy(fontWeight = FontWeight(800), color = Pad.Ink.copy(alpha = 0.72f)))
        Spacer(Modifier.height(6.dp))
        val shape = RoundedCornerShape(16.dp)
        Box(Modifier.fillMaxWidth().clip(shape).background(if (enabled) Pad.White else Pad.Ink05).border(1.5.dp, if (error != null) Pad.Down else Pad.Ink.copy(alpha = 0.12f), shape).padding(horizontal = 14.dp, vertical = 14.dp)) {
            BasicTextField(
                value, onChange, singleLine = singleLine, enabled = enabled, minLines = minLines,
                textStyle = TextStyle(fontFamily = if (mono) Mono else Sans, fontWeight = FontWeight(700), fontSize = if (mono) 13.sp else 15.sp, color = Pad.Ink),
                cursorBrush = SolidColor(Pad.Ink), keyboardOptions = KeyboardOptions(keyboardType = keyboard), modifier = Modifier.fillMaxWidth(),
                decorationBox = { inner -> if (value.isEmpty()) Text(placeholder, style = TextStyle(fontFamily = if (mono) Mono else Sans, fontSize = if (mono) 13.sp else 15.sp, fontWeight = FontWeight(600), color = Pad.Ink.copy(alpha = 0.3f))); inner() },
            )
        }
        if (error != null) Text(error, style = Type.small.copy(color = Pad.Down, fontSize = 12.sp), modifier = Modifier.padding(top = 4.dp))
        else if (hint != null) Text(hint, style = Type.small.copy(fontSize = 11.5.sp), modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
fun Loading(label: String = "Loading…", modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(24.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Pad.Ink); Spacer(Modifier.width(10.dp)); MonoText(label.uppercase(), size = 11)
    }
}

@Composable
fun ErrorCard(message: String, onRetry: (() -> Unit)?, modifier: Modifier = Modifier) {
    Raised(modifier.fillMaxWidth()) {
        Strong("Something didn’t load.")
        Body(message, Modifier.padding(top = 4.dp))
        if (onRetry != null) PadButton("Try again", onRetry, Modifier.padding(top = 12.dp), style = BtnStyle.Glass, height = 46.dp)
    }
}

@Composable
fun Notice(text: String, modifier: Modifier = Modifier, tone: Color = Pad.Ink) {
    Box(modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(tone.copy(alpha = 0.08f)).padding(12.dp)) {
        Body(text, color = if (tone == Pad.Ink) Pad.Ink.copy(alpha = 0.72f) else tone, size = 13, weight = 700)
    }
}

/** Animated progress bar that grows from the left like the website's `.bar-grow`. */
@Composable
fun ProgressBar(progress: Float, modifier: Modifier = Modifier, color: Color = Pad.Ink, height: Dp = 10.dp) {
    val p by animateFloatAsState(progress.coerceIn(0f, 1f), tween(900), label = "bar")
    Box(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(50)).background(Pad.sunk)) {
        Box(Modifier.fillMaxWidth(maxOf(0.02f, p)).height(height).clip(RoundedCornerShape(50)).background(color))
    }
}

@Composable
fun Sparkline(points: List<Double>, modifier: Modifier = Modifier, up: Boolean = true) {
    if (points.size < 2) { Box(modifier); return }
    val color = if (up) Pad.Up else Pad.Down
    Canvas(modifier) {
        val min = points.min(); val max = points.max(); val span = (max - min).takeIf { it > 0 } ?: 1.0
        val path = Path()
        points.forEachIndexed { i, v ->
            val x = size.width * i / (points.size - 1); val y = (size.height * (1 - (v - min) / span)).toFloat()
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color, style = Stroke(2.2.dp.toPx(), cap = StrokeCap.Round))
    }
}

/** Donut chart for the fee split. */
@Composable
fun Donut(slices: List<Pair<Float, Color>>, modifier: Modifier = Modifier, thickness: Dp = 22.dp, center: @Composable BoxScope.() -> Unit = {}) {
    val total = slices.sumOf { it.first.toDouble() }.toFloat().takeIf { it > 0 } ?: 1f
    val grow by animateFloatAsState(1f, tween(1100), label = "donut")
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            var start = -90f; val stroke = thickness.toPx()
            slices.forEach { (v, c) ->
                val sweep = 360f * v / total * grow
                drawArc(c, start + 1.5f, sweep - 3f, false, topLeft = Offset(stroke / 2, stroke / 2), size = androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke), style = Stroke(stroke, cap = StrokeCap.Butt))
                start += sweep
            }
        }
        center()
    }
}

@Composable
fun StatCell(label: String, value: String, modifier: Modifier = Modifier, glass: Glass? = null, valueColor: Color = Pad.Ink) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        if (glass != null) { GlassIcon(glass, 40.dp); Spacer(Modifier.width(10.dp)) }
        Column(Modifier.weight(1f)) {
            MonoText(label.uppercase(), size = 10, maxLines = 1)
            Text(value, style = Type.strong.copy(fontSize = 17.sp, color = valueColor), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable fun SectionTitle(lab: String, title: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f)) { Lab(lab); Spacer(Modifier.height(6.dp)); Display(title, 28) }
        action?.invoke()
    }
}

@Composable fun Divider(modifier: Modifier = Modifier) = Box(modifier.fillMaxWidth().height(1.dp).background(Pad.Ink.copy(alpha = 0.07f)))

val ScreenPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 120.dp)

fun Context.openUrl(url: String) { runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
fun Context.copyText(label: String, value: String) { (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(label, value)) }
fun Context.shareText(text: String) { runCatching { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
