package com.masterhls.tv.ui.screens.addons

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.masterhls.tv.data.remote.dto.InstalledAddonDto
import com.masterhls.tv.data.repository.MasterHlsRepository
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
)

@HiltViewModel
class AddonsViewModel @Inject constructor(
    private val repository: MasterHlsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AddonsUiState())
    val state: StateFlow<AddonsUiState> = _state.asStateFlow()

    init {
        refresh()
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
