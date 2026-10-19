import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { cineHaxProvider, cineHaxLanguageOrder, parseCineHaxPlayers } from '../src/providers/cinehax.js';
import { fanpelisProvider, fanpelisAudioCompatible } from '../src/providers/fanpelis.js';
import { doramasflixProvider } from '../src/providers/doramasflix.js';
import { tioAnimeProvider } from '../src/providers/tioanime.js';
import { frembedProvider } from '../src/providers/frembed.js';
import { ridomoviesProvider } from '../src/providers/ridomovies.js';
import { mstreamProvider } from '../src/providers/mstream.js';
import { guardaFlixProvider } from '../src/providers/guardaflix.js';
import { zaluknijProvider } from '../src/providers/zaluknij.js';
import { isDirectMedia, publicHttpUrl, sameTitle, titleYear } from '../src/providers/site-tools.js';
import { STREAMFLIX_PROVIDER_CATALOG } from '../src/providers/upstream-catalog.js';
import { DEFAULT_PROVIDERS } from '../src/index.js';
import { ScraperRegistry } from '../src/providers/registry.js';
import type { ScrapeContext, ScrapeRequest } from '../src/types.js';

const movie: ScrapeRequest = { id: 'tmdb:123', titleId: 'tmdb:123', tmdbId: '123', title: 'Película', type: 'movie', language: 'es-419' };
const episode: ScrapeRequest = { id: 'tmdb:123:2:4', titleId: 'tmdb:123', tmdbId: '123', title: 'Serie', type: 'series', season: 2, episode: 4, language: 'es-419' };

function context(
  text: (url: string) => string | Promise<string>,
  json: (url: string) => unknown = () => ({}),
  post?: (url: string, body: unknown) => unknown,
): ScrapeContext {
  return {
    userAgent: 'test-agent',
    fetchText: async (url) => text(url),
    fetchJson: async <T>(url: string) => json(url) as T,
    ...(post ? { postJson: async <T>(url: string, body: unknown) => post(url, body) as T } : {}),
  };
}

describe('inventario upstream: NO es un listado de proveedores instalados', () => {
  it('abarca los archivos VOD, IPTV y referencias sin registrar; no cuenta variantes como archivos', () => {
    const counts = (state: string) => STREAMFLIX_PROVIDER_CATALOG.filter((item) => item.state === state).length;
    assert.deepEqual([counts('registered-vod'), counts('registered-iptv'), counts('unregistered')], [51, 15, 10]);
    assert.equal(new Set(STREAMFLIX_PROVIDER_CATALOG.map((item) => item.file)).size, 76);
    assert.deepEqual(STREAMFLIX_PROVIDER_CATALOG.find((item) => item.file === 'StreamingCommunityProvider.kt')?.languages, ['it', 'en']);
    assert.deepEqual(STREAMFLIX_PROVIDER_CATALOG.find((item) => item.file === 'VavooProvider.kt')?.languages, ['de', 'it', 'fr', 'es', 'pl', 'en']);
    assert.equal(STREAMFLIX_PROVIDER_CATALOG.find((item) => item.file === 'PlutoTvEsProvider.kt')?.state, 'registered-iptv');
    assert.equal(STREAMFLIX_PROVIDER_CATALOG.find((item) => item.file === 'VavooVodProvider.kt')?.state, 'unregistered');
    assert.equal(STREAMFLIX_PROVIDER_CATALOG.find((item) => item.file === 'TmdbProvider.kt')?.nativeId, undefined);
    const native = STREAMFLIX_PROVIDER_CATALOG.flatMap((item) => item.nativeId ? [item.nativeId] : []);
    assert.deepEqual(native.sort(), DEFAULT_PROVIDERS.filter((item) => item.id !== 'internet-archive').map((item) => item.id).sort());
    assert.ok(!STREAMFLIX_PROVIDER_CATALOG.some((item) => item.media.includes('live') && item.nativeId));
  });

  it('comprueba regiones e impide tratar un iframe privado como vídeo', () => {
    assert.deepEqual(cineHaxLanguageOrder('es-ES'), ['castellano', 'latino']);
    assert.deepEqual(cineHaxLanguageOrder('es-NI'), ['latino', 'castellano']);
    assert.equal(publicHttpUrl('http://127.0.0.1/secret'), undefined);
    assert.equal(publicHttpUrl('http://[::ffff:127.0.0.1]/embed'), undefined);
    assert.equal(publicHttpUrl('http://192.168.0.5/embed'), undefined);
    assert.ok(publicHttpUrl('https://fcdn.example/video.mp4'));
    assert.equal(isDirectMedia('https://cdn.example/embed/m'), false);
    assert.equal(sameTitle('Película (2020)', 'Pelicula', 2020), true);
    assert.equal(sameTitle('Película 2', 'Película'), false);
    assert.equal(titleYear('Pelicula (2020)'), 2020);
    assert.equal(titleYear('2001: A Space Odyssey'), undefined);
  });
});

describe('CineHax VOD nativo', () => {
  const player = `<script>finalizePlayer({"subtitulado":{"remux":"https://remux.unlimplay.com/english.mp4"},` +
    `"latino":{"remux":"https://remux.unlimplay.com/latino-1080p.mp4"},` +
    `"castellano":{"remux":"https://remux.unlimplay.com/castellano.mp4"}});</script>`;

  it('usa el ID TMDb y prefiere doblaje latino o castellano sin mezclar subtitulado', async () => {
    const urls: string[] = [];
    const ctx = context((url) => { urls.push(url); return player; });
    const latin = await cineHaxProvider.fetchSources(movie, ctx);
    const spanish = await cineHaxProvider.fetchSources({ ...movie, language: 'es-ES' }, ctx);
    assert.deepEqual(urls, Array(2).fill('https://unlimplay.com/f/embed/movie/123'));
    assert.equal(latin[0]?.url, 'https://remux.unlimplay.com/latino-1080p.mp4');
    assert.equal(spanish[0]?.url, 'https://remux.unlimplay.com/castellano.mp4');
    assert.equal(latin[0]?.headers?.Referer, urls[0]);
    assert.equal(latin[0]?.quality, '1080p');
    assert.equal(parseCineHaxPlayers('sin player').latino, undefined);
  });

  it('construye el episodio solicitado y se niega a reproducir sin S/E', async () => {
    const urls: string[] = [];
    const ctx = context((url) => { urls.push(url); return player; });
    const sources = await cineHaxProvider.fetchSources(episode, ctx);
    assert.equal(urls[0], 'https://unlimplay.com/f/embed/tv/123/2/4');
    assert.ok(sources.length);
    assert.deepEqual(await cineHaxProvider.fetchSources({ ...episode, episode: undefined }, ctx), []);
    assert.equal(urls.length, 1);
  });

  it('busca el TMDb ID con nonce y rechaza títulos/tipos/años distintos', async () => {
    const urls: string[] = [];
    const ctx = context((url) => {
      urls.push(url);
      return url === 'https://cinehax.com' ? '<script>var config={"nonce":"abc"}</script>' : player;
    }, (url) => {
      urls.push(url);
      return { success: true, data: [
        { id: 5, media_type: 'movie', title: 'Otra película' },
        { id: 55, media_type: 'tv', name: 'Película' },
        { id: 77, media_type: 'movie', title: 'Película', release_date: '2020-02-10' },
      ] };
    });
    const sources = await cineHaxProvider.fetchSources({ type: 'movie', id: 'tt5', title: 'Película', year: 2020 }, ctx);
    assert.ok(urls.some((url) => url.includes('action=tmdb_live_search&query=Pel')));
    assert.ok(urls.includes('https://unlimplay.com/f/embed/movie/77'));
    assert.ok(sources.length);
    const differentYear = await cineHaxProvider.fetchSources({ type: 'movie', id: 'tt5', title: 'Película', year: 1999 }, ctx);
    assert.deepEqual(differentYear, []);
  });

  it('no devuelve iframe, enlace de LAN, JSON roto o audio en otra lengua', async () => {
    const base = movie;
    assert.deepEqual(await cineHaxProvider.fetchSources(base, context(() =>
      'finalizePlayer({"latino":{"voe":"http://127.0.0.1/embed"}})'),), []);
    assert.deepEqual(await cineHaxProvider.fetchSources(base, context(() =>
      'finalizePlayer({"subtitulado":{"remux":"https://remux.unlimplay.com/en.mp4"}})'),), []);
    assert.deepEqual(await cineHaxProvider.fetchSources(base, context(() => 'finalizePlayer({bad json})')), []);
  });
});

describe('Fanpelis VOD nativo', () => {
  it('filtra película por título/tipo/año y resuelve un embed, no lo expone', async () => {
    const urls: string[] = [];
    const ctx = context((url) => {
      urls.push(url);
      return '<script>{"file":"https://cdn.example/video-720p.m3u8"}</script>';
    }, (url) => {
      urls.push(url);
      if (url.includes('/search?')) return { data: { posts: [
        { _id: 10, title: 'Película 2', type: 'movies' },
        { _id: 11, title: 'Película', type: 'tvshows' },
        { _id: 12, title: 'Película', type: 'movies' },
      ] } };
      if (url.includes('/player?')) return { data: { embeds: [
        { url: 'https://host.example/embed/12', lang: 'latino' },
        { url: 'https://host.example/embed/english', lang: 'en' },
      ] } };
      throw new Error(`Unexpected ${url}`);
    });
    const result = await fanpelisProvider.fetchSources(movie, ctx);
    assert.equal(result[0]?.url, 'https://cdn.example/video-720p.m3u8');
    assert.equal(result[0]?.headers?.Referer, 'https://host.example/embed/12');
    assert.ok(urls.some((url) => url.includes('/player?post_id=12')));
    assert.ok(!urls.some((url) => url.includes('english')));
    assert.equal(fanpelisAudioCompatible('SUB'), false);
  });

  it('verifica temporada y episodio exactos antes de pedir el player', async () => {
    const urls: string[] = [];
    const ctx = context(() => '', (url) => {
      urls.push(url);
      if (url.includes('/search?')) return { data: { posts: [{ _id: 88, type: 'tvshows', title: 'Serie' }] } };
      if (url.includes('/episodes?')) return { data: [
        { _id: 100, season_number: 1, episode_number: 4 },
        { _id: 204, season_number: 2, episode_number: 4 },
      ] };
      if (url.includes('/player?')) return { data: { embeds: [{ url: 'https://cdn.example/episode.mp4', lang: 'es' }] } };
      return {};
    });
    assert.equal((await fanpelisProvider.fetchSources(episode, ctx))[0]?.url, 'https://cdn.example/episode.mp4');
    assert.ok(urls.some((url) => url.includes('/player?post_id=204')));
    const length = urls.length;
    assert.deepEqual(await fanpelisProvider.fetchSources({ ...episode, episode: 7 }, ctx), []);
    assert.equal(urls.length, length + 2);
  });
});

describe('TioAnime nativo', () => {
  const directory = '<main><article class="anime"><a href="/anime/serie-elegida">' +
    '<h3 class="title">Serie elegida</h3></a></article></main>';
  it('resuelve sólo la temporada 1 y episodio incluido en var episodes', async () => {
    const urls: string[] = [];
    const ctx = context((url) => {
      urls.push(url);
      if (url.includes('/directorio?')) return directory;
      if (url.includes('/anime/serie-elegida')) return '<script>var episodes = [1,4,8];</script>';
      if (url.includes('/ver/serie-elegida-4')) return '<script>var videos = [["Voe","https://host.example/embed/4"]];</script>';
      if (url.includes('host.example/embed/4')) return '<video src="https://cdn.example/4.mp4">';
      throw new Error(url);
    });
    const request: ScrapeRequest = { type: 'series', kind: 'anime', id: 'tt1:1:4', title: 'Serie elegida', season: 1, episode: 4 };
    assert.equal((await tioAnimeProvider.fetchSources(request, ctx))[0]?.url, 'https://cdn.example/4.mp4');
    assert.deepEqual(await tioAnimeProvider.fetchSources({ ...request, episode: 3 }, ctx), []);
    assert.deepEqual(await tioAnimeProvider.fetchSources({ ...request, season: 2 }, ctx), []);
    assert.ok(!urls.some((url) => url.includes('/ver/serie-elegida-3')));
  });

  it('rechaza búsquedas parecidas o enlaces que no son vídeo', async () => {
    const ctx = context((url) => url.includes('/directorio?') ? directory :
      url.includes('/anime/') ? '<script>var episodes=[1];</script>' :
        '<script>var videos=[["Voe","https://host.example/iframe"]];</script>');
    assert.deepEqual(await tioAnimeProvider.fetchSources({ type: 'movie', kind: 'anime', id: 'a', title: 'Serie elegida' }, ctx), []);
    assert.deepEqual(await tioAnimeProvider.fetchSources({ type: 'series', kind: 'anime', id: 'a:1:1', title: 'Serie 2', season: 1, episode: 1 }, ctx), []);
    assert.deepEqual(await tioAnimeProvider.fetchSources({ type: 'series', kind: 'anime', id: 'a:1:1', title: 'Serie elegida', season: 1, episode: 1 }, ctx), []);
  });
});

describe('Doramasflix nativo', () => {
  const title = 'Dorama elegido';
  const apollo = (state: Record<string, unknown>) =>
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { apolloState: state } } })}</script>`;
  const request: ScrapeRequest = { type: 'series', kind: 'dorama', id: 'tt1:2:4',
    title, season: 2, episode: 4, language: 'es-NI' };

  it('usa GraphQL, verifica el episodio y descarta audio SUB/POR', async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const ctx = context((url) => {
      calls.push({ url });
      if (url.endsWith('/doramas-online/dorama-elegido')) return apollo({ 'Dorama:1': { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa' } });
      if (url.endsWith('/episodios/episodio-4')) return apollo({ 'Episode:4': { links_online: { json: [
        { link: 'https://cdn.example/lat.mp4', lang: '38' },
        { link: 'https://cdn.example/sub.mp4', lang: '192' },
        { link: 'https://cdn.example/por.mp4', lang: '1327' },
      ] } } });
      throw new Error(url);
    }, undefined, (url, body) => {
      calls.push({ url, body });
      const name = (body as { operationName?: string }).operationName;
      if (name === 'searchAll') return { data: { searchDorama: [
        { slug: 'wrong-title', name: 'Otra serie' },
        { slug: 'dorama-elegido', name: title },
      ] } };
      if (name === 'listEpisodes') return { data: { listEpisodes: [
        { slug: 'episodio-de-otra-temporada', season_number: 1, episode_number: 4 },
        { slug: 'episodio-4', season_number: 2, episode_number: 4 },
      ] } };
      throw new Error(name);
    });
    assert.deepEqual((await doramasflixProvider.fetchSources(request, ctx)).map((item) => item.url),
      ['https://cdn.example/lat.mp4']);
    assert.ok(calls.some((item) => (item.body as { variables?: { season_number?: number } })?.variables?.season_number === 2));
    assert.ok(calls.some((item) => item.url.endsWith('/episodios/episodio-4')));
    const before = calls.length;
    assert.deepEqual(await doramasflixProvider.fetchSources({ ...request, episode: 5 }, ctx), []);
    assert.equal(calls.length, before + 3, 'no debe pedir página del episodio equivocado');
  });

  it('resuelve un fkplayer codificado y nunca expone el iframe como stream', async () => {
    const ctx = context((url) => {
      if (url.includes('fkplayer.xyz')) return apollo({})
        .replace('"apolloState":{}', '"apolloState":{},"token":"token-de-prueba"');
      return apollo({ 'Movie:10': { links_online: { json: [
        { link: 'https://fkplayer.xyz/e/10', lang: '37' },
      ] } } });
    }, undefined, (_url, body) => {
      const name = (body as { operationName?: string }).operationName;
      if (name === 'searchAll') return { data: { searchMovie: [{ slug: 'dorama-film', name: 'Dorama film' }] } };
      if ('token' in (body as Record<string, unknown>)) return { link: Buffer.from('https://cdn.example/decoded.m3u8').toString('base64') };
      return {};
    });
    const sources = await doramasflixProvider.fetchSources({ type: 'movie', id: 'tt2', title: 'Dorama film', language: 'es-ES' }, ctx);
    assert.deepEqual(sources.map((item) => item.url), ['https://cdn.example/decoded.m3u8']);
    assert.deepEqual(await doramasflixProvider.fetchSources(request, context(() => '', () => ({}))), []);
  });
});

describe('Zaluknij nativo polaco', () => {
  const search = '<div id="advanced-search">' +
    '<a class="item" href="/film/film-2"><img alt="Film 2"></a>' +
    '<a href="/film/film" class="item"><img alt="Film"></a></div>';
  it('lee el iframe base64 del servidor sin confundir el enlace de la ficha con vídeo', async () => {
    const token = Buffer.from(JSON.stringify({ src: 'https://cdn.example/polish.mp4' })).toString('base64');
    const urls: string[] = [];
    const ctx = context((url) => {
      urls.push(url);
      if (url.includes('/wyszukiwarka?')) return search;
      return `<h1>Film (2022)</h1><div id="link-list"><table><tbody><tr><td><a href="https://host.example/watch" data-iframe="${token}">Watch</a></td></tr></tbody></table></div>`;
    });
    const request: ScrapeRequest = { id: 'tt1', type: 'movie', title: 'Film', year: 2022, language: 'pl' };
    assert.deepEqual((await zaluknijProvider.fetchSources(request, ctx)).map((source) => source.url),
      ['https://cdn.example/polish.mp4']);
    assert.equal(urls.length, 2);
    assert.deepEqual(await zaluknijProvider.fetchSources({ ...request, year: 2023 }, ctx), []);
    assert.deepEqual(await zaluknijProvider.fetchSources({ ...request, type: 'series', season: 1, episode: 1 }, ctx), []);
  });

  it('el desafío antibot y URLs privadas no son streams', async () => {
    const ctx = context((url) => url.includes('/wyszukiwarka?') ? search
      : '<h1>Film</h1><div id="link-list"><tbody><tr><a href="http://127.0.0.1/private">watch</a></tr></tbody></div>');
    assert.deepEqual(await zaluknijProvider.fetchSources({ id: 'tt1', type: 'movie', title: 'Film', language: 'pl' }, ctx), []);
    assert.deepEqual(await zaluknijProvider.fetchSources({ id: 'tt1', type: 'movie', title: 'Film', language: 'pl' },
      context(() => '<title>Checking your browser</title>')), []);
  });
});

describe('GuardaFlix nativo italiano', () => {
  it('busca la película exacta, sigue la opción y exige wrapper de vídeo', async () => {
    const urls: string[] = [];
    const ctx = context((url) => {
      urls.push(url);
      if (url.includes('?s=')) return '<ul class="post-lst">' +
        '<li><h2 class="entry-title">Film 2</h2><a class="lnk-blk" href="/film-2/"></a></li>' +
        '<li><h2 class="entry-title">Film</h2><a class="lnk-blk" href="/film/"></a></li></ul>';
      if (url === 'https://guardaplay.store/film/') return '<h1 class="entry-title">Film (2020)</h1>' +
        '<div id="aa-options"><div id="options-1"><iframe data-src="https://wrapper.example/film"></iframe></div>' +
        '<div id="options-2"><iframe src="http://127.0.0.1/private"></iframe></div></div>';
      if (url === 'https://wrapper.example/film') return '<div class="Video"><iframe src="https://cdn.example/film.mp4"></iframe></div>';
      throw new Error(url);
    });
    const request: ScrapeRequest = { id: 'tt1', type: 'movie', title: 'Film', year: 2020, language: 'it' };
    assert.deepEqual((await guardaFlixProvider.fetchSources(request, ctx)).map((source) => source.url),
      ['https://cdn.example/film.mp4']);
    assert.deepEqual(await guardaFlixProvider.fetchSources({ ...request, type: 'series', season: 1, episode: 1 }, ctx), []);
    assert.equal(urls.filter((url) => url.includes('127.0.0.1')).length, 0);
  });

  it('descarta fichas homónimas equivocadas y opciones sin vídeo', async () => {
    const ctx = context((url) => url.includes('?s=')
      ? '<li><h2 class="entry-title">Film</h2><a class="lnk-blk" href="https://evil.example/film/"></a></li>'
      : '<h1 class="entry-title">Film 2</h1>');
    assert.deepEqual(await guardaFlixProvider.fetchSources({ id: 'tt1', type: 'movie', title: 'Film' }, ctx), []);
  });
});

describe('MStream nativo alemán', () => {
  const search = '<script>window.bootstrapData = {"loaders":{"searchPage":{"results":[' +
    '{"is_series":false,"title":{"id":100,"name":"Film","year":"2021","primary_video":{"id":900}}},' +
    '{"is_series":true,"id":200,"name":"Serie","year":"2022"}' +
    ']}}};</script>';
  it('resuelve vídeos de película, descarta premium y no confunde secuelas/años', async () => {
    const urls: string[] = [];
    const ctx = context((url) => { urls.push(url); return search; }, (url) => {
      urls.push(url);
      return { alternative_videos: [
        { src: 'https://cdn.example/premium.mp4', premium_locked: true },
        { src: 'https://cdn.example/german.m3u8', premium_locked: false },
        { src: '' },
      ] };
    });
    const request: ScrapeRequest = { id: 'tt1', type: 'movie', title: 'Film', year: 2021, language: 'de' };
    assert.deepEqual((await mstreamProvider.fetchSources(request, ctx)).map((source) => source.url),
      ['https://cdn.example/german.m3u8']);
    assert.ok(urls.includes('https://moflix-stream.xyz/api/v1/watch/900'));
    assert.deepEqual(await mstreamProvider.fetchSources({ ...request, year: 2022 }, ctx), []);
  });

  it('comprueba listado y respuesta del episodio antes de resolver vídeo', async () => {
    const urls: string[] = [];
    const ctx = context((url) => { urls.push(url); return search; }, (url) => {
      urls.push(url);
      if (url.includes('/episodes?')) return { pagination: { data: [
        { title_id: 200, season_number: 3, episode_number: 2 },
      ] } };
      return { episode: { title_id: 200, season_number: 3, episode_number: 2,
        videos: [{ src: 'https://cdn.example/german-ep.mp4' }] } };
    });
    const request: ScrapeRequest = { id: 'tt2:3:2', type: 'series', title: 'Serie', season: 3, episode: 2, language: 'de' };
    assert.deepEqual((await mstreamProvider.fetchSources(request, ctx)).map((source) => source.url),
      ['https://cdn.example/german-ep.mp4']);
    const before = urls.length;
    assert.deepEqual(await mstreamProvider.fetchSources({ ...request, episode: 3 }, ctx), []);
    assert.equal(urls.length, before + 2, 'no pide el player de otro episodio');
  });
});

describe('Ridomovies nativo inglés', () => {
  const search = { status: true, data: [
    { slug: 'sequel', title: 'Movie 2', type: 'movie' },
    { slug: 'my-movie', title: 'Movie', type: 'movie', release_date: '2020-10-10' },
    { slug: 'my-show', title: 'Show', type: 'tv' },
  ] };
  it('comprueba título/año y extrae el iframe escapado del player de la película', async () => {
    const ctx = context((url) => {
      if (url.endsWith('/movie/my-movie')) return '<h1>Movie (2020)</h1>' +
        '<div id="player-cover" data-embed="&lt;iframe src=&quot;https://cdn.example/movie.mp4&quot;&gt;&lt;/iframe&gt;"></div>';
      throw new Error(url);
    }, () => search);
    const result = await ridomoviesProvider.fetchSources({ id: 'tt1', type: 'movie', title: 'Movie', year: 2020 }, ctx);
    assert.equal(result[0]?.url, 'https://cdn.example/movie.mp4');
    assert.deepEqual(await ridomoviesProvider.fetchSources({ id: 'tt1', type: 'movie', title: 'Movie', year: 2019 }, ctx), []);
  });

  it('exige el enlace exacto del episodio en el listado de la página', async () => {
    const urls: string[] = [];
    const ctx = context((url) => {
      urls.push(url);
      if (url.includes('/embed/4')) return '<video src="https://cdn.example/episode-4.m3u8">';
      return '<div class="episodes-grid"><a class="episode-link" href="/tv/my-show/season-2/episode-4">4</a></div>' +
        '<div id="player-cover" data-embed="&lt;iframe src=&quot;https://host.example/embed/4&quot;&gt;&lt;/iframe&gt;"></div>';
    }, () => search);
    const request: ScrapeRequest = { id: 'tt1:2:4', type: 'series', title: 'Show', season: 2, episode: 4 };
    assert.deepEqual((await ridomoviesProvider.fetchSources(request, ctx)).map((source) => source.url),
      ['https://cdn.example/episode-4.m3u8']);
    const before = urls.length;
    assert.deepEqual(await ridomoviesProvider.fetchSources({ ...request, episode: 5 }, ctx), []);
    assert.equal(urls.length, before + 1, 'no se resuelve el embed de otro episodio');
  });

  it('no consulta fuentes de otro idioma si el perfil elige inglés', async () => {
    const registry = new ScraperRegistry();
    registry.register(ridomoviesProvider);
    registry.register(frembedProvider);
    const urls: string[] = [];
    const ctx = context((url) => {
      urls.push(url);
      return '<h1>Movie</h1><div id="player-cover" data-embed="&lt;iframe src=&quot;https://cdn.example/en.mp4&quot;&gt;"></div>';
    }, (url) => {
      urls.push(url);
      return { status: true, data: [{ slug: 'movie', title: 'Movie', type: 'movie' }] };
    });
    const result = await registry.resolve({ id: 'tt1', type: 'movie', title: 'Movie', language: 'en' }, ctx);
    assert.deepEqual(result.map((source) => source.url), ['https://cdn.example/en.mp4']);
    assert.ok(urls.every((url) => url.startsWith('https://ridomovies.su/')));
  });
});

describe('Frembed nativo francés', () => {
  it('usa id TMDb y descarta VOSTFR/VO sin doblaje francés', async () => {
    const urls: string[] = [];
    const ctx = context(() => '', (url) => {
      urls.push(url);
      if (url.endsWith('/api/domain')) return { domain: 'frembed.casa' };
      if (url.includes('/api/series')) return { links: [
        { lang: 'vf', url: 'https://cdn.example/fr.m3u8' },
        { lang: 'vo', url: 'https://cdn.example/en.m3u8' },
        { lang: 'vostfr', url: 'https://cdn.example/subbed.m3u8' },
      ] };
      return {};
    });
    const result = await frembedProvider.fetchSources({ ...episode, language: 'fr' }, ctx);
    assert.deepEqual(result.map((source) => source.url), ['https://cdn.example/fr.m3u8']);
    assert.ok(urls.some((url) => url.includes('/api/series?id=123&sa=2&epi=4')));
  });

  it('busca por título si no hay TMDb ID y no acepta dominio no fiable', async () => {
    const ctx = context(() => '', (url) => {
      if (url.endsWith('/api/domain')) return { domain: '127.0.0.1' };
      if (url.includes('/api/public/search?')) return { movies: [{ tmdb: 42, title_fr: 'Le voyage', year: '2020' }] };
      if (url.includes('/api/films?')) return { link1: 'https://cdn.example/film.mp4', link1vo: 'https://cdn.example/en.mp4' };
      return {};
    });
    const result = await frembedProvider.fetchSources({ type: 'movie', id: 'tt1', title: 'Le voyage', year: 2020 }, ctx);
    assert.deepEqual(result.map((source) => source.url), ['https://cdn.example/film.mp4']);
    assert.deepEqual(await frembedProvider.fetchSources({ type: 'movie', id: 'tt1', title: 'Le voyage', year: 2021 }, ctx), []);
  });

  it('elige sólo fuentes del idioma del perfil en el registro', async () => {
    const registry = new ScraperRegistry();
    registry.register(frembedProvider);
    registry.register(cineHaxProvider);
    const urls: string[] = [];
    const ctx = context((url) => { urls.push(url); return 'finalizePlayer({"latino":{"remux":"https://remux.unlimplay.com/m.mp4"}})'; },
      (url) => url.endsWith('/api/domain') ? { domain: 'frembed.casa' } : { link1: 'https://cdn.example/fr.mp4' });
    assert.deepEqual((await registry.resolve({ ...movie, language: 'es' }, ctx)).map((source) => source.provider), ['CineHax']);
    assert.deepEqual((await registry.resolve({ ...movie, language: 'fr' }, ctx)).map((source) => source.provider), ['Frembed']);
  });
});
