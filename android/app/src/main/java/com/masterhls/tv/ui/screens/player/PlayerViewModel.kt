package com.masterhls.tv.ui.screens.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.masterhls.tv.data.local.SettingsStore
import com.masterhls.tv.data.repository.MasterHlsRepository
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
    val variants: List<VariantOption> = emptyList(),
    val selectedHeight: Int? = null,
    val loading: Boolean = true,
    val error: String? = null,
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
    private val repository: MasterHlsRepository,
    private val settingsStore: SettingsStore,
) : ViewModel() {

    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    fun prepare(url: String) {
        if (url.isBlank()) {
            _state.value = PlayerUiState(loading = false, error = "URL de stream vacia")
            return
        }
        viewModelScope.launch {
            _state.value = PlayerUiState(loading = true, playbackUrl = url)
            try {
                val maxHeight = settingsStore.maxHeight.first()
                val supportsHdr = settingsStore.supportsHdr.first()
                val audioLanguage = settingsStore.audioLanguage.first()

                val info = repository.masterInfo(
                    url = url,
                    maxHeight = maxHeight,
                    audioLanguage = audioLanguage,
                )

                if (!info.isMaster) {
                    _state.value = PlayerUiState(
                        loading = false,
                        playbackUrl = url,
                        isMaster = false,
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
                _state.value = PlayerUiState(
                    loading = false,
                    isMaster = true,
                    playbackUrl = selected?.uri ?: url,
                    variants = variants,
                    selectedHeight = selected?.height,
                )
            } catch (error: Throwable) {
                // Si el analisis del master falla, se reproduce la URL original.
                _state.value = PlayerUiState(
                    loading = false,
                    playbackUrl = url,
                    error = error.message,
                )
            }
        }
    }

    fun selectVariant(variant: VariantOption) {
        _state.value = _state.value.copy(
            playbackUrl = variant.uri,
            selectedHeight = variant.height,
        )
    }
}
