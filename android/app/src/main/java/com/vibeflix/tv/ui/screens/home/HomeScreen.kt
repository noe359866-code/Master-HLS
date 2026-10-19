package com.vibeflix.tv.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.vibeflix.tv.ui.components.PosterRow

@Composable
fun HomeScreen(
    onOpenDetail: (type: String, id: String) -> Unit,
    onOpenAddons: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenGenres: () -> Unit,
    onOpenDecades: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
    ) {
        Box(modifier = Modifier.padding(24.dp)) {
            Column {
                Text(
                    text = "Vibe Flix",
                    style = MaterialTheme.typography.headlineMedium,
                )
                Text(
                    text = "Tu biblioteca Stremio, agregada",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        if (state.loading) {
            Text(
                text = "Cargando catalogos…",
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.padding(24.dp),
            )
        }

        state.error?.let { message ->
            Column(modifier = Modifier.padding(24.dp)) {
                Text(text = message, style = MaterialTheme.typography.bodyLarge)
                Button(onClick = viewModel::refresh, modifier = Modifier.padding(top = 12.dp)) {
                    Text("Reintentar")
                }
            }
        }

        state.rows.forEach { row ->
            PosterRow(
                title = row.catalog.name,
                items = row.items,
                onSelect = { meta ->
                    onOpenDetail(meta.type ?: row.catalog.type, meta.id)
                },
            )
        }

        Row(
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.visibleSections.contains("search")) {
                Button(onClick = onOpenSearch) { Text("Buscar") }
            }
            if (state.visibleSections.contains("genres")) {
                Button(onClick = onOpenGenres) { Text("Géneros") }
            }
            if (state.visibleSections.contains("decades")) {
                Button(onClick = onOpenDecades) { Text("Décadas") }
            }
        }

        Button(
            onClick = onOpenAddons,
            modifier = Modifier.padding(24.dp),
        ) {
            Text("Gestionar addons")
        }
    }
}
