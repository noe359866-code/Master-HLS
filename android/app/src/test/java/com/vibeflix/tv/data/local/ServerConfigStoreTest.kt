package com.vibeflix.tv.data.local

import com.vibeflix.tv.data.remote.ServerUrlInterceptor
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Tests unitarios para la normalización de URLs y reescritura dinámica de
 * peticiones hacia el servidor configurado.
 */
class ServerConfigStoreTest {

    @Test
    fun `normalizeUrl anade http cuando no tiene esquema`() {
        assertEquals("http://192.168.1.50:8181", ServerConfigStore.normalizeUrl("192.168.1.50:8181"))
        assertEquals("http://vibe.local:8181", ServerConfigStore.normalizeUrl("vibe.local:8181"))
    }

    @Test
    fun `normalizeUrl respeta https y elimina barra final`() {
        assertEquals("https://tv.example.com", ServerConfigStore.normalizeUrl("https://tv.example.com/"))
        assertEquals("http://192.168.1.200:8181", ServerConfigStore.normalizeUrl("http://192.168.1.200:8181/"))
    }

    @Test
    fun `normalizeUrl limpia espacios en blanco`() {
        assertEquals("http://192.168.1.10:8181", ServerConfigStore.normalizeUrl("  192.168.1.10:8181  "))
        assertEquals("https://my-server.org", ServerConfigStore.normalizeUrl("  https://my-server.org/  "))
        assertEquals("", ServerConfigStore.normalizeUrl("   "))
        assertEquals("", ServerConfigStore.normalizeUrl(""))
    }

    @Test
    fun `resolveUrl reescribe esquema host y puerto preservando la ruta`() {
        val target = "http://192.168.1.50:8181".toHttpUrl()
        val original = "http://10.0.2.2:8181/api/profiles".toHttpUrl()
        val resolved = ServerUrlInterceptor.resolveUrl(target, original)

        assertEquals("http://192.168.1.50:8181/api/profiles", resolved.toString())
    }

    @Test
    fun `resolveUrl preserva query params y fragmentos`() {
        val target = "https://tv.myhomelab.org:9000".toHttpUrl()
        val original = "http://10.0.2.2:8181/catalog/movie/top.json?search=star%20wars&skip=20#player".toHttpUrl()
        val resolved = ServerUrlInterceptor.resolveUrl(target, original)

        assertEquals("https://tv.myhomelab.org:9000/catalog/movie/top.json?search=star%20wars&skip=20#player", resolved.toString())
        assertEquals("star wars", resolved.queryParameter("search"))
        assertEquals("20", resolved.queryParameter("skip"))
        assertEquals("player", resolved.fragment)
    }

    @Test
    fun `resolveUrl conserva el prefijo de ruta de un servidor tras proxy inverso`() {
        val target = "https://tv.example.com/vibeflix".toHttpUrl()
        val original = "http://10.0.2.2:8181/api/profiles".toHttpUrl()

        assertEquals(
            "https://tv.example.com/vibeflix/api/profiles",
            ServerUrlInterceptor.resolveUrl(target, original).toString(),
        )
    }

    @Test
    fun `resolveUrl funciona con paths complejos como stream y manifest`() {
        val target = "http://192.168.0.100:8181".toHttpUrl()
        val manifestUrl = "http://10.0.2.2:8181/manifest.json".toHttpUrl()
        val streamUrl = "http://10.0.2.2:8181/stream/movie/tt123456.json".toHttpUrl()

        assertEquals("http://192.168.0.100:8181/manifest.json", ServerUrlInterceptor.resolveUrl(target, manifestUrl).toString())
        assertEquals("http://192.168.0.100:8181/stream/movie/tt123456.json", ServerUrlInterceptor.resolveUrl(target, streamUrl).toString())
    }
}
