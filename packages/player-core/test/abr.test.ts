import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  capLevelIndex,
  formatBitrate,
  isHdrLevel,
  matchLevelIndex,
  planStartup,
  qualityLabel,
  HLS_DEFAULT_ABR_ESTIMATE,
  type ClientLevel,
} from '../src/abr.js';
import { planBuffer, bytesPerSecond, isBufferStarved } from '../src/buffer.js';

const LEVELS: ClientLevel[] = [
  { uri: 'https://cdn/360.m3u8', bitrate: 800_000, height: 360, codecs: ['avc1.4d401e'] },
  { uri: 'https://cdn/720.m3u8', bitrate: 2_500_000, height: 720, codecs: ['avc1.640028'] },
  { uri: 'https://cdn/1080.m3u8', bitrate: 6_000_000, height: 1080, codecs: ['avc1.640028'] },
  { uri: 'https://cdn/2160.m3u8', bitrate: 22_000_000, height: 2160, codecs: ['hvc1.2.4.L153.B0'], videoRange: 'PQ' },
];

describe('capLevelIndex', () => {
  it('limita por la altura del dispositivo', () => {
    assert.equal(capLevelIndex(LEVELS, { maxHeight: 1080 }), 2);
    assert.equal(capLevelIndex(LEVELS, { maxHeight: 720 }), 1);
  });

  it('descarta HDR cuando el dispositivo no lo soporta', () => {
    assert.equal(capLevelIndex(LEVELS, { maxHeight: 2160, supportsHdr: false }), 2);
    assert.equal(capLevelIndex(LEVELS, { maxHeight: 2160, supportsHdr: true }), 3);
  });

  it('limita por el ancho de banda maximo', () => {
    assert.equal(capLevelIndex(LEVELS, { maxBandwidthMbps: 8 }), 2);
    assert.equal(capLevelIndex(LEVELS, { maxBandwidthMbps: 2 }), 0);
  });

  it('limita por el tamano real del elemento de video', () => {
    assert.equal(capLevelIndex(LEVELS, { maxHeight: 2160, playerHeight: 720 }), 1);
  });

  it('devuelve -1 cuando ningun nivel queda limitado', () => {
    assert.equal(capLevelIndex(LEVELS, {}), -1);
  });

  it('no se queda sin niveles si todo excede los limites', () => {
    assert.equal(capLevelIndex(LEVELS, { maxHeight: 144 }), 0);
  });
});

describe('matchLevelIndex', () => {
  it('encuentra el nivel por URI exacta', () => {
    assert.equal(matchLevelIndex(LEVELS, { uri: 'https://cdn/1080.m3u8', height: 1080 }), 2);
  });

  it('ignora la query (tokens rotatorios del CDN)', () => {
    assert.equal(matchLevelIndex(LEVELS, { uri: 'https://cdn/720.m3u8?token=abc' }), 1);
  });

  it('encuentra el nivel por altura y bitrate cuando la URI cambia (proxy)', () => {
    assert.equal(
      matchLevelIndex(LEVELS, { uri: 'https://proxy.local/hls/proxy?url=x', height: 1080, bandwidth: 6_100_000 }),
      2,
    );
  });

  it('devuelve -1 sin variante', () => {
    assert.equal(matchLevelIndex(LEVELS, null), -1);
    assert.equal(matchLevelIndex([], { uri: 'x' }), -1);
  });
});

describe('planStartup', () => {
  it('arranca en la variante elegida por el servidor, no en la mas alta', () => {
    const plan = planStartup({
      levels: LEVELS,
      variant: { uri: 'https://cdn/1080.m3u8', height: 1080, bandwidth: 6_000_000 },
    });
    assert.equal(plan.startLevel, 2);
    assert.equal(plan.autoLevel, true);
    // La semilla del ABR viene del bitrate de la variante, no de 500 kbps.
    assert.ok(plan.abrEwmaDefaultEstimate > 6_000_000);
    assert.ok(plan.reason.includes('servidor'));
  });

  it('sin variante del servidor arranca en el techo del dispositivo', () => {
    const plan = planStartup({ levels: LEVELS, capabilities: { maxHeight: 720 } });
    assert.equal(plan.startLevel, 1);
    assert.equal(plan.capLevel, 1);
  });

  it('respeta el techo de bitrate del usuario (ajuste «max bitrate» de WuPlay)', () => {
    const plan = planStartup({
      levels: LEVELS,
      variant: { uri: 'https://cdn/2160.m3u8', height: 2160, bandwidth: 22_000_000 },
      maxBitrateMbps: 8,
    });
    assert.equal(plan.startLevel, 2);
    assert.equal(plan.capLevel, 2);
    assert.equal(plan.maxBitrate, 8_000_000);
    assert.ok(plan.abrEwmaDefaultEstimate <= 8_000_000);
  });

  it('la calidad fijada manualmente desactiva el ABR', () => {
    const plan = planStartup({ levels: LEVELS, pinnedLevel: 1 });
    assert.equal(plan.startLevel, 1);
    assert.equal(plan.capLevel, 1);
    assert.equal(plan.autoLevel, false);
  });

  it('no siembra por debajo del minimo razonable', () => {
    const small: ClientLevel[] = [{ uri: 'a', bitrate: 120_000, height: 240 }];
    const plan = planStartup({ levels: small });
    assert.equal(plan.abrEwmaDefaultEstimate, HLS_DEFAULT_ABR_ESTIMATE);
  });

  it('sin niveles devuelve un plan neutro', () => {
    const plan = planStartup({ levels: [] });
    assert.equal(plan.startLevel, -1);
    assert.equal(plan.capLevel, -1);
  });
});

describe('etiquetas de calidad', () => {
  it('marca 4K HDR cuando el nivel lo declara', () => {
    assert.equal(qualityLabel(LEVELS[3]), '4K HDR');
    assert.equal(qualityLabel(LEVELS[2]), '1080p');
    assert.equal(qualityLabel({ bitrate: 2_500_000 }), '2.5 Mbps');
  });

  it('formatea bitrates', () => {
    assert.equal(formatBitrate(0), '0 Mbps');
    assert.equal(formatBitrate(900_000), '0.9 Mbps');
    assert.equal(formatBitrate(22_000_000), '22 Mbps');
  });

  it('detecta HDR por rango y por codec Dolby Vision', () => {
    assert.equal(isHdrLevel({ videoRange: 'HLG' }), true);
    assert.equal(isHdrLevel({ codecs: ['dvh1.05.01'] }), true);
    assert.equal(isHdrLevel({ codecs: ['avc1.640028'] }), false);
  });
});

describe('planBuffer', () => {
  it('reduce el buffer en dispositivos justos', () => {
    const low = planBuffer({ device: { deviceMemory: 1, hardwareConcurrency: 2 }, bitrate: 6_000_000 });
    const high = planBuffer({ device: { deviceMemory: 8, hardwareConcurrency: 8 }, bitrate: 6_000_000 });
    assert.ok(low.maxBufferLength <= high.maxBufferLength);
    assert.ok(low.backBufferLength < high.backBufferLength);
    assert.ok(low.maxBufferSize <= 96 * 1024 * 1024);
  });

  it('limita el buffer en bytes cuando el bitrate es enorme', () => {
    const plan = planBuffer({ device: { deviceMemory: 2 }, bitrate: 80_000_000 });
    assert.ok(plan.maxBufferLength < 25);
    assert.ok(plan.reason.includes('presupuesto'));
  });

  it('usa buffer corto en directo', () => {
    const plan = planBuffer({ live: true });
    assert.ok(plan.maxBufferLength <= 12);
    assert.ok(plan.reason.includes('directo'));
  });

  it('respeta la preferencia del usuario', () => {
    const plan = planBuffer({ preferredSeconds: 90 });
    assert.equal(plan.maxBufferLength, 90);
  });

  it('convierte bitrate a bytes por segundo y detecta buffer hambriento', () => {
    assert.equal(bytesPerSecond(8_000_000), 1_000_000);
    assert.equal(isBufferStarved(1.5, { maxBufferLength: 30 }), true);
    assert.equal(isBufferStarved(12, { maxBufferLength: 30 }), false);
  });
});
