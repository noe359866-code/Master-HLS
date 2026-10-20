package com.vibeflix.tv.data.repository

import com.vibeflix.tv.data.remote.VibeFlixApi
import com.vibeflix.tv.data.remote.dto.BrowseResponseDto
import com.vibeflix.tv.data.remote.dto.CatalogDto
import com.vibeflix.tv.data.remote.dto.CatalogResponseDto
import com.vibeflix.tv.data.remote.dto.DebridInfoDto
import com.vibeflix.tv.data.remote.dto.DebridTestDto
import com.vibeflix.tv.data.remote.dto.DeviceDto
import com.vibeflix.tv.data.remote.dto.InstalledAddonDto
import com.vibeflix.tv.data.remote.dto.MasterInfoDto
import com.vibeflix.tv.data.remote.dto.MetaDto
import com.vibeflix.tv.data.remote.dto.OpenSubtitleDownloadDto
import com.vibeflix.tv.data.remote.dto.OpenSubtitlesResponseDto
import com.vibeflix.tv.data.remote.dto.ProfileDto
import com.vibeflix.tv.data.remote.dto.ProfilesResponseDto
import com.vibeflix.tv.data.remote.dto.RatingDto
import com.vibeflix.tv.data.remote.dto.GenresResponseDto
import com.vibeflix.tv.data.remote.dto.SearchHistoryEntryDto
import com.vibeflix.tv.data.remote.dto.ServerSettingsDto
import com.vibeflix.tv.data.remote.dto.SkipIntroResponseDto
import com.vibeflix.tv.data.remote.dto.StreamDto
import com.vibeflix.tv.util.HeaderCodec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repositorio: unica puerta de entrada a los datos.
 *
 * Toda llamada sale hacia el servidor Vibe Flix, que a su vez agrega los
 * addons Stremio instalados. Asi el shell de TV no necesita conocer el
 * protocolo de addons: consume el mismo contrato que usaria Stremio, WuPlay o
 * Nuvio.
 */
@Singleton
class VibeFlixRepository @Inject constructor(
    private val api: VibeFlixApi,
) {

    suspend fun manifest() = withContext(Dispatchers.IO) { api.manifest() }

    suspend fun profiles(): ProfilesResponseDto = withContext(Dispatchers.IO) { api.profiles() }

    suspend fun createProfile(name: String): ProfileDto = withContext(Dispatchers.IO) {
        api.createProfile(mapOf("name" to name)).profile
            ?: error("No se pudo crear el perfil")
    }

    suspend fun activateProfile(id: String, pin: String = "") = withContext(Dispatchers.IO) {
        api.activateProfile(id, if (pin.isBlank()) emptyMap() else mapOf("pin" to pin))
    }

    suspend fun updateProfile(id: String, name: String, language: String): ProfileDto =
        withContext(Dispatchers.IO) {
            api.updateProfile(id, mapOf("name" to name, "contentLanguage" to language)).profile
                ?: error("No se pudo guardar el perfil")
        }

    suspend fun catalog(
        type: String,
        id: String,
        search: String? = null,
        genre: String? = null,
    ): List<MetaDto> = withContext(Dispatchers.IO) {
        api.catalog(type, id, search = search, genre = genre).metas
    }

    suspend fun meta(type: String, id: String): MetaDto? = withContext(Dispatchers.IO) {
        api.meta(type, id).meta
    }

    suspend fun streams(type: String, id: String): List<StreamDto> = withContext(Dispatchers.IO) {
        api.streams(type, id).streams
    }

    suspend fun addons(): List<InstalledAddonDto> = withContext(Dispatchers.IO) {
        api.addons().addons
    }

    suspend fun catalogs(): List<CatalogDto> = withContext(Dispatchers.IO) {
        api.addons().catalogs
    }

    suspend fun installAddon(manifestUrl: String) = withContext(Dispatchers.IO) {
        api.installAddon(manifestUrl)
    }

    suspend fun removeAddon(id: String) = withContext(Dispatchers.IO) {
        api.removeAddon(id)
    }

    suspend fun person(name: String, type: String? = null): List<MetaDto> =
        withContext(Dispatchers.IO) { api.person(name, type).titles }

    suspend fun similar(id: String, type: String): List<MetaDto> =
        withContext(Dispatchers.IO) { api.similar(id, type).titles }

    suspend fun debridStatus(): DebridInfoDto =
        withContext(Dispatchers.IO) { api.debridStatus().debrid ?: DebridInfoDto() }

    suspend fun testDebrid(): DebridTestDto =
        withContext(Dispatchers.IO) { api.testDebrid() }

    suspend fun ratings(): List<RatingDto> =
        withContext(Dispatchers.IO) { api.ratings().ratings }

    suspend fun rate(
        id: String,
        type: String,
        name: String,
        rating: String,
        genres: List<String> = emptyList(),
    ): List<RatingDto> = withContext(Dispatchers.IO) {
        api.saveRating(
            mapOf(
                "id" to id,
                "type" to type,
                "name" to name,
                "rating" to rating,
                "genres" to genres,
            )
        ).ratings
    }

    suspend fun recommended(): List<MetaDto> =
        withContext(Dispatchers.IO) { api.recommended().titles }

    suspend fun devices(): List<DeviceDto> =
        withContext(Dispatchers.IO) { api.devices().devices }

    /** Generos y decadas de las pantallas de contenido. */
    suspend fun genres(): GenresResponseDto = withContext(Dispatchers.IO) { api.genres() }

    /** Contenido por genero, decada o texto. */
    suspend fun browse(
        type: String? = null,
        genre: String? = null,
        decade: String? = null,
        query: String? = null,
    ): BrowseResponseDto = withContext(Dispatchers.IO) {
        api.browse(type = type, genre = genre, decade = decade, query = query)
    }

    /** Historial de busquedas del perfil. */
    suspend fun searchHistory(): List<SearchHistoryEntryDto> =
        withContext(Dispatchers.IO) { api.searchHistory().history }

    /** Anade una busqueda al historial. */
    suspend fun addSearchHistory(term: String): List<SearchHistoryEntryDto> =
        withContext(Dispatchers.IO) {
            api.addSearchHistory(mapOf("term" to term)).history
        }

    /** Vacia el historial de busquedas. */
    suspend fun clearSearchHistory(): List<SearchHistoryEntryDto> =
        withContext(Dispatchers.IO) { api.clearSearchHistory().history }

    /** Ajustes del servidor (OpenSubtitles, omitir intro, debrid…). */
    suspend fun settings(): ServerSettingsDto = withContext(Dispatchers.IO) {
        api.settings().settings ?: ServerSettingsDto()
    }

    /** Guarda (un subconjunto de) los ajustes del servidor. */
    suspend fun saveSettings(patch: Map<String, Any>): ServerSettingsDto =
        withContext(Dispatchers.IO) { api.saveSettings(patch).settings ?: ServerSettingsDto() }

    /**
     * Segmento saltable (intro/recap) que ha detectado el servidor.
     *
     * El analisis es nativo: se hace con los subtitulos del titulo, sin
     * servicios externos de "skip intro".
     */
    suspend fun skipIntro(
        type: String?,
        id: String?,
        imdbId: String?,
        season: Int? = null,
        episode: Int? = null,
        durationMs: Int? = null,
    ): SkipIntroResponseDto = withContext(Dispatchers.IO) {
        api.skipIntro(
            type = type,
            id = id,
            imdbId = imdbId,
            season = season,
            episode = episode,
            duration = durationMs,
        )
    }

    /** Busca subtitulos en OpenSubtitles de forma nativa. */
    suspend fun openSubtitles(
        imdbId: String,
        season: Int? = null,
        episode: Int? = null,
        language: String? = null,
    ): OpenSubtitlesResponseDto = withContext(Dispatchers.IO) {
        api.openSubtitles(
            imdbId = imdbId,
            season = season,
            episode = episode,
            language = language,
        )
    }

    /** Descarga un subtitulo de OpenSubtitles (el servidor lo sirve en WebVTT). */
    suspend fun downloadOpenSubtitle(fileId: Long): OpenSubtitleDownloadDto =
        withContext(Dispatchers.IO) { api.downloadOpenSubtitle(fileId) }

    suspend fun masterInfo(
        url: String,
        maxHeight: Int?,
        audioLanguage: String?,
        supportsHdr: Boolean? = null,
        headers: Map<String, String> = emptyMap(),
    ): MasterInfoDto = withContext(Dispatchers.IO) {
        api.masterInfo(
            url = url,
            maxHeight = maxHeight,
            hdr = when (supportsHdr) {
                true -> 1
                false -> 0
                null -> null
            },
            audioLanguage = audioLanguage,
            headers = HeaderCodec.encode(headers).ifBlank { null },
        )
    }
}
