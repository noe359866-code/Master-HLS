/**
 * Proveedores de tracking (NuvioTV: `TrackingProvider` / `TrackingScrobbleCoordinator`).
 *
 * NuvioTV sincroniza biblioteca y progreso con Trakt, Simkl y MDBList a través
 * de puertos abstractos (`TrackingProvider`, `TrackingLibraryProvider`,
 * `TrackingProgressProvider`, `TrackingScrobbleCoordinator`). Cada proveedor
 * puede leer/escribir en su destino y los cambios se fusionan en el servidor.
 *
 * Aquí se replica el diseño con un registro genérico: cada proveedor declara
 * qué puede hacer (biblioteca, progreso, scrobble) y el coordinador despacha
 * los cambios a todos los proveedores conectados, aislando los fallos.
 */

export type TrackingProviderId = 'trakt' | 'simkl' | 'mdblist' | 'local';

export type TrackingCapability = 'library' | 'progress' | 'scrobble';

export interface TrackingProvider {
  id: TrackingProviderId;
  name: string;
  capabilities: TrackingCapability[];
  /** true si el usuario ha conectado su cuenta. */
  connected: boolean;
  /** URL de autorización (si no está conectado). */
  authUrl?: string;
}

export type ScrobbleAction = 'start' | 'pause' | 'stop' | 'seek';

export interface ScrobbleEvent {
  contentId: string;
  contentType: 'movie' | 'series';
  videoId?: string;
  season?: number;
  episode?: number;
  position: number;
  duration: number;
  progressPercent: number;
}

export interface ScrobbleResult {
  providerId: TrackingProviderId;
  ok: boolean;
  error?: string;
}

/**
 * Despacha un evento de scrobble a todos los proveedores conectados que
 * soporten `scrobble`. Aísla los fallos: un proveedor que falle no afecta a
 * los demás (NuvioTV: `TrackingScrobbleCoordinator.dispatch`).
 */
export async function dispatchScrobble(
  providers: TrackingProvider[],
  action: ScrobbleAction,
  event: ScrobbleEvent,
  handler: (provider: TrackingProvider, action: ScrobbleAction, event: ScrobbleEvent) => Promise<void>,
): Promise<ScrobbleResult[]> {
  const scrobblers = providers.filter((p) => p.connected && p.capabilities.includes('scrobble'));
  const results = await Promise.allSettled(
    scrobblers.map(async (provider) => {
      await handler(provider, action, event);
      return { providerId: provider.id, ok: true } as ScrobbleResult;
    }),
  );
  return results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const provider = scrobblers[index]!;
    return {
      providerId: provider.id,
      ok: false,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

/** Resumen de diagnóstico (como NuvioTV `scrobbleDiagnosticSummary`). */
export function scrobbleSummary(event: ScrobbleEvent): string {
  const pct = Math.round(event.progressPercent * 100);
  const ep = event.season !== undefined ? `S${event.season}E${event.episode}` : '';
  return `${event.contentId}${ep ? ` ${ep}` : ''} ${pct}% (${event.position}/${event.duration}s)`;
}
