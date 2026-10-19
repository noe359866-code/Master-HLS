import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parsePlaylist } from '../src/parser.js';
import { nameMatchesLanguage, selectBest, selectRendition, selectVariant, listVariants } from '../src/select.js';

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud",SUBTITLES="sub",NAME="1080p"
https://cdn.tld/1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=25000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ,AUDIO="aud",NAME="4K HDR"
https://cdn.tld/2160p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="av01.0.05M.08",AUDIO="aud",NAME="720p AV1"
https://cdn.tld/720p.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Espanol",LANGUAGE="es",DEFAULT=YES,CHANNELS="6",URI="audio/es.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Ingles",LANGUAGE="en",DEFAULT=NO,URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub",NAME="Espanol",LANGUAGE="es",DEFAULT=YES,URI="sub/es.m3u8"
`;

describe('selectVariant', () => {
  const master = parsePlaylist(MASTER, 'https://base.tld/master.m3u8');

  it('elige la mejor variante sin limites de dispositivo', () => {
    const variant = selectVariant(master);
    assert.equal(variant?.height, 2160);
  });

  it('respeta el limite de altura del dispositivo', () => {
    const variant = selectVariant(master, { maxHeight: 1080 });
    assert.equal(variant?.height, 1080);
  });

  it('descarta HDR si el dispositivo no lo soporta', () => {
    const variant = selectVariant(master, { maxHeight: 2160, supportsHdr: false });
    assert.notEqual(variant?.videoRange, 'PQ');
  });

  it('prefiere el codec pedido cuando la altura es la misma', () => {
    const variant = selectVariant(master, { maxHeight: 720, preferredCodecs: ['av1'] });
    assert.equal(variant?.name, '720p AV1');
  });

  it('ignora las variantes de solo audio', () => {
    const withAudioOnly = parsePlaylist(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=99999999,CODECS="mp4a.40.2"\nhttps://cdn.tld/audio.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720\nhttps://cdn.tld/720.m3u8\n',
      'https://base.tld/master.m3u8',
    );
    const variant = selectVariant(withAudioOnly);
    assert.equal(variant?.height, 720);
  });
});

describe('selectRendition', () => {
  const master = parsePlaylist(MASTER, 'https://base.tld/master.m3u8');

  it('selecciona la pista de audio por idioma', () => {
    const audio = selectRendition(master, 'AUDIO', { groupId: 'aud', language: 'es' });
    assert.equal(audio?.name, 'Espanol');
  });

  it('selecciona la pista por defecto si no hay idioma', () => {
    const audio = selectRendition(master, 'AUDIO', { groupId: 'aud' });
    assert.equal(audio?.isDefault, true);
  });

  it('acepta alias de idioma (spa -> es)', () => {
    const audio = selectRendition(master, 'AUDIO', { groupId: 'aud', language: 'spa' });
    assert.equal(audio?.name, 'Espanol');
  });
});

describe('selectBest', () => {
  const master = parsePlaylist(MASTER, 'https://base.tld/master.m3u8');

  it('devuelve variante + pistas segun preferencias', () => {
    const selection = selectBest(master, {
      capabilities: { maxHeight: 1080, supportsHdr: false },
      preferences: { audioLanguage: 'es', subtitleLanguage: 'es', preferSubtitles: true },
    });
    assert.equal(selection?.variant.height, 1080);
    assert.equal(selection?.audio?.name, 'Espanol');
    assert.equal(selection?.subtitles?.name, 'Espanol');
    assert.ok(selection?.reason.includes('height=1080'));
  });
});

describe('listVariants', () => {
  it('ordena de mejor a peor', () => {
    const master = parsePlaylist(MASTER, 'https://base.tld/master.m3u8');
    const variants = listVariants(master, { maxHeight: 2160, supportsHdr: true });
    assert.equal(variants[0]?.height, 2160);
  });
});

describe('selectRendition por nombre', () => {
  const master = parsePlaylist(
    [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English 5.1",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,URI="en.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Espanol Latino",LANGUAGE="es-MX",DEFAULT=YES,AUTOSELECT=YES,URI="es.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Francais",DEFAULT=NO,AUTOSELECT=NO,URI="fr.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Sin idioma declarado",DEFAULT=NO,AUTOSELECT=NO,URI="unk.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=640x360,AUDIO="aud"',
      'low/index.m3u8',
      '',
    ].join('\n'),
    'https://base.tld/master.m3u8',
  );

  it('encuentra el idioma cuando el addon solo lo pone en NAME', () => {
    assert.equal(nameMatchesLanguage('English 5.1', 'en'), true);
    assert.equal(nameMatchesLanguage('Espanol Latino', 'es'), true);
    assert.equal(nameMatchesLanguage('Frances', 'fr'), true);
    assert.equal(nameMatchesLanguage('Frances', 'de'), false);
    assert.equal(nameMatchesLanguage(undefined, 'es'), false);
    assert.equal(selectRendition(master, 'AUDIO', { groupId: 'aud', language: 'fr' })?.name, 'Francais');
  });

  it('sigue prefiriendo el atributo LANGUAGE y la pista por defecto', () => {
    assert.equal(selectRendition(master, 'AUDIO', { groupId: 'aud', language: 'es' })?.name, 'Espanol Latino');
    assert.equal(selectRendition(master, 'AUDIO', { groupId: 'aud' })?.name, 'Espanol Latino');
    assert.equal(selectRendition(master, 'AUDIO', { groupId: 'aud', language: 'de' })?.name, 'Espanol Latino');
  });
});
