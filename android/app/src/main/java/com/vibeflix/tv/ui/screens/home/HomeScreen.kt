package com.vibeflix.tv.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.vibeflix.tv.ui.components.PosterRow
import com.vibeflix.tv.ui.components.ServerConfigDialog

@Composable
fun HomeScreen(
    onOpenDetail: (type: String, id: String) -> Unit,
    onOpenProfiles: () -> Unit,
    onOpenAddons: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenGenres: () -> Unit,
    onOpenDecades: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showServerConfig by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
    ) {
        Box(modifier = Modifier.padding(24.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
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
                Button(
                    onClick = { showServerConfig = true },
                    colors = ButtonDefaults.colors(containerColor = Color(0xFF151C2C)),
                ) {
                    Text("⚙ Servidor: ${state.serverUrl.ifBlank { "Configurar" }}")
                }
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
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF281118))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = "⚠️ Error al cargar catálogos",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color(0xFFFF6B7D),
                )
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFFFFA6B0),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = viewModel::refresh) {
                        Text("Reintentar")
                    }
                    Button(
                        onClick = { showServerConfig = true },
                        colors = ButtonDefaults.colors(containerColor = Color(0xFF361E28)),
                    ) {
                        Text("⚙ Configurar Servidor")
                    }
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

        Row(
            modifier = Modifier.padding(24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Button(onClick = onOpenProfiles) { Text("Cambiar perfil e idioma") }
            Button(onClick = onOpenAddons) { Text("Gestionar addons") }
            Button(
                onClick = { showServerConfig = true },
                colors = ButtonDefaults.colors(containerColor = Color(0xFF1E283C)),
            ) {
                Text("⚙ Servidor")
            }
        }
    }

    if (showServerConfig) {
        ServerConfigDialog(
            currentUrl = state.serverUrl,
            onSave = { newUrl ->
                showServerConfig = false
                viewModel.saveServerUrl(newUrl)
            },
            onDismiss = { showServerConfig = false },
            onTestConnection = { testUrl -> viewModel.testConnection(testUrl) },
        )
    }
}
