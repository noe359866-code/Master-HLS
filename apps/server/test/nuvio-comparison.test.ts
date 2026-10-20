/**
 * Tests para las mejoras inspiradas en NuvioTV.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeTrackPreferencePatch } from '../src/library/track-prefs.js';
import { badgesForStream, deriveAutoBadges, normalizeStreamBadgeConfig, sanitizeStreamBadgeImport } from '../src/library/stream-badges.js';
import { COLLECTION_PRESETS, sanitizeCollection } from '../src/library/collections.js';
import {
  isSettingsSectionVisible,
  isPlayerControlVisible,
  resolveExperienceMode,
  visiblePlayerControls,
  visibleSettingsSections,
} from '../src/library/visibility-policy.js';
import {
  isPartyExpired,
  PARTY_TTL_MS,
  pruneStaleMembers,
  sanitizePartyCreate,
  sanitizePartyUpdate,
} from '../src/library/party.js';
import { dispatchScrobble } from '../src/library/tracking.js';
import { isCompleted, isInProgress, mergeProgress, nextUp } from '../src/library/continue-watching.js';

// ────────────────────────────────────── audio delay (NuvioTV: AudioDelayRouteDataStore)

describe('audioDelay in track prefs (NuvioTV parity)', () => {
  it('acepta audioDelayMs dentro del rango ±60s', () => {
    const patch = sanitizeTrackPreferencePatch({ audioDelayMs: 1500 });
    assert.equal(patch.audioDelayMs, 1500);
  });

  it('recorta audioDelayMs fuera de rango', () => {
    const patch = sanitizeTrackPreferencePatch({ audioDelayMs: 999_000 });
    assert.equal(patch.audioDelayMs, 60_000);
  });

  it('rechaza audioDelayMs no numerico', () => {
    const patch = sanitizeTrackPreferencePatch({ audioDelayMs: 'hola' });
    assert.equal(patch.audioDelayMs, undefined);
  });

  it('tolera audioDelayMs negativo', () => {
    const patch = sanitizeTrackPreferencePatch({ audioDelayMs: -5000 });
    assert.equal(patch.audioDelayMs, -5000);
  });
});

// ────────────────────────────────────── stream badges (NuvioTV: StreamBadgeRules)

describe('stream badges', () => {
  it('detecta HDR automaticamente', () => {
    const badges = deriveAutoBadges('Movie HDR 2160p HEVC');
    assert.ok(badges.some((b) => b.kind === 'hdr'));
    assert.ok(badges.some((b) => b.kind === 'uhd'));
    assert.ok(badges.some((b) => b.kind === 'hevc'));
  });

  it('no da falsos positivos con texto normal', () => {
    const badges = deriveAutoBadges('The Office S01E01');
    assert.equal(badges.length, 0);
  });

  it('aplica reglas personalizadas', () => {
    const config = normalizeStreamBadgeConfig({
      imports: [
        {
          sourceUrl: 'https://example.com/badges.json',
          isActive: true,
          groups: [],
          filters: [
            { id: '1', name: 'Mi servidor', pattern: 'plex', tagColor: '#fff', imageUrl: '', enabled: true },
          ],
        },
      ],
    });
    const badges = badgesForStream('My Plex Server 1080p', config);
    assert.ok(badges.some((b) => b.label === 'Mi servidor'));
  });

  it('ignora reglas desactivadas', () => {
    const config = normalizeStreamBadgeConfig({
      imports: [
        {
          sourceUrl: 'https://example.com/b.json',
          isActive: true,
          groups: [],
          filters: [
            { id: '1', name: 'X', pattern: 'plex', tagColor: '', imageUrl: '', enabled: false },
          ],
        },
      ],
    });
    const badges = badgesForStream('plex movie', config);
    assert.ok(!badges.some((b) => b.label === 'X'));
  });

  it('limita a 3 imports', () => {
    const config = normalizeStreamBadgeConfig({
      imports: [
        { sourceUrl: 'https://a.com/1', isActive: true, groups: [], filters: [{ id: '1', name: 'A', pattern: 'a', enabled: true }] },
        { sourceUrl: 'https://a.com/2', isActive: false, groups: [], filters: [{ id: '2', name: 'B', pattern: 'b', enabled: true }] },
        { sourceUrl: 'https://a.com/3', isActive: false, groups: [], filters: [{ id: '3', name: 'C', pattern: 'c', enabled: true }] },
        { sourceUrl: 'https://a.com/4', isActive: false, groups: [], filters: [{ id: '4', name: 'D', pattern: 'd', enabled: true }] },
      ],
    });
    assert.equal(config.imports.length, 3);
  });

  it('sanitize rechaza URL invalida', () => {
    assert.equal(sanitizeStreamBadgeImport({ sourceUrl: 'not-a-url' }), null);
    assert.equal(sanitizeStreamBadgeImport({ sourceUrl: '' }), null);
  });
});

// ────────────────────────────────────── collections (NuvioTV: Collection)

describe('collections', () => {
  it('ofrece presets curados', () => {
    assert.ok(COLLECTION_PRESETS.length >= 4);
    assert.ok(COLLECTION_PRESETS.some((p) => p.title.includes('Marvel')));
    assert.ok(COLLECTION_PRESETS.some((p) => p.title.includes('Star Wars')));
  });

  it('sanitize rechaza titulo vacio', () => {
    assert.equal(sanitizeCollection({ title: '' }, []), null);
    assert.equal(sanitizeCollection({}, []), null);
  });

  it('crea coleccion valida', () => {
    const c = sanitizeCollection({ title: 'Test', sourceType: 'keyword', sourceId: 'test', mediaType: 'movie' }, []);
    assert.ok(c);
    assert.equal(c!.title, 'Test');
    assert.equal(c!.sourceType, 'keyword');
  });

  it('respeta limite de 64 colecciones', () => {
    const existing = Array.from({ length: 64 }, (_, i) => ({ id: `c${i}` }) as unknown as ReturnType<typeof sanitizeCollection> & { id: string });
    const result = sanitizeCollection({ title: 'Nueva', sourceType: 'keyword', sourceId: 'x', mediaType: 'movie' }, existing as never[]);
    assert.equal(result, null);
  });
});

// ────────────────────────────────────── visibility policy (NuvioTV: essential-mode.md)

describe('visibility policy', () => {
  it('essential oculta secciones avanzadas', () => {
    assert.equal(isSettingsSectionVisible('essential', 'debrid'), false);
    assert.equal(isSettingsSectionVisible('essential', 'scrapers'), false);
    assert.equal(isSettingsSectionVisible('essential', 'plugins'), false);
    assert.equal(isSettingsSectionVisible('advanced', 'debrid'), true);
  });

  it('essential oculta controles avanzados del player', () => {
    assert.equal(isPlayerControlVisible('essential', 'engineSwitch'), false);
    assert.equal(isPlayerControlVisible('essential', 'speed'), false);
    assert.equal(isPlayerControlVisible('advanced', 'speed'), true);
  });

  it('essential siempre muestra basicos', () => {
    assert.equal(isSettingsSectionVisible('essential', 'playback'), true);
    assert.equal(isPlayerControlVisible('essential', 'playPause'), true);
  });

  it('lista visibles coincide con conteo esperado', () => {
    assert.ok(visibleSettingsSections('essential').length < visibleSettingsSections('advanced').length);
    assert.ok(visiblePlayerControls('essential').length < visiblePlayerControls('advanced').length);
  });

  it('resuelve modo desconocido como advanced (instalaciones existentes)', () => {
    assert.equal(resolveExperienceMode(undefined), 'advanced');
    assert.equal(resolveExperienceMode('essential'), 'essential');
    assert.equal(resolveExperienceMode('advanced'), 'advanced');
  });
});

// ────────────────────────────────────── party

describe('party rooms', () => {
  it('valida creacion sin contentId', () => {
    assert.equal(sanitizePartyCreate({}), null);
    assert.equal(sanitizePartyCreate({ contentId: '' }), null);
  });

  it('crea sala valida', () => {
    const room = sanitizePartyCreate({ contentId: 'tt0111161', contentName: 'Shawshank' });
    assert.ok(room);
    assert.equal(room!.contentId, 'tt0111161');
  });

  it('detecta expiracion por TTL', () => {
    const now = Date.now();
    const room = { id: '1', hostId: 'h', contentId: 'x', contentType: 'movie', contentName: 'X', state: 'idle' as const, position: 0, updatedAt: now - PARTY_TTL_MS - 1000, members: [], createdAt: now } as ReturnType<typeof sanitizePartyCreate> & { id: string; createdAt: number; updatedAt: number; members: never[] };
    assert.equal(isPartyExpired(room as never, now), true);
  });

  it('poda miembros inactivos', () => {
    const now = Date.now();
    const room = {
      id: '1', hostId: 'h', contentId: 'x', contentType: 'movie', contentName: 'X',
      state: 'playing' as const, position: 0, updatedAt: now, createdAt: now,
      members: [
        { id: 'a', name: 'A', joinedAt: now, lastSeenAt: now },
        { id: 'b', name: 'B', joinedAt: now - 100_000, lastSeenAt: now - 100_000 },
      ],
    };
    const pruned = pruneStaleMembers(room as never, now);
    assert.equal(pruned.members.length, 1);
    assert.equal(pruned.members[0]!.id, 'a');
  });

  it('valida update vacio como null', () => {
    assert.equal(sanitizePartyUpdate({}), null);
  });

  it('update con posicion valida', () => {
    const patch = sanitizePartyUpdate({ position: 120, state: 'playing' });
    assert.ok(patch);
    assert.equal(patch!.position, 120);
    assert.equal(patch!.state, 'playing');
  });
});

// ────────────────────────────────────── tracking scrobble

describe('tracking scrobble', () => {
  it('despacha a proveedores conectados y aísla fallos', async () => {
    const providers = [
      { id: 'trakt' as const, name: 'Trakt', capabilities: ['scrobble' as const], connected: true },
      { id: 'simkl' as const, name: 'Simkl', capabilities: ['scrobble' as const], connected: true },
      { id: 'mdblist' as const, name: 'MDBList', capabilities: ['library' as const], connected: true },
    ];
    const event = { contentId: 'tt0111161', contentType: 'movie' as const, position: 100, duration: 600, progressPercent: 0.16 };
    const results = await dispatchScrobble(providers, 'start', event, async (p) => {
      if (p.id === 'simkl') throw new Error('simkl down');
    });
    assert.equal(results.length, 2); // solo trakt + simkl (mdblist no hace scrobble)
    assert.equal(results.find((r) => r.providerId === 'trakt')!.ok, true);
    assert.equal(results.find((r) => r.providerId === 'simkl')!.ok, false);
  });
});

// ────────────────────────────────────── continue watching

describe('continue watching', () => {
  it('detecta completado al 90%', () => {
    assert.equal(isCompleted({ position: 90, duration: 100 }), true);
    assert.equal(isCompleted({ position: 89, duration: 100 }), false);
  });

  it('detecta en progreso', () => {
    assert.equal(isInProgress({ position: 5, duration: 100 }), true);
    assert.equal(isInProgress({ position: 0, duration: 100 }), false);
    assert.equal(isInProgress({ position: 95, duration: 100 }), false);
  });

  it('nextUp devuelve el siguiente episodio cuando el actual esta completado', () => {
    const eps = [
      { id: 'e1', season: 1, episode: 1 },
      { id: 'e2', season: 1, episode: 2 },
      { id: 'e3', season: 1, episode: 3 },
    ];
    const result = nextUp(eps, 1, 1, true);
    assert.equal(result.nextEpisode?.id, 'e2');
    assert.equal(result.isCurrentCompleted, true);
  });

  it('nextUp devuelve el actual si no esta completado', () => {
    const eps = [
      { id: 'e1', season: 1, episode: 1 },
      { id: 'e2', season: 1, episode: 2 },
    ];
    const result = nextUp(eps, 1, 1, false);
    assert.equal(result.nextEpisode?.id, 'e1');
    assert.equal(result.isCurrentCompleted, false);
  });

  it('mergeProgress prioriza proveedor y conserva locales no duplicados', () => {
    const provider = [{ id: 'tt1', type: 'movie', name: 'A', position: 10, duration: 100, mediaType: 'movie' as const, updatedAt: 2, poster: '' }];
    const local = [
      { id: 'tt2', type: 'movie', name: 'B', position: 20, duration: 100, mediaType: 'movie' as const, updatedAt: 1, poster: '' },
      { id: 'tt1', type: 'movie', name: 'A dup', position: 5, duration: 100, mediaType: 'movie' as const, updatedAt: 1, poster: '' },
    ];
    const merged = mergeProgress(provider as never[], local as never[]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0]!.id, 'tt1');
    assert.equal(merged[1]!.id, 'tt2');
  });
});
