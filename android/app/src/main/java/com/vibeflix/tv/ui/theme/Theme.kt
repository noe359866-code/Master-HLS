package com.vibeflix.tv.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val VibeFlixColors = darkColorScheme(
    primary = Color(0xFF5B8CFF),
    onPrimary = Color(0xFF08101F),
    secondary = Color(0xFF9D7BFF),
    background = Color(0xFF0B0E14),
    onBackground = Color(0xFFE9EDF6),
    surface = Color(0xFF141924),
    onSurface = Color(0xFFE9EDF6),
    surfaceVariant = Color(0xFF1A2030),
    onSurfaceVariant = Color(0xFF98A2B8),
    error = Color(0xFFFF5B6E),
)

/** Tema oscuro por defecto: el cliente se usa en el salon. */
@Composable
fun VibeFlixTheme(content: @Composable () -> Unit) {
    isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = VibeFlixColors,
        content = content,
    )
}
