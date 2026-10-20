package com.vibeflix.tv.data.player

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheKeyFactory
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File

/**
 * Cache de reproduccion.
 *
 * Es la pieza que evita los cortes: los segmentos HLS ya descargados se
 * reutilizan en vez de volver a pedirlos al CDN, de modo que la reproduccion
 * aguanta una red debil sin caerse.
 *
 * - `SimpleCache` con `LeastRecentlyUsedCacheEvictor` (512 MB por defecto):
 *   la cache es circular, lo que se reproduce hace tiempo se descarta solo.
 * - `StandaloneDatabaseProvider` guarda el indice en SQLite (artefacto
 *   `media3-database`), de modo que la cache sobrevive a reinicios de la app.
 * - Debe existir **una sola instancia** por directorio, por eso el patron
 *   `object` con inicializacion perezosa y sincronizada.
 */
@androidx.annotation.OptIn(UnstableApi::class)
object PlaybackCache {

    /** Tamano maximo de la cache (bytes). */
    const val MAX_CACHE_BYTES: Long = 512L * 1024 * 1024

    /** Subdirectorio de la cache del sistema. */
    const val DIRECTORY_NAME: String = "playback"

    @Volatile
    private var instance: SimpleCache? = null

    /** Instancia unica de la cache. */
    fun get(context: Context): SimpleCache {
        return instance ?: synchronized(this) {
            instance ?: SimpleCache(
                File(context.applicationContext.cacheDir, DIRECTORY_NAME),
                LeastRecentlyUsedCacheEvictor(MAX_CACHE_BYTES),
                StandaloneDatabaseProvider(context.applicationContext),
            ).also { instance = it }
        }
    }

    /** Libera la cache (tests o cierre de la app). */
    fun release() {
        synchronized(this) {
            instance?.release()
            instance = null
        }
    }
}

/**
 * Claves de cache de Vibe Flix.
 *
 * Delega en [HlsCacheKeys] (logica pura) para que los playlists roten por
 * ventana de tiempo y los segmentos se cacheen de forma inmutable.
 */
@androidx.annotation.OptIn(UnstableApi::class)
class VibeFlixCacheKeyFactory(
    private val playlistTtlMs: Long = HlsCacheKeys.DEFAULT_PLAYLIST_TTL_MS,
) : CacheKeyFactory {

    override fun buildCacheKey(dataSpec: DataSpec): String =
        HlsCacheKeys.buildKey(
            uri = dataSpec.uri.toString(),
            nowMs = System.currentTimeMillis(),
            ttlMs = playlistTtlMs,
        )
}
