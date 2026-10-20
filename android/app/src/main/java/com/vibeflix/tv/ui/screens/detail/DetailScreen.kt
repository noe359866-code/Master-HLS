package com.vibeflix.tv.ui.screens.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.clickable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.vibeflix.tv.data.remote.dto.OpenSubtitleDto
import com.vibeflix.tv.data.remote.dto.StreamDto
import com.vibeflix.tv.data.remote.dto.VideoDto

@Composable
fun DetailScreen(
    type: String,
    id: String,
    onBack: () -> Unit,
    onPlay: (
        episodeId: String,
        url: String,
        name: String,
        title: String,
        headers: Map<String, String>,
        subtitleUrl: String,
    ) -> Unit,
    viewModel: DetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    var subtitlesOpen by remember { mutableStateOf(false) }

    LaunchedEffect(type, id) { viewModel.load(type, id) }

    val meta = state.meta
    val videos = meta?.videos.orEmpty().filter { it.id.isNotBlank() }
        .sortedWith(compareBy<VideoDto> { it.season ?: 1 }
            .thenBy { it.episode ?: it.number ?: 0 })
    val seasons = videos.map { it.season ?: 1 }.distinct()
    val selectedSeason = videos.firstOrNull { it.id == state.selectedEpisodeId }?.season
        ?: seasons.firstOrNull()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF06080F)),
    ) {
        item {
            Column {
                BoxBackground(meta?.background)

                Row(
                    modifier = Modifier.padding(24.dp),
                    horizontalArrangement = Arrangement.spacedBy(24.dp),
                ) {
                    AsyncImage(
                        model = meta?.poster,
                        contentDescription = meta?.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .width(180.dp)
                            .aspectRatio(2f / 3f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFF151C2C)),
                    )
                    Column(modifier = Modifier.width(560.dp)) {
                        Text(
                            text = meta?.name.orEmpty(),
                            style = MaterialTheme.typography.headlineMedium,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = listOfNotNull(
                                meta?.releaseInfo,
                                meta?.runtime,
                                meta?.imdbRating?.let { "★ $it" },
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = meta?.description.orEmpty(),
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 4,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(20.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(
                                onClick = {
                                    state.streams.firstOrNull()?.let { stream ->
                                        onPlay(
                                            state.selectedEpisodeId ?: id,
                                            stream.url.orEmpty(),
                                            stream.name.orEmpty(),
                                            meta?.name.orEmpty(),
                                            stream.requestHeaders(),
                                            state.selectedSubtitleUrl.orEmpty(),
                                        )
                                    }
                                },
                                enabled = state.streams.isNotEmpty(),
                            ) {
                                Text("▶ Reproducir")
                            }
                            Button(
                                onClick = {
                                    subtitlesOpen = true
                                    viewModel.loadSubtitles(type, state.selectedEpisodeId ?: id)
                                },
                            ) {
                                Text(
                                    if (state.selectedSubtitleName != null) {
                                        "💬 ${state.selectedSubtitleName}"
                                    } else {
                                        "💬 Subtítulos"
                                    },
                                )
                            }
                            Button(onClick = onBack) { Text("Volver") }
                        }
                    }
                }
            }
        }

        if (videos.isNotEmpty()) {
            item {
                Text("Episodios", style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp))
                LazyRow(
                    modifier = Modifier.padding(horizontal = 24.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(seasons) { season ->
                        Button(onClick = {
                            videos.firstOrNull { (it.season ?: 1) == season }?.let {
                                viewModel.selectEpisode(type, it.id)
                            }
                        }) {
                            Text(if (selectedSeason == season) "✓ T$season" else "Temporada $season")
                        }
                    }
                }
            }
            items(videos.filter { (it.season ?: 1) == selectedSeason }, key = { "episode:${it.id}" }) { video ->
                Button(
                    onClick = { viewModel.selectEpisode(type, video.id) },
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 4.dp),
                ) {
                    val number = video.episode ?: video.number ?: 0
                    val title = video.title ?: video.name ?: "Episodio $number"
                    Text("${if (state.selectedEpisodeId == video.id) "✓ " else ""}E$number · $title")
                }
            }
        }

        item {
            val label = when {
                state.loading -> "Cargando título…"
                state.error != null -> state.error
                state.streamsLoading -> "Buscando fuentes de este episodio…"
                state.streams.isEmpty() -> "Sin fuentes disponibles para este título"
                else -> "Fuentes (${state.streams.size})"
            }
            Text(label.orEmpty(), modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp))
        }

        // Todas las etiquetas coinciden ahora con el título: usar la URL y el
        // índice como clave para que Compose no reciba claves duplicadas.
        itemsIndexed(state.streams, key = { index, stream ->
            "stream:${stream.url ?: stream.externalUrl ?: stream.infoHash ?: stream.ytId ?: "otro"}:$index"
        }) { _, stream ->
            StreamRow(
                stream = stream,
                onPlay = {
                    onPlay(
                        state.selectedEpisodeId ?: id,
                        it,
                        stream.name.orEmpty(),
                        meta?.name.orEmpty(),
                        stream.requestHeaders(),
                        state.selectedSubtitleUrl.orEmpty(),
                    )
                },
            )
        }
    }

    if (subtitlesOpen) {
        SubtitlesDialog(
            state = state,
            onSelect = { entry -> viewModel.selectSubtitle(entry) },
            onClear = { viewModel.clearSubtitle() },
            onClose = { subtitlesOpen = false },
        )
    }
}

/**
 * Selector de subtitulos de OpenSubtitles.
 *
 * Es nativo: el servidor consulta la API oficial y sirve el WebVTT ya
 * convertido, de modo que el reproductor solo tiene que cargarlo.
 */
@Composable
private fun SubtitlesDialog(
    state: DetailUiState,
    onSelect: (OpenSubtitleDto) -> Unit,
    onClear: () -> Unit,
    onClose: () -> Unit,
) {
    Dialog(onDismissRequest = onClose) {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .fillMaxWidth(0.8f)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFF111726))
                .padding(24.dp),
        ) {
            Column(modifier = Modifier.padding(8.dp)) {
                Text(
                    text = "Subtitulos (OpenSubtitles)",
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(Modifier.height(8.dp))
                when {
                    !state.subtitlesEnabled -> Text(
                        text = "OpenSubtitles esta desactivado. Añade la API key en los ajustes " +
                            "del servidor para buscar subtitulos de forma nativa.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF98A2B8),
                    )

                    state.subtitlesLoading -> Text(
                        text = "Buscando subtitulos…",
                        style = MaterialTheme.typography.bodyMedium,
                    )

                    state.subtitles.isEmpty() -> Text(
                        text = "No se han encontrado subtitulos para este titulo.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF98A2B8),
                    )

                    else -> Column(
                        modifier = Modifier.height(360.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        androidx.compose.foundation.lazy.LazyColumn {
                            items(state.subtitles, key = { it.fileId }) { entry ->
                                val selected = state.selectedSubtitleUrl != null &&
                                    state.selectedSubtitleName == entry.languageName
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { onSelect(entry) }
                                        .padding(vertical = 8.dp),
                                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = buildString {
                                                append(entry.languageName.ifBlank { entry.language })
                                                if (entry.release.isNotBlank()) {
                                                    append(" · ")
                                                    append(entry.release)
                                                }
                                            },
                                            style = MaterialTheme.typography.bodyLarge,
                                        )
                                        Text(
                                            text = buildString {
                                                if (entry.hearingImpaired) append("Para sordos · ")
                                                append("${entry.downloadCount} descargas")
                                            },
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Color(0xFF98A2B8),
                                        )
                                    }
                                    if (selected) {
                                        Text(
                                            text = "✓",
                                            style = MaterialTheme.typography.titleMedium,
                                            color = Color(0xFF5B8CFF),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (state.selectedSubtitleUrl != null) {
                        Button(onClick = onClear) { Text("Quitar") }
                    }
                    Button(onClick = onClose) { Text("Cerrar") }
                }
            }
        }
    }
}

@Composable
private fun BoxBackground(background: String?) {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(280.dp)
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF16203A),
                        Color(0xFF06080F),
                    ),
                ),
            ),
    ) {
        if (!background.isNullOrBlank()) {
            AsyncImage(
                model = background,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
private fun StreamRow(stream: StreamDto, onPlay: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 6.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = stream.name.orEmpty(), style = MaterialTheme.typography.bodyLarge)
            stream.description?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF98A2B8),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Button(onClick = { stream.url?.let(onPlay) }, enabled = !stream.url.isNullOrBlank()) {
            Text("Reproducir")
        }
    }
}

/**
 * Cabeceras HTTP que el addon pide usar para el stream.
 *
 * El protocolo Stremio las expone en `behaviorHints.proxyHeaders.request` y
 * muchos CDN las exigen (Referer, User-Agent, cookies). El reproductor de
 * Android las replica en sus peticiones.
 */
private fun StreamDto.requestHeaders(): Map<String, String> =
    behaviorHints?.proxyHeaders?.request.orEmpty()
