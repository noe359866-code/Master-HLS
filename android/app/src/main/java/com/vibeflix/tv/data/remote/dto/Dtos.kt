package com.vibeflix.tv.data.remote.dto

import com.squareup.moshi.Json

/** Manifest del addon Stremio local (Vibe Flix). */
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

/** Estado del proveedor de debrid configurado en el servidor. */
data class DebridStatusDto(
    @Json(name = "debrid") val debrid: DebridInfoDto? = null,
)

data class DebridInfoDto(
    @Json(name = "enabled") val enabled: Boolean = false,
    @Json(name = "provider") val provider: String? = null,
    @Json(name = "name") val name: String? = null,
    @Json(name = "tag") val tag: String? = null,
    @Json(name = "hosters") val hosters: List<String> = emptyList(),
    @Json(name = "lastError") val lastError: String? = null,
)

data class DebridTestDto(
    @Json(name = "ok") val ok: Boolean = false,
    @Json(name = "message") val message: String = "",
)

/** Valoracion de un titulo ("Me gusta" / "No para mi"). */
data class RatingDto(
    @Json(name = "id") val id: String = "",
    @Json(name = "type") val type: String = "movie",
    @Json(name = "name") val name: String = "",
    @Json(name = "rating") val rating: String = "like",
    @Json(name = "genres") val genres: List<String> = emptyList(),
)

data class RatingsResponseDto(
    @Json(name = "ratings") val ratings: List<RatingDto> = emptyList(),
)

/** Dispositivos vinculados (sincronizacion multi-dispositivo). */
data class DeviceDto(
    @Json(name = "id") val id: String = "",
    @Json(name = "name") val name: String = "",
    @Json(name = "current") val current: Boolean = false,
    @Json(name = "lastSeenAt") val lastSeenAt: Long = 0,
)

data class DevicesResponseDto(
    @Json(name = "pairingRequired") val pairingRequired: Boolean = false,
    @Json(name = "devices") val devices: List<DeviceDto> = emptyList(),
)

/**
 * Segmento saltable (intro o recap) detectado por el servidor.
 *
 * El servidor analiza los subtitulos del titulo y dice hasta donde llega la
 * intro, para que el reproductor ofrezca el boton de "saltar intro".
 */
data class SkipSegmentDto(
    @Json(name = "startMs") val startMs: Long = 0L,
    @Json(name = "endMs") val endMs: Long = 0L,
    @Json(name = "kind") val kind: String = "intro",
    @Json(name = "confidence") val confidence: Double = 0.0,
    @Json(name = "source") val source: String = "fallback",
)

data class SkipIntroResponseDto(
    /** false si el usuario desactivo la funcion en los ajustes del servidor. */
    @Json(name = "enabled") val enabled: Boolean = true,
    @Json(name = "segment") val segment: SkipSegmentDto? = null,
    @Json(name = "source") val source: String = "fallback",
    @Json(name = "cues") val cues: Int = 0,
)

/** Subtitulo disponible en OpenSubtitles. */
data class OpenSubtitleDto(
    @Json(name = "fileId") val fileId: Long = 0L,
    @Json(name = "fileName") val fileName: String = "",
    @Json(name = "language") val language: String = "und",
    @Json(name = "languageName") val languageName: String = "",
    @Json(name = "downloadCount") val downloadCount: Int = 0,
    @Json(name = "hearingImpaired") val hearingImpaired: Boolean = false,
    @Json(name = "title") val title: String = "",
    @Json(name = "release") val release: String = "",
)

data class OpenSubtitlesResponseDto(
    @Json(name = "enabled") val enabled: Boolean = false,
    @Json(name = "subtitles") val subtitles: List<OpenSubtitleDto> = emptyList(),
)

data class OpenSubtitleDownloadDto(
    @Json(name = "url") val url: String = "",
    @Json(name = "path") val path: String = "",
    @Json(name = "cues") val cues: Int = 0,
    @Json(name = "format") val format: String = "vtt",
)

/** Ajustes del servidor (los comparte la web, la TV y el addon). */
data class ServerSettingsDto(
    @Json(name = "language") val language: String = "es",
    @Json(name = "opensubtitles") val opensubtitles: OpenSubtitlesSettingsDto? = null,
    @Json(name = "skipIntro") val skipIntro: SkipIntroSettingsDto? = null,
    /** Menu de navegacion personalizado (WuPlay: "manage sidebar items"). */
    @Json(name = "sidebar") val sidebar: List<SidebarItemDto>? = null,
    /** Scrapers nativos (addon de streams del servidor). */
    @Json(name = "scrapers") val scrapers: ScraperSettingsDto? = null,
)

/** Elemento del menu de navegacion (id, visible y orden). */
data class SidebarItemDto(
    @Json(name = "id") val id: String = "",
    @Json(name = "hidden") val hidden: Boolean = false,
    @Json(name = "order") val order: Int = 0,
)

data class OpenSubtitlesSettingsDto(
    @Json(name = "apiKey") val apiKey: String = "",
)

data class SkipIntroSettingsDto(
    @Json(name = "enabled") val enabled: Boolean = true,
    @Json(name = "offsetSeconds") val offsetSeconds: Int = 90,
)

/** Scrapers nativos: addon de streams resuelto en el servidor. */
data class ScraperSettingsDto(
    @Json(name = "enabled") val enabled: Boolean = true,
    @Json(name = "providers") val providers: List<String>? = null,
)

data class SettingsResponseDto(
    @Json(name = "settings") val settings: ServerSettingsDto? = null,
)

/** Genero de la pantalla de generos (estilo WuPlay). */
data class GenreDto(
    @Json(name = "id") val id: String = "",
    @Json(name = "name") val name: String = "",
    /** Valor canonico que entiende el extra `genre` de los addons. */
    @Json(name = "catalog") val catalog: String = "",
    @Json(name = "emoji") val emoji: String = "",
    @Json(name = "color") val color: String = "#5b8cff",
)

/** Decada de la pantalla de decadas. */
data class DecadeDto(
    @Json(name = "id") val id: String = "",
    @Json(name = "label") val label: String = "",
    @Json(name = "from") val from: Int = 0,
    @Json(name = "to") val to: Int = 0,
)

data class GenresResponseDto(
    @Json(name = "genres") val genres: List<GenreDto> = emptyList(),
    @Json(name = "decades") val decades: List<DecadeDto> = emptyList(),
)

/** Respuesta de la pantalla de contenido (por genero, decada o texto). */
data class BrowseResponseDto(
    @Json(name = "metas") val metas: List<MetaDto> = emptyList(),
    @Json(name = "source") val source: String = "",
    @Json(name = "total") val total: Int = 0,
)

/** Entrada del historial de busquedas. */
data class SearchHistoryEntryDto(
    @Json(name = "term") val term: String = "",
    @Json(name = "at") val at: Long = 0L,
)

data class SearchHistoryDto(
    @Json(name = "history") val history: List<SearchHistoryEntryDto> = emptyList(),
)
