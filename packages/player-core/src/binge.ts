/**
 * Continuidad de reproduccion: `behaviorHints.bingeGroup` del protocolo Stremio.
 *
 * El SDK de addons define `bingeGroup` asi: si dos streams (por ejemplo el
 * episodio 1 y el 2 de la misma serie) declaran el mismo `bingeGroup`, el
 * cliente debe elegir **implicitamente** ese stream al encadenar episodios.
 * Es la pieza que hace que el autoplay no baje de calidad ni cambie de
 * servidor a mitad de una temporada.
 *
 * Referencia: stremio-addon-sdk → docs/api/responses/stream.md.
 */

/** Stream tal y como llega del servidor (subconjunto del objeto Stremio). */
export interface StreamLike {
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  ytId?: string;
  externalUrl?: string;
  infoHash?: string;
  behaviorHints?: {
    bingeGroup?: string;
    filename?: string;
    videoSize?: number;
    notWebReady?: boolean;
  };
}

const HEIGHT_PATTERNS: Array<[RegExp, number]> = [
  [/\b(2160p|4k|uhd)\b/i, 2160],
  [/\b1440p\b/i, 1440],
  [/\b(1080p|1080i|fullhd|fhd)\b/i, 1080],
  [/\b720p\b/i, 720],
  [/\b(576p|540p)\b/i, 540],
  [/\b(480p|sd)\b/i, 480],
  [/\b360p\b/i, 360],
];

/** Altura declarada en el nombre/descripcion del stream (0 si no aparece). */
export function streamHeight(stream: StreamLike): number {
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename]
    .filter(Boolean)
    .join(' ');
  for (const [pattern, height] of HEIGHT_PATTERNS) {
    if (pattern.test(text)) return height;
  }
  return 0;
}

/** `bingeGroup` declarado por el addon (normalizado a minusculas). */
export function bingeGroupOf(stream?: StreamLike | null): string {
  return (stream?.behaviorHints?.bingeGroup ?? '').trim().toLowerCase();
}

/** true si el stream se puede reproducir en un navegador (tiene URL directa). */
export function isPlayableInBrowser(stream: StreamLike): boolean {
  if (!stream.url) return false;
  // El protocolo exige `notWebReady: true` cuando la URL no es web-ready
  // (http plano sin CORS, MKV, cabeceras obligatorias...). Vibe Flix resuelve
  // esas cabeceras con su proxy HLS, asi que se aceptan igualmente.
  return /^https?:\/\//i.test(stream.url);
}

/**
 * Elige el stream que debe sonar al encadenar el siguiente episodio.
 *
 * Orden de preferencia:
 *  1. mismo `bingeGroup` que el stream actual (lo que pide el protocolo),
 *  2. misma altura declarada (misma calidad percibida),
 *  3. el mejor reproducible en navegador,
 *  4. el primero de la lista (el servidor ya los ordena por calidad).
 */
export function pickBingeStream(
  streams: StreamLike[],
  current?: StreamLike | null,
  options: { maxHeight?: number } = {},
): StreamLike | undefined {
  const playable = streams.filter((stream) => isPlayableInBrowser(stream));
  const pool = playable.length ? playable : streams;
  if (!pool.length) return undefined;

  const ceiling = options.maxHeight ?? Infinity;
  const allowed = pool.filter((stream) => {
    const height = streamHeight(stream);
    return !height || height <= ceiling;
  });
  const candidates = allowed.length ? allowed : pool;

  const group = bingeGroupOf(current);
  if (group) {
    const same = candidates.find((stream) => bingeGroupOf(stream) === group);
    if (same) return same;
  }

  const height = current ? streamHeight(current) : 0;
  if (height) {
    const similar = candidates.find((stream) => streamHeight(stream) === height);
    if (similar) return similar;
  }

  return candidates[0];
}

/**
 * Ordena streams por calidad percibida sin depender del orden del addon
 * (util cuando el cliente pide los streams de un episodio en frio).
 */
export function rankStreams(streams: StreamLike[], options: { maxHeight?: number } = {}): StreamLike[] {
  const ceiling = options.maxHeight ?? Infinity;
  return [...streams].sort((a, b) => {
    // 1. Lo que se puede reproducir en el navegador va primero: un torrent en
    //    4K no sirve de nada en la web.
    const playA = isPlayableInBrowser(a) ? 0 : 1;
    const playB = isPlayableInBrowser(b) ? 0 : 1;
    if (playA !== playB) return playA - playB;
    // 2. Lo que excede el techo del dispositivo, detras.
    const heightA = streamHeight(a);
    const heightB = streamHeight(b);
    const overA = heightA > ceiling ? 1 : 0;
    const overB = heightB > ceiling ? 1 : 0;
    if (overA !== overB) return overA - overB;
    // 3. Mejor calidad primero.
    return heightB - heightA;
  });
}
