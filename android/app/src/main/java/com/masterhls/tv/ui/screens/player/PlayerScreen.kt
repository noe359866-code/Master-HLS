package com.masterhls.tv.ui.screens.player

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    type: String,
    id: String,
    url: String,
    streamName: String,
    title: String,
    onBack: () -> Unit,
    viewModel: PlayerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(url) { viewModel.prepare(url) }

    val context = androidx.compose.ui.platform.LocalContext.current
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            val mediaSourceFactory = DefaultMediaSourceFactory(context)
            setMediaSourceFactory(mediaSourceFactory)
        }
    }

    DisposableEffect(Unit) {
        onDispose { player.release() }
    }

    LaunchedEffect(state.playbackUrl) {
        val playbackUrl = state.playbackUrl ?: return@LaunchedEffect
        player.setMediaItem(
            MediaItem.Builder()
                .setUri(playbackUrl)
                .setMimeType(
                    if (playbackUrl.contains(".m3u8")) {
                        MimeTypes.APPLICATION_M3U8
                    } else {
                        MimeTypes.APPLICATION_MEDIA
                    },
                )
                .build(),
        )
        player.prepare()
        player.playWhenReady = true
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        PlayerView(
            player = player,
            modifier = Modifier.fillMaxSize(),
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
        ) {
            Text(text = title.ifBlank { streamName }, style = MaterialTheme.typography.titleMedium)
            if (state.isMaster) {
                Text(
                    text = "Master HLS · ${state.selectedHeight ?: "?"}p · ${state.variants.size} variantes",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF98A2B8),
                )
            }
        }

        if (state.isMaster && state.variants.size > 1) {
            Row(
                modifier = Modifier
                    .align(androidx.compose.ui.Alignment.BottomStart)
                    .padding(24.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                state.variants.forEach { variant ->
                    Button(onClick = { viewModel.selectVariant(variant) }) {
                        Text(variant.height?.let { "${it}p" } ?: variant.name.orEmpty())
                    }
                }
            }
        }

        Button(
            onClick = onBack,
            modifier = Modifier
                .align(androidx.compose.ui.Alignment.TopEnd)
                .padding(24.dp),
        ) {
            Text("Volver")
        }
    }
}
