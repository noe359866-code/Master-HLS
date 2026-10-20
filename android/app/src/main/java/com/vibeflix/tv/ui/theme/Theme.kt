package com.vibeflix.tv.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Paleta hibrida Vibe Flix (misma que el cliente web).
 *
 * Fondo azul-noche casi negro, superficies translucidas y una marca con
 * degradado (azul -> violeta -> turquesa). Los colores planos se evitan:
 * el contraste lo pone el degradado y las superficies translucidas.
 */
private val VibeFlixColors = darkColorScheme(
    primary = Color(0xFF6E8BFF),
    onPrimary = Color(0xFF06080F),
    primaryContainer = Color(0xFF1B2542),
    onPrimaryContainer = Color(0xFFDDE4FF),
    secondary = Color(0xFFA06BFF),
    onSecondary = Color(0xFF06080F),
    secondaryContainer = Color(0xFF2A1F45),
    onSecondaryContainer = Color(0xFFEADCFF),
    tertiary = Color(0xFF35D6C4),
    onTertiary = Color(0xFF04201D),
    background = Color(0xFF06080F),
    onBackground = Color(0xFFF3F6FD),
    surface = Color(0xFF111726),
    onSurface = Color(0xFFF3F6FD),
    surfaceVariant = Color(0xFF151C2C),
    onSurfaceVariant = Color(0xFF8E99B3),
    outline = Color(0xFF2A3348),
    error = Color(0xFFFF6B7D),
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
