/**
 * Miniaturas de previsualizacion al desplazar (scrubbing).
 *
 * Es la funcion estrella de WuPlay v0.9.3 («Preview thumbnails during
 * fast-forward and rewind») y en HLS tiene un camino estandar: el master
 * playlist puede declarar `#EXT-X-IMAGE-STREAM-INF`, que apunta a un playlist
 * WebVTT con hojas de sprites (`#xywh=`).
 *
 * Aqui se parsea ese WebVTT y se resuelve que recorte de que sprite
 * corresponde a cada instante, listo para pintarlo con CSS. El parseo del
 * master (la declaracion `EXT-X-IMAGE-STREAM-INF`) vive en `@vibeflix/hls-master`.
 */

import { parseCues, type Cue } from './cues.js';

/** Un recorte de una hoja de sprites. */
export interface Thumbnail {
  /** URL absoluta de la hoja de sprites. */
  url: string;
  startMs: number;
  endMs: number;
  /** Posicion y tamano del recorte dentro de la hoja (px). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Ancho y alto totales de la hoja, si se deducen. */
  sheetWidth?: number;
  sheetHeight?: number;
}

/** Fragmento de media `#xywh=` (absoluto o en porcentaje). */
const XYWH = /#xywh=(percent:)?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i;

/** Resuelve una URL relativa contra la base del playlist. */
export function resolveSpriteUrl(url: string, baseUrl?: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (!baseUrl) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

/**
 * Parsea un playlist WebVTT de sprites.
 *
 * @param vtt     contenido del playlist de imagenes
 * @param baseUrl URL del playlist (para resolver las hojas relativas)
 * @param tiles   numero de recortes por hoja, si el master lo declara
 */
export function parseSpritePlaylist(vtt: string, baseUrl?: string, tiles?: number): Thumbnail[] {
  const cues: Cue[] = parseCues(vtt);
  const thumbnails: Thumbnail[] = [];

  for (const cue of cues) {
    const line = cue.lines.find((entry) => entry.includes('#xywh') || /\.(jpg|jpeg|png|webp)/i.test(entry));
    if (!line) continue;
    const [rawUrl, fragment = ''] = line.split('#') as [string, string?];
    const url = resolveSpriteUrl((rawUrl ?? '').trim(), baseUrl);
    if (!url) continue;

    const match = XYWH.exec(`#${fragment}`);
    if (!match) {
      // Sin region: la imagen entera es la miniatura.
      thumbnails.push({ url, startMs: cue.startMs, endMs: cue.endMs, x: 0, y: 0, width: 0, height: 0 });
      continue;
    }

    const percent = Boolean(match[1]);
    const x = Number(match[2]);
    const y = Number(match[3]);
    const width = Number(match[4]);
    const height = Number(match[5]);
    if (!Number.isFinite(x) || !Number.isFinite(width)) continue;

    const entry: Thumbnail = {
      url,
      startMs: cue.startMs,
      endMs: cue.endMs,
      x: percent ? x / 100 : x,
      y: percent ? y / 100 : y,
      width: percent ? width / 100 : width,
      height: percent ? height / 100 : height,
    };
    if (percent) {
      // En modo porcentaje las coordenadas ya vienen normalizadas (0-1).
      entry.sheetWidth = 1;
      entry.sheetHeight = 1;
    } else if (tiles && tiles > 0) {
      const columns = Math.ceil(Math.sqrt(tiles));
      entry.sheetWidth = width * columns;
      entry.sheetHeight = height * Math.ceil(tiles / columns);
    }
    thumbnails.push(entry);
  }

  return thumbnails.sort((a, b) => a.startMs - b.startMs);
}

/** Miniatura correspondiente a un instante (busqueda lineal acotada). */
export function thumbnailAt(thumbnails: Thumbnail[], timeMs: number): Thumbnail | undefined {
  if (!thumbnails.length) return undefined;
  let low = 0;
  let high = thumbnails.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const entry = thumbnails[middle];
    if (!entry) break;
    if (entry.startMs > timeMs) high = middle - 1;
    else if (entry.endMs < timeMs) low = middle + 1;
    else return entry;
  }
  // Fuera de rango: la mas cercana (el ultimo sprite suele cubrir el resto).
  return thumbnails[Math.min(Math.max(low, 0), thumbnails.length - 1)];
}

/** Propiedades CSS para pintar la miniatura con `background-image`. */
export function thumbnailCss(
  thumbnail: Thumbnail,
  boxWidth: number,
  boxHeight: number,
): Record<string, string> {
  if (!thumbnail.width || !thumbnail.height) {
    return {
      backgroundImage: `url("${thumbnail.url}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      width: `${boxWidth}px`,
      height: `${boxHeight}px`,
    };
  }

  const percentMode = thumbnail.sheetWidth === 1 && thumbnail.sheetHeight === 1;
  const scale = percentMode
    ? Math.max(boxWidth, 1)
    : boxWidth / thumbnail.width;
  const sheetWidth = percentMode ? 100 / thumbnail.width : (thumbnail.sheetWidth ?? thumbnail.width) * scale;
  const sheetHeight = percentMode ? 100 / thumbnail.height : (thumbnail.sheetHeight ?? thumbnail.height) * scale;

  return {
    backgroundImage: `url("${thumbnail.url}")`,
    backgroundSize: `${sheetWidth.toFixed(2)}${percentMode ? '%' : 'px'} ${sheetHeight.toFixed(2)}${percentMode ? '%' : 'px'}`,
    backgroundPosition: `${(-thumbnail.x * (percentMode ? sheetWidth / 100 : scale)).toFixed(2)}px ${(-thumbnail.y * (percentMode ? sheetHeight / 100 : scale)).toFixed(2)}px`,
    width: `${boxWidth}px`,
    height: `${boxHeight}px`,
  };
}

/** Geometria de la hoja de sprites declarada en el master (`EXT-X-IMAGE-STREAM-INF`). */
export interface HlsImagePlaylistOptions {
  /** URL del playlist de imagenes (para resolver hojas relativas). */
  baseUrl?: string;
  /** Ancho de cada miniatura (`RESOLUTION` del master). */
  tileWidth?: number;
  /** Alto de cada miniatura. */
  tileHeight?: number;
  /** Columnas de la hoja (`TILES=5x5`). */
  tilesX?: number;
  /** Filas de la hoja. */
  tilesY?: number;
  /** Segundos por hoja (`DURATION`), si `#EXTINF` no los declara. */
  sheetSeconds?: number;
}

/**
 * Parsea un playlist **media** de imagenes HLS (lo que apunta
 * `#EXT-X-IMAGE-STREAM-INF` en el master) a la misma lista de miniaturas que el
 * WebVTT de sprites.
 *
 * Cada entrada del playlist es una hoja con `tilesX * tilesY` miniaturas que
 * cubre `#EXTINF` segundos: se reparte ese tiempo a partes iguales y se calcula
 * el recorte de cada una, que es exactamente lo que `thumbnailCss` necesita para
 * pintar la previsualizacion del salto.
 */
export function parseHlsImagePlaylist(text: string, options: HlsImagePlaylistOptions = {}): Thumbnail[] {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  // Algunos servidores responden con el WebVTT de sprites directamente.
  if (/^\s*WEBVTT/i.test(source)) return parseSpritePlaylist(source, options.baseUrl);

  const tilesX = Math.max(1, Math.round(options.tilesX ?? 1));
  const tilesY = Math.max(1, Math.round(options.tilesY ?? 1));
  const perSheet = tilesX * tilesY;
  const tileWidth = options.tileWidth && options.tileWidth > 0 ? options.tileWidth : 160;
  const tileHeight = options.tileHeight && options.tileHeight > 0 ? options.tileHeight : Math.round((tileWidth * 9) / 16);

  const thumbnails: Thumbnail[] = [];
  let clockMs = 0;
  let pendingSeconds: number | undefined;

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const seconds = Number.parseFloat(line.slice('#EXTINF:'.length).split(',')[0] ?? '');
      pendingSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
      continue;
    }
    if (line.startsWith('#')) continue;

    const seconds = pendingSeconds ?? options.sheetSeconds ?? 0;
    pendingSeconds = undefined;
    if (seconds <= 0) continue;

    const url = resolveSpriteUrl(line, options.baseUrl);
    const sheetMs = seconds * 1000;
    const perTileMs = sheetMs / perSheet;
    const sheetWidth = tileWidth * tilesX;
    const sheetHeight = tileHeight * tilesY;

    for (let tile = 0; tile < perSheet; tile += 1) {
      const startMs = clockMs + tile * perTileMs;
      thumbnails.push({
        url,
        startMs: Math.round(startMs),
        endMs: Math.round(startMs + perTileMs),
        x: (tile % tilesX) * tileWidth,
        y: Math.floor(tile / tilesX) * tileHeight,
        width: tileWidth,
        height: tileHeight,
        sheetWidth,
        sheetHeight,
      });
    }
    clockMs += sheetMs;
  }

  return thumbnails.sort((a, b) => a.startMs - b.startMs);
}

/** Tamano sugerido del recorte segun el ancho del sprite declarado. */
export function thumbnailBox(
  thumbnails: Thumbnail[],
  maxWidth = 240,
): { width: number; height: number } {
  const first = thumbnails[0];
  const ratio = first?.width && first?.height ? first.width / first.height : 16 / 9;
  const width = Math.min(maxWidth, first?.width || maxWidth);
  return { width, height: Math.round(width / (ratio || 16 / 9)) };
}
