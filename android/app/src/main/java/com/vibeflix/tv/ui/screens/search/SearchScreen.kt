package com.vibeflix.tv.ui.screens.search

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.vibeflix.tv.ui.components.OnScreenKeyboard
import com.vibeflix.tv.ui.components.PosterRow

/**
 * Pantalla de busqueda con teclado en pantalla.
 *
 * El foco arranca en el teclado (que es lo que se usa en una TV) y los
 * resultados se muestran arriba, como en WuPlay.
 */
@Composable
fun SearchScreen(
    onOpenDetail: (type: String, id: String) -> Unit,
    onBack: () -> Unit,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0B0E14))
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(text = "Buscar", style = MaterialTheme.typography.headlineSmall)
            Button(onClick = onBack) { Text("Volver") }
        }

        if (state.history.isNotEmpty() && state.submitted.isEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "Busquedas recientes",
                    style = MaterialTheme.typography.titleMedium,
                )
                Button(onClick = viewModel::clearHistory) { Text("Limpiar") }
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.history, key = { it.term }) { entry ->
                    Button(onClick = { viewModel.search(entry.term) }) {
                        Text(entry.term)
                    }
                }
            }
        }

        state.error?.let { message ->
            Text(text = message, style = MaterialTheme.typography.bodyMedium)
        }

        if (state.submitted.isNotEmpty()) {
            Text(
                text = "${state.results.size} resultados para \"${state.submitted}\"",
                style = MaterialTheme.typography.titleMedium,
            )
        }

        PosterRow(
            title = if (state.submitted.isEmpty()) "Resultados" else "Resultados de la búsqueda",
            items = state.results,
            onSelect = { meta -> onOpenDetail(meta.type ?: "movie", meta.id) },
        )

        Spacer(Modifier.height(4.dp))

        OnScreenKeyboard(
            value = state.term,
            onChange = viewModel::onTermChange,
            onSubmit = { viewModel.search(it) },
        )
    }
}
