package com.vibeflix.tv.data.player

/**
 * Claves de la cache de reproduccion.
 *
 * Logica pura (sin dependencias de Android) para poder testearla en la JVM:
 * `HlsCacheKeysTest` cubre la rotacion de playlists y la inmutabilidad de los
 * segmentos.
 *
 * Regla:
 *  - Los segmentos, claves AES e init segments son inmutables: se cachean por
 *    URI y se reutilizan (es lo que evita los cortes al hacer buffering).
 *  - Los playlists (master y media) **no** son inmutables: si se cachearan
 *    para siempre, un stream en directo se quedaria congelado en el primer
 *    manifiesto descargado. Por eso su clave incluye una ventana temporal:
 *    dentro de la misma ventana se reutiliza (rapido) y al pasar la ventana se
 *    vuelve a pedir al origen.
 */
object HlsCacheKeys {

    /** Ventana de validez de la cache de playlists (ms). */
    const val DEFAULT_PLAYLIST_TTL_MS: Long = 60_000L

    /** true si la URI apunta a un playlist HLS. */
    fun isPlaylist(uri: String): Boolean {
        val path = uri.substringBefore('?').substringBefore('#')
        return path.endsWith(".m3u8", ignoreCase = true) ||
            path.endsWith(".m3u", ignoreCase = true)
    }

    /** Ventana temporal (bucket) en la que se cachea un playlist. */
    fun playlistBucket(nowMs: Long, ttlMs: Long = DEFAULT_PLAYLIST_TTL_MS): Long {
        if (ttlMs <= 0L) return 0L
        return nowMs / ttlMs
    }

    /**
     * Clave de cache de un recurso.
     *
     * - Segmentos y claves: la propia URI (inmutable).
     * - Playlists: URI + ventana temporal.
     */
    fun buildKey(
        uri: String,
        nowMs: Long,
        ttlMs: Long = DEFAULT_PLAYLIST_TTL_MS,
    ): String {
        if (!isPlaylist(uri)) return uri
        return "$uri#playlist=${playlistBucket(nowMs, ttlMs)}"
    }
}
