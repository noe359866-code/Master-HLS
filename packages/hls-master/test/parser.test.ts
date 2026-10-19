import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseAttributes, parsePlaylist, isMasterPlaylist, isHlsUrl } from '../src/parser.js';

const MASTER = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=8000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=23.976,CODECS="avc1.640028,mp4a.40.2",VIDEO-RANGE=SDR,AUDIO="aud",SUBTITLES="sub",NAME="1080p"
https://cdn.tld/1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=25000000,RESOLUTION=3840x2160,FRAME-RATE=23.976,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ,AUDIO="aud",NAME="4K HDR"
https://cdn.tld/2160p/index.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Espanol",LANGUAGE="es",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="6",URI="audio/es.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Ingles",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub",NAME="Espanol",LANGUAGE="es",DEFAULT=YES,FORCED=NO,URI="sub/es.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=128000,RESOLUTION=640x360,CODECS="mp4a.40.2",AUDIO="aud"
https://cdn.tld/360p/index.m3u8
`;

describe('parseAttributes', () => {
  it('parsea atributos con y sin comillas', () => {
    const attributes = parseAttributes('BANDWIDTH=8000000,CODECS="avc1.640028,mp4a.40.2",DEFAULT=YES');
    assert.equal(attributes['BANDWIDTH'], '8000000');
    assert.equal(attributes['CODECS'], 'avc1.640028,mp4a.40.2');
    assert.equal(attributes['DEFAULT'], 'YES');
  });

  it('parsea URIs con comas dentro', () => {
    const attributes = parseAttributes('TYPE=AUDIO,URI="https://cdn.tld/a,b.m3u8"');
    assert.equal(attributes['URI'], 'https://cdn.tld/a,b.m3u8');
  });
});

describe('parsePlaylist', () => {
  const master = parsePlaylist(MASTER, 'https://base.tld/master.m3u8');

  it('detecta que es master', () => {
    assert.equal(master.isMaster, true);
    assert.equal(isMasterPlaylist(MASTER), true);
  });

  it('parsea las variantes con sus atributos', () => {
    assert.equal(master.variants.length, 3);
    const [hd, uhd, low] = master.variants;
    assert.equal(hd?.width, 1920);
    assert.equal(hd?.height, 1080);
    assert.equal(hd?.bandwidth, 8_000_000);
    assert.equal(hd?.averageBandwidth, 6_500_000);
    assert.equal(hd?.frameRate, 23.976);
    assert.deepEqual(hd?.codecs, ['avc1.640028', 'mp4a.40.2']);
    assert.equal(hd?.audioGroup, 'aud');
    assert.equal(hd?.subtitleGroup, 'sub');
    assert.equal(hd?.name, '1080p');
    assert.equal(uhd?.videoRange, 'PQ');
    assert.equal(low?.height, 360);
  });

  it('resuelve las URIs relativas contra la URL base', () => {
    const playlist = parsePlaylist(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nseg/index.m3u8\n',
      'https://base.tld/path/master.m3u8',
    );
    assert.equal(playlist.variants[0]?.uri, 'https://base.tld/path/seg/index.m3u8');
  });

  it('parsea las pistas de audio y subtitulos', () => {
    const audio = master.renditions.filter((r) => r.type === 'AUDIO');
    const subs = master.renditions.filter((r) => r.type === 'SUBTITLES');
    assert.equal(audio.length, 2);
    assert.equal(subs.length, 1);
    assert.equal(audio[0]?.language, 'es');
    assert.equal(audio[0]?.isDefault, true);
    assert.equal(audio[0]?.channels, '6');
    assert.equal(audio[0]?.uri, 'https://base.tld/audio/es.m3u8');
    assert.equal(subs[0]?.uri, 'https://base.tld/sub/es.m3u8');
  });

  it('reconoce una playlist media (no master)', () => {
    const media = parsePlaylist(
      '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nseg1.ts\n#EXTINF:9,\nseg2.ts\n',
      'https://base.tld/media.m3u8',
    );
    assert.equal(media.isMaster, false);
    assert.equal(media.targetDuration, 10);
    assert.equal(media.variants.length, 0);
  });
});

describe('isHlsUrl', () => {
  it('detecta playlists por extension', () => {
    assert.equal(isHlsUrl('https://cdn.tld/master.m3u8'), true);
    assert.equal(isHlsUrl('https://cdn.tld/master.M3U8'), true);
    assert.equal(isHlsUrl('https://cdn.tld/video.mp4'), false);
  });
});
