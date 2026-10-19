package com.vibeflix.tv.ui.screens.browse

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.vibeflix.tv.ui.components.PosterRow

/**
 * Pantalla de generos: tarjetas con emoji y color, al estilo del "genre hub"
 * de WuPlay.
 */
@Composable
fun GenresScreen(
    onOpenGenre: (catalog: String, name: String) -> Unit,
    onBack: () -> Unit,
    viewModel: BrowseViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF06080F))
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(text = "Géneros", style = MaterialTheme.typography.headlineSmall)
            Button(onClick = onBack) { Text("Volver") }
        }

        state.error?.let { Text(text = it, style = MaterialTheme.typography.bodyMedium) }

        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 160.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(state.genres, key = { it.id }) { genre ->
                Button(
                    onClick = { onOpenGenre(genre.catalog, genre.name) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(96.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Column(horizontalAlignment = Alignment.Start) {
                        Text(text = genre.emoji, style = MaterialTheme.typography.titleLarge)
                        Text(text = genre.name, style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
        }
    }
}

/** Pantalla de decadas. */
@Composable
fun DecadesScreen(
    onOpenDecade: (id: String, label: String) -> Unit,
    onBack: () -> Unit,
    viewModel: BrowseViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF06080F))
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(text = "Décadas", style = MaterialTheme.typography.headlineSmall)
            Button(onClick = onBack) { Text("Volver") }
        }

        state.error?.let { Text(text = it, style = MaterialTheme.typography.bodyMedium) }

        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 150.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(state.decades, key = { it.id }) { decade ->
                Button(
                    onClick = { onOpenDecade(decade.id, decade.label) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(84.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Column(horizontalAlignment = Alignment.Start) {
                        Text(
                            text = decade.from.toString(),
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Text(text = decade.label, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

/** Ficha de un genero o de una decada: los titulos encontrados. */
@Composable
fun BrowseDetailScreen(
    title: String,
    genre: String? = null,
    decade: String? = null,
    onOpenDetail: (type: String, id: String) -> Unit,
    onBack: () -> Unit,
    viewModel: BrowseViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(genre, decade) {
        if (genre != null) viewModel.loadGenre(genre) else if (decade != null) viewModel.loadDecade(decade)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF06080F))
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(text = title, style = MaterialTheme.typography.headlineSmall)
            Button(onClick = onBack) { Text("Volver") }
        }

        state.error?.let { Text(text = it, style = MaterialTheme.typography.bodyMedium) }

        if (state.metas.isEmpty() && !state.loading) {
            Text(
                text = "No hay títulos en tus catálogos.",
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        PosterRow(
            title = title,
            items = state.metas,
            onSelect = { meta -> onOpenDetail(meta.type ?: "movie", meta.id) },
        )
    }
}
