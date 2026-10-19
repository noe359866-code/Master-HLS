package com.masterhls.tv.ui.screens.addons

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import androidx.tv.material3.TextField
import com.masterhls.tv.data.remote.dto.InstalledAddonDto

@Composable
fun AddonsScreen(
    onBack: () -> Unit,
    viewModel: AddonsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
    ) {
        Text(text = "Addons", style = MaterialTheme.typography.headlineSmall)
        Text(
            text = "Master-HLS agrega todos los addons instalados en el servidor.",
            style = MaterialTheme.typography.bodySmall,
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            TextField(
                value = state.manifestUrl,
                onValueChange = viewModel::onManifestUrlChange,
                placeholder = { Text("https://…/manifest.json") },
                modifier = Modifier.weight(1f),
            )
            Button(onClick = viewModel::install) { Text("Instalar") }
            Button(onClick = viewModel::refresh) { Text("Actualizar") }
            Button(onClick = onBack) { Text("Volver") }
        }

        state.error?.let { message ->
            Text(text = message, style = MaterialTheme.typography.bodySmall)
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.addons, key = { it.id }) { addon ->
                AddonRow(addon = addon, onRemove = { viewModel.remove(addon.id) })
            }
        }
    }
}

@Composable
private fun AddonRow(addon: InstalledAddonDto, onRemove: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = addon.name, style = MaterialTheme.typography.bodyLarge)
            Text(
                text = "v${addon.version} · ${addon.manifestUrl}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Button(onClick = onRemove) { Text("Quitar") }
    }
}
