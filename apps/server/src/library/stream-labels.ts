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

export function streamDisplayName(type: string, id: string, meta: MetaDetail | null): string {
  const title = meta?.name?.trim() || 'Vibe Flix';
  const { season, episode } = parseEpisodeId(type, id);
  return season === undefined || episode === undefined
    ? title
    : `${title} · T${season} E${episode}`;
}

/** Deja exclusivamente los campos que hacen falta para la reproducción. */
export function presentStreams(streams: Stream[], displayName: string): Stream[] {
  return streams.map((stream) => {
    const hints = stream.behaviorHints;
    const behaviorHints = hints ? {
      notWebReady: hints.notWebReady,
      countryWhitelist: hints.countryWhitelist,
      proxyHeaders: hints.proxyHeaders,
      videoHash: hints.videoHash,
      videoSize: hints.videoSize,
      audioDelayMs: hints.audioDelayMs,
    } : undefined;
    return {
      name: displayName,
      title: displayName,
      url: stream.url,
      externalUrl: stream.externalUrl,
      ytId: stream.ytId,
      infoHash: stream.infoHash,
      fileIdx: stream.fileIdx,
      sources: stream.sources,
      subtitles: stream.subtitles,
      ...(behaviorHints ? { behaviorHints } : {}),
    };
  });
}
