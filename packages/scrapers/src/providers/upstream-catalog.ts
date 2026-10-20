/**
 * Inventario de la carpeta `providers/` de StreamFlix Reborn, no un registro de
 * fuentes reproducibles de Vibe Flix. Corte: main@f4aca8672cee225543324b14879c8600da200ea1
 * (19 oct 2026). `Provider.kt` es la fuente de verdad para `registered` y los
 * flags movies/tvShows; cada archivo aporta `language` y especialización.
 *
 * El idioma es el del catálogo/instancia upstream, NO una garantía de audio.
 * Incluso los IptvProvider usan tvShows=true en Kotlin: aquí son LIVE, nunca
 * se envían como episodios VOD. Los archivos no registrados son referencias.
 * https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers
 */

export const STREAMFLIX_UPSTREAM_COMMIT = 'f4aca8672cee225543324b14879c8600da200ea1';
export const STREAMFLIX_PROVIDERS_URL =
  'https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/providers';

export type UpstreamMedia = 'movie' | 'series' | 'anime' | 'dorama' | 'live';
export type UpstreamState = 'registered-vod' | 'registered-iptv' | 'unregistered';

export interface UpstreamProvider {
  /** Nombre del archivo Kotlin (sin Provider.kt); una fila por archivo. */
  file: string;
  /** Etiquetas de catálogo: `es-MX` etc. indican región de la instancia. */
  languages: string[];
  /** Categorías según el registro y la implementación upstream. */
  media: UpstreamMedia[];
  state: UpstreamState;
  /** ID de un port REAL en Vibe Flix, ausente para referencias sin adaptador. */
  nativeId?: string;
  upstreamUrl: string;
}

type Row = readonly [file: string, languages: string, media: string];

// Cada `m` / `s` proviene de ProviderSupport en Provider.kt. `a` / `d`
// describen especializaciones de anime/dorama, no idiomas del audio.
const vod: Row[] = [
  // Español
  ['Fanpelis', 'es', 'ms'], ['PoseidonHD2', 'es', 'ms'],
  ['CuevanaEu', 'es', 'ms'], ['Latanime', 'es', 'msa'],
  ['Doramasflix', 'es', 'msd'], ['CineCalidad', 'es', 'ms'],
  ['SeriesFlix', 'es', 's'], ['SeriesTurcas', 'es', 's'],
  ['FlixLatam', 'es', 'ms'], ['LaCartoons', 'es', 's'],
  ['Animefenix', 'es', 'sa'], ['AnimeFlv', 'es', 'sa'],
  ['JKAnime', 'es', 'msa'], ['TioAnime', 'es', 'msa'],
  ['AnimeAv1', 'es', 'sa'], ['AnimeOnlineNinja', 'es', 'msa'],
  ['SoloLatino', 'es', 'ms'], ['Cine24h', 'es', 'ms'],
  ['Pelisplusto', 'es', 'ms'], ['PelisflixHd', 'es', 'ms'],
  ['CineHax', 'es', 'ms'],
  // Inglés (StreamingCommunity tiene dos instancias registradas)
  ['Sflix', 'en', 'ms'], ['StreamingCommunity', 'it,en', 'ms'],
  ['Mkissa', 'en', 'msa'], ['Ridomovies', 'en', 'ms'],
  ['Anikoto', 'en', 'msa'], ['NetPrime', 'en', 'ms'],
  // Alemán
  ['SerienStream', 'de', 's'], ['AniWorld', 'de', 'sa'],
  ['MStream', 'de', 'ms'], ['FilmPalast', 'de', 'ms'],
  ['Einschalten', 'de', 'm'], ['KellerKino', 'de', 'm'],
  ['KinoGer', 'de', 'ms'], ['HDFilme', 'de', 'ms'],
  ['MEGAKino', 'de', 'ms'],
  // Francés
  ['Wiflix', 'fr', 'ms'], ['FrenchAnime', 'fr', 'msa'],
  ['FrenchStream', 'fr', 'ms'], ['Frembed', 'fr', 'ms'],
  ['Kidraz', 'fr', 'm'], ['FrenchManga', 'fr', 'sa'],
  // Italiano (la instancia it de StreamingCommunity está arriba)
  ['AnimeWorld', 'it', 'msa'], ['Altadefinizione01', 'it', 'ms'],
  ['GuardaFlix', 'it', 'm'], ['CB01', 'it', 'ms'],
  ['AnimeUnity', 'it', 'msa'], ['AnimeSaturn', 'it', 'sa'],
  ['GuardaSerie', 'it', 'ms'],
  // Polaco
  ['FilmyOnlineCc', 'pl', 'ms'], ['Zaluknij', 'pl', 'ms'],
];

// Provider.kt anuncia tvShows=true para estos canales, pero todos emiten
// televisión EN VIVO (IptvProvider); no sirven la temporada/episodio solicitado.
const iptv: Row[] = [
  ['CableVisionHD', 'es', 'l'], ['TvporinternetHD', 'es', 'l'],
  ['IptvOrg', 'en', 'l'], ['IptvSpain', 'es', 'l'],
  ['TvLibrefutbol', 'es', 'l'], ['PelotaLibreTvHd', 'es', 'l'],
  ['PlutoTvMx', 'es-MX', 'l'], ['PlutoTvAr', 'es-AR', 'l'],
  ['PlutoTvDe', 'de', 'l'], ['PlutoTvEs', 'es-ES', 'l'],
  ['PlutoTvFr', 'fr', 'l'], ['PlutoTvIt', 'it', 'l'],
  ['PlutoTvUs', 'en-US', 'l'], ['CineCity', 'es', 'l'],
  ['Vavoo', 'de,it,fr,es,pl,en', 'l'],
];

// Existen como archivos pero NO figuran en Provider.kt. TmdbProvider se
// instancia como ayudante por otros proveedores; no es una fuente activa allí.
const unregistered: Row[] = [
  ['AfterDark', 'fr', 'ms'], ['AnimeBum', 'es', 'msa'],
  ['AnyMovie', 'en', 'ms'], ['HiAnime', 'en', 'msa'],
  ['Otakufr', 'fr', 'sa'], ['StreamingIta', 'it', 'ms'],
  ['SuperStream', 'en', 'ms'], ['UnJourUnFilm', 'fr', 'ms'],
  ['Tmdb', 'multi', 'ms'], ['VavooVod', 'de,it,fr,es,pl,en', 'ms'],
];

const media: Record<string, UpstreamMedia> = {
  m: 'movie', s: 'series', a: 'anime', d: 'dorama', l: 'live',
};
const nativeIds: Record<string, string> = {
  CineHax: 'cinehax', Fanpelis: 'fanpelis', Doramasflix: 'doramasflix',
  TioAnime: 'tioanime', Frembed: 'frembed', Ridomovies: 'ridomovies',
  MStream: 'mstream', GuardaFlix: 'guardaflix', Zaluknij: 'zaluknij',
};

function entries(rows: Row[], state: UpstreamState): UpstreamProvider[] {
  return rows.map(([file, languages, codes]) => ({
    file: `${file}Provider.kt`,
    languages: languages.split(','),
    media: [...codes].map((code) => media[code]!),
    state,
    ...(state === 'registered-vod' && nativeIds[file] ? { nativeId: nativeIds[file] } : {}),
    upstreamUrl: `${STREAMFLIX_PROVIDERS_URL}/${file}Provider.kt`,
  }));
}

export const STREAMFLIX_PROVIDER_CATALOG: ReadonlyArray<UpstreamProvider> = [
  ...entries(vod, 'registered-vod'),
  ...entries(iptv, 'registered-iptv'),
  ...entries(unregistered, 'unregistered'),
];
