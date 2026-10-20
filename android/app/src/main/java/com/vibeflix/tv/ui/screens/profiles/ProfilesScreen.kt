package com.vibeflix.tv.ui.screens.profiles

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.OutlinedTextField
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text

private val languages = listOf(
    "es-419" to "Español latino",
    "es-ES" to "Español de España",
    "en" to "English",
    "pt" to "Português",
    "fr" to "Français",
    "de" to "Deutsch",
    "it" to "Italiano",
    "pl" to "Polski",
    "ja" to "日本語",
    "ko" to "한국어",
    "zh" to "中文",
)

/** Elige perfil (PIN si lo hay), nombre e idioma antes de cargar los streams. */
@Composable
fun ProfilesScreen(
    onEntered: () -> Unit,
    onBack: () -> Unit,
    canGoBack: Boolean,
    viewModel: ProfilesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF06080F))
            .verticalScroll(rememberScrollState())
            .padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Text("VIBE FLIX · PERFILES", style = MaterialTheme.typography.labelMedium, color = Color(0xFF35D6C4))
        Text("¿Quién está viendo?", style = MaterialTheme.typography.headlineMedium)
        Text(
            "El idioma se guarda en tu perfil junto a tus listas y progreso. " +
                "Vibe Flix selecciona automáticamente las fuentes compatibles.",
            style = MaterialTheme.typography.bodyMedium,
        )
        if (state.loading) {
            Text("Cargando perfiles…")
        } else if (state.selected == null && !state.creating) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                items(state.profiles, key = { it.id }) { profile ->
                    Button(onClick = { viewModel.choose(profile) }) {
                        Text("${profile.avatar} ${profile.name}")
                    }
                }
                item { Button(onClick = viewModel::newProfile) { Text("+ Nuevo perfil") } }
            }
            if (canGoBack) Button(onClick = onBack) { Text("Volver") }
        } else {
            Text(
                if (state.creating) "Nuevo perfil" else "Nombre e idioma del perfil",
                style = MaterialTheme.typography.titleLarge,
            )
            OutlinedTextField(
                value = state.name,
                onValueChange = viewModel::setName,
                placeholder = { Text("¿Cómo te llamas?") },
                modifier = Modifier.width(400.dp),
            )
            if (state.selected?.pin?.isNotBlank() == true) {
                OutlinedTextField(
                    value = state.pin,
                    onValueChange = viewModel::setPin,
                    placeholder = { Text("PIN del perfil") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.width(260.dp),
                )
            }
            Text("¿En qué idioma prefieres ver el contenido?", style = MaterialTheme.typography.titleMedium)
            languages.chunked(2).forEach { row ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    row.forEach { (code, label) ->
                        Button(onClick = { viewModel.setLanguage(code) }) {
                            Text(if (state.language == code) "✓ $label" else label)
                        }
                    }
                }
            }
            Text(
                "Hay adaptadores nativos para algunas películas, series, anime y doramas. " +
                    "No se ha verificado su reproducción en vivo; otros idiomas pueden requerir addons.",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { viewModel.enter(onEntered) }, enabled = !state.busy) {
                    Text(if (state.busy) "Guardando…" else "Entrar a Vibe Flix")
                }
                Button(onClick = viewModel::back) { Text("Elegir otro perfil") }
            }
        }
        state.error?.let {
            Text(it, color = Color(0xFFFF6B7D))
            Button(onClick = viewModel::reload) { Text("Reintentar conexión") }
        }
        Spacer(Modifier.height(12.dp))
    }
}
