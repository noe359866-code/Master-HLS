package com.vibeflix.tv.ui.screens.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vibeflix.tv.BuildConfig
import com.vibeflix.tv.data.local.SettingsStore
import com.vibeflix.tv.data.remote.dto.MetaDto
import com.vibeflix.tv.data.remote.dto.OpenSubtitleDto
import com.vibeflix.tv.data.remote.dto.StreamDto
import com.vibeflix.tv.data.remote.dto.VideoDto
import com.vibeflix.tv.data.repository.VibeFlixRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DetailUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val meta: MetaDto? = null,
    val streams: List<StreamDto> = emptyList(),
    val streamsLoading: Boolean = false,
    val selectedEpisodeId: String? = null,
    /** OpenSubtitles nativo: resultados de la busqueda. */
    val subtitles: List<OpenSubtitleDto> = emptyList(),
    /** false cuando falta la API key en los ajustes del servidor. */
    val subtitlesEnabled: Boolean = false,
    val subtitlesLoading: Boolean = false,
    /** Subtitulo elegido (URL absoluta del WebVTT). */
    val selectedSubtitleUrl: String? = null,
    val selectedSubtitleName: String? = null,
)

@HiltViewModel
class DetailViewModel @Inject constructor(
    private val repository: VibeFlixRepository,
    private val settingsStore: SettingsStore,
) : ViewModel() {

    private val _state = MutableStateFlow(DetailUiState())
    val state: StateFlow<DetailUiState> = _state.asStateFlow()
    private var loadedTitle: String? = null
    private var requestedStream: String? = null

    fun load(type: String, id: String) {
        val key = "$type/$id"
        if (loadedTitle == key) return
        loadedTitle = key
        viewModelScope.launch {
            _state.value = DetailUiState(loading = true)
            try {
                val meta = repository.meta(type, id)
                if (loadedTitle != key) return@launch
                val firstEpisode = meta?.videos.orEmpty()
                    .filter { it.id.isNotBlank() }
                    .minWithOrNull(compareBy<VideoDto> { it.season ?: 1 }
                        .thenBy { it.episode ?: it.number ?: 0 })
                _state.value = DetailUiState(
                    loading = false,
                    meta = meta,
                    selectedEpisodeId = firstEpisode?.id,
                )
                loadStreams(type, firstEpisode?.id ?: id)
            } catch (error: Throwable) {
                if (loadedTitle == key) _state.value = DetailUiState(
                    loading = false,
                    error = error.message ?: "No se pudo cargar el titulo",
                )
            }
        }
    }

    /** Cada capítulo se consulta por su ID S:E, no por la ficha de la serie. */
    fun selectEpisode(type: String, id: String) {
        if (id.isBlank() || _state.value.selectedEpisodeId == id) return
        _state.value = _state.value.copy(
            selectedEpisodeId = id,
            selectedSubtitleUrl = null,
            selectedSubtitleName = null,
            subtitles = emptyList(),
        )
        loadStreams(type, id)
    }

    private fun loadStreams(type: String, id: String) {
        val key = "$type/$id"
        requestedStream = key
        _state.value = _state.value.copy(streams = emptyList(), streamsLoading = true)
        viewModelScope.launch {
            val streams = runCatching { repository.streams(type, id) }.getOrDefault(emptyList())
            if (requestedStream == key) {
                _state.value = _state.value.copy(streams = streams, streamsLoading = false)
            }
        }
    }

    /**
     * Busca subtitulos en OpenSubtitles de forma nativa.
     *
     * No hace falta instalar el addon de subtitulos: el servidor consulta la
     * API oficial de OpenSubtitles con la API key configurada en los ajustes.
     */
    fun loadSubtitles(type: String, id: String) {
        if (_state.value.subtitlesLoading) return
        viewModelScope.launch {
            _state.value = _state.value.copy(subtitlesLoading = true)
            try {
                val imdbId = id.substringBefore(':')
                val season = id.substringAfter(':', "").toIntOrNull()
                val episode = id.substringAfter(':', "").substringAfter(':', "").toIntOrNull()
                val result = repository.openSubtitles(
                    imdbId = imdbId,
                    season = season,
                    episode = episode,
                )
                _state.value = _state.value.copy(
                    subtitles = result.subtitles,
                    subtitlesEnabled = result.enabled,
                    subtitlesLoading = false,
                )
            } catch (error: Throwable) {
                _state.value = _state.value.copy(
                    subtitlesLoading = false,
                    subtitlesEnabled = false,
                )
            }
        }
    }

    /**
     * Descarga el subtitulo elegido y guarda su URL.
     *
     * El servidor lo sirve ya convertido a WebVTT, listo para Media3.
     */
    fun selectSubtitle(entry: OpenSubtitleDto) {
        viewModelScope.launch {
            try {
                val result = repository.downloadOpenSubtitle(entry.fileId)
                val base = (settingsStore.serverUrl.first() ?: BuildConfig.DEFAULT_SERVER_URL)
                    .trimEnd('/')
                val url = if (result.path.startsWith("http")) {
                    result.path
                } else {
                    "$base${result.path}"
                }
                _state.value = _state.value.copy(
                    selectedSubtitleUrl = url,
                    selectedSubtitleName = entry.languageName.ifBlank { "Subtitulos" },
                )
            } catch (error: Throwable) {
                _state.value = _state.value.copy(subtitlesLoading = false)
            }
        }
    }

    /** Quita el subtitulo elegido. */
    fun clearSubtitle() {
        _state.value = _state.value.copy(selectedSubtitleUrl = null, selectedSubtitleName = null)
    }
}
