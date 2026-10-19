package com.masterhls.tv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Card
import coil.compose.AsyncImage
import com.masterhls.tv.data.remote.dto.MetaDto

/**
 * Fila de posters con navegacion por D-pad (Compose for TV).
 */
@Composable
fun PosterRow(
    title: String,
    items: List<MetaDto>,
    onSelect: (MetaDto) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(start = 24.dp, top = 16.dp, bottom = 8.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(items, key = { it.id }) { meta ->
                Card(
                    onClick = { onSelect(meta) },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.width(140.dp),
                ) {
                    AsyncImage(
                        model = meta.poster,
                        contentDescription = meta.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(2f / 3f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFF1A2030)),
                    )
                }
            }
        }
    }
}

/** Cartel con titulo (util cuando el poster no identifica la pelicula). */
@Composable
fun PosterCard(meta: MetaDto, onSelect: (MetaDto) -> Unit) {
    Card(onClick = { onSelect(meta) }, shape = RoundedCornerShape(12.dp)) {
        AsyncImage(
            model = meta.poster,
            contentDescription = meta.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(12.dp)),
        )
        Text(
            text = meta.name.orEmpty(),
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(8.dp),
        )
    }
}
