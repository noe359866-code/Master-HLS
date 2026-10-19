import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  bingeGroupOf,
  isPlayableInBrowser,
  pickBingeStream,
  rankStreams,
  streamHeight,
  type StreamLike,
} from '../src/binge.js';
import { streamLabelFor, subtitleTrackLabel } from '../src/labels.js';

const STREAMS: StreamLike[] = [
  { name: 'Vibe Flix', description: '1080p', url: 'https://cdn/a.m3u8', behaviorHints: { bingeGroup: 'vibeflix-1080p' } },
  { name: 'Vibe Flix', description: '720p', url: 'https://cdn/b.m3u8', behaviorHints: { bingeGroup: 'vibeflix-720p' } },
  { name: 'Vibe Flix', description: '2160p HEVC', url: 'https://cdn/c.m3u8', behaviorHints: { bingeGroup: 'vibeflix-2160p' } },
  { name: 'Vibe Flix', description: '1080p (torrent)', infoHash: 'abc123' },
];

describe('streamHeight', () => {
  it('extrae la altura del nombre, la descripcion o el fichero', () => {
    assert.equal(streamHeight({ description: '1080p' }), 1080);
    assert.equal(streamHeight({ name: '4K HDR' }), 2160);
    assert.equal(streamHeight({ behaviorHints: { filename: 'movie.720p.mkv' } }), 720);
    assert.equal(streamHeight({ name: 'sin datos' }), 0);
  });
});

describe('pickBingeStream', () => {
  it('elige el stream con el mismo bingeGroup (protocolo Stremio)', () => {
    const current: StreamLike = { url: 'https://cdn/x.m3u8', behaviorHints: { bingeGroup: 'vibeflix-720p' } };
    const next = pickBingeStream(STREAMS, current);
    assert.equal(next?.url, 'https://cdn/b.m3u8');
  });

  it('sin bingeGroup coincide por calidad', () => {
    const current: StreamLike = { url: 'https://cdn/y.m3u8', description: '1080p' };
    const next = pickBingeStream(STREAMS, current);
    assert.equal(next?.url, 'https://cdn/a.m3u8');
  });

  it('respeta el techo de altura del dispositivo', () => {
    const next = pickBingeStream(STREAMS, null, { maxHeight: 720 });
    assert.ok((streamHeight(next ?? {}) ?? 0) <= 720);
  });

  it('descarta lo que no se puede reproducir en navegador si hay alternativa', () => {
    const torrentOnly: StreamLike[] = [
      { name: 'torrent', infoHash: 'abc' },
      { name: 'directo', url: 'https://cdn/z.m3u8' },
    ];
    assert.equal(pickBingeStream(torrentOnly)?.url, 'https://cdn/z.m3u8');
  });

  it('devuelve undefined sin streams', () => {
    assert.equal(pickBingeStream([]), undefined);
  });

  it('normaliza el bingeGroup (mayusculas/espacios)', () => {
    assert.equal(bingeGroupOf({ behaviorHints: { bingeGroup: ' MiGrupo-1080P ' } }), 'migrupo-1080p');
    assert.equal(bingeGroupOf(null), '');
  });

  it('marca lo reproducible en navegador', () => {
    assert.equal(isPlayableInBrowser({ url: 'https://cdn/a.m3u8' }), true);
    assert.equal(isPlayableInBrowser({ url: 'ftp://cdn/a.mp4' }), false);
    assert.equal(isPlayableInBrowser({ infoHash: 'abc' }), false);
  });
});

describe('rankStreams', () => {
  it('ordena por calidad y deja los torrents detras', () => {
    const ranked = rankStreams([
      { name: 'sd', url: 'https://cdn/sd.m3u8', description: '480p' },
      { name: 'torrent', infoHash: 'abc', description: '2160p' },
      { name: 'hd', url: 'https://cdn/hd.m3u8', description: '1080p' },
    ]);
    assert.equal(ranked[0]?.name, 'hd');
    assert.equal(ranked[2]?.name, 'torrent');
  });

  it('manda por debajo del techo lo que lo excede', () => {
    const ranked = rankStreams(STREAMS, { maxHeight: 1080 });
    assert.notEqual(ranked[0]?.description, '2160p HEVC');
  });
});

describe('etiquetas de la interfaz', () => {
  it('describe un stream con calidad y tipo', () => {
    const label = streamLabelFor({ description: '1080p HEVC HDR', url: 'https://cdn/a.m3u8' });
    assert.match(label, /1080p/);
    assert.match(label, /HDR/);
  });

  it('describe una pista de audio o subtitulos con su idioma', () => {
    assert.equal(subtitleTrackLabel({ lang: 'spa', name: 'Spanish' }), 'Spanish (es)');
    assert.equal(subtitleTrackLabel({ lang: 'eng', name: 'English' }), 'English');
    assert.equal(subtitleTrackLabel({ lang: 'es', name: 'Original' }), 'Original (es)');
    assert.equal(subtitleTrackLabel({ lang: 'es' }), 'Español');
    assert.equal(subtitleTrackLabel({ lang: 'spa-LA' }), 'Español');
    assert.equal(subtitleTrackLabel({ name: 'English', lang: 'eng', channels: '6' }), 'English 5.1');
    assert.equal(subtitleTrackLabel({}, 2), 'Pista 3');
  });
});
