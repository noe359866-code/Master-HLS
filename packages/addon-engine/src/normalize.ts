/**
 * Normalizacion tolerante de las respuestas de los addons.
 *
 * En la practica ningun addon respeta el protocolo al 100%: hay `cast` como
 * string o como array, `director` con un nombre o con varios, `videos` con
 * `season`/`episode` o solo con `title`, streams sin `url` pero con `externalUrl`,
 * etc. Aqui se deja cada respuesta en una forma estable para el resto de la app.
 */

import type {
  CatalogResponse,
  MetaDetail,
  MetaPreview,
  MetaResponse,
  Stream,
  StreamResponse,
  Subtitle,
  SubtitleResponse,
  Video,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Normaliza un valor a array de strings (`cast`, `director`, `writer`...). */
export function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (isRecord(entry) && typeof entry['name'] === 'string') {
          const character = typeof entry['character'] === 'string' ? ` (${entry['character']})` : '';
          return `${entry['name']}${character}`.trim();
        }
        return '';
      })
      .filter(Boolean);
    return items;
  }
  return undefined;
}

/** Normaliza `cast`/`director`/`writer` a string[] (soporta `writers`). */
export function normalizePeople(meta: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...meta };
  const cast = toStringArray(meta['cast'] ?? meta['credits']);
  if (cast) result['cast'] = cast;

  const director = toStringArray(meta['director'] ?? meta['directors']);
  if (director) result['director'] = director;

  const writer = toStringArray(meta['writer'] ?? meta['writers']);
  if (writer) {
    result['writer'] = writer;
    delete result['writers'];
  }
  return result;
}

export function normalizeMetaPreview(input: unknown): MetaPreview | null {
  if (!isRecord(input)) return null;
  const id = typeof input['id'] === 'string' ? input['id'] : undefined;
  if (!id) return null;

  const meta: Record<string, unknown> = normalizePeople(input);
  meta['id'] = id;

  if (typeof input['type'] === 'string') meta['type'] = input['type'];
  if (typeof input['name'] === 'string') meta['name'] = input['name'];

  for (const key of [
    'poster',
    'posterShape',
    'background',
    'logo',
    'description',
    'releaseInfo',
    'imdbRating',
    'runtime',
    'status',
    'released',
    'country',
    'language',
    'awards',
    'imdb_id',
    'slug',
    'landscapePoster',
  ]) {
    if (typeof input[key] === 'string') meta[key] = input[key];
  }

  if (Array.isArray(input['genres'])) {
    meta['genres'] = input['genres'].filter((g): g is string => typeof g === 'string');
  }
  if (isRecord(input['behaviorHints'])) meta['behaviorHints'] = input['behaviorHints'];
  if (Array.isArray(input['links'])) meta['links'] = input['links'];
  if (Array.isArray(input['trailers'])) meta['trailers'] = input['trailers'];

  return meta as MetaPreview;
}

export function normalizeVideo(input: unknown): Video | null {
  if (!isRecord(input)) return null;
  const id = typeof input['id'] === 'string' ? input['id'] : undefined;
  if (!id) return null;

  const video: Record<string, unknown> = { ...input, id };
  for (const key of ['season', 'episode', 'number']) {
    if (typeof input[key] === 'number') video[key] = input[key];
  }
  for (const key of ['title', 'name', 'released', 'thumbnail', 'overview', 'description', 'runtime', 'rating']) {
    if (typeof input[key] === 'string') video[key] = input[key];
  }
  if (typeof input['available'] === 'boolean') video['available'] = input['available'];

  if (Array.isArray(input['streams'])) {
    video['streams'] = input['streams']
      .map((stream) => normalizeStream(stream))
      .filter((stream): stream is Stream => stream !== null);
  }
  if (Array.isArray(input['subtitles'])) {
    video['subtitles'] = input['subtitles']
      .map((subtitle) => normalizeSubtitle(subtitle))
      .filter((subtitle): subtitle is Subtitle => subtitle !== null);
  }
  return video as Video;
}

export function normalizeMeta(input: unknown): MetaDetail | null {
  if (!isRecord(input)) return null;
  const preview = normalizeMetaPreview(input);
  if (!preview) return null;

  const meta: Record<string, unknown> = { ...preview };
  if (Array.isArray(input['videos'])) {
    meta['videos'] = input['videos']
      .map((video) => normalizeVideo(video))
      .filter((video): video is Video => video !== null);
  }
  if (isRecord(input['app_extras'])) meta['app_extras'] = input['app_extras'];
  return meta as MetaDetail;
}

export function normalizeStream(input: unknown): Stream | null {
  if (!isRecord(input)) return null;

  // Un stream sin ninguna URL utilizable no sirve para nada.
  const hasUrl = typeof input['url'] === 'string' && input['url'].length > 0;
  const hasExternal = typeof input['externalUrl'] === 'string' && input['externalUrl'].length > 0;
  const hasYtId = typeof input['ytId'] === 'string' && input['ytId'].length > 0;
  if (!hasUrl && !hasExternal && !hasYtId) return null;

  const stream: Record<string, unknown> = { ...input };
  for (const key of ['name', 'title', 'description', 'url', 'ytId', 'infoHash', 'externalUrl']) {
    if (typeof input[key] === 'string') stream[key] = input[key];
  }
  if (typeof input['fileIdx'] === 'number') stream['fileIdx'] = input['fileIdx'];
  if (Array.isArray(input['sources'])) {
    stream['sources'] = input['sources'].filter((s): s is string => typeof s === 'string');
  }
  if (isRecord(input['behaviorHints'])) stream['behaviorHints'] = input['behaviorHints'];
  if (Array.isArray(input['subtitles'])) {
    stream['subtitles'] = input['subtitles']
      .map((subtitle) => normalizeSubtitle(subtitle))
      .filter((subtitle): subtitle is Subtitle => subtitle !== null);
  }
  return stream as Stream;
}

export function normalizeSubtitle(input: unknown): Subtitle | null {
  if (!isRecord(input)) return null;
  const url = typeof input['url'] === 'string' ? input['url'] : undefined;
  if (!url) return null;
  const lang =
    (typeof input['lang'] === 'string' && input['lang']) ||
    (typeof input['language'] === 'string' && input['language']) ||
    'und';
  const subtitle: Record<string, unknown> = { ...input, url, lang };
  if (typeof input['id'] === 'string') subtitle['id'] = input['id'];
  if (isRecord(input['headers'])) subtitle['headers'] = input['headers'];
  return subtitle as Subtitle;
}

export function normalizeCatalogResponse(input: unknown): CatalogResponse {
  const metas = isRecord(input) && Array.isArray(input['metas']) ? input['metas'] : [];
  return {
    metas: metas
      .map((meta) => normalizeMetaPreview(meta))
      .filter((meta): meta is MetaPreview => meta !== null),
  };
}

export function normalizeMetaResponse(input: unknown): MetaResponse {
  const raw = isRecord(input) ? input['meta'] : undefined;
  return { meta: normalizeMeta(raw) };
}

export function normalizeStreamResponse(input: unknown): StreamResponse {
  const streams = isRecord(input) && Array.isArray(input['streams']) ? input['streams'] : [];
  return {
    streams: streams
      .map((stream) => normalizeStream(stream))
      .filter((stream): stream is Stream => stream !== null),
  };
}

export function normalizeSubtitleResponse(input: unknown): SubtitleResponse {
  const subtitles = isRecord(input) && Array.isArray(input['subtitles']) ? input['subtitles'] : [];
  return {
    subtitles: subtitles
      .map((subtitle) => normalizeSubtitle(subtitle))
      .filter((subtitle): subtitle is Subtitle => subtitle !== null),
  };
}

/** Fusiona dos respuestas de meta respetando lo que ya tiene la primera. */
export function mergeMeta(base: MetaDetail | null, extra: MetaDetail | null): MetaDetail | null {
  if (!base) return extra;
  if (!extra) return base;

  const merged: Record<string, unknown> = { ...extra, ...base };
  for (const key of ['poster', 'background', 'logo', 'description', 'imdbRating', 'runtime', 'releaseInfo']) {
    if (!merged[key] && extra[key]) merged[key] = extra[key];
  }

  const genres = new Set<string>([
    ...(Array.isArray(base['genres']) ? (base['genres'] as string[]) : []),
    ...(Array.isArray(extra['genres']) ? (extra['genres'] as string[]) : []),
  ]);
  if (genres.size) merged['genres'] = [...genres];

  const videos = mergeVideos(base['videos'] as Video[] | undefined, extra['videos'] as Video[] | undefined);
  if (videos.length) merged['videos'] = videos;

  const cast = toStringArray(base['cast']) ?? [];
  const extraCast = toStringArray(extra['cast']) ?? [];
  const allCast = [...new Set([...cast, ...extraCast])];
  if (allCast.length) merged['cast'] = allCast;

  return merged as MetaDetail;
}

/** Fusiona listas de episodios sin duplicar por id. */
export function mergeVideos(a?: Video[], b?: Video[]): Video[] {
  if (!a?.length) return b ?? [];
  if (!b?.length) return a;
  const byId = new Map<string, Video>();
  for (const video of [...a, ...b]) {
    const existing = byId.get(video.id);
    byId.set(video.id, existing ? { ...video, ...existing } : video);
  }
  return [...byId.values()];
}
