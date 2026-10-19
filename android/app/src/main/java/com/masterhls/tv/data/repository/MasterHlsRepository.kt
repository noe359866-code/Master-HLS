package com.masterhls.tv.data.repository

import com.masterhls.tv.data.remote.MasterHlsApi
import com.masterhls.tv.data.remote.dto.CatalogDto
import com.masterhls.tv.data.remote.dto.CatalogResponseDto
import com.masterhls.tv.data.remote.dto.InstalledAddonDto
import com.masterhls.tv.data.remote.dto.MasterInfoDto
import com.masterhls.tv.data.remote.dto.MetaDto
import com.masterhls.tv.data.remote.dto.StreamDto
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

    suspend fun masterInfo(url: String, maxHeight: Int?, audioLanguage: String?): MasterInfoDto =
        withContext(Dispatchers.IO) {
            api.masterInfo(url, maxHeight, audioLanguage = audioLanguage)
        }
}
