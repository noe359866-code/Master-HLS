package com.masterhls.tv.data.repository

import com.masterhls.tv.data.remote.MasterHlsApi
import com.masterhls.tv.data.remote.dto.CatalogDto
import com.masterhls.tv.data.remote.dto.CatalogResponseDto
import com.masterhls.tv.data.remote.dto.DebridInfoDto
import com.masterhls.tv.data.remote.dto.DebridTestDto
import com.masterhls.tv.data.remote.dto.DeviceDto
import com.masterhls.tv.data.remote.dto.InstalledAddonDto
import com.masterhls.tv.data.remote.dto.MasterInfoDto
import com.masterhls.tv.data.remote.dto.MetaDto
import com.masterhls.tv.data.remote.dto.RatingDto
import com.masterhls.tv.data.remote.dto.StreamDto
import com.masterhls.tv.util.HeaderCodec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repositorio: unica puerta de entrada a los datos.
 *
 * Toda llamada sale hacia el servidor Master-HLS, que a su vez agrega los
 * addons Stremio instalados. Asi el shell de TV no necesita conocer el
 * protocolo de addons: consume el mismo contrato que usaria Stremio, WuPlay o
 * Nuvio.
 */
@Singleton
class MasterHlsRepository @Inject constructor(
    private val api: MasterHlsApi,
) {

    suspend fun manifest() = withContext(Dispatchers.IO) { api.manifest() }

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
