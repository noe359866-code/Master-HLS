package com.masterhls.tv.ui.screens.player

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.masterhls.tv.data.player.PlaybackState
import com.masterhls.tv.data.player.TrackOption

/** Panel desplegable de los controles del reproductor. */
enum class ControlPanel {
    NONE,
    SPEED,
    AUDIO,
    SUBTITLES,
    VARIANTS,
}

/** Velocidades ofrecidas en la TV. */
val PLAYBACK_SPEEDS: List<Float> = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f)

/**
 * Barra de controles del reproductor para TV.
 *
 * Todo es navegable con el D-pad: los botones de `androidx.tv.material3`
 * participan en el sistema de foco de Compose for TV, y las opciones
 * (velocidad, pistas, variantes) se despliegan en filas horizontales que
 * tambien se recorren con las flechas.
 */
@Composable
fun PlayerControls(
    state: PlaybackState,
    panel: ControlPanel,
    variants: List<VariantOption>,
    selectedVariantIndex: Int?,
    onPanelChange: (ControlPanel) -> Unit,
    onPlayPause: () -> Unit,
    onSeekBy: (Long) -> Unit,
    onSpeed: (Float) -> Unit,
    onVolume: (Float) -> Unit,
    onAudioTrack: (TrackOption?) -> Unit,
    onSubtitleTrack: (TrackOption?) -> Unit,
    onSubtitlesEnabled: (Boolean) -> Unit,
    onVariant: (Int) -> Unit,
    onExit: () -> Unit,
    onFocusStateChange: (Boolean) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xE60B0E14))
            .padding(horizontal = 24.dp, vertical = 16.dp)
            .focusable()
            .onFocusChanged { onFocusStateChange(it.hasFocus) },
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // ------------------------------------------------------------- progreso
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(Color(0x33FFFFFF)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(state.bufferedProgress)
                    .height(6.dp)
                    .background(Color(0x55FFFFFF)),
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth(state.progress)
                    .height(6.dp)
                    .background(Color(0xFF5B8CFF)),
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = formatTime(state.positionMs),
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF98A2B8),
            )
            Text(
                text = formatTime(state.durationMs),
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF98A2B8),
            )
        }

        // -------------------------------------------------------------- panel
        when (panel) {
            ControlPanel.SPEED -> OptionRow(
                options = PLAYBACK_SPEEDS.map { formatSpeed(it) },
                selected = formatSpeed(state.speed),
                onSelect = { label ->
                    val speed = PLAYBACK_SPEEDS.firstOrNull { formatSpeed(it) == label } ?: 1f
                    onSpeed(speed)
                },
            )

            ControlPanel.AUDIO -> OptionRow(
                options = listOf("Auto") + state.audioTracks.map { trackLabel(it) },
                selected = state.selectedAudioTrack?.let { trackLabel(it) },
                onSelect = { label ->
                    if (label == "Auto") {
                        onAudioTrack(null)
                    } else {
                        onAudioTrack(state.audioTracks.firstOrNull { trackLabel(it) == label })
                    }
                },
            )

            ControlPanel.SUBTITLES -> OptionRow(
                options = listOf("Desactivados") + state.subtitleTracks.map { trackLabel(it) },
                selected = if (state.subtitlesEnabled) {
                    state.selectedSubtitleTrack?.let { trackLabel(it) }
                } else {
                    "Desactivados"
                },
                onSelect = { label ->
                    if (label == "Desactivados") {
                        onSubtitlesEnabled(false)
                    } else {
                        val track = state.subtitleTracks.firstOrNull { trackLabel(it) == label }
                        onSubtitleTrack(track)
                        onSubtitlesEnabled(true)
                    }
                },
            )

            ControlPanel.VARIANTS -> OptionRow(
                options = variants.map { variantLabel(it) },
                selected = selectedVariantIndex?.let { index ->
                    variants.getOrNull(index)?.let { variantLabel(it) }
                },
                onSelect = { label ->
                    val index = variants.indexOfFirst { variantLabel(it) == label }
                    if (index >= 0) onVariant(index)
                },
            )

            ControlPanel.NONE -> Unit
        }

        // ------------------------------------------------------------ botones
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Button(onClick = { onSeekBy(-10_000L) }) { Text("⏪ 10s") }
            Button(onClick = onPlayPause) { Text(if (state.isPlaying) "⏸ Pausa" else "▶ Play") }
            Button(onClick = { onSeekBy(10_000L) }) { Text("10s ⏩") }

            Button(onClick = {
                onPanelChange(if (panel == ControlPanel.SPEED) ControlPanel.NONE else ControlPanel.SPEED)
            }) { Text("⏩ ${formatSpeed(state.speed)}") }

            Button(onClick = {
                onPanelChange(if (panel == ControlPanel.AUDIO) ControlPanel.NONE else ControlPanel.AUDIO)
            }) { Text("🔊 Audio") }

            Button(onClick = {
                onPanelChange(
                    if (panel == ControlPanel.SUBTITLES) ControlPanel.NONE else ControlPanel.SUBTITLES,
                )
            }) { Text("💬 Subtítulos") }

            if (variants.size > 1) {
                Button(onClick = {
                    onPanelChange(
                        if (panel == ControlPanel.VARIANTS) ControlPanel.NONE else ControlPanel.VARIANTS,
                    )
                }) { Text("📺 Variante") }
            }

            Button(onClick = { onVolume(state.volume - 0.1f) }) { Text("🔉 −") }
            Button(onClick = { onVolume(state.volume + 0.1f) }) { Text("🔊 +") }

            Button(onClick = onExit) { Text("⏹ Salir") }
        }
    }
}

/** Fila horizontal de opciones (se recorre con las flechas del D-pad). */
@Composable
private fun OptionRow(
    options: List<String>,
    selected: String?,
    onSelect: (String) -> Unit,
) {
    if (options.isEmpty()) return
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            Button(
                onClick = { onSelect(option) },
                enabled = option != selected,
            ) {
                Text(
                    text = option,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private fun trackLabel(track: TrackOption): String {
    val language = track.language?.uppercase() ?: "?"
    val label = track.label
    return if (label.equals(language, ignoreCase = true)) language else "$language · $label"
}

private fun variantLabel(variant: VariantOption): String =
    variant.height?.let { "${it}p" } ?: variant.name.orEmpty()

private fun formatSpeed(speed: Float): String {
    val value = if (speed % 1f == 0f) speed.toInt().toString() else speed.toString()
    return "${value}x"
}

/** Formatea milisegundos como `mm:ss` o `h:mm:ss`. */
fun formatTime(millis: Long): String {
    if (millis <= 0L) return "0:00"
    val totalSeconds = millis / 1000
    val seconds = totalSeconds % 60
    val minutes = (totalSeconds / 60) % 60
    val hours = totalSeconds / 3600
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%d:%02d".format(minutes, seconds)
    }
}
