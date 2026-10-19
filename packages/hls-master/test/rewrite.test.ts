import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { rewritePlaylist, buildSingleVariantPlaylist } from '../src/rewrite.js';

const MASTER = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x00
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="ES",LANGUAGE="es",URI="audio/es.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,AUDIO="aud"
https://cdn.tld/1080p/index.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:10,
seg1.ts
#EXTINF:10,
seg2.ts
#EXT-X-ENDLIST
`;

describe('rewritePlaylist', () => {
  it('reescribe la URI de las variantes, pistas, claves e init segments', () => {
    const resolve = (url: string) => `https://proxy.tld/hls?url=${encodeURIComponent(url)}`;
    const output = rewritePlaylist(MASTER, 'https://cdn.tld/master.m3u8', resolve);

    assert.ok(output.includes('https://proxy.tld/hls?url=https%3A%2F%2Fcdn.tld%2Fkey.bin'));
    assert.ok(output.includes('https://proxy.tld/hls?url=https%3A%2F%2Fcdn.tld%2Faudio%2Fes.m3u8'));
    assert.ok(output.includes('https://proxy.tld/hls?url=https%3A%2F%2Fcdn.tld%2F1080p%2Findex.m3u8'));
  });

  it('reescribe los segmentos de una playlist media', () => {
    const resolve = (url: string) => `P(${url})`;
    const output = rewritePlaylist(MEDIA, 'https://cdn.tld/media/index.m3u8', resolve);
    assert.ok(output.includes('P(https://cdn.tld/media/init.mp4)'));
    assert.ok(output.includes('P(https://cdn.tld/media/seg1.ts)'));
    assert.ok(output.includes('P(https://cdn.tld/media/seg2.ts)'));
  });

  it('resuelve URIs relativas antes de aplicar el resolver', () => {
    const resolve = (url: string) => url;
    const output = rewritePlaylist(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nsub/index.m3u8\n',
      'https://cdn.tld/path/master.m3u8',
      resolve,
    );
    assert.ok(output.includes('https://cdn.tld/path/sub/index.m3u8'));
  });

  it('no toca los tags sin URI', () => {
    const resolve = (url: string) => url;
    const output = rewritePlaylist('#EXTM3U\n#EXT-X-VERSION:4\n', 'https://cdn.tld/', resolve);
    assert.ok(output.includes('#EXT-X-VERSION:4'));
  });
});

describe('buildSingleVariantPlaylist', () => {
  it('genera un master de una sola variante', () => {
    const playlist = buildSingleVariantPlaylist({
      uri: 'https://cdn.tld/1080p.m3u8',
      bandwidth: 8_000_000,
      codecs: ['avc1.640028'],
    });
    assert.ok(playlist.startsWith('#EXTM3U'));
    assert.ok(playlist.includes('BANDWIDTH=8000000'));
    assert.ok(playlist.includes('CODECS="avc1.640028"'));
    assert.ok(playlist.includes('https://cdn.tld/1080p.m3u8'));
  });
});
