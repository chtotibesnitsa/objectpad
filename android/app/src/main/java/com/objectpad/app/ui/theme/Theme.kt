package com.objectpad.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.objectpad.app.R

/** ObjectPad's pearl-and-ink palette, taken 1:1 from the website's Tailwind tokens. */
object Pad {
    val Paper = Color(0xFFECEEF1)
    val Pearl = Color(0xFFF8F9FA)
    val White = Color(0xFFFFFFFF)
    val Ink = Color(0xFF0C0D10)
    val Graphite = Color(0xFF1B1D22)
    val Obsidian = Color(0xFF0B0C0F)
    val Stone = Color(0xFFE6E8EC)
    val Line = Color(0xFFDADDE3)
    val Muted = Color(0xFF6A6E78)
    val Steel = Color(0xFFD6DAE1)
    val Up = Color(0xFF12A150)
    val UpGlow = Color(0xFF34D57A)
    val Down = Color(0xFFE5484D)
    val Aqua = Color(0xFF9AA3B2)
    val Ink60 = Ink.copy(alpha = 0.6f)
    val Ink08 = Ink.copy(alpha = 0.08f)
    val Ink05 = Ink.copy(alpha = 0.05f)

    val raised = Brush.verticalGradient(listOf(White, Pearl))
    val steel = Brush.verticalGradient(listOf(Color(0xFFE4E7EC), Steel))
    val sunk = Brush.verticalGradient(listOf(Ink.copy(alpha = 0.055f), Ink.copy(alpha = 0.03f)))
    val page = Brush.verticalGradient(listOf(Color(0xFFF3F4F6), Paper, Color(0xFFE3E6EB)))
    val night = Brush.verticalGradient(listOf(Color(0xFF15171C), Obsidian))
}

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
private fun anybody(weight: Int, width: Float) = Font(R.font.anybody, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight), FontVariation.width(width)))

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
private fun geist(weight: Int) = Font(R.font.geist, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
private fun mono(weight: Int) = Font(R.font.geistmono, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

/** Anybody at 112% width, the website's `.display` face. */
val Display = FontFamily(anybody(800, 112f), anybody(900, 125f))
val Sans = FontFamily(geist(400), geist(500), geist(600), geist(700), geist(800))
val Mono = FontFamily(mono(500), mono(700), mono(800))

object Type {
    fun display(size: Int) = TextStyle(fontFamily = Display, fontWeight = FontWeight(800), fontSize = size.sp, lineHeight = (size * 0.95).sp, letterSpacing = (-0.03 * size).sp, color = Pad.Ink)
    val lab = TextStyle(fontFamily = Mono, fontWeight = FontWeight(800), fontSize = 11.sp, letterSpacing = 1.3.sp, color = Pad.Ink.copy(alpha = 0.75f))
    val body = TextStyle(fontFamily = Sans, fontWeight = FontWeight(600), fontSize = 15.sp, lineHeight = 21.sp, color = Pad.Ink)
    val strong = TextStyle(fontFamily = Sans, fontWeight = FontWeight(800), fontSize = 16.sp, lineHeight = 21.sp, color = Pad.Ink)
    val small = TextStyle(fontFamily = Sans, fontWeight = FontWeight(600), fontSize = 13.sp, lineHeight = 18.sp, color = Pad.Ink.copy(alpha = 0.62f))
    val num = TextStyle(fontFamily = Mono, fontWeight = FontWeight(700), fontSize = 13.sp, color = Pad.Ink)
}

@Composable
fun ObjectPadTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(primary = Pad.Ink, onPrimary = Pad.White, background = Pad.Paper, surface = Pad.White, onSurface = Pad.Ink, onBackground = Pad.Ink, secondary = Pad.Graphite, error = Pad.Down, surfaceVariant = Pad.Stone),
        typography = MaterialTheme.typography.copy(
            bodyLarge = Type.body, bodyMedium = Type.body.copy(fontSize = 14.sp), labelLarge = Type.strong.copy(fontSize = 14.sp),
            titleLarge = Type.display(24), headlineMedium = Type.display(30),
        ),
        content = content,
    )
}
