package com.masterhls.tv.ui.screens.detail

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.masterhls.tv.data.remote.dto.StreamDto

@Composable
fun DetailScreen(
    type: String,
    id: String,
    onBack: () -> Unit,
    onPlay: (url: String, name: String, title: String) -> Unit,
    viewModel: DetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(type, id) { viewModel.load(type, id) }

    val meta = state.meta

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0B0E14)),
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
                            .background(Color(0xFF1A2030)),
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
                                            stream.url.orEmpty(),
                                            stream.name.orEmpty(),
                                            meta?.name.orEmpty(),
                                        )
                                    }
                                },
                                enabled = state.streams.isNotEmpty(),
                            ) {
                                Text("▶ Reproducir")
                            }
                            Button(onClick = onBack) { Text("Volver") }
                        }
                    }
                }
            }
        }

        items(state.streams, key = { it.name ?: it.url.orEmpty() }) { stream ->
            StreamRow(stream = stream, onPlay = { onPlay(it, stream.name.orEmpty(), meta?.name.orEmpty()) })
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
                        Color(0xFF0B0E14),
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
