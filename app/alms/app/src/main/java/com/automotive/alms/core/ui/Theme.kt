package com.automotive.alms.core.ui

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val LightColors: ColorScheme = lightColorScheme(
    primary = Color(0xFF116B58),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD8F1EA),
    onPrimaryContainer = Color(0xFF0B4A3D),
    secondary = Color(0xFF315D8C),
    secondaryContainer = Color(0xFFDDEBFA),
    onSecondaryContainer = Color(0xFF1C3D61),
    tertiary = Color(0xFF9A6200),
    tertiaryContainer = Color(0xFFFFE6B8),
    background = Color(0xFFF4F6F8),
    onBackground = Color(0xFF1A1F24),
    surface = Color.White,
    onSurface = Color(0xFF1A1F24),
    surfaceVariant = Color(0xFFE8EDF0),
    onSurfaceVariant = Color(0xFF5B6670),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF8FAFB),
    surfaceContainer = Color(0xFFF2F5F7),
    surfaceContainerHigh = Color(0xFFFFFFFF),
    surfaceContainerHighest = Color(0xFFE8EDF0),
    outline = Color(0xFFC6D1D8),
    outlineVariant = Color(0xFFE3E8EC),
    error = Color(0xFFB42318),
)

private val AlmsTypography = Typography(
    headlineLarge = TextStyle(fontSize = 32.sp, lineHeight = 38.sp, fontWeight = FontWeight.SemiBold),
    headlineMedium = TextStyle(fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold),
    headlineSmall = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
    titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.Normal),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Normal),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Normal),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun AlmsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = AlmsTypography,
        shapes = Shapes(),
        content = content,
    )
}
