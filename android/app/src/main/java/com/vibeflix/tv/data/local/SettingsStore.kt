package com.vibeflix.tv.data.local

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "master_hls_settings")

/**
 * Ajustes locales del dispositivo.
 *
 * `maxHeight` y `supportsHdr` condicionan que variante HLS elige el servidor
 * para este dispositivo (mismo criterio que el cliente web).
 */
@Singleton
class SettingsStore @Inject constructor(
    private val context: Context,
) {

    val maxHeight: Flow<Int> = context.dataStore.data.map { it[MAX_HEIGHT] ?: 1080 }

    val supportsHdr: Flow<Boolean> = context.dataStore.data.map { it[SUPPORTS_HDR] ?: false }

    val audioLanguage: Flow<String> = context.dataStore.data.map { it[AUDIO_LANGUAGE] ?: "es" }

    val serverUrl: Flow<String?> = context.dataStore.data.map { it[SERVER_URL] }

    suspend fun setMaxHeight(value: Int) {
        context.dataStore.edit { it[MAX_HEIGHT] = value }
    }

    suspend fun setSupportsHdr(value: Boolean) {
        context.dataStore.edit { it[SUPPORTS_HDR] = value }
    }

    suspend fun setAudioLanguage(value: String) {
        context.dataStore.edit { it[AUDIO_LANGUAGE] = value }
    }

    suspend fun setServerUrl(value: String?) {
        context.dataStore.edit { preferences ->
            if (value.isNullOrBlank()) preferences.remove(SERVER_URL) else preferences[SERVER_URL] = value
        }
    }

    private companion object {
        val MAX_HEIGHT = intPreferencesKey("max_height")
        val SUPPORTS_HDR = booleanPreferencesKey("supports_hdr")
        val AUDIO_LANGUAGE = stringPreferencesKey("audio_language")
        val SERVER_URL = stringPreferencesKey("server_url")
    }
}
