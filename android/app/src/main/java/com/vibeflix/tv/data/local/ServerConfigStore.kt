package com.vibeflix.tv.data.local

import com.vibeflix.tv.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Gestor dinámico de la URL del servidor Vibe Flix / Master-HLS.
 *
 * Permite que el usuario configure la IP local o URL remota de su servidor
 * desde la pantalla de TV sin recompilar el APK ni depender de 10.0.2.2.
 */
@Singleton
class ServerConfigStore @Inject constructor(
    private val settingsStore: SettingsStore,
) {
    private val scope = CoroutineScope(Dispatchers.IO)

    private val _serverUrl = MutableStateFlow(
        normalizeUrl(BuildConfig.DEFAULT_SERVER_URL)
    )
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _baseHttpUrl = MutableStateFlow<HttpUrl?>(
        _serverUrl.value.toHttpUrlOrNull()
    )
    val baseHttpUrl: StateFlow<HttpUrl?> = _baseHttpUrl.asStateFlow()

    init {
        scope.launch {
            val saved = settingsStore.serverUrl.firstOrNull()
            if (!saved.isNullOrBlank()) {
                val normalized = normalizeUrl(saved)
                _serverUrl.value = normalized
                _baseHttpUrl.value = normalized.toHttpUrlOrNull()
            }
        }
    }

    fun getBaseHttpUrl(): HttpUrl? = _baseHttpUrl.value

    fun getCurrentUrl(): String = _serverUrl.value

    suspend fun setServerUrl(rawUrl: String): Boolean {
        val normalized = normalizeUrl(rawUrl)
        val parsed = normalized.toHttpUrlOrNull() ?: return false
        _serverUrl.value = normalized
        _baseHttpUrl.value = parsed
        settingsStore.setServerUrl(normalized)
        return true
    }

    suspend fun testConnection(rawUrl: String): Result<String> = withContext(Dispatchers.IO) {
        val normalized = normalizeUrl(rawUrl)
        val parsed = normalized.toHttpUrlOrNull()
            ?: return@withContext Result.failure(IllegalArgumentException("URL inválida: $rawUrl"))

        val probeClient = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .build()

        val manifestUrl = parsed.newBuilder()
            .addPathSegment("manifest.json")
            .build()

        try {
            val req = Request.Builder().url(manifestUrl).get().build()
            probeClient.newCall(req).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    if (body.contains("\"name\"") || body.contains("\"id\"")) {
                        Result.success("Conectado con éxito a Vibe Flix")
                    } else {
                        Result.success("Servidor respondió (HTTP ${response.code})")
                    }
                } else {
                    Result.failure(Exception("El servidor respondió con código HTTP ${response.code}"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    companion object {
        fun normalizeUrl(raw: String): String {
            var trimmed = raw.trim()
            if (trimmed.isEmpty()) return ""
            if (!trimmed.startsWith("http://", ignoreCase = true) &&
                !trimmed.startsWith("https://", ignoreCase = true)
            ) {
                trimmed = "http://$trimmed"
            }
            return trimmed.trimEnd('/')
        }
    }
}
