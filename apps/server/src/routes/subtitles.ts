/**
 * Rutas de subtitulos nativos y de omision de intro.
 *
 *  - `/api/opensubtitles`             busca subtitulos en OpenSubtitles.
 *  - `/api/opensubtitles/download`     descarga uno y lo sirve como WebVTT.
 *  - `/api/opensubtitles/file/:name`   sirve el WebVTT ya convertido.
 *  - `/api/skip-intro`                 indica hasta donde saltar la intro.
 *
 * El analisis de la intro es **nativo**: usa los subtitulos que ya traen los
 * addons (o los de OpenSubtitles) y no depende de servicios externos de
 * "skip intro" ni de analisis de audio.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  detectSkipSegment,
  fallbackSkipSegment,
  parseSubtitles,
  resolveSkipSegment,
  type SkipSegment,
} from '@vibeflix/skip-intro';
import type { AddonRegistry } from '@vibeflix/addon-engine';

import type { Router } from '../http/router.js';
import { sendJson, sendText } from '../http/router.js';
import type { AppData } from '../model.js';
import { OpenSubtitlesService, type OpenSubtitleEntry } from '../services/opensubtitles.js';

export interface SubtitleRouteOptions {
  registry: AddonRegistry;
  getData: () => AppData;
  /** Directorio donde se guardan los WebVTT descargados. */
  cacheDir: string;
  /** URL publica del servidor (para construir las URLs de los subtitulos). */
  publicUrl: () => string;
  /** Factoría del servicio de OpenSubtitles (tests). */
  createOpenSubtitles?: (apiKey: string) => OpenSubtitlesService;
  /** `fetch` inyectable para descargar subtitulos (tests). */
  fetchImpl?: typeof fetch;
}

interface SubtitleCandidate {
  url: string;
  lang: string;
  name?: string;
}

/** Idioma preferido por defecto para la deteccion de intro. */
const PREFERRED_LANGUAGES = ['es', 'en'];

export function registerSubtitleRoutes(
  router: Router,
  options: SubtitleRouteOptions,
): void {
  const { registry, getData, cacheDir, publicUrl } = options;
  const fetchImpl = options.fetchImpl ?? fetch;

  const serviceFor = (apiKey: string) =>
    options.createOpenSubtitles
      ? options.createOpenSubtitles(apiKey)
      : new OpenSubtitlesService({ apiKey });

  // ------------------------------------------------------------- OpenSubtitles
  router.get('/api/opensubtitles', async ({ res, query }) => {
    const apiKey = getData().settings.opensubtitles?.apiKey ?? '';
    if (!apiKey) {
      sendJson(res, 200, { enabled: false, subtitles: [] });
      return;
    }

    const imdbId = query.get('imdbId') ?? query.get('imdb_id') ?? '';
    const season = numberOf(query.get('season'));
    const episode = numberOf(query.get('episode'));
    const language = query.get('lang') ?? query.get('language') ?? '';
    const search = query.get('q') ?? '';

    try {
      const service = serviceFor(apiKey);
      const subtitles = await service.search({
        imdbId: imdbId || undefined,
        season,
        episode,
        language: language || undefined,
        query: search || undefined,
      });
      sendJson(res, 200, { enabled: true, subtitles });
    } catch (error) {
      sendJson(res, 502, { enabled: true, error: (error as Error).message, subtitles: [] });
    }
  });

  router.get('/api/opensubtitles/download', async ({ res, query }) => {
    const apiKey = getData().settings.opensubtitles?.apiKey ?? '';
    if (!apiKey) {
      sendJson(res, 400, { error: 'Falta la API key de OpenSubtitles' });
      return;
    }
    const fileId = Number(query.get('fileId') ?? query.get('file_id'));
    if (!Number.isFinite(fileId)) {
      sendJson(res, 400, { error: 'Falta fileId' });
      return;
    }

    try {
      const service = serviceFor(apiKey);
      const subtitle = await service.download(fileId);
      const name = `os-${fileId}.vtt`;
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(path.join(cacheDir, name), subtitle.vtt, 'utf8');
      sendJson(res, 200, {
        url: `${publicUrl()}/api/opensubtitles/file/${name}`,
        path: `/api/opensubtitles/file/${name}`,
        cues: subtitle.cues.length,
        format: subtitle.format,
      });
    } catch (error) {
      sendJson(res, 502, { error: (error as Error).message });
    }
  });

  router.get('/api/opensubtitles/file/:name', async ({ res, params }) => {
    const name = path.basename(params['name'] ?? '');
    if (!name.endsWith('.vtt')) {
      sendJson(res, 400, { error: 'Solo se sirven subtitulos WebVTT' });
      return;
    }
    try {
      const content = await fs.readFile(path.join(cacheDir, name), 'utf8');
      sendText(res, 200, content, 'text/vtt');
    } catch {
      sendJson(res, 404, { error: 'Subtitulo no encontrado' });
    }
  });

  // ------------------------------------------------------------- omitir intro
  router.get('/api/skip-intro', async ({ res, query }) => {
    const settings = getData().settings.skipIntro ?? { enabled: true, offsetSeconds: 90 };
    const type = query.get('type') ?? 'movie';
    const id = query.get('id') ?? '';
    const imdbId = query.get('imdbId') ?? '';
    const season = numberOf(query.get('season'));
    const episode = numberOf(query.get('episode'));
    const durationMs = numberOf(query.get('duration')) ?? 0;

    const options = {
      fallbackMs: Math.max(5, settings.offsetSeconds ?? 90) * 1000,
    };

    // 1) Subtitulos del addon (o de OpenSubtitles) para analizar el dialogo.
    //
    // En Stremio, un episodio se pide como tipo `series` con el id completo
    // (`tt123:1:2`): por eso se recompone aqui.
    const resourceId =
      season !== undefined && episode !== undefined
        ? `${imdbId || id}:${season}:${episode}`
        : id || imdbId;

    const cues = await collectCues({
      registry,
      getData,
      type,
      id: resourceId,
      imdbId,
      season,
      episode,
      fetchImpl,
    });

    const segment: SkipSegment = cues.length
      ? resolveSkipSegment(cues, durationMs, options)
      : fallbackSkipSegment(durationMs, options);

    sendJson(res, 200, {
      segment,
      source: segment.source,
      cues: cues.length,
    });
  });
}

interface CollectCuesOptions {
  registry: AddonRegistry;
  getData: () => AppData;
  type: string;
  id: string;
  imdbId: string;
  season?: number;
  episode?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Reune los subtitulos disponibles para analizar el dialogo.
 *
 * Prioridad: los del addon (son los que el usuario ya ve) y, si no hay,
 * los de OpenSubtitles.
 */
async function collectCues(options: CollectCuesOptions): Promise<ReturnType<typeof parseSubtitles>> {
  const { registry, getData, type, id, imdbId, season, episode } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const candidates: SubtitleCandidate[] = [];

  if (id) {
    try {
      const result = await registry.subtitles({ type, id });
      for (const subtitle of result.value.subtitles) {
        if (subtitle.url) {
          candidates.push({
            url: subtitle.url,
            lang: subtitle.lang ?? subtitle.language ?? 'und',
            name: typeof subtitle.name === 'string' ? subtitle.name : undefined,
          });
        }
      }
    } catch {
      // El addon puede fallar: se sigue con OpenSubtitles.
    }
  }

  if (!candidates.length && imdbId) {
    const apiKey = getData().settings.opensubtitles?.apiKey ?? '';
    if (apiKey) {
      try {
        const service = new OpenSubtitlesService({ apiKey });
        const entries: OpenSubtitleEntry[] = await service.search({ imdbId, season, episode });
        const best = entries[0];
        if (best) {
          const subtitle = await service.download(best.fileId);
          return subtitle.cues;
        }
      } catch {
        // Sin OpenSubtitles: se usa el valor por defecto.
      }
    }
  }

  if (!candidates.length) return [];

  // Se preferse el idioma del perfil y el primer candidato.
  const preferred = getData().profiles.find((profile) => profile.id === getData().activeProfileId);
  const languages = [preferred?.subtitleLanguage, ...PREFERRED_LANGUAGES].filter(
    (value): value is string => Boolean(value),
  );
  const ordered = [...candidates].sort((a, b) => {
    const indexA = languages.indexOf(a.lang);
    const indexB = languages.indexOf(b.lang);
    return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
  });

  const chosen = ordered[0];
  if (!chosen) return [];

  try {
    const response = await fetchImpl(chosen.url, { redirect: 'follow' });
    if (!response.ok) return [];
    const text = await response.text();
    return parseSubtitles(text);
  } catch {
    return [];
  }
}

/** Convierte un parametro a numero (undefined si no es valido). */
function numberOf(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
