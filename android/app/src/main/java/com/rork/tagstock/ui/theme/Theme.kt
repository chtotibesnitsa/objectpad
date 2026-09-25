package com.rork.tagstock.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** CasePad palette, lifted from the website CSS variables. */
object CasepadColors {
    val Background = Color(0xFF0A0A0B)
    val Surface = Color(0xFF0F0F10)
    val Card = Color(0xFF141416)
    val CardRaised = Color(0xFF1B1B1E)
    val Secondary = Color(0xFF232326)
    val Border = Color(0x0FFFFFFF)
    val Foreground = Color(0xFFF5F3EF)
    val Muted = Color(0xFF9E9EA4)
    val Gold = Color(0xFFF59C40)
    val GoldDeep = Color(0xFFD97B1C)
    val Up = Color(0xFF54D494)
    val Down = Color(0xFFE5606B)
    val Cobalt = Color(0xFF5E93EB)

    fun rarity(name: String): Color = when (name) {
        "uncommon" -> Up
        "rare" -> Cobalt
        "epic" -> Color(0xFFA57FE0)
        "legendary" -> Color(0xFFE0B04F)
        "mythic" -> Color(0xFFE56A8C)
        else -> Color(0xFFA6A8B3)
    }
}

private val Scheme = darkColorScheme(
    primary = CasepadColors.Foreground,
    onPrimary = CasepadColors.Background,
    secondary = CasepadColors.Gold,
    onSecondary = CasepadColors.Background,
    tertiary = CasepadColors.Up,
    background = CasepadColors.Background,
    onBackground = CasepadColors.Foreground,
    surface = CasepadColors.Surface,
    onSurface = CasepadColors.Foreground,
    surfaceVariant = CasepadColors.Card,
    onSurfaceVariant = CasepadColors.Muted,
    surfaceContainer = CasepadColors.Card,
    surfaceContainerHigh = CasepadColors.CardRaised,
    outline = CasepadColors.Secondary,
    error = CasepadColors.Down,
    onError = Color.White,
)

val Mono = FontFamily.Monospace

val CasepadTypography = Typography(
    headlineLarge = TextStyle(fontWeight = FontWeight.Black, fontSize = 34.sp, lineHeight = 36.sp, letterSpacing = (-1.4).sp),
    headlineMedium = TextStyle(fontWeight = FontWeight.ExtraBold, fontSize = 24.sp, letterSpacing = (-0.8).sp),
    titleLarge = TextStyle(fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, letterSpacing = (-0.5).sp),
    titleMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 15.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp),
    bodySmall = TextStyle(fontSize = 11.sp, lineHeight = 15.sp),
    labelSmall = TextStyle(fontFamily = Mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = 1.4.sp),
    labelMedium = TextStyle(fontFamily = Mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp),
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    isSystemInDarkTheme()
    MaterialTheme(colorScheme = Scheme, typography = CasepadTypography, content = content)
}
