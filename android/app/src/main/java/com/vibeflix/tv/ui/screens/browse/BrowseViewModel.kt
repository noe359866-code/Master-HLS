package com.vibeflix.tv.ui.screens.browse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vibeflix.tv.data.remote.dto.DecadeDto
import com.vibeflix.tv.data.remote.dto.GenreDto
import com.vibeflix.tv.data.remote.dto.MetaDto
import com.vibeflix.tv.data.repository.VibeFlixRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BrowseUiState(
    val genres: List<GenreDto> = emptyList(),
    val decades: List<DecadeDto> = emptyList(),
    val metas: List<MetaDto> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

/**
 * Pantallas de contenido por genero y por decada (estilo WuPlay).
 *
 * Los generos se piden al servidor, que ya conoce el extra `genre` de los
 * catalogos; las decadas filtran los metadatos por su ano de estreno.
 */
@HiltViewModel
class BrowseViewModel @Inject constructor(
    private val repository: VibeFlixRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(BrowseUiState())
    val state: StateFlow<BrowseUiState> = _state.asStateFlow()

    init {
        loadCatalog()
    }

    /** Carga la lista de generos y decadas. */
    fun loadCatalog() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val response = repository.genres()
                _state.value = _state.value.copy(
                    loading = false,
                    genres = response.genres,
                    decades = response.decades,
                )
            } catch (error: Throwable) {
                _state.value = _state.value.copy(
                    loading = false,
                    error = error.message ?: "No se pudo cargar el catálogo",
                )
            }
        }
    }

    /** Carga el contenido de un genero. */
    fun loadGenre(genre: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val response = repository.browse(genre = genre)
                _state.value = _state.value.copy(loading = false, metas = response.metas)
            } catch (error: Throwable) {
                _state.value = _state.value.copy(
                    loading = false,
                    error = error.message ?: "No se pudo cargar el género",
                )
            }
        }
    }

    /** Carga el contenido de una decada. */
    fun loadDecade(decade: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val response = repository.browse(decade = decade)
                _state.value = _state.value.copy(loading = false, metas = response.metas)
            } catch (error: Throwable) {
                _state.value = _state.value.copy(
                    loading = false,
                    error = error.message ?: "No se pudo cargar la década",
                )
            }
        }
    }
}
