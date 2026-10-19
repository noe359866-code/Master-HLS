/**
 * Addon Stremio de demostracion.
 *
 * Sirve un manifest, un catalogo, metadatos, streams y subtitulos completos
 * (incluido un master playlist HLS real) para poder probar Master-HLS sin
 * depender de ningun addon externo ni de conexion a Internet.
 *
 *   node scripts/demo-addon.mjs [puerto]
 */

import http from 'node:http';

const port = Number(process.argv[2] ?? 8182);

const MOVIES = [
  {
    id: 'tt0111161',
    type: 'movie',
    name: 'El Imperio Contraataca',
    poster: 'https://images.metahub.space/poster/medium/tt0111161/img',
    background: 'https://images.metahub.space/background/medium/tt0111161/img',
    description:
      'Tras la victoria sobre la Alianza Rebelde, Luke Skywalker se enfrenta al Emperor Palpatine.',
    releaseInfo: '1980',
    imdbRating: '8.7',
    genres: ['Action', 'Sci-Fi', 'Adventure'],
    runtime: '124 min',
    videos: [
      {
        id: 'tt0111161:1',
        title: 'Episodio 1 - El Sith',
        season: 1,
        episode: 1,
        overview: 'Luke empieza su viaje.',
      },
    ],
  },
  {
    id: 'tt0068646',
    type: 'movie',
    name: 'El Signo del Zodiaco',
    poster: 'https://images.metahub.space/poster/medium/tt0068646/img',
    description: 'Un periodista obsessedo con unasesino en serie.',
    releaseInfo: '2007',
    imdbRating: '7.6',
    genres: ['Thriller', 'Crime', 'Drama'],
    runtime: '158 min',
  },
  {
    id: 'tt6751668',
    type: 'series',
    name: 'Cien Años de Soledad',
    poster: 'https://images.metahub.space/poster/medium/tt6751668/img',
    description: 'La saga de la familia Buendia.',
    releaseInfo: '2024',
    imdbRating: '8.5',
    genres: ['Drama', 'Fantasy'],
    videos: [
      { id: 'tt6751668:1:1', title: 'Many Years Ago', season: 1, episode: 1 },
      { id: 'tt6751668:1:2', title: 'The Pilot', season: 1, episode: 2 },
    ],
  },
  {
    id: 'tt0903747',
    type: 'series',
    name: 'Breaking Bad',
    poster: 'https://images.metahub.space/poster/medium/tt0903747/img',
    description: 'Un profesor de quimica con cancer se pasa a fabricar metanfetamina.',
    releaseInfo: '2008–2013',
    imdbRating: '9.5',
    genres: ['Drama', 'Crime'],
    videos: [
      { id: 'tt0903747:1:1', title: 'Pilot', season: 1, episode: 1 },
      { id: 'tt0903747:1:2', title: "Cat's in the Bag...", season: 1, episode: 2 },
    ],
  },
];

/** Master playlist HLS real (variantes + pistas de audio y subtitulos). */
const MASTER_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=6000000,AVERAGE-BANDWIDTH=5200000,RESOLUTION=1920x1080,FRAME-RATE=23.976,CODECS="avc1.640028,mp4a.40.2",VIDEO-RANGE=SDR,AUDIO="aud",SUBTITLES="sub",NAME="1080p"
http://127.0.0.1:${port}/hls/1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=18000000,RESOLUTION=3840x2160,FRAME-RATE=23.976,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ,AUDIO="aud",SUBTITLES="sub",NAME="4K HDR"
http://127.0.0.1:${port}/hls/2160p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2200000,RESOLUTION=1280x720,FRAME-RATE=23.976,CODECS="av01.0.05M.08",AUDIO="aud",SUBTITLES="sub",NAME="720p AV1"
http://127.0.0.1:${port}/hls/720p/index.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Espanol",LANGUAGE="es",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="6",URI="http://127.0.0.1:${port}/hls/audio/es.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,CHANNELS="2",URI="http://127.0.0.1:${port}/hls/audio/en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub",NAME="Espanol",LANGUAGE="es",DEFAULT=YES,AUTOSELECT=YES,URI="http://127.0.0.1:${port}/hls/sub/es.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub",NAME="English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,URI="http://127.0.0.1:${port}/hls/sub/en.m3u8"
`;

const MEDIA_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:6.0,
segment0.ts
#EXTINF:6.0,
segment1.ts
#EXTINF:6.0,
segment2.ts
#EXT-X-ENDLIST
`;

function json(res, payload, status = 200) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const path = url.pathname;

  if (path === '/manifest.json') {
    json(res, {
      id: 'com.masterhls.demo',
      name: 'Master-HLS Demo',
      version: '1.0.0',
      description: 'Addon de demostracion con catalogo, metadatos, streams HLS y subtitulos.',
      logo: `http://127.0.0.1:${port}/logo.png`,
      types: ['movie', 'series'],
      idPrefixes: ['tt'],
      resources: [
        { name: 'catalog', types: ['movie', 'series'], idPrefixes: ['tt'] },
        { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt'] },
        { name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt'] },
        { name: 'subtitles', types: ['movie', 'series'], idPrefixes: ['tt'] },
      ],
      catalogs: [
        {
          type: 'movie',
          id: 'top',
          name: 'Películas destacadas',
          extraSupported: ['search', 'skip', 'genre'],
          pageSize: 20,
        },
        {
          type: 'series',
          id: 'top',
          name: 'Series destacadas',
          extraSupported: ['search', 'skip', 'genre'],
          pageSize: 20,
        },
      ],
      behaviorHints: { configurable: false, configurationRequired: false },
    });
    return;
  }

  if (path.startsWith('/catalog/')) {
    const segments = path.split('/').filter(Boolean);
    const type = segments[1];
    const extra = Object.fromEntries(url.searchParams.entries());
    let items = MOVIES.filter((meta) => meta.type === type);
    if (extra['search']) {
      const term = extra['search'].toLowerCase();
      items = items.filter((meta) => meta.name.toLowerCase().includes(term));
    }
    const skip = Number(extra['skip'] ?? 0);
    json(res, { metas: items.slice(skip, skip + 20) });
    return;
  }

  if (path.startsWith('/meta/')) {
    const segments = path.split('/').filter(Boolean);
    const id = decodeURIComponent(segments[2] ?? '').replace(/\.json$/, '');
    const base = id.split(':')[0];
    const meta = MOVIES.find((entry) => entry.id === base);
    if (!meta) {
      json(res, { meta: null });
      return;
    }
    json(res, { meta: { ...meta, cast: ['Mark Hamill', 'Carrie Fisher'], director: ['George Lucas'] } });
    return;
  }

  if (path.startsWith('/stream/')) {
    const segments = path.split('/').filter(Boolean);
    const id = decodeURIComponent(segments[2] ?? '').replace(/\.json$/, '');
    const base = id.split(':')[0];
    const meta = MOVIES.find((entry) => entry.id === base);
    if (!meta) {
      json(res, { streams: [] });
      return;
    }
    json(res, {
      streams: [
        {
          name: 'Demo 1080p HLS',
          title: `${meta.name} 1080p`,
          description: 'Master playlist con variantes y pistas multi-audio',
          url: `http://127.0.0.1:${port}/hls/master.m3u8`,
          subtitles: [
            { id: 'es', url: `http://127.0.0.1:${port}/subs/es.vtt`, lang: 'es' },
            { id: 'en', url: `http://127.0.0.1:${port}/subs/en.vtt`, lang: 'en' },
          ],
          behaviorHints: { bingeGroup: 'demo-hls' },
        },
        {
          name: 'Demo 720p directo',
          title: `${meta.name} 720p`,
          url: `http://127.0.0.1:${port}/hls/720p/index.m3u8`,
        },
        {
          name: 'Demo 480p (baja)',
          title: `${meta.name} 480p`,
          url: `http://127.0.0.1:${port}/hls/480p/index.m3u8`,
        },
      ],
    });
    return;
  }

  if (path.startsWith('/subtitles/')) {
    const segments = path.split('/').filter(Boolean);
    const id = decodeURIComponent(segments[2] ?? '').replace(/\.json$/, '');
    const base = id.split(':')[0];
    const meta = MOVIES.find((entry) => entry.id === base);
    if (!meta) {
      json(res, { subtitles: [] });
      return;
    }
    json(res, {
      subtitles: [
        { id: 'es', url: `http://127.0.0.1:${port}/subs/es.vtt`, lang: 'es' },
        { id: 'en', url: `http://127.0.0.1:${port}/subs/en.vtt`, lang: 'en' },
      ],
    });
    return;
  }

  if (path === '/hls/master.m3u8') {
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
    res.end(MASTER_PLAYLIST);
    return;
  }

  if (path.endsWith('.m3u8')) {
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
    res.end(MEDIA_PLAYLIST);
    return;
  }

  if (path.endsWith('.vtt')) {
    res.writeHead(200, { 'content-type': 'text/vtt' });
    res.end('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nDemo de subtitulos Master-HLS\n');
    return;
  }

  if (path.endsWith('.ts')) {
    // Segmento ficticio (cabecera TS basica) para no romper al reproductor.
    res.writeHead(200, { 'content-type': 'video/mp2t' });
    res.end(Buffer.alloc(188, 0x47));
    return;
  }

  json(res, { error: 'not found' }, 404);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[demo-addon] addon Stremio de demostracion en http://127.0.0.1:${port}/manifest.json`);
});
