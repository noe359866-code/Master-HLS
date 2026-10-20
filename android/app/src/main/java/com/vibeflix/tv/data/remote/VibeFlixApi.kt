package com.vibeflix.tv.data.remote

import com.vibeflix.tv.data.remote.dto.AddonsResponseDto
import com.vibeflix.tv.data.remote.dto.DebridStatusDto
import com.vibeflix.tv.data.remote.dto.DebridTestDto
import com.vibeflix.tv.data.remote.dto.DevicesResponseDto
import com.vibeflix.tv.data.remote.dto.CatalogResponseDto
import com.vibeflix.tv.data.remote.dto.ManifestDto
import com.vibeflix.tv.data.remote.dto.MasterInfoDto
import com.vibeflix.tv.data.remote.dto.MetaResponseDto
import com.vibeflix.tv.data.remote.dto.OpenSubtitleDownloadDto
import com.vibeflix.tv.data.remote.dto.OpenSubtitlesResponseDto
import com.vibeflix.tv.data.remote.dto.PersonResponseDto
import com.vibeflix.tv.data.remote.dto.ProfileResponseDto
import com.vibeflix.tv.data.remote.dto.ProfilesResponseDto
import com.vibeflix.tv.data.remote.dto.RatingsResponseDto
import com.vibeflix.tv.data.remote.dto.BrowseResponseDto
import com.vibeflix.tv.data.remote.dto.GenresResponseDto
import com.vibeflix.tv.data.remote.dto.SearchHistoryDto
import com.vibeflix.tv.data.remote.dto.SettingsResponseDto
import com.vibeflix.tv.data.remote.dto.SimilarResponseDto
import com.vibeflix.tv.data.remote.dto.SkipIntroResponseDto
import com.vibeflix.tv.data.remote.dto.StreamResponseDto
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * Cliente del addon Stremio local que expone el servidor Vibe Flix.
 *
 * Las rutas son las del protocolo Stremio, por lo que la misma app puede
 * apuntar a cualquier addon compatible (incluido el propio Vibe Flix).
 */
interface VibeFlixApi {

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

    @GET("api/profiles")
    suspend fun profiles(): ProfilesResponseDto

    @POST("api/profiles")
    suspend fun createProfile(@Body body: Map<String, String>): ProfileResponseDto

    @PUT("api/profiles/{id}")
    suspend fun updateProfile(
        @Path("id") id: String,
        @Body body: Map<String, String>,
    ): ProfileResponseDto

    @POST("api/profiles/{id}/activate")
    suspend fun activateProfile(
        @Path("id") id: String,
        @Body body: Map<String, String>,
    ): Map<String, String>

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

    /** Segmento saltable (intro/recap) detectado por el servidor. */
    /** Ajustes del servidor (compartidos con la web y el addon). */
    /** Generos y decadas de las pantallas de contenido. */
    @GET("api/genres")
    suspend fun genres(): GenresResponseDto

    /** Contenido por genero, decada o texto (el servidor aplica los filtros). */
    @GET("api/browse")
    suspend fun browse(
        @Query("type") type: String? = null,
        @Query("genre") genre: String? = null,
        @Query("decade") decade: String? = null,
        @Query("q") query: String? = null,
    ): BrowseResponseDto

    /** Historial de busquedas del perfil. */
    @GET("api/search-history")
    suspend fun searchHistory(): SearchHistoryDto

    @POST("api/search-history")
    suspend fun addSearchHistory(@Body body: Map<String, Any>): SearchHistoryDto

    @DELETE("api/search-history")
    suspend fun clearSearchHistory(): SearchHistoryDto

    @GET("api/settings")
    suspend fun settings(): SettingsResponseDto

    @PUT("api/settings")
    suspend fun saveSettings(@Body body: Map<String, Any>): SettingsResponseDto

    @GET("api/skip-intro")
    suspend fun skipIntro(
        @Query("type") type: String? = null,
        @Query("id") id: String? = null,
        @Query("imdbId") imdbId: String? = null,
        @Query("season") season: Int? = null,
        @Query("episode") episode: Int? = null,
        @Query("duration") duration: Int? = null,
    ): SkipIntroResponseDto

    /** Busca subtitulos en OpenSubtitles (nativo, sin addon). */
    @GET("api/opensubtitles")
    suspend fun openSubtitles(
        @Query("imdbId") imdbId: String? = null,
        @Query("season") season: Int? = null,
        @Query("episode") episode: Int? = null,
        @Query("lang") language: String? = null,
    ): OpenSubtitlesResponseDto

    /** Descarga un subtitulo y devuelve su URL en WebVTT. */
    @GET("api/opensubtitles/download")
    suspend fun downloadOpenSubtitle(
        @Query("fileId") fileId: Long,
    ): OpenSubtitleDownloadDto

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
