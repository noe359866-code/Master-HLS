package com.vibeflix.tv.data.player

import android.content.Context
import android.net.Uri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.DefaultLoadControl
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/** Pista de audio o de subtitulos seleccionable por el usuario. */
data class TrackOption(
    /** Indice del grupo de pistas dentro de `Tracks`. */
    val groupIndex: Int,
    /** Indice de la pista dentro del grupo. */
    val trackIndex: Int,
    /** Codigo ISO 639-1 (o null si el origen no lo indica). */
    val language: String?,
    /** Etiqueta legible. */
    val label: String,
    /** `C.TRACK_TYPE_AUDIO` o `C.TRACK_TYPE_TEXT`. */
    val type: Int,
)

/** Estado del reproductor expuesto a la interfaz. */
data class PlaybackState(
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val bufferedMs: Long = 0L,
    val speed: Float = 1f,
    val volume: Float = 1f,
    val audioTracks: List<TrackOption> = emptyList(),
    val subtitleTracks: List<TrackOption> = emptyList(),
    val selectedAudioTrack: TrackOption? = null,
    val selectedSubtitleTrack: TrackOption? = null,
    val subtitlesEnabled: Boolean = false,
    /** true cuando el medio ha terminado (para el autoplay). */
    val isEnded: Boolean = false,
    val error: String? = null,
) {
    /** Progreso de la reproduccion (0..1). */
    val progress: Float
        get() = if (durationMs > 0L) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f

    /** Progreso del buffer (0..1). */
    val bufferedProgress: Float
        get() = if (durationMs > 0L) (bufferedMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
}

/**
 * Motor de reproduccion (AndroidX Media3 / ExoPlayer).
 *
 * Decisiones de diseño:
 *  - **HLS optimizado**: buffers amplios (50 s minimo, 120 s maximo) para
 *    que un pico de red no corte la reproduccion, `allowChunklessPreparation`
 *    desactivado (muchos CDN de addons no lo soportan) y el factory de HLS
 *    propio para poder tunearlo.
 *  - **Cache**: los segmentos ya descargados se reutilizan
 *    ([PlaybackCache]); los playlists rotan por ventana de tiempo para no
 *    servir un manifiesto rancio en directo.
 *  - **Eleccion de calidad**: la variante la elige el servidor (`/hls/master`)
 *    segun las capacidades del dispositivo; aqui solo se pone un techo por si
 *    se reproduce un master multivariant directamente.
 *  - **Velocidad y pistas**: la UI de TV puede cambiar la velocidad, elegir
 *    la pista de audio y activar/cambiar los subtitulos.
 *  - **Puente con la UI**: un `StateFlow` con el estado y funciones de comando,
 *    de forma que la pantalla de Compose solo se ocupa del D-pad y del foco.
 */
@androidx.annotation.OptIn(UnstableApi::class)
class PlayerEngine(
    context: Context,
    private val scope: CoroutineScope,
    private val headers: Map<String, String> = emptyMap(),
) {

    private val appContext: Context = context.applicationContext

    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .retryOnConnectionFailure(true)
        .build()

    private val trackSelector: DefaultTrackSelector = DefaultTrackSelector(appContext)

    private val _state = MutableStateFlow(PlaybackState())
    val state: StateFlow<PlaybackState> = _state.asStateFlow()

    /** Reproductor de Media3 (se expone para la superficie de video). */
    val player: ExoPlayer = buildPlayer()

    private var ticker: Job? = null

    /** Pista de audio fijada por el usuario. */
    private var audioOverride: TrackSelectionOverride? = null

    /** Pista de subtitulos fijada por el usuario. */
    private var subtitleOverride: TrackSelectionOverride? = null

    /** true si el usuario quiere ver los subtitulos. */
    private var subtitlesEnabled: Boolean = false

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) = refreshState()

        override fun onPlaybackStateChanged(playbackState: Int) = refreshState()

        override fun onTracksChanged(tracks: Tracks) = refreshState()

        override fun onPlayerError(error: PlaybackException) {
            _state.value = _state.value.copy(error = error.errorCodeName)
        }
    }

    init {
        player.addListener(listener)
        ticker = scope.launch {
            while (isActive) {
                refreshState()
                delay(STATE_POLL_MS)
            }
        }
    }

    // ------------------------------------------------------------- comandos

    /**
     * Carga un stream y empieza a reproducirlo.
     *
     * `subtitleUrl` permite cargar un subtitulo externo (por ejemplo, uno
     * descargado de OpenSubtitles) como pista adicional del propio medio: es
     * la via que ofrece Media3 para los "side-loaded subtitles".
     */
    fun setMedia(
        url: String,
        title: String? = null,
        isHls: Boolean = HlsCacheKeys.isPlaylist(url),
        subtitleUrl: String? = null,
    ) {
        if (url.isBlank()) return
        val builder = MediaItem.Builder().setUri(url)
        if (isHls) {
            builder.setMimeType(MimeTypes.APPLICATION_M3U8)
        }
        if (!title.isNullOrBlank()) {
            builder.setMediaMetadata(MediaMetadata.Builder().setTitle(title).build())
        }
        if (!subtitleUrl.isNullOrBlank()) {
            val subtitle = MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitleUrl))
                .setMimeType(MimeTypes.APPLICATION_VTT)
                .setLanguage("und")
                .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                .build()
            builder.setSubtitleConfigurations(listOf(subtitle))
        }
        player.setMediaItem(builder.build())
        player.prepare()
        player.playWhenReady = true
        _state.value = _state.value.copy(error = null)
    }

    /** Reproducir o pausar. */
    fun togglePlayPause() {
        if (player.isPlaying) player.pause() else player.play()
    }

    /** Avance o retroceso en milisegundos (botones del mando). */
    fun seekBy(deltaMs: Long) {
        val target = (player.currentPosition + deltaMs).coerceAtLeast(0L)
        val duration = player.duration
        player.seekTo(if (duration > 0L) target.coerceAtMost(duration) else target)
    }

    /** Salta a una posicion concreta. */
    fun seekTo(positionMs: Long) {
        player.seekTo(positionMs.coerceAtLeast(0L))
    }

    /** Cambia la velocidad de reproduccion (1.0 = normal). */
    fun setSpeed(speed: Float) {
        player.setPlaybackSpeed(speed.coerceIn(0.25f, 3f))
        refreshState()
    }

    /** Cambia el volumen (0..1). */
    fun setVolume(volume: Float) {
        player.volume = volume.coerceIn(0f, 1f)
        refreshState()
    }

    /**
     * Elige una pista concreta (audio o subtitulos).
     *
     * Se usa `TrackSelectionOverride` para fijar el grupo y el indice exactos:
     * elegir solo por idioma deja al reproductor decidir entre pistas con el
     * mismo codigo (por ejemplo, dos voces en ingles).
     */
    fun selectTrack(option: TrackOption) {
        val group = player.currentTracks.groups.getOrNull(option.groupIndex) ?: return
        if (group.type != option.type) return
        val override = TrackSelectionOverride(group.mediaTrackGroup, option.trackIndex)
        if (option.type == C.TRACK_TYPE_AUDIO) {
            audioOverride = override
        } else {
            subtitleOverride = override
            subtitlesEnabled = true
        }
        applyTrackParameters()
    }

    /** Vuelve a la seleccion automatica de pistas del reproductor. */
    fun clearTrackOverride(type: Int) {
        if (type == C.TRACK_TYPE_AUDIO) {
            audioOverride = null
        } else {
            subtitleOverride = null
            subtitlesEnabled = false
        }
        applyTrackParameters()
    }

    /** Activa o desactiva los subtitulos. */
    fun setSubtitlesEnabled(enabled: Boolean) {
        subtitlesEnabled = enabled
        if (!enabled) subtitleOverride = null
        applyTrackParameters()
    }

    /**
     * Aplica las pistas fijadas por el usuario.
     *
     * Se reconstruyen los parametros de seleccion para poder quitar una
     * fijacion sin perder la otra (por ejemplo, quitar los subtitulos sin
     * perder el audio elegido).
     */
    private fun applyTrackParameters() {
        val builder = TrackSelectionParameters.Builder()
        audioOverride?.let { builder.setOverrideForType(it) }
        subtitleOverride?.let { builder.setOverrideForType(it) }
        builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !subtitlesEnabled)
        player.trackSelectionParameters = builder.build()
        refreshState()
    }

    /**
     * Aplica las capacidades del dispositivo como techo de calidad.
     *
     * El servidor ya elige la variante adecuada (`/hls/master`); este techo
     * es la red de seguridad para cuando se reproduce un master directamente.
     */
    fun applyDeviceConstraints(maxHeight: Int) {
        val height = maxHeight.coerceIn(240, 4320)
        val width = height * 16 / 9
        trackSelector.parameters = trackSelector.buildUponParameters()
            .setMaxVideoSize(width, height)
            .setExceedVideoConstraintsIfNecessary(false)
            .build()
    }

    /** Libera el reproductor y los recursos. */
    fun release() {
        ticker?.cancel()
        ticker = null
        player.removeListener(listener)
        player.release()
    }

    // ------------------------------------------------------------- internos

    private fun buildPlayer(): ExoPlayer {
        val upstream = OkHttpDataSource.Factory(httpClient)
            .setUserAgent(USER_AGENT)
            .apply {
                if (headers.isNotEmpty()) setDefaultRequestProperties(headers)
            }

        val cached = CacheDataSource.Factory()
            .setCache(PlaybackCache.get(appContext))
            .setUpstreamDataSourceFactory(upstream)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
            .setCacheKeyFactory(VibeFlixCacheKeyFactory())

        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                MIN_BUFFER_MS,
                MAX_BUFFER_MS,
                BUFFER_FOR_PLAYBACK_MS,
                BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        return ExoPlayer.Builder(appContext)
            .setMediaSourceFactory(VibeFlixMediaSourceFactory(cached))
            .setLoadControl(loadControl)
            .setTrackSelector(trackSelector)
            .build()
            .also { exo ->
                exo.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                        .setUsage(C.USAGE_MEDIA)
                        .build(),
                    true,
                )
            }
    }

    private fun refreshState() {
        val duration = player.duration.takeIf { it > 0L } ?: 0L
        _state.value = _state.value.copy(
            isPlaying = player.isPlaying,
            isBuffering = player.playbackState == Player.STATE_BUFFERING,
            positionMs = player.currentPosition.coerceAtLeast(0L),
            durationMs = duration,
            bufferedMs = player.bufferedPosition.coerceAtLeast(0L),
            speed = player.playbackParameters.speed,
            volume = player.volume,
            audioTracks = collectTracks(C.TRACK_TYPE_AUDIO),
            subtitleTracks = collectTracks(C.TRACK_TYPE_TEXT),
            selectedAudioTrack = currentOverride(C.TRACK_TYPE_AUDIO),
            selectedSubtitleTrack = currentOverride(C.TRACK_TYPE_TEXT),
            subtitlesEnabled = !player.trackSelectionParameters.isTrackTypeDisabled(C.TRACK_TYPE_TEXT),
            isEnded = player.playbackState == Player.STATE_ENDED,
        )
    }

    /** Pista fijada manualmente por el usuario (si la hay). */
    private fun currentOverride(type: Int): TrackOption? {
        val overrides = player.trackSelectionParameters.overrides
        if (overrides.isEmpty()) return null
        val groups = player.currentTracks.groups
        groups.forEachIndexed { groupIndex, group ->
            if (group.type != type) return@forEachIndexed
            val override = overrides[group.mediaTrackGroup] ?: return@forEachIndexed
            val index = override.trackIndex
            if (index !in 0 until group.length) return@forEachIndexed
            val format = group.getTrackFormat(index)
            return TrackOption(
                groupIndex = groupIndex,
                trackIndex = index,
                language = format.language,
                label = format.label ?: format.language ?: "Pista ${index + 1}",
                type = type,
            )
        }
        return null
    }

    private fun collectTracks(type: Int): List<TrackOption> {
        val options = mutableListOf<TrackOption>()
        player.currentTracks.groups.forEachIndexed { groupIndex, group ->
            if (group.type != type) return@forEachIndexed
            for (index in 0 until group.length) {
                val format = group.getTrackFormat(index)
                val language = format.language
                options += TrackOption(
                    groupIndex = groupIndex,
                    trackIndex = index,
                    language = language,
                    label = format.label ?: language ?: "Pista ${options.size + 1}",
                    type = type,
                )
            }
        }
        return options
    }

    companion object {
        private const val USER_AGENT =
            "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"

        /** Buffer minimo antes de empezar a reproducir (ms). */
        const val MIN_BUFFER_MS: Int = 50_000

        /** Buffer maximo en memoria (ms). */
        const val MAX_BUFFER_MS: Int = 120_000

        /** Margen de buffer para empezar a reproducir (ms). */
        const val BUFFER_FOR_PLAYBACK_MS: Int = 2_500

        /** Margen de buffer tras un rebobinado (ms). */
        const val BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS: Int = 5_000

        /** Salto del boton de adelante/atras (ms). */
        const val SEEK_INCREMENT_MS: Long = 10_000L

        /** Frecuencia de actualizacion del estado (ms). */
        const val STATE_POLL_MS: Long = 500L
    }
}

/**
 * Fabrica de fuentes de medios con un tratamiento especifico para HLS.
 *
 * `DefaultMediaSourceFactory` no permite ajustar el factory de HLS, asi que
 * aqui se enruta: los `.m3u8` van a [HlsMediaSource] con sus parametros y el
 * resto (mp4, etc.) al factory por defecto.
 */
@androidx.annotation.OptIn(UnstableApi::class)
internal class VibeFlixMediaSourceFactory(
    private val dataSourceFactory: DataSource.Factory,
) : MediaSource.Factory {

    private val defaultFactory: DefaultMediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)

    private val hlsFactory: HlsMediaSource.Factory = HlsMediaSource.Factory(dataSourceFactory)
        .setAllowChunklessPreparation(false)

    override fun createMediaSource(mediaItem: MediaItem): MediaSource {
        val mimeType = mediaItem.localConfiguration?.mimeType
        return if (mimeType == MimeTypes.APPLICATION_M3U8) {
            hlsFactory.createMediaSource(mediaItem)
        } else {
            defaultFactory.createMediaSource(mediaItem)
        }
    }
}
