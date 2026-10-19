package com.vibeflix.tv.data.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests de la logica de claves de cache.
 *
 * Son funciones puras (sin Android), asi que se ejecutan en la JVM con
 * `./gradlew :app:testDebugUnitTest`.
 */
class HlsCacheKeysTest {

    @Test
    fun `detecta playlists por extension`() {
        assertTrue(HlsCacheKeys.isPlaylist("https://cdn.example.com/master.m3u8"))
        assertTrue(HlsCacheKeys.isPlaylist("https://cdn.example.com/master.M3U8"))
        assertTrue(HlsCacheKeys.isPlaylist("https://cdn.example.com/live.m3u"))
    }

    @Test
    fun `no confunde segmentos con playlists`() {
        assertFalse(HlsCacheKeys.isPlaylist("https://cdn.example.com/segment0.ts"))
        assertFalse(HlsCacheKeys.isPlaylist("https://cdn.example.com/video.mp4"))
        assertFalse(HlsCacheKeys.isPlaylist("https://cdn.example.com/key.bin"))
    }

    @Test
    fun `ignora query y fragmento al detectar el tipo`() {
        assertTrue(HlsCacheKeys.isPlaylist("https://cdn.example.com/master.m3u8?token=abc"))
        assertTrue(HlsCacheKeys.isPlaylist("https://cdn.example.com/master.m3u8#fragment"))
        assertFalse(HlsCacheKeys.isPlaylist("https://cdn.example.com/segment0.ts?token=abc"))
    }

    @Test
    fun `los segmentos se cachean de forma inmutable`() {
        val url = "https://cdn.example.com/segment0.ts"
        val early = HlsCacheKeys.buildKey(url, nowMs = 1_000L)
        val late = HlsCacheKeys.buildKey(url, nowMs = 9_999_999L)
        assertEquals(url, early)
        assertEquals(early, late)
    }

    @Test
    fun `los playlists rotan por ventana temporal`() {
        val url = "https://cdn.example.com/master.m3u8"
        val ttl = 60_000L
        val first = HlsCacheKeys.buildKey(url, nowMs = 0L, ttlMs = ttl)
        val sameWindow = HlsCacheKeys.buildKey(url, nowMs = 59_999L, ttlMs = ttl)
        val nextWindow = HlsCacheKeys.buildKey(url, nowMs = 60_000L, ttlMs = ttl)

        assertEquals(first, sameWindow)
        assertNotEquals(first, nextWindow)
        assertTrue(first.startsWith(url))
    }

    @Test
    fun `la ventana temporal respeta el ttl configurado`() {
        val ttl = 10_000L
        assertEquals(
            HlsCacheKeys.playlistBucket(0L, ttlMs = ttl),
            HlsCacheKeys.playlistBucket(9_999L, ttlMs = ttl),
        )
        assertNotEquals(
            HlsCacheKeys.playlistBucket(0L, ttlMs = ttl),
            HlsCacheKeys.playlistBucket(10_000L, ttlMs = ttl),
        )
    }

    @Test
    fun `un ttl de cero desactiva la ventana temporal`() {
        assertEquals(0L, HlsCacheKeys.playlistBucket(123_456L, ttlMs = 0L))
        val url = "https://cdn.example.com/master.m3u8"
        assertEquals(
            HlsCacheKeys.buildKey(url, nowMs = 0L, ttlMs = 0L),
            HlsCacheKeys.buildKey(url, nowMs = 999_999L, ttlMs = 0L),
        )
    }
}
