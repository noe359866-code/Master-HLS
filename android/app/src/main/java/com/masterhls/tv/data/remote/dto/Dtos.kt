package com.masterhls.tv.data.remote.dto

import com.squareup.moshi.Json

/** Manifest del addon Stremio local (Master-HLS). */
data class ManifestDto(
    @Json(name = "id") val id: String = "",
    @Json(name = "name") val name: String = "",
    @Json(name = "version") val version: String = "",
    @Json(name = "description") val description: String? = null,
    @Json(name = "logo") val logo: String? = null,
    @Json(name = "background") val background: String? = null,
    @Json(name = "types") val types: List<String> = emptyList(),
    @Json(name = "idPrefixes") val idPrefixes: List<String> = emptyList(),
    @Json(name = "resources") val resources: List<String> = emptyList(),
    @Json(name = "catalogs") val catalogs: List<CatalogDto> = emptyList(),
)

data class CatalogDto(
    @Json(name = "type") val type: String = "",
    @Json(name = "id") val id: String = "",
    @Json(name = "name") val name: String = "",
    @Json(name = "extraSupported") val extraSupported: List<String>? = null,
    @Json(name = "pageSize") val pageSize: Int? = null,
    @Json(name = "showInHome") val showInHome: Boolean? = null,
)

data class CatalogResponseDto(
    @Json(name = "metas") val metas: List<MetaDto> = emptyList(),
)

data class MetaResponseDto(
    @Json(name = "meta") val meta: MetaDto? = null,
)

data class MetaDto(
    @Json(name = "id") val id: String = "",
    @Json(name = "type") val type: String? = null,
    @Json(name = "name") val name: String? = null,
    @Json(name = "poster") val poster: String? = null,
    @Json(name = "posterShape") val posterShape: String? = null,
    @Json(name = "background") val background: String? = null,
    @Json(name = "landscapePoster") val landscapePoster: String? = null,
    @Json(name = "description") val description: String? = null,
    @Json(name = "releaseInfo") val releaseInfo: String? = null,
    @Json(name = "imdbRating") val imdbRating: String? = null,
    @Json(name = "genres") val genres: List<String>? = null,
    @Json(name = "runtime") val runtime: String? = null,
    @Json(name = "cast") val cast: List<String>? = null,
    @Json(name = "director") val director: List<String>? = null,
    @Json(name = "videos") val videos: List<VideoDto>? = null,
    @Json(name = "behaviorHints") val behaviorHints: Map<String, Any?>? = null,
)

data class VideoDto(
    @Json(name = "id") val id: String = "",
    @Json(name = "title") val title: String? = null,
    @Json(name = "name") val name: String? = null,
    @Json(name = "season") val season: Int? = null,
    @Json(name = "episode") val episode: Int? = null,
    @Json(name = "number") val number: Int? = null,
    @Json(name = "overview") val overview: String? = null,
    @Json(name = "thumbnail") val thumbnail: String? = null,
    @Json(name = "released") val released: String? = null,
)

data class StreamResponseDto(
    @Json(name = "streams") val streams: List<StreamDto> = emptyList(),
)

data class StreamDto(
    @Json(name = "name") val name: String? = null,
    @Json(name = "title") val title: String? = null,
    @Json(name = "description") val description: String? = null,
    @Json(name = "url") val url: String? = null,
    @Json(name = "externalUrl") val externalUrl: String? = null,
    @Json(name = "ytId") val ytId: String? = null,
    @Json(name = "infoHash") val infoHash: String? = null,
    @Json(name = "fileIdx") val fileIdx: Int? = null,
    @Json(name = "subtitles") val subtitles: List<SubtitleDto>? = null,
    @Json(name = "behaviorHints") val behaviorHints: StreamBehaviorHintsDto? = null,
)

data class StreamBehaviorHintsDto(
    @Json(name = "bingeGroup") val bingeGroup: String? = null,
    @Json(name = "filename") val filename: String? = null,
    @Json(name = "videoSize") val videoSize: Long? = null,
    @Json(name = "notWebReady") val notWebReady: Boolean? = null,
    @Json(name = "proxyHeaders") val proxyHeaders: ProxyHeadersDto? = null,
)

data class ProxyHeadersDto(
    @Json(name = "request") val request: Map<String, String>? = null,
    @Json(name = "response") val response: Map<String, String>? = null,
)

data class SubtitleDto(
    @Json(name = "id") val id: String? = null,
    @Json(name = "url") val url: String? = null,
    @Json(name = "lang") val lang: String? = null,
    @Json(name = "headers") val headers: Map<String, String>? = null,
)

/** Addons instalados en el servidor. */
data class AddonsResponseDto(
    @Json(name = "addons") val addons: List<InstalledAddonDto> = emptyList(),
    @Json(name = "catalogs") val catalogs: List<CatalogDto> = emptyList(),
)

data class InstalledAddonDto(
    @Json(name = "id") val id: String = "",
    @Json(name = "name") val name: String = "",
    @Json(name = "version") val version: String = "",
    @Json(name = "manifestUrl") val manifestUrl: String = "",
    @Json(name = "supports") val supports: SupportsDto? = null,
)

data class SupportsDto(
    @Json(name = "catalog") val catalog: Boolean = false,
    @Json(name = "meta") val meta: Boolean = false,
    @Json(name = "stream") val stream: Boolean = false,
    @Json(name = "subtitles") val subtitles: Boolean = false,
)

/** Master playlist HLS analizado por el servidor. */
data class MasterInfoDto(
    @Json(name = "isMaster") val isMaster: Boolean = false,
    @Json(name = "variants") val variants: List<VariantDto> = emptyList(),
    @Json(name = "renditions") val renditions: List<RenditionDto> = emptyList(),
    @Json(name = "selected") val selected: SelectedDto? = null,
    @Json(name = "url") val url: String = "",
)

data class VariantDto(
    @Json(name = "uri") val uri: String = "",
    @Json(name = "width") val width: Int? = null,
    @Json(name = "height") val height: Int? = null,
    @Json(name = "frameRate") val frameRate: Double? = null,
    @Json(name = "bandwidth") val bandwidth: Long? = null,
    @Json(name = "codecs") val codecs: List<String>? = null,
    @Json(name = "videoRange") val videoRange: String? = null,
    @Json(name = "name") val name: String? = null,
)

data class RenditionDto(
    @Json(name = "type") val type: String = "",
    @Json(name = "groupId") val groupId: String = "",
    @Json(name = "name") val name: String = "",
    @Json(name = "language") val language: String? = null,
    @Json(name = "uri") val uri: String? = null,
    @Json(name = "isDefault") val isDefault: Boolean = false,
    @Json(name = "channels") val channels: String? = null,
)

data class SelectedDto(
    @Json(name = "variant") val variant: VariantDto? = null,
    @Json(name = "audio") val audio: RenditionDto? = null,
    @Json(name = "subtitles") val subtitles: RenditionDto? = null,
    @Json(name = "reason") val reason: String = "",
)

/** Ficha de persona con su filmografia. */
data class PersonResponseDto(
    @Json(name = "name") val name: String = "",
    @Json(name = "titles") val titles: List<MetaDto> = emptyList(),
)

/** Titulos similares a un id. */
data class SimilarResponseDto(
    @Json(name = "titles") val titles: List<MetaDto> = emptyList(),
)
