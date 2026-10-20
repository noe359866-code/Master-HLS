package com.vibeflix.tv.ui.screens.addons

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vibeflix.tv.data.remote.dto.InstalledAddonDto
import com.vibeflix.tv.data.repository.VibeFlixRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AddonsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val manifestUrl: String = "",
    val addons: List<InstalledAddonDto> = emptyList(),
    /** API key de OpenSubtitles (guardada en el servidor). */
    val openSubtitlesKey: String = "",
    /** Si el boton de omitir intro esta activo. */
    val skipIntroEnabled: Boolean = true,
    /** Salto por defecto cuando no se puede detectar la intro (segundos). */
    val skipIntroOffset: Int = 90,
    val settingsSaved: Boolean = false,
)

@HiltViewModel
class AddonsViewModel @Inject constructor(
    private val repository: VibeFlixRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AddonsUiState())
    val state: StateFlow<AddonsUiState> = _state.asStateFlow()

    init {
        refresh()
        loadSettings()
    }

    /** Carga los ajustes del servidor (OpenSubtitles, omitir intro). */
    fun loadSettings() {
        viewModelScope.launch {
            runCatching { repository.settings() }
                .onSuccess { settings ->
                    _state.value = _state.value.copy(
                        openSubtitlesKey = settings.opensubtitles?.apiKey.orEmpty(),
                        skipIntroEnabled = settings.skipIntro?.enabled ?: true,
                        skipIntroOffset = settings.skipIntro?.offsetSeconds ?: 90,
                    )
                }
        }
    }

    fun onOpenSubtitlesKeyChange(value: String) {
        _state.value = _state.value.copy(openSubtitlesKey = value, settingsSaved = false)
    }

    fun onSkipIntroEnabledChange(value: Boolean) {
        _state.value = _state.value.copy(skipIntroEnabled = value, settingsSaved = false)
    }

    fun onSkipIntroOffsetChange(value: Int) {
        _state.value = _state.value.copy(skipIntroOffset = value, settingsSaved = false)
    }

    /** Guarda los ajustes de OpenSubtitles y de omitir intro en el servidor. */
    fun saveSettings() {
        viewModelScope.launch {
            runCatching {
                repository.saveSettings(
                    mapOf(
                        "opensubtitles" to mapOf("apiKey" to _state.value.openSubtitlesKey.trim()),
                        "skipIntro" to mapOf(
                            "enabled" to _state.value.skipIntroEnabled,
                            "offsetSeconds" to _state.value.skipIntroOffset.coerceIn(5, 600),
                        ),
                    ),
                )
            }
                .onSuccess { _state.value = _state.value.copy(settingsSaved = true, error = null) }
                .onFailure { error ->
                    _state.value = _state.value.copy(
                        error = error.message ?: "No se pudieron guardar los ajustes",
                    )
                }
        }
    }

    fun onManifestUrlChange(value: String) {
        _state.value = _state.value.copy(manifestUrl = value)
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            runCatching { repository.addons() }
                .onSuccess { addons -> _state.value = _state.value.copy(loading = false, addons = addons) }
                .onFailure { error ->
                    _state.value = _state.value.copy(
                        loading = false,
                        error = error.message ?: "No se pudieron cargar los addons",
                    )
                }
        }
    }

    fun install() {
        val url = _state.value.manifestUrl.trim()
        if (url.isEmpty()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            runCatching { repository.installAddon(url) }
                .onSuccess {
                    _state.value = _state.value.copy(manifestUrl = "")
                    refresh()
                }
                .onFailure { error ->
                    _state.value = _state.value.copy(
                        loading = false,
                        error = error.message ?: "No se pudo instalar el addon",
                    )
                }
        }
    }

    fun remove(id: String) {
        viewModelScope.launch {
            runCatching { repository.removeAddon(id) }
                .onSuccess { refresh() }
                .onFailure { error ->
                    _state.value = _state.value.copy(error = error.message)
                }
        }
    }
}
