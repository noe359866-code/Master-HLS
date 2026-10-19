package com.masterhls.tv.data.remote

import com.masterhls.tv.data.remote.dto.AddonsResponseDto
import com.masterhls.tv.data.remote.dto.DebridStatusDto
import com.masterhls.tv.data.remote.dto.DebridTestDto
import com.masterhls.tv.data.remote.dto.DevicesResponseDto
import com.masterhls.tv.data.remote.dto.CatalogResponseDto
import com.masterhls.tv.data.remote.dto.ManifestDto
import com.masterhls.tv.data.remote.dto.MasterInfoDto
import com.masterhls.tv.data.remote.dto.MetaResponseDto
import com.masterhls.tv.data.remote.dto.RatingsResponseDto
import com.masterhls.tv.data.remote.dto.StreamResponseDto
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Cliente del addon Stremio local que expone el servidor Master-HLS.
 *
 * Las rutas son las del protocolo Stremio, por lo que la misma app puede
 * apuntar a cualquier addon compatible (incluido el propio Master-HLS).
 */
interface MasterHlsApi {

    @GET("manifest.json")
    suspend fun manifest(): ManifestDto

    @GET("catalog/{type}/{id}.json")
    suspend fun catalog(
        @Path("type") type: String,
        @Path("id") id: String,
        @Query("skip") skip: Int = 0,
        @Query("search") search: String? = null,
        @Query("genre") genre: String? = null,
    ): CatalogResponseDto

    @GET("meta/{type}/{id}.json")
    suspend fun meta(
        @Path("type") type: String,
        @Path("id") id: String,
    ): MetaResponseDto

    @GET("stream/{type}/{id}.json")
    suspend fun streams(
        @Path("type") type: String,
        @Path("id") id: String,
    ): StreamResponseDto

    @GET("api/addons")
    suspend fun addons(): AddonsResponseDto

    @POST("api/addons")
    suspend fun installAddon(@Query("manifestUrl") manifestUrl: String): Map<String, Any>

    @DELETE("api/addons/{id}")
    suspend fun removeAddon(@Path("id") id: String): Map<String, Any>

    @GET("api/person")
    suspend fun person(
        @Query("name") name: String,
        @Query("type") type: String? = null,
    ): PersonResponseDto

    @GET("api/similar")
    suspend fun similar(
        @Query("id") id: String,
        @Query("type") type: String = "movie",
    ): SimilarResponseDto

    @GET("api/debrid")
    suspend fun debridStatus(): DebridStatusDto

    @POST("api/debrid/test")
    suspend fun testDebrid(): DebridTestDto

    @GET("api/ratings")
    suspend fun ratings(): RatingsResponseDto

    @POST("api/ratings")
    suspend fun saveRating(@Body body: Map<String, Any>): RatingsResponseDto

    @GET("api/recommended")
    suspend fun recommended(): SimilarResponseDto

    @GET("api/devices")
    suspend fun devices(): DevicesResponseDto

    @GET("hls/master")
    suspend fun masterInfo(
        @Query("url") url: String,
        @Query("maxHeight") maxHeight: Int? = null,
        @Query("hdr") hdr: Int? = null,
        @Query("audioLang") audioLanguage: String? = null,
        /** Cabeceras HTTP del stream (JSON en base64url). */
        @Query("h") headers: String? = null,
    ): MasterInfoDto
}
