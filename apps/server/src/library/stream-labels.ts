/**
 * Etiquetas públicas del addon Vibe Flix. Se aplican DESPUÉS de ordenar y
 * resolver debrid para no perder la calidad ni enviar nombres de servidores,
 * releases o proveedores a Stremio, la web o Android TV.
 *
 * La URL/cabeceras originales se conservan: son necesarias para reproducir
 * el vídeo. Esto oculta nombres de la interfaz, no anonimiza la red.
 */

import type { MetaDetail, Stream } from '@vibeflix/addon-engine';
import { parseEpisodeId } from '@vibeflix/scrapers';

import { badgesForStream, type StreamBadgeConfig } from './stream-badges.js';

export function streamDisplayName(type: string, id: string, meta: MetaDetail | null): string {
  const title = meta?.name?.trim() || 'Vibe Flix';
  const { season, episode } = parseEpisodeId(type, id);
  return season === undefined || episode === undefined
    ? title
    : `${title} · T${season} E${episode}`;
}

/**
 * `bingeGroup` del stream.
 *
 * El protocolo Stremio lo define para encadenar episodios: si el episodio
 * siguiente tiene un stream con el mismo `bingeGroup`, el cliente debe elegirlo
 * implicitamente (misma fuente y misma calidad). Casi ningun addon lo rellena y
 * los que lo rellenan suelen poner el nombre del proveedor, asi que **siempre se
 * deriva** de la calidad declarada y del id del addon: se conserva la funcion
 * (Stremio y WuPlay encadenan el siguiente episodio con la misma calidad) sin
 * reexponer informacion del origen.
 */
/** Altura legible (`720p`, `4k`) declarada en el stream, o `best` si no consta. */
export function qualityTokenOf(stream: Stream): string {
  const labelled = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename];
  for (const text of labelled) {
    if (!text) continue;
    const match = /\b(2160|1440|1080|720|576|540|480|360)p\b|\b(4k|uhd)\b/i.exec(text);
    if (match) {
      if (match[2]) return '4k';
      return `${match[1]}p`;
    }
  }
  // Muchos addons no lo dicen en la etiqueta pero si en la URL
  // (`.../movie-720.mp4`, `.../title.1080p.x264.mkv`): se usa como segunda
  // pista, sin exponer nada mas que la resolucion.
  for (const text of [stream.url, ...(stream.sources ?? [])]) {
    if (!text) continue;
    const match = /[-_.](2160|1440|1080|720|576|540|480|360)[-_.]/i.exec(text) ??
      /\b(4k|uhd)\b/i.exec(text);
    if (match) return match[1] ? `${match[1]}p` : '4k';
  }
  return 'best';
}

export function bingeGroupFor(stream: Stream, addonId?: string): string {
  // Solo el id del addon (nunca el nombre de fichero del proveedor, que podria
  // revelar el servidor de origen: la privacidad de la etiqueta es invariante).
  const source = addonId ?? 'vibeflix';
  return `${source}-${qualityTokenOf(stream)}`;
}

/**
 * Deja exclusivamente los campos que hacen falta para la reproducción.
 *
 * Se conservan los `behaviorHints` que el protocolo usa para reproducir mejor:
 * `proxyHeaders` (con `notWebReady`, que el SDK exige al declararlos),
 * `videoSize` y `videoHash` (los consumen los addons de subtitulos para
 * emparejar el fichero correcto) y `bingeGroup`, derivado si el addon no lo
 * manda, para que Stremio y WuPlay encadenen el episodio siguiente con la misma
 * fuente y calidad.
 *
 * **No** se reexpone `behaviorHints.filename`: es el unico campo del stream que
 * suele contener el nombre del servidor de origen, y la etiqueta publica de
 * Vibe Flix solo lleva titulo y temporada/episodio.
 */
export function presentStreams(
  streams: Stream[],
  displayName: string,
  addonId?: string,
  badgeConfig?: StreamBadgeConfig,
): Stream[] {
  return streams.map((stream) => {
    const hints = stream.behaviorHints as Record<string, unknown> | undefined;
    const hasProxyHeaders = Boolean(
      (hints as { proxyHeaders?: unknown })?.proxyHeaders,
    );
    // Badges del stream (NuvioTV: Stream.badge): se calculan del texto visible
    // del stream y de las reglas personalizadas del usuario.
    const haystack = [stream.name, stream.title, stream.description, (hints as { filename?: string })?.filename]
      .filter(Boolean)
      .join(' ');
    const badges = badgesForStream(haystack, badgeConfig);
    const behaviorHints: Record<string, unknown> = {
      // El SDK obliga a marcar `notWebReady` cuando se piden cabeceras.
      ...(hasProxyHeaders ? { notWebReady: true } : hints?.['notWebReady'] !== undefined ? { notWebReady: hints!['notWebReady'] } : {}),
      ...(hints?.['countryWhitelist'] ? { countryWhitelist: hints!['countryWhitelist'] } : {}),
      ...(hints?.['proxyHeaders'] ? { proxyHeaders: hints!['proxyHeaders'] } : {}),
      ...(hints?.['videoHash'] ? { videoHash: hints!['videoHash'] } : {}),
      ...(hints?.['videoSize'] ? { videoSize: hints!['videoSize'] } : {}),
      ...(typeof hints?.['audioDelayMs'] === 'number' ? { audioDelayMs: hints!['audioDelayMs'] } : {}),
      ...(badges.length ? { streamBadges: badges } : {}),
      bingeGroup: bingeGroupFor(stream, addonId),
    };
    // `description` es el campo actual del protocolo y `title` esta deprecado,
    // pero aun lo leen los clientes antiguos: se envian los dos con la misma
    // etiqueta publica (nunca la `description` original del addon, que suele
    // llevar el nombre del servidor o de la release).
    return {
      name: displayName,
      title: displayName,
      description: displayName,
      url: stream.url,
      externalUrl: stream.externalUrl,
      ytId: stream.ytId,
      infoHash: stream.infoHash,
      fileIdx: stream.fileIdx,
      sources: stream.sources,
      subtitles: stream.subtitles,
      behaviorHints,
    };
  });
}
