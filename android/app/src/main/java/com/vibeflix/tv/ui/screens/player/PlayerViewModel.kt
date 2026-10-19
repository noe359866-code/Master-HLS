package com.vibeflix.tv.ui.screens.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vibeflix.tv.data.local.SettingsStore
import com.vibeflix.tv.data.remote.dto.SkipSegmentDto
import com.vibeflix.tv.data.repository.VibeFlixRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PlayerUiState(
    /** URL final que se reproduce (puede ser la variante elegida del master). */
    val playbackUrl: String? = null,
    val isMaster: Boolean = false,
    /** true si la URL final es un playlist HLS. */
    val isHls: Boolean = false,
    val variants: List<VariantOption> = emptyList(),
    /** Indice de la variante seleccionada en `variants`. */
    val selectedVariantIndex: Int? = null,
    val selectedHeight: Int? = null,
    /** Resolucion maxima del dispositivo (techo de calidad). */
    val deviceMaxHeight: Int = 1080,
    val loading: Boolean = true,
    val error: String? = null,
    /**
     * Segmento saltable detectado por el servidor (intro o resumen).
     *
     * `null` si el titulo no tiene intro reconocible o si el usuario desactivo
     * la funcion en los ajustes.
     */
    val skipSegment: SkipSegmentDto? = null,
    /** Episodio siguiente para el autoplay (null si no es una serie). */
    val nextEpisode: NextEpisode? = null,
)

/** Episodio siguiente listo para reproducir (autoplay). */
data class NextEpisode(
    val id: String,
    val title: String,
    val url: String,
    val streamName: String,
)

data class VariantOption(
    val uri: String,
    val height: Int?,
    val name: String?,
    val codecs: List<String>,
)

/**
 * Resolucion del stream antes de reproducir.
 *
 * Si el stream es un master playlist multivariant, se consulta al servidor
 * (`/hls/master`) para elegir la variante que mejor encaja con el
 * dispositivo (resolucion maxima, soporte HDR, codec) y se reproduce esa URL
 * concreta en lugar de dejar que el reproductor decida a ciegas.
 */
@HiltViewModel
class PlayerViewModel @Inject constructor(
    private val repository: VibeFlixRepository,
    private val settingsStore: SettingsStore,
) : ViewModel() {

    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    fun prepare(
        url: String,
        headers: Map<String, String> = emptyMap(),
        id: String = "",
        type: String = "",
    ) {
        if (url.isBlank()) {
            _state.value = PlayerUiState(loading = false, error = "URL de stream vacia")
            return
        }
        viewModelScope.launch {
            // `playbackUrl` se limpia para que el reproductor no cargue la URL
            // original y luego la variante: espera a la resolucion del master.
            _state.value = _state.value.copy(loading = true, playbackUrl = null)
            try {
                val maxHeight = settingsStore.maxHeight.first()
                val supportsHdr = settingsStore.supportsHdr.first()
                val audioLanguage = settingsStore.audioLanguage.first()

                val info = repository.masterInfo(
                    url = url,
                    maxHeight = maxHeight,
                    audioLanguage = audioLanguage,
                    supportsHdr = supportsHdr,
                    headers = headers,
                )

                // Deteccion nativa del final de la intro y del siguiente
                // episodio (autoplay). Ninguna de las dos bloquea la
                // reproduccion: si fallan, se reproduce igual.
                val imdbId = id.substringBefore(':')
                val season = id.substringAfter(':', "").toIntOrNull()
                val episode = id.substringAfter(':', "").substringAfter(':', "").toIntOrNull()
                val segment = runCatching {
                    val result = repository.skipIntro(
                        type = type.ifBlank { null },
                        id = imdbId.ifBlank { null },
                        imdbId = imdbId.ifBlank { null },
                        season = season,
                        episode = episode,
                    )
                    // Si el usuario lo desactivo en los ajustes, no hay boton.
                    if (result.enabled) result.segment else null
                }.getOrNull()
                val next = if (type == "episode") findNextEpisode(id, imdbId) else null

                if (!info.isMaster) {
                    _state.value = _state.value.copy(
                        loading = false,
                        playbackUrl = url,
                        isMaster = false,
                        isHls = looksLikeHls(url),
                        deviceMaxHeight = maxHeight,
                        skipSegment = segment,
                        nextEpisode = next,
                    )
                    return@launch
                }

                val variants = info.variants.map { variant ->
                    VariantOption(
                        uri = variant.uri,
                        height = variant.height,
                        name = variant.name,
                        codecs = variant.codecs.orEmpty(),
                    )
                }

                val selected = info.selected?.variant
                val index = variants.indexOfFirst { it.uri == selected?.uri }
                _state.value = _state.value.copy(
                    loading = false,
                    isMaster = true,
                    isHls = true,
                    playbackUrl = selected?.uri ?: url,
                    variants = variants,
                    selectedVariantIndex = if (index >= 0) index else null,
                    selectedHeight = selected?.height,
                    deviceMaxHeight = maxHeight,
                    skipSegment = segment,
                    nextEpisode = next,
                )
            } catch (error: Throwable) {
                // Si el analisis del master falla, se reproduce la URL original.
                _state.value = _state.value.copy(
                    loading = false,
                    playbackUrl = url,
                    isHls = looksLikeHls(url),
                    error = error.message,
                    skipSegment = segment,
                    nextEpisode = next,
                )
            }
        }
    }

    /**
     * Busca el episodio siguiente de una serie y su stream.
     *
     * Se usa para el autoplay: al terminar el episodio se ofrece el
     * siguiente con una cuenta atras que se puede cancelar.
     */
    private suspend fun findNextEpisode(id: String, imdbId: String): NextEpisode? = runCatching {
        val meta = repository.meta("series", imdbId) ?: return null
        val videos = meta.videos.orEmpty()
        val index = videos.indexOfFirst { it.id == id }
        val next = videos.getOrNull(index + 1) ?: return null
        val stream = repository.streams("series", next.id)
            .firstOrNull { !it.url.isNullOrBlank() }
            ?: return null
        NextEpisode(
            id = next.id,
            title = next.title ?: next.name ?: "Episodio ${next.episode ?: index + 2}",
            url = stream.url.orEmpty(),
            streamName = stream.name ?: stream.title ?: "Stream",
        )
    }.getOrNull()

    /** Cambia a otra variante del master (el usuario lo elige con el D-pad). */
    fun selectVariant(variant: VariantOption) {
        val index = _state.value.variants.indexOfFirst { it.uri == variant.uri }
        _state.value = _state.value.copy(
            playbackUrl = variant.uri,
            selectedVariantIndex = if (index >= 0) index else null,
            selectedHeight = variant.height,
        )
    }
}

/**
 * Deduce si la URL es un playlist HLS.
 *
 * Se miran dos casos: la extension `.m3u8` y el proxy de HLS del servidor
 * (`/hls/proxy`), que siempre devuelve un playlist aunque la URL original
 * no lleve extension (los CDN de addons suelen servir `/playlist?token=...`).
 */
internal fun looksLikeHls(url: String): Boolean {
    val path = url.substringBefore('?').substringBefore('#').lowercase()
    if (path.endsWith(".m3u8") || path.endsWith(".m3u")) return true
    return path.endsWith("/hls/proxy") || path.contains("/hls/proxy/")
}
