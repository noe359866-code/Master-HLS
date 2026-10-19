package com.vibeflix.tv.ui.screens.profiles

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vibeflix.tv.data.local.SettingsStore
import com.vibeflix.tv.data.remote.dto.ProfileDto
import com.vibeflix.tv.data.repository.VibeFlixRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import javax.inject.Inject

data class ProfilesUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val profiles: List<ProfileDto> = emptyList(),
    val selected: ProfileDto? = null,
    val creating: Boolean = false,
    val name: String = "",
    val language: String = "",
    val pin: String = "",
)

/** El perfil activo y su idioma viven en el servidor, como las listas y el progreso. */
@HiltViewModel
class ProfilesViewModel @Inject constructor(
    private val repository: VibeFlixRepository,
    private val settingsStore: SettingsStore,
) : ViewModel() {
    private val _state = MutableStateFlow(ProfilesUiState())
    val state: StateFlow<ProfilesUiState> = _state.asStateFlow()

    init { reload() }

    fun reload() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val result = repository.profiles()
                _state.value = _state.value.copy(loading = false, profiles = result.profiles)
            } catch (cause: Throwable) {
                _state.value = _state.value.copy(loading = false, error =
                    cause.message ?: "No se pudieron cargar los perfiles")
            }
        }
    }

    fun choose(profile: ProfileDto) {
        _state.value = _state.value.copy(
            selected = profile,
            creating = false,
            name = if (profile.id == "default" && profile.name == "Perfil principal" &&
                profile.contentLanguage.isNullOrBlank()) "" else profile.name,
            language = profile.contentLanguage.orEmpty(),
            pin = "",
            error = null,
        )
    }

    fun newProfile() {
        _state.value = _state.value.copy(
            selected = null, creating = true, name = "", language = "", pin = "", error = null,
        )
    }

    fun back() {
        _state.value = _state.value.copy(selected = null, creating = false, error = null)
    }

    fun setName(value: String) { _state.value = _state.value.copy(name = value) }
    fun setLanguage(value: String) { _state.value = _state.value.copy(language = value) }
    fun setPin(value: String) { _state.value = _state.value.copy(pin = value) }

    fun enter(onEntered: () -> Unit) {
        val state = _state.value
        if (state.busy) return
        val name = state.name.trim()
        if (name.isBlank() || name.length > 80 || state.language.isBlank()) {
            _state.value = state.copy(error = "Escribe tu nombre y elige un idioma")
            return
        }
        if (state.selected?.pin?.isNotBlank() == true && state.pin.isBlank()) {
            _state.value = state.copy(error = "Introduce el PIN de este perfil")
            return
        }

        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null)
            try {
                val profile = state.selected ?: repository.createProfile(name).also {
                    // Si falla un paso posterior, se puede reintentar sin duplicar el perfil.
                    _state.value = _state.value.copy(selected = it, creating = false)
                }
                repository.activateProfile(profile.id, state.pin)
                repository.updateProfile(profile.id, name, state.language)
                settingsStore.setAudioLanguage(state.language.substringBefore('-'))
                _state.value = _state.value.copy(busy = false)
                onEntered()
            } catch (cause: Throwable) {
                val message = if (cause is HttpException && (cause.code() == 401 || cause.code() == 403)) {
                    "PIN incorrecto o requerido"
                } else cause.message ?: "No se pudo guardar el perfil"
                _state.value = _state.value.copy(busy = false, error = message)
            }
        }
    }
}
