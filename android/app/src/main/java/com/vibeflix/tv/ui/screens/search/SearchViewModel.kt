package com.vibeflix.tv.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vibeflix.tv.data.remote.dto.MetaDto
import com.vibeflix.tv.data.remote.dto.SearchHistoryEntryDto
import com.vibeflix.tv.data.repository.VibeFlixRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SearchUiState(
    /** Texto que se esta escribiendo. */
    val term: String = "",
    /** Ultima busqueda ejecutada. */
    val submitted: String = "",
    val results: List<MetaDto> = emptyList(),
    val history: List<SearchHistoryEntryDto> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

/**
 * Buscador nativo (estilo WuPlay).
 *
 * La busqueda se hace sobre los catalogos agregados en el servidor y se
 * guarda en el historial del perfil, de modo que las busquedas recientes
 * aparecen como chips.
 */
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val repository: VibeFlixRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    init {
        loadHistory()
    }

    fun loadHistory() {
        viewModelScope.launch {
            runCatching { repository.searchHistory() }
                .onSuccess { history -> _state.value = _state.value.copy(history = history) }
        }
    }

    /** Texto que se esta escribiendo (el teclado en pantalla lo llama). */
    fun onTermChange(value: String) {
        _state.value = _state.value.copy(term = value)
    }

    /** Ejecuta la busqueda y la guarda en el historial. */
    fun search(term: String = _state.value.term) {
        val clean = term.trim()
        if (clean.isEmpty()) {
            _state.value = _state.value.copy(results = emptyList(), submitted = "")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null, term = clean)
            try {
                val response = repository.browse(query = clean)
                _state.value = _state.value.copy(
                    loading = false,
                    submitted = clean,
                    results = response.metas,
                )
                runCatching { repository.addSearchHistory(clean) }
                    .onSuccess { history -> _state.value = _state.value.copy(history = history) }
            } catch (error: Throwable) {
                _state.value = _state.value.copy(
                    loading = false,
                    error = error.message ?: "No se pudo buscar",
                )
            }
        }
    }

    /** Vacia el historial de busquedas. */
    fun clearHistory() {
        viewModelScope.launch {
            runCatching { repository.clearSearchHistory() }
                .onSuccess { _state.value = _state.value.copy(history = it) }
        }
    }
}
