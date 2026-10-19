package com.vibeflix.tv.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vibeflix.tv.data.remote.dto.CatalogDto
import com.vibeflix.tv.data.remote.dto.MetaDto
import com.vibeflix.tv.data.repository.VibeFlixRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val rows: List<CatalogRow> = emptyList(),
)

data class CatalogRow(
    val catalog: CatalogDto,
    val items: List<MetaDto>,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repository: VibeFlixRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val catalogs = repository.manifest().catalogs.filter { it.showInHome != false }

                // Cada catalogo se pide en paralelo: el tiempo de carga es el
                // del addon mas lento, no la suma de todos.
                val rows = catalogs.map { catalog ->
                    async {
                        runCatching { repository.catalog(catalog.type, catalog.id) }
                            .map { CatalogRow(catalog, it) }
                            .getOrElse { CatalogRow(catalog, emptyList()) }
                    }
                }.awaitAll()

                _state.value = HomeUiState(loading = false, rows = rows)
            } catch (error: Throwable) {
                _state.value = HomeUiState(
                    loading = false,
                    error = error.message ?: "No se pudo cargar el catalogo",
                )
            }
        }
    }
}
