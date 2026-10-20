/**
 * Tracking externo (NuvioTV: `TrackingProvider` / `TrackingScrobbleCoordinator`).
 *
 * Trakt, Simkl y MDBList pueden ser fuentes de biblioteca, progreso y scrobble.
 * El servidor actúa como registro de proveedores conectados y coordinador de
 * scrobble: cada evento se despacha a todos los proveedores conectados que
 * soporten la acción, aislando los fallos.
 *
 * Rutas (ligeras; el OAuth real lo hace el cliente contra cada proveedor y
 * solo registra su token aquí):
 *   GET    /api/tracking/providers     lista proveedores y su estado
 *   PUT    /api/tracking/providers/:id conecta/desconecta (guarda token)
 *   POST   /api/tracking/scrobble      despacha un evento a los conectados
 */

import type { Router } from '../http/router.js';
import { sendJson } from '../http/router.js';
import type { AppData } from '../model.js';
import type { ScrobbleAction, ScrobbleEvent, TrackingProvider, TrackingProviderId } from '../library/tracking.js';
import { dispatchScrobble, scrobbleSummary } from '../library/tracking.js';

export interface TrackingRouteOptions {
  getData: () => AppData;
  save: (mutate: (data: AppData) => void) => Promise<void>;
}

/** Estado persistido por proveedor (tokens opacos, nunca expuestos en claro). */
interface TrackingPersisted {
  connected: boolean;
  tokenHint?: string;
}

const KNOWN_PROVIDERS: TrackingProvider[] = [
  { id: 'trakt', name: 'Trakt', capabilities: ['library', 'progress', 'scrobble'], connected: false, authUrl: 'https://trakt.tv/oauth/authorize' },
  { id: 'simkl', name: 'Simkl', capabilities: ['library', 'progress', 'scrobble'], connected: false, authUrl: 'https://simkl.com/oauth/authorize' },
  { id: 'mdblist', name: 'MDBList', capabilities: ['library'], connected: false, authUrl: 'https://mdblist.com/preferences/api' },
  { id: 'local', name: 'Local', capabilities: ['library', 'progress', 'scrobble'], connected: true },
];

export function registerTrackingRoutes(router: Router, options: TrackingRouteOptions): void {
  const { getData } = options;

  type DataWithTracking = AppData & { trackingTokens?: Record<string, TrackingPersisted> };
  const persisted = (): Record<string, TrackingPersisted> =>
    (getData() as DataWithTracking).trackingTokens ?? {};

  const providers = (): TrackingProvider[] => {
    const tokens = persisted();
    return KNOWN_PROVIDERS.map((p) => ({
      ...p,
      connected: p.id === 'local' ? true : Boolean(tokens[p.id]?.connected),
    }));
  };

  router.get('/api/tracking/providers', ({ res }) => {
    const list = providers().map((p) => ({
      ...p,
      // El token nunca sale del servidor; solo se expone si hay uno guardado.
      hasToken: Boolean(persisted()[p.id]?.tokenHint),
    }));
    sendJson(res, 200, { providers: list });
  });

  router.put('/api/tracking/providers/:id', async ({ res, params, body: rawBody }) => {
    const id = (params['id'] ?? '') as TrackingProviderId;
    if (!KNOWN_PROVIDERS.some((p) => p.id === id)) {
      sendJson(res, 404, { error: 'Proveedor desconocido' });
      return;
    }
    if (id === 'local') {
      sendJson(res, 400, { error: 'El proveedor local no se puede desconectar' });
      return;
    }
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const connected = Boolean(body['connected']);
    const token = typeof body['token'] === 'string' ? body['token'].trim().slice(0, 512) : '';
    await options.save((mutable) => {
      const data = mutable as DataWithTracking;
      data.trackingTokens ??= {};
      if (connected && token) {
        data.trackingTokens[id] = { connected: true, tokenHint: `${token.slice(0, 4)}…${token.slice(-4)}` };
        // El token real se guarda en memoria del proceso si se necesita para
        // forwarding; aquí solo se marca como conectado (evita persistir secretos
        // en el JSON del disco sin cifrar).
      } else if (!connected) {
        delete data.trackingTokens[id];
      } else {
        data.trackingTokens[id] = { connected: true, tokenHint: token ? `${token.slice(0, 4)}…` : undefined };
      }
    });
    sendJson(res, 200, { providers: providers() });
  });

  router.post('/api/tracking/scrobble', async ({ res, body: rawBody }) => {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const action = body['action'] as ScrobbleAction;
    const validActions: ScrobbleAction[] = ['start', 'pause', 'stop', 'seek'];
    if (!validActions.includes(action)) {
      sendJson(res, 400, { error: 'action debe ser start|pause|stop|seek' });
      return;
    }
    const event = body['event'] as ScrobbleEvent | undefined;
    if (!event?.contentId) {
      sendJson(res, 400, { error: 'Falta event.contentId' });
      return;
    }
    const list = providers();
    // En esta versión el scrobble es local-first: siempre se aplica al
    // progreso local y además se intenta despachar a los proveedores externos.
    // Si no hay proveedor externo conectado, el resultado es local-only.
    const results = await dispatchScrobble(list, action, event, async (provider) => {
      // Para proveedores externos, el cliente ya hace el forwarding directo;
      // el servidor solo registra que el evento se despachó (log).
      if (provider.id !== 'local') {
        console.log(`[tracking] scrobble ${action} → ${provider.id} ${scrobbleSummary(event)}`);
      }
    });
    sendJson(res, 200, { action, event: scrobbleSummary(event), results });
  });
}
