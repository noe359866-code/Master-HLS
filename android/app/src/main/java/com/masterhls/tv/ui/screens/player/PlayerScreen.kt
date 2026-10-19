package com.masterhls.tv.ui.screens.player

import android.view.KeyEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.masterhls.tv.data.player.PlayerEngine
import kotlinx.coroutines.delay

/**
 * Reproductor de TV basado en AndroidX Media3 (ExoPlayer).
 *
 * Integracion con el D-pad:
 *  - El video tiene el foco inicial. Las flechas izquierda y derecha saltan
 *    +/-10 s, el centro play/pausa y las teclas de volumen del mando suben o
 *    bajan el volumen. Tambien se responden las teclas multimedia.
 *  - Arriba y abajo despliegan la barra de controles y le ceden el foco, de
 *    modo que alli se recorre con las flechas y se activa con el centro.
 *  - BACK devuelve el foco al video si la barra esta activa, y sale del
 *    reproductor si el foco esta en el video.
 *  - Los controles se ocultan solos a los 5 s de inactividad (no mientras el
 *    usuario los esta usando) y vuelven a aparecer con cualquier pulsacion.
 */
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    type: String,
    id: String,
    url: String,
    streamName: String,
    title: String,
    headers: Map<String, String> = emptyMap(),
    onBack: () -> Unit,
    viewModel: PlayerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val engine = remember {
        PlayerEngine(context, scope, headers)
    }
    val playback by engine.state.collectAsStateWithLifecycle()

    var panel by remember { mutableStateOf(ControlPanel.NONE) }
    var controlsVisible by remember { mutableStateOf(true) }
    var controlsFocused by remember { mutableStateOf(false) }
    var pendingControlsFocus by remember { mutableStateOf(false) }

    val videoFocus = remember { FocusRequester() }
    val controlsFocus = remember { FocusRequester() }

    DisposableEffect(Unit) {
        onDispose { engine.release() }
    }

    // El video toma el foco inicial.
    LaunchedEffect(Unit) {
        runCatching { videoFocus.requestFocus() }
    }

    LaunchedEffect(url, headers) { viewModel.prepare(url, headers) }

    // Limite de calidad segun las capacidades del dispositivo.
    LaunchedEffect(state.deviceMaxHeight) {
        engine.applyDeviceConstraints(state.deviceMaxHeight)
    }

    // Carga del stream elegido por el servidor (variante HLS o URL directa).
    LaunchedEffect(state.playbackUrl) {
        val playbackUrl = state.playbackUrl ?: return@LaunchedEffect
        engine.setMedia(playbackUrl, title.ifBlank { streamName }, state.isHls)
    }

    // Los controles se ocultan solos si no hay actividad (ni foco en la barra).
    LaunchedEffect(controlsVisible, controlsFocused) {
        if (controlsVisible && !controlsFocused) {
            delay(CONTROLS_TIMEOUT_MS)
            controlsVisible = false
            controlsFocused = false
        }
    }

    // Cuando el usuario pide la barra de controles, se le cede el foco.
    LaunchedEffect(pendingControlsFocus) {
        if (pendingControlsFocus) {
            delay(60)
            runCatching { controlsFocus.requestFocus() }
            pendingControlsFocus = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(videoFocus)
            .focusable()
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                val native = event.nativeKeyEvent

                // Con el foco en la barra de controles, las flechas y el
                // centro los gestiona Compose (foco de los botones).
                if (controlsFocused) {
                    if (event.key == Key.Back) {
                        runCatching { videoFocus.requestFocus() }
                        true
                    } else {
                        false
                    }
                } else {
                    when {
                        event.key == Key.DirectionLeft -> {
                            engine.seekBy(-PlayerEngine.SEEK_INCREMENT_MS)
                            true
                        }

                        event.key == Key.DirectionRight -> {
                            engine.seekBy(PlayerEngine.SEEK_INCREMENT_MS)
                            true
                        }

                        event.key == Key.DirectionUp || event.key == Key.DirectionDown -> {
                            // Despliega los controles y les cede el foco.
                            panel = ControlPanel.NONE
                            controlsVisible = true
                            pendingControlsFocus = true
                            true
                        }

                        event.key == Key.Enter ||
                            event.key == Key.NumPadEnter ||
                            event.key == Key.DirectionCenter -> {
                            engine.togglePlayPause()
                            true
                        }

                        event.key == Key.Back -> {
                            onBack()
                            true
                        }

                        native.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                            engine.togglePlayPause()
                            true
                        }

                        native.keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                            engine.seekBy(PlayerEngine.SEEK_INCREMENT_MS)
                            true
                        }

                        native.keyCode == KeyEvent.KEYCODE_MEDIA_REWIND -> {
                            engine.seekBy(-PlayerEngine.SEEK_INCREMENT_MS)
                            true
                        }

                        native.keyCode == KeyEvent.KEYCODE_MEDIA_STOP -> {
                            onBack()
                            true
                        }

                        native.keyCode == KeyEvent.KEYCODE_VOLUME_UP -> {
                            engine.setVolume(playback.volume + 0.1f)
                            true
                        }

                        native.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN -> {
                            engine.setVolume(playback.volume - 0.1f)
                            true
                        }

                        native.keyCode == KeyEvent.KEYCODE_MENU -> {
                            controlsVisible = true
                            pendingControlsFocus = true
                            true
                        }

                        else -> false
                    }.also { handled ->
                        if (handled) controlsVisible = true
                    }
                }
            },
    ) {
        AndroidView(
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    // El foco lo lleva la capa de Compose, no la vista de video.
                    isFocusable = false
                    isFocusableInTouchMode = false
                    this.player = engine.player
                }
            },
            update = { it.player = engine.player },
            modifier = Modifier.fillMaxSize(),
        )

        // Cabecera: titulo e informacion de la variante.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = title.ifBlank { streamName },
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                )
                val info = buildString {
                    if (state.isMaster) {
                        append("Master HLS · ")
                        append("${state.selectedHeight ?: "?"}p · ")
                        append("${state.variants.size} variantes")
                    } else {
                        append(if (state.isHls) "HLS" else "Directo")
                    }
                    if (playback.speed != 1f) {
                        append(" · ${playback.speed}x")
                    }
                    if (playback.volume < 1f) {
                        append(" · vol ${(playback.volume * 100).toInt()}%")
                    }
                }
                Text(
                    text = info,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF98A2B8),
                )
            }
        }

        if (state.loading || playback.isBuffering) {
            Text(
                text = if (state.loading) "Analizando el stream…" else "Cargando…",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF98A2B8),
                modifier = Modifier
                    .align(Alignment.Center),
            )
        }

        playback.error?.let { message ->
            Text(
                text = "Error de reproduccion: $message",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFFFF6B6B),
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(24.dp),
            )
        }

        if (!controlsVisible) {
            Text(
                text = "↑ Controles",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0x66FFFFFF),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(24.dp),
            )
        }

        if (controlsVisible) {
            PlayerControls(
                state = playback,
                panel = panel,
                variants = state.variants,
                selectedVariantIndex = state.selectedVariantIndex,
                onPanelChange = { panel = it },
                onPlayPause = { engine.togglePlayPause() },
                onSeekBy = { delta -> engine.seekBy(delta) },
                onSpeed = { speed -> engine.setSpeed(speed) },
                onVolume = { volume -> engine.setVolume(volume) },
                onAudioTrack = { track ->
                    if (track == null) {
                        engine.clearTrackOverride(C.TRACK_TYPE_AUDIO)
                    } else {
                        engine.selectTrack(track)
                    }
                },
                onSubtitleTrack = { track ->
                    if (track == null) {
                        engine.clearTrackOverride(C.TRACK_TYPE_TEXT)
                    } else {
                        engine.selectTrack(track)
                    }
                },
                onSubtitlesEnabled = { enabled -> engine.setSubtitlesEnabled(enabled) },
                onVariant = { index ->
                    state.variants.getOrNull(index)?.let { viewModel.selectVariant(it) }
                },
                onExit = {
                    onBack()
                },
                onFocusStateChange = { focused ->
                    controlsFocused = focused
                    if (focused) {
                        controlsVisible = true
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(24.dp)
                    .focusRequester(controlsFocus),
            )
        }
    }
}

/** Tiempo que los controles permanecen visibles sin actividad (ms). */
private const val CONTROLS_TIMEOUT_MS: Long = 5_000L
