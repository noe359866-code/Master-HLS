/**
 * Reescritura de playlists HLS para hacerlas pasar por un proxy.
 *
 * Motivo: muchos addons devuelven URLs de CDN que exigen cabeceras concretas
 * (Referer, User-Agent, Cookie) o que bloquean por IP. El proxy del servidor
 * reproduce esas cabeceras; para que los segmentos, claves e init segments
 * tambien pasen por el proxy hay que reescribir las URIs del playlist.
 */

import { parseAttributes } from './parser.js';

export type UriResolver = (absoluteUrl: string) => string;

const MEDIA_TAG = '#EXT-X-MEDIA:';
const KEY_TAG = '#EXT-X-KEY:';
const MAP_TAG = '#EXT-X-MAP:';
const SESSION_KEY_TAG = '#EXT-X-SESSION-KEY:';
const I_FRAME_TAG = '#EXT-X-I-FRAME-STREAM-INF:';
const RENDITION_REPORT_TAG = '#EXT-X-RENDITION-REPORT:';
const PART_TAG = '#EXT-X-PART:';
const PRELOAD_HINT_TAG = '#EXT-X-PRELOAD-HINT:';

/** Reemplaza el atributo URI="..." de un tag por la URL resuelta. */
function rewriteUriAttribute(line: string, baseUrl: string, resolve: UriResolver): string {
  return line.replace(/URI="([^"]*)"/g, (_match, uri: string) => {
    if (!uri) return 'URI=""';
    let absolute: string;
    try {
      absolute = new URL(uri, baseUrl).toString();
    } catch {
      absolute = uri;
    }
    return `URI="${resolve(absolute)}"`;
  });
}

/**
 * Reescribe todas las URIs de un playlist.
 *
 * @param text    contenido original
 * @param baseUrl URL base del playlist (para resolver URIs relativas)
 * @param resolve funcion que convierte una URL absoluta en la URL que debe
 *                usar el cliente (normalmente la URL del proxy)
 */
export function rewritePlaylist(text: string, baseUrl: string, resolve: UriResolver): string {
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let pendingVariant = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      output.push(rawLine);
      continue;
    }

    if (line.startsWith(MEDIA_TAG) || line.startsWith(KEY_TAG) || line.startsWith(MAP_TAG) ||
        line.startsWith(SESSION_KEY_TAG) || line.startsWith(I_FRAME_TAG) ||
        line.startsWith(RENDITION_REPORT_TAG) || line.startsWith(PART_TAG) ||
        line.startsWith(PRELOAD_HINT_TAG)) {
      output.push(rewriteUriAttribute(line, baseUrl, resolve));
      pendingVariant = line.startsWith(I_FRAME_TAG);
      continue;
    }

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      output.push(rawLine);
      pendingVariant = true;
      continue;
    }

    if (pendingVariant && !line.startsWith('#')) {
      let absolute: string;
      try {
        absolute = new URL(line, baseUrl).toString();
      } catch {
        absolute = line;
      }
      output.push(resolve(absolute));
      pendingVariant = false;
      continue;
    }

    if (!line.startsWith('#')) {
      // URI de segmento en playlist media.
      let absolute: string;
      try {
        absolute = new URL(line, baseUrl).toString();
      } catch {
        absolute = line;
      }
      output.push(resolve(absolute));
      continue;
    }

    output.push(rawLine);
  }

  return output.join('\n');
}

/**
 * Genera una playlist media con una unica variante (bypass de adaptacion).
 * Se usa cuando el cliente quiere fijar una calidad concreta y el proxy
 * entrega el contenido ya filtrado.
 */
export function buildSingleVariantPlaylist(variant: {
  uri: string;
  bandwidth?: number;
  codecs?: string[];
  audioGroup?: string;
  subtitleGroup?: string;
}): string {
  const attributes = [
    `BANDWIDTH=${variant.bandwidth ?? 0}`,
    variant.codecs?.length ? `CODECS="${variant.codecs.join(',')}"` : '',
    variant.audioGroup ? `AUDIO="${variant.audioGroup}"` : '',
    variant.subtitleGroup ? `SUBTITLES="${variant.subtitleGroup}"` : '',
  ]
    .filter(Boolean)
    .join(',');

  return [
    '#EXTM3U',
    '#EXT-X-VERSION:4',
    `#EXT-X-STREAM-INF:${attributes}`,
    variant.uri,
    '',
  ].join('\n');
}

/** Atributos de un tag (reexportado para convenience). */
export { parseAttributes };
