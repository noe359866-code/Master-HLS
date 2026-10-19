import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseStreamQuality, sortStreamsByQuality, streamDedupeKey } from '../src/streamQuality.js';

describe('parseStreamQuality', () => {
  it('detecta la resolucion', () => {
    assert.equal(parseStreamQuality('Torrentio 1080p').height, 1080);
    assert.equal(parseStreamQuality('Torrentio 4K HDR').height, 2160);
    assert.equal(parseStreamQuality('Torrentio 720p').height, 720);
    assert.equal(parseStreamQuality('sin calidad').height, 0);
  });

  it('detecta el codec', () => {
    assert.equal(parseStreamQuality('x265 1080p').codec, 'hevc');
    assert.equal(parseStreamQuality('AV1 1080p').codec, 'av1');
    assert.equal(parseStreamQuality('x264 1080p').codec, 'h264');
  });

  it('detecta HDR, Dolby Vision y audio multicanal', () => {
    const dv = parseStreamQuality('1080p Dolby Vision');
    assert.equal(dv.dolbyVision, true);
    assert.equal(dv.hdr, true);

    const atmos = parseStreamQuality('1080p Atmos 5.1');
    assert.equal(atmos.atmos, true);
  });

  it('detecta streams cacheados de debrid', () => {
    assert.equal(parseStreamQuality('RealDebrid 1080p cached').cached, true);
  });
});

describe('sortStreamsByQuality', () => {
  it('ordena de mejor a peor', () => {
    const sorted = sortStreamsByQuality([
      { name: '720p' },
      { name: '2160p Dolby Vision' },
      { name: '1080p' },
    ]);
    assert.match(sorted[0]?.name ?? '', /2160p/);
    assert.match(sorted[2]?.name ?? '', /720p/);
  });

  it('es estable en empates', () => {
    const sorted = sortStreamsByQuality([{ name: '1080p A' }, { name: '1080p B' }]);
    assert.match(sorted[0]?.name ?? '', /A/);
  });
});

describe('streamDedupeKey', () => {
  it('prioriza la url', () => {
    assert.equal(streamDedupeKey({ url: 'https://x', name: 'n' }), 'url:https://x');
  });

  it('usa externalUrl y ytId como alternativa', () => {
    assert.equal(streamDedupeKey({ externalUrl: 'https://x' }), 'ext:https://x');
    assert.equal(streamDedupeKey({ ytId: 'abc' }), 'yt:abc');
  });
});
