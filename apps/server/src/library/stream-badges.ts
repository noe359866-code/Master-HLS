/**
 * Etiquetas de calidad en los streams (NuvioTV: `StreamBadgeRules`).
 *
 * NuvioTV clasifica cada fuente con badges (HDR, Dolby Vision, 4K, HEVC…)
 * usando reglas de regex configurables que el usuario puede importar. Los
 * badges se muestran como chips en la lista de streams y se usan para
 * filtrar y ordenar.
 *
 * Aquí se replica la idea con un enfoque minimalista: cada stream ya trae
 * campos de calidad (resolución, códec), y el servidor añade badges
 * derivados de esos metadatos más las reglas personalizadas del usuario.
 */

export type StreamBadgeKind =
  | 'hdr'
  | 'dolby-vision'
  | 'dolby-atmos'
  | 'uhd'
  | 'fhd'
  | 'hd'
  | 'hevc'
  | 'av1'
  | 'remux'
  | 'bluray'
  | 'webdl'
  | 'custom';

export interface StreamBadge {
  /** Identificador estable. */
  id: string;
  /** Etiqueta visible. */
  label: string;
  /** Tipo semántico. */
  kind: StreamBadgeKind;
  /** Color opcional (CSS). */
  color?: string;
  /** Icono opcional. */
  icon?: string;
}

/** Regla personalizada del usuario (NuvioTV: `StreamBadgeFilter`). */
export interface StreamBadgeRule {
  id: string;
  /** Nombre visible (ej. «Mi servidor Plex»). */
  name: string;
  /** Patrón regex aplicado a `name + title + behaviorHints`. */
  pattern: string;
  /** Color de la etiqueta. */
  tagColor?: string;
  /** URL de la imagen/badge. */
  imageUrl?: string;
  /** Si está desactivada, no se aplica. */
  enabled: boolean;
  /** Grupo al que pertenece. */
  groupId?: string;
}

/** Grupo de reglas (NuvioTV: `StreamBadgeGroup`). */
export interface StreamBadgeGroup {
  id: string;
  name: string;
  color?: string;
}

/** Import de reglas desde una URL (NuvioTV: `StreamBadgeImport`). */
export interface StreamBadgeImport {
  sourceUrl: string;
  filters: StreamBadgeRule[];
  groups: StreamBadgeGroup[];
  isActive: boolean;
}

/** Configuración completa de badges del usuario. */
export interface StreamBadgeConfig {
  imports: StreamBadgeImport[];
}

export const STREAM_BADGE_IMPORT_LIMIT = 3;

/** Normaliza la configuración: quita duplicados, respeta el límite. */
export function normalizeStreamBadgeConfig(config: StreamBadgeConfig): StreamBadgeConfig {
  const seen = new Map<string, StreamBadgeImport>();
  for (const imp of config.imports ?? []) {
    const url = imp.sourceUrl.trim();
    if (!url || !imp.filters?.length) continue;
    const key = url.toLowerCase();
    if (!seen.has(key) && seen.size < STREAM_BADGE_IMPORT_LIMIT) {
      seen.set(key, { ...imp, sourceUrl: url });
    } else if (seen.has(key)) {
      seen.set(key, { ...imp, sourceUrl: url });
    }
  }
  const imports = [...seen.values()];
  if (!imports.length) return { imports: [] };
  const hasActive = imports.some((i) => i.isActive);
  if (!hasActive && imports.length) imports[0]!.isActive = true;
  return { imports };
}

/** Patrones automáticos derivados de los metadatos del stream. */
const AUTO_PATTERNS: Array<{ badge: StreamBadge; test: RegExp }> = [
  { badge: { id: 'hdr', label: 'HDR', kind: 'hdr', color: '#ffb700' }, test: /\bhdr\b/i },
  { badge: { id: 'dv', label: 'DV', kind: 'dolby-vision', color: '#7c3aed' }, test: /dolby.?vision|\bdv\b/i },
  { badge: { id: 'atmos', label: 'Atmos', kind: 'dolby-atmos', color: '#06b6d4' }, test: /dolby.?atmos|\batmos\b/i },
  { badge: { id: 'uhd', label: '4K', kind: 'uhd', color: '#ef4444' }, test: /2160p|3840x2160|\b4k\b|uhd/i },
  { badge: { id: 'fhd', label: '1080p', kind: 'fhd' }, test: /1080p|1920x1080/i },
  { badge: { id: 'hd', label: '720p', kind: 'hd' }, test: /720p|1280x720/i },
  { badge: { id: 'hevc', label: 'HEVC', kind: 'hevc', color: '#22c55e' }, test: /h\.?265|hevc|x265/i },
  { badge: { id: 'av1', label: 'AV1', kind: 'av1', color: '#3b82f6' }, test: /\bav1\b/i },
  { badge: { id: 'remux', label: 'REMUX', kind: 'remux', color: '#f59e0b' }, test: /remux/i },
  { badge: { id: 'bluray', label: 'BluRay', kind: 'bluray' }, test: /blu.?ray|bdrip/i },
  { badge: { id: 'webdl', label: 'WEB-DL', kind: 'webdl' }, test: /web.?dl|webrip/i },
];

/**
 * Deduce badges automáticos de los campos del stream.
 * `haystack` es la concatenación de name + title + behaviorHints.filename.
 */
export function deriveAutoBadges(haystack: string): StreamBadge[] {
  const text = haystack ?? '';
  const badges: StreamBadge[] = [];
  for (const { badge, test } of AUTO_PATTERNS) {
    if (test.test(text)) badges.push(badge);
  }
  return badges;
}

/**
 * Aplica las reglas personalizadas del usuario a un stream.
 * Cada regla que coincide añade un badge `custom`.
 */
export function applyCustomBadgeRules(
  haystack: string,
  config: StreamBadgeConfig,
): StreamBadge[] {
  const active = config.imports?.find((i) => i.isActive);
  if (!active) return [];
  const badges: StreamBadge[] = [];
  for (const rule of active.filters ?? []) {
    if (!rule.enabled || !rule.pattern) continue;
    try {
      const re = new RegExp(rule.pattern, 'i');
      if (re.test(haystack)) {
        badges.push({
          id: rule.id || `custom:${rule.name}`,
          label: rule.name || rule.pattern,
          kind: 'custom',
          color: rule.tagColor,
          icon: rule.imageUrl,
        });
      }
    } catch {
      // patrón inválido → se ignora (no puede romper la lista de streams)
    }
  }
  return badges;
}

/**
 * Lista completa de badges de un stream: automáticos + personalizados,
 * sin duplicados por id.
 */
export function badgesForStream(
  haystack: string,
  config?: StreamBadgeConfig,
): StreamBadge[] {
  const auto = deriveAutoBadges(haystack);
  const custom = config ? applyCustomBadgeRules(haystack, config) : [];
  const seen = new Set<string>();
  const result: StreamBadge[] = [];
  for (const badge of [...auto, ...custom]) {
    if (!seen.has(badge.id)) {
      seen.add(badge.id);
      result.push(badge);
    }
  }
  return result;
}

/** Valida y normaliza un import que llega del cliente. */
export function sanitizeStreamBadgeImport(input: unknown): StreamBadgeImport | null {
  const raw = (input ?? {}) as Record<string, unknown>;
  const sourceUrl = typeof raw['sourceUrl'] === 'string' ? raw['sourceUrl'].trim() : '';
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  } catch {
    return null;
  }
  const filters: StreamBadgeRule[] = Array.isArray(raw['filters'])
    ? raw['filters']
        .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
        .map((f) => ({
          id: typeof f['id'] === 'string' ? f['id'].slice(0, 64) : '',
          name: typeof f['name'] === 'string' ? f['name'].slice(0, 64) : '',
          pattern: typeof f['pattern'] === 'string' ? f['pattern'].slice(0, 256) : '',
          tagColor: typeof f['tagColor'] === 'string' ? f['tagColor'].slice(0, 32) : undefined,
          imageUrl: typeof f['imageUrl'] === 'string' ? f['imageUrl'].slice(0, 512) : undefined,
          enabled: f['isEnabled'] !== false && f['enabled'] !== false,
          groupId: typeof f['groupId'] === 'string' ? f['groupId'].slice(0, 64) : undefined,
        }))
        .filter((f) => f.name || f.pattern)
        .slice(0, 100)
    : [];
  const groups: StreamBadgeGroup[] = Array.isArray(raw['groups'])
    ? raw['groups']
        .filter((g): g is Record<string, unknown> => Boolean(g && typeof g === 'object'))
        .map((g) => ({
          id: typeof g['id'] === 'string' ? g['id'].slice(0, 64) : '',
          name: typeof g['name'] === 'string' ? g['name'].slice(0, 64) : '',
          color: typeof g['color'] === 'string' ? g['color'].slice(0, 32) : undefined,
        }))
        .slice(0, 20)
    : [];
  return {
    sourceUrl,
    filters,
    groups,
    isActive: raw['isActive'] !== false && raw['active'] !== false,
  };
}
