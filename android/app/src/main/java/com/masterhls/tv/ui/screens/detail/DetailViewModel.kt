package com.masterhls.tv.ui.screens.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.masterhls.tv.data.remote.dto.MetaDto
import com.masterhls.tv.data.remote.dto.StreamDto
import com.masterhls.tv.data.repository.MasterHlsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DetailUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val meta: MetaDto? = null,
    val streams: List<StreamDto> = emptyList(),
)

@HiltViewModel
class DetailViewModel @Inject constructor(
    private val repository: MasterHlsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(DetailUiState())
    val state: StateFlow<DetailUiState> = _state.asStateFlow()

    fun load(type: String, id: String) {
        if (_state.value.meta != null || _state.value.loading) return
        viewModelScope.launch {
            _state.value = DetailUiState(loading = true)
            try {
                val meta = async { repository.meta(type, id) }
                val streams = async { repository.streams(type, id) }
                _state.value = DetailUiState(
                    loading = false,
                    meta = meta.await(),
                    streams = streams.await(),
                )
            } catch (error: Throwable) {
                _state.value = DetailUiState(
                    loading = false,
                    error = error.message ?: "No se pudo cargar el titulo",
                )
            }
        }
    }
}
