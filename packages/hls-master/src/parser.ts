/**
 * Parser de playlists HLS.
 *
 * Cubre lo que necesita un cliente Stremio de TV:
 *  - Playlist *master* (multivariant) con sus variantes y sus pistas
 *    (AUDIO / SUBTITLES / VIDEO / CLOSED-CAPTIONS).
 *  - Playlist *media* (univariant) para saber si hay que escalar o no.
 *  - Tags de media: RESOLUTION, BANDWIDTH, AVERAGE-BANDWIDTH, CODECS,
 *    FRAME-RATE, VIDEO-RANGE, AUDIO, SUBTITLES, NAME, DEFAULT, AUTOSELECT.
 *  - `#EXT-X-IMAGE-STREAM-INF`: las hojas de sprites que algunos debrid y CDN
 *    sirven para previsualizar el salto (WuPlay las usa en la barra de
 *    progreso). No se pueden ignorar sin mas: sin ellas el cliente no sabe que
 *    existen las miniaturas.
 */

export type RenditionType = 'AUDIO' | 'SUBTITLES' | 'VIDEO' | 'CLOSED-CAPTIONS';

export interface Variant {
  /** URI absoluta de la variante. */
  uri: string;
  /** Ancho en pixeles, si el playlist lo declara. */
  width?: number;
  /** Alto en pixeles, si el playlist lo declara. */
  height?: number;
  /** Tasa de cuadros. */
  frameRate?: number;
  /** Bitrate maximo declarado (bps). */
  bandwidth?: number;
  /** Bitrate medio declarado (bps). */
  averageBandwidth?: number;
  /** Codecs declarados (p.ej. ["avc1.640028", "mp4a.40.2"]). */
  codecs?: string[];
  /** Grupo de audio (renditions) al que pertenece la variante. */
  audioGroup?: string;
  /** Grupo de subtitulos. */
  subtitleGroup?: string;
  /** Rango de video: SDR, PQ o HLG. */
  videoRange?: string;
  /** Nombre legible de la variante (atributo NAME). */
  name?: string;
  /** Indice dentro del master (estable entre recargas). */
  index: number;
}

/**
 * Pista de imagenes (`#EXT-X-IMAGE-STREAM-INF`).
 *
 * Apple la define para «trick play»: el master apunta a un playlist de imagenes
 * donde cada entrada es una hoja de sprites con `TILES` miniaturas por hoja y
 * `DURATION` segundos cubiertos por cada una.
 */
export interface ImageStream {
  /** URI absoluta del playlist de imagenes. */
  uri: string;
  /** Ancho de cada miniatura dentro de la hoja. */
  width?: number;
  /** Alto de cada miniatura dentro de la hoja. */
  height?: number;
  /** Columnas y filas de la hoja de sprites. */
  tilesX?: number;
  tilesY?: number;
  /** Segundos que cubre cada hoja. */
  durationSeconds?: number;
  /** Bitrate declarado (bps). */
  bandwidth?: number;
  /** Nombre legible (atributo NAME). */
  name?: string;
  /** Indice dentro del master. */
  index: number;
}

export interface MediaRendition {
  type: RenditionType;
  groupId: string;
  name: string;
  language?: string;
  /** URI absoluta (ausente en CLOSED-CAPTIONS embebidas). */
  uri?: string;
  isDefault: boolean;
  autoselect: boolean;
  forced: boolean;
  /** Canales de audio declarados (p.ej. "6" para 5.1). */
  channels?: string;
  /** Marca de tiempo de los subtitulos embebidos. */
  characteristics?: string;
}

export interface MasterPlaylist {
  /** true si el playlist contiene variantes (#EXT-X-STREAM-INF). */
  isMaster: boolean;
  variants: Variant[];
  renditions: MediaRendition[];
  /** Hojas de sprites para previsualizar el salto (si el master las trae). */
  imageStreams: ImageStream[];
  targetDuration?: number;
  mediaSequence?: number;
  version?: number;
  independentSegments?: boolean;
  /** Playlist original, por si hay que reescribirla tal cual. */
  raw: string;
}

const MEDIA_TAG = /^#EXT-X-MEDIA:(.+)$/;
const STREAM_INF_TAG = /^#EXT-X-STREAM-INF:(.+)$/;
const I_FRAME_TAG = /^#EXT-X-I-FRAME-STREAM-INF:(.+)$/;
const IMAGE_STREAM_TAG = /^#EXT-X-IMAGE-STREAM-INF:(.*)$/;

/** Parsea `TILES=5x5` en columnas y filas. */
function parseTiles(value: string | undefined): { x?: number; y?: number } {
  if (!value) return {};
  const match = /^(\d+)\s*[x,]\s*(\d+)$/i.exec(value.trim());
  if (!match) {
    const single = Number(value);
    return Number.isFinite(single) && single > 0 ? { x: single, y: 1 } : {};
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

export function isHlsUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.m3u8') || lower.includes('.m3u');
}

/** ¿El texto es un master playlist (tiene variantes)? */
export function isMasterPlaylist(text: string): boolean {
  return /^#EXT-X-STREAM-INF:/m.test(text);
}

/** Parsea una lista de atributos de tag HLS: `KEY=VALUE,KEY="VALUE"`. */
export function parseAttributes(input: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let index = 0;
  const length = input.length;

  while (index < length) {
    // Nombre de la clave
    const keyStart = index;
    while (index < length && input[index] !== '=' && input[index] !== ',') index += 1;
    const key = input.slice(keyStart, index).trim().toUpperCase();
    if (!key) {
      index += 1;
      continue;
    }
    if (input[index] !== '=') {
      // Bandera sin valor (p.ej. "NONE").
      attributes[key] = 'YES';
      continue;
    }
    index += 1; // '='

    let value = '';
    if (input[index] === '"') {
      index += 1;
      const valueStart = index;
      while (index < length && input[index] !== '"') index += 1;
      value = input.slice(valueStart, index);
      index += 1; // comilla de cierre
    } else {
      const valueStart = index;
      while (index < length && input[index] !== ',') index += 1;
      value = input.slice(valueStart, index).trim();
    }
    attributes[key] = value;

    if (input[index] === ',') index += 1;
  }

  return attributes;
}

function resolveUrl(uri: string, base: string): string {
  try {
    return new URL(uri, base).toString();
  } catch {
    return uri;
  }
}

function parseResolution(value?: string): { width?: number; height?: number } {
  if (!value) return {};
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseCodecs(value?: string): string[] | undefined {
  if (!value) return undefined;
  const codecs = value
    .split(',')
    .map((codec) => codec.trim())
    .filter(Boolean);
  return codecs.length ? codecs : undefined;
}

/**
 * Parsea un playlist HLS completo.
 *
 * @param text  contenido del playlist
 * @param baseUrl URL base para resolver URIs relativas
 */
export function parsePlaylist(text: string, baseUrl: string): MasterPlaylist {
  const lines = text.split(/\r?\n/);
  const variants: Variant[] = [];
  const renditions: MediaRendition[] = [];
  const imageStreams: ImageStream[] = [];

  let targetDuration: number | undefined;
  let mediaSequence: number | undefined;
  let version: number | undefined;
  let independentSegments: boolean | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = Number(line.split(':')[1]);
      continue;
    }
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = Number(line.split(':')[1]);
      continue;
    }
    if (line.startsWith('#EXT-X-VERSION:')) {
      version = Number(line.split(':')[1]);
      continue;
    }
    if (line === '#EXT-X-INDEPENDENT-SEGMENTS') {
      independentSegments = true;
      continue;
    }

    const mediaMatch = MEDIA_TAG.exec(line);
    if (mediaMatch) {
      const attributes = parseAttributes(mediaMatch[1]!);
      const type = (attributes['TYPE'] ?? 'AUDIO').toUpperCase() as RenditionType;
      renditions.push({
        type,
        groupId: attributes['GROUP-ID'] ?? '',
        name: attributes['NAME'] ?? '',
        language: attributes['LANGUAGE'],
        uri: attributes['URI'] ? resolveUrl(attributes['URI'], baseUrl) : undefined,
        isDefault: (attributes['DEFAULT'] ?? 'NO').toUpperCase() === 'YES',
        autoselect: (attributes['AUTOSELECT'] ?? 'NO').toUpperCase() === 'YES',
        forced: (attributes['FORCED'] ?? 'NO').toUpperCase() === 'YES',
        channels: attributes['CHANNELS'],
        characteristics: attributes['CHARACTERISTICS'],
      });
      continue;
    }

    const streamInfMatch = STREAM_INF_TAG.exec(line);
    if (streamInfMatch) {
      const attributes = parseAttributes(streamInfMatch[1]!);
      // La URI es la siguiente linea no comentada.
      let uri = '';
      for (let next = index + 1; next < lines.length; next += 1) {
        const candidate = lines[next]!.trim();
        if (!candidate) continue;
        if (candidate.startsWith('#')) continue;
        uri = candidate;
        index = next;
        break;
      }
      const resolution = parseResolution(attributes['RESOLUTION']);
      variants.push({
        uri: resolveUrl(uri, baseUrl),
        width: resolution.width,
        height: resolution.height,
        frameRate: attributes['FRAME-RATE'] ? Number(attributes['FRAME-RATE']) : undefined,
        bandwidth: attributes['BANDWIDTH'] ? Number(attributes['BANDWIDTH']) : undefined,
        averageBandwidth: attributes['AVERAGE-BANDWIDTH']
          ? Number(attributes['AVERAGE-BANDWIDTH'])
          : undefined,
        codecs: parseCodecs(attributes['CODECS']),
        audioGroup: attributes['AUDIO'],
        subtitleGroup: attributes['SUBTITLES'],
        videoRange: attributes['VIDEO-RANGE'],
        name: attributes['NAME'],
        index: variants.length,
      });
      continue;
    }

    if (I_FRAME_TAG.test(line)) {
      // Los I-frame playlists no se reproducen como variante principal.
      continue;
    }

    const imageMatch = IMAGE_STREAM_TAG.exec(line);
    if (imageMatch) {
      const attributes = parseAttributes(imageMatch[1] ?? '');
      // La URI puede venir como atributo o en la siguiente linea no comentada.
      let uri = attributes['URI'] ?? '';
      if (!uri) {
        for (let next = index + 1; next < lines.length; next += 1) {
          const candidate = lines[next]!.trim();
          if (!candidate || candidate.startsWith('#')) continue;
          uri = candidate;
          index = next;
          break;
        }
      }
      if (!uri) continue;
      const resolution = parseResolution(attributes['RESOLUTION']);
      const tiles = parseTiles(attributes['TILES']);
      imageStreams.push({
        uri: resolveUrl(uri, baseUrl),
        width: resolution.width,
        height: resolution.height,
        tilesX: tiles.x,
        tilesY: tiles.y,
        durationSeconds: attributes['DURATION'] ? Number(attributes['DURATION']) : undefined,
        bandwidth: attributes['BANDWIDTH'] ? Number(attributes['BANDWIDTH']) : undefined,
        name: attributes['NAME'],
        index: imageStreams.length,
      });
      continue;
    }
  }

  return {
    isMaster: variants.length > 0,
    variants,
    renditions,
    imageStreams,
    targetDuration,
    mediaSequence,
    version,
    independentSegments,
    raw: text,
  };
}

/** Variante de un master a partir de un indice. */
export function variantByIndex(master: MasterPlaylist, index: number): Variant | undefined {
  return master.variants.find((variant) => variant.index === index);
}
