/**
 * Provider URL overrides (StreamFlix: UserPreferences.getProviderCache +
 * ProviderPortalUrl / ProviderConfigUrl with Mutex).
 *
 * StreamFlix lets each provider's portalUrl/baseUrl be overridden at runtime
 * to handle mirrors without redeploy. Master-HLS stores overrides in
 * AppData.providerUrls and providers read via ScrapeContext.providerUrls.
 */

export interface ProviderUrls {
  portalUrl?: string;
  baseUrl?: string;
}

export type ProviderUrlMap = Record<string, ProviderUrls>;

export function resolveProviderUrls(
  providerId: string,
  defaults: { portalUrl?: string; baseUrl: string },
  overrides?: ProviderUrlMap,
): { portalUrl: string; baseUrl: string } {
  const ov = overrides?.[providerId];
  if (!ov) return { portalUrl: defaults.portalUrl ?? defaults.baseUrl, baseUrl: defaults.baseUrl };
  return {
    portalUrl: ov.portalUrl?.trim() || defaults.portalUrl || defaults.baseUrl,
    baseUrl: ov.baseUrl?.trim() || defaults.baseUrl,
  };
}

export function sanitizeProviderUrlEntry(input: unknown): { portalUrl?: string; baseUrl?: string } | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const out: ProviderUrls = {};
  if (typeof obj['portalUrl'] === 'string' && obj['portalUrl'].trim()) {
    try { const u = new URL(obj['portalUrl'].trim()); if (u.protocol === 'http:' || u.protocol === 'https:') out.portalUrl = u.toString(); else return null; } catch { return null; }
  }
  if (typeof obj['baseUrl'] === 'string' && obj['baseUrl'].trim()) {
    try { const u = new URL(obj['baseUrl'].trim()); if (u.protocol === 'http:' || u.protocol === 'https:') out.baseUrl = u.toString(); else return null; } catch { return null; }
  }
  if (!out.portalUrl && !out.baseUrl) return null;
  return out;
}
