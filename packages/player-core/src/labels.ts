/**
 * Etiquetas de la interfaz del reproductor.
 *
 * Los selectores de stream, audio y subtitulos (redisenados por WuPlay en
 * v0.9.2) muestran informacion corta y consistente: calidad, codec, HDR,
 * idioma y si la pista es la predeterminada. Los addons no siguen ningun
 * estandar aqui, asi que la etiqueta se construye con los datos disponibles.
 */

import { isHdrLevel, type ClientLevel } from './abr.js';
import type { StreamLike } from './binge.js';

/** Nombre nativo de los idiomas que aparecen en las pistas de los addons. */
export const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'العربية', be: 'Беларуская', bg: 'Български', bn: 'বাংলা', ca: 'Català',
  cs: 'Čeština', da: 'Dansk', de: 'Deutsch', el: 'Ελληνικά', en: 'English',
  eo: 'Esperanto', es: 'Español', et: 'Eesti', eu: 'Euskara', fa: 'فارسی',
  fi: 'Suomi', fr: 'Français', gl: 'Galego', he: 'עברית', hi: 'हिन्दी',
  hr: 'Hrvatski', hu: 'Magyar', id: 'Bahasa Indonesia', it: 'Italiano',
  ja: '日本語', ko: '한국어', lt: 'Lietuvių', lv: 'Latviešu', mk: 'Македонски',
  ml: 'മലയാളം', mr: 'मराठी', ms: 'Bahasa Melayu', my: 'ဗမာစာ', nb: 'Norsk bokmål',
  ne: 'नेपाली', nl: 'Nederlands', nn: 'Norsk nynorsk', no: 'Norsk', pa: 'ਪੰਜਾਬੀ',
  pl: 'Polski', pt: 'Português', ro: 'Română', ru: 'Русский', sk: 'Slovenčina',
  sl: 'Slovenščina', sq: 'Shqip', sr: 'Српски', sv: 'Svenska', ta: 'தமிழ்',
  te: 'తెలుగు', th: 'ไทย', tr: 'Türkçe', uk: 'Українська', ur: 'اردو',
  vi: 'Tiếng Việt', zh: '中文',
};

/** Aliases ISO 639-2/B y codigos raros → ISO 639-1. */
const LANGUAGE_ALIASES: Record<string, string> = {
  spa: 'es', esp: 'es', esn: 'es', es419: 'es',
  eng: 'en', enu: 'en', enus: 'en', engb: 'en',
  fre: 'fr', fra: 'fr',
  ger: 'de', deu: 'de',
  por: 'pt', ptb: 'pt', pto: 'pt',
  ita: 'it', jpn: 'ja', kor: 'ko',
  chi: 'zh', zho: 'zh', mandarin: 'zh',
  ara: 'ar', rus: 'ru', hin: 'hi', tur: 'tr',
  pol: 'pl', nld: 'nl', dut: 'nl', swe: 'sv', nor: 'no', nob: 'nb',
  dan: 'da', fin: 'fi', ell: 'el', gre: 'el', heb: 'he',
  ces: 'cs', cze: 'cs', hun: 'hu', ron: 'ro', rum: 'ro',
  bul: 'bg', ukr: 'uk', tha: 'th', vie: 'vi', ind: 'id',
};

/** Normaliza un codigo de idioma a ISO 639-1. */
export function languageCode(language?: string | null): string {
  const raw = (language ?? '').trim().toLowerCase().replace('_', '-');
  if (!raw) return '';
  const primary = raw.split('-')[0] ?? '';
  return LANGUAGE_ALIASES[raw.replace(/-/g, '')] ?? LANGUAGE_ALIASES[primary] ?? primary;
}

/** Nombre nativo del idioma (o el codigo si no se conoce). */
export function languageName(language?: string | null): string {
  const code = languageCode(language);
  return LANGUAGE_NAMES[code] ?? (code ? code.toUpperCase() : '');
}

/**
 * Ordena las pistas de subtitulos como WuPlay v0.8.0: primero el idioma
 * preferido del perfil, despues el idioma de la interfaz y el resto en orden
 * alfabetico (estable dentro de cada grupo, sin perder la posicion original
 * de las pistas que empatan).
 */
export function sortSubtitleTracks<T extends { lang?: string | null; label?: string }>(
  tracks: T[],
  preferred?: string | null,
  appLanguage?: string | null,
): T[] {
  const preferredCode = languageCode(preferred);
  const appCode = languageCode(appLanguage);
  const rank = (track: T): number => {
    const code = languageCode(track.lang);
    if (code && code === preferredCode) return 0;
    if (code && code === appCode) return 1;
    return 2;
  };
  return tracks
    .map((track, index) => ({ track, index }))
    .sort(
      (a, b) =>
        rank(a.track) - rank(b.track) ||
        (a.track.label ?? '').localeCompare(b.track.label ?? '', undefined, { sensitivity: 'base' }) ||
        a.index - b.index,
    )
    .map((entry) => entry.track);
}

/** Pista de audio o subtitulos tal y como la publica hls.js o el addon. */
export interface TrackLike {
  name?: string;
  lang?: string;
  language?: string;
  default?: boolean;
  isDefault?: boolean;
  channels?: string;
  groupId?: string;
}

/** Compara nombres de idioma sin acentos ni mayusculas. */
function foldDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Etiqueta de una pista: «Español (es)», «English 5.1». */
export function subtitleTrackLabel(track: TrackLike, index?: number): string {
  const code = languageCode(track.lang ?? track.language);
  const name = track.name?.trim() || (code ? LANGUAGE_NAMES[code] ?? code.toUpperCase() : '');
  const channels = audioChannelLabel(track.channels);
  const suffix = channels && channels !== 'Estéreo' ? ` ${channels}` : '';

  if (!name) return index === undefined ? 'Desconocido' : `Pista ${index + 1}`;
  // Se anade el codigo solo cuando el nombre no es ya el del idioma: «English»
  // no necesita «(en)», pero «Original» si («Original (es)»).
  const native = foldDiacritics(LANGUAGE_NAMES[code] ?? '');
  if (code && native !== foldDiacritics(name)) return `${name}${suffix} (${code})`;
  return `${name}${suffix}`;
}

/** true si la pista es la predeterminada del playlist. */
export function isDefaultTrack(track: TrackLike): boolean {
  return Boolean(track.default ?? track.isDefault);
}

/** Ancho de banda de audio declarado («6 canales», «stereo»). */
export function audioChannelLabel(channels?: string): string {
  const value = (channels ?? '').replace(/"/g, '').trim();
  if (!value) return '';
  const count = Number(value);
  if (Number.isFinite(count) && count > 0) {
    if (count >= 8) return '7.1';
    if (count >= 6) return '5.1';
    if (count === 2) return 'Estéreo';
    if (count === 1) return 'Mono';
    return `${count} canales`;
  }
  return value;
}

/** Codec de video legible a partir de los codecs declarados. */
export function videoCodecLabel(level?: ClientLevel | null): string {
  const codecs = (level?.codecs ?? []).join(' ').toLowerCase();
  if (codecs.includes('av01') || codecs.includes('av1')) return 'AV1';
  if (codecs.includes('hvc1') || codecs.includes('hev1') || codecs.includes('hevc')) return 'HEVC';
  if (codecs.includes('vp09') || codecs.includes('vp9')) return 'VP9';
  if (codecs.includes('avc1') || codecs.includes('avc3')) return 'H.264';
  if (codecs.includes('dvh1') || codecs.includes('dvhe')) return 'Dolby Vision';
  return '';
}

/**
 * Etiqueta de un stream para el selector.
 *
 * El servidor ya envia el titulo publico (sin nombres de proveedor), asi que
 * aqui se anade solo lo tecnico: calidad, codec, HDR y tipo de fuente.
 */
export function streamLabelFor(stream: StreamLike, level?: ClientLevel | null): string {
  const parts: string[] = [];
  const text = [stream.name, stream.title, stream.description].filter(Boolean).join(' ');

  const heightMatch = /\b(2160p|1440p|1080p|720p|576p|480p|360p|4k|uhd)\b/i.exec(text);
  if (heightMatch) {
    const raw = (heightMatch[1] ?? '').toLowerCase();
    parts.push(raw === '4k' || raw === 'uhd' || raw === '2160p' ? '4K' : raw);
  } else if (level?.height) {
    parts.push(`${level.height}p`);
  }

  if (/\b(hdr10\+|hdr10|hdr|dolby vision|dovi|hlg)\b/i.test(text) || isHdrLevel(level ?? {})) {
    parts.push(/\bdolby vision|dovi\b/i.test(text) ? 'Dolby Vision' : 'HDR');
  }

  if (/\b(atmos|truehd|dts-hd|dts|ac3|eac3|dd\+?5\.1|7\.1|5\.1)\b/i.test(text)) {
    const audio = /\batmos\b/i.test(text)
      ? 'Atmos'
      : /\b7\.1\b/.test(text)
        ? '7.1'
        : /\b(5\.1|dd\+?|ac3|eac3|dts)\b/i.test(text)
          ? '5.1'
          : '';
    if (audio) parts.push(audio);
  }

  const codec = /\b(hevc|x265|h\.?265|av1|x264|h\.?264|avc|vp9)\b/i.exec(text);
  if (codec) {
    const value = codec[1]?.toLowerCase() ?? '';
    if (value.includes('hevc') || value.includes('265')) parts.push('HEVC');
    else if (value.includes('av1')) parts.push('AV1');
    else if (value.includes('vp9')) parts.push('VP9');
    else if (value.includes('264') || value.includes('avc')) parts.push('H.264');
  } else {
    const fromLevel = videoCodecLabel(level);
    if (fromLevel && !parts.includes(fromLevel)) parts.push(fromLevel);
  }

  if (stream.infoHash && !stream.url) parts.push('Torrent');
  if (stream.externalUrl && !stream.url) parts.push('Externo');
  if (stream.ytId) parts.push('YouTube');

  const unique = [...new Set(parts)];
  return unique.length ? unique.join(' · ') : stream.name ?? stream.title ?? 'Stream';
}
