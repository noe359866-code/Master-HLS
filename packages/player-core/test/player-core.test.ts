import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseHlsImagePlaylist, parseSpritePlaylist, thumbnailAt, thumbnailCss, thumbnailBox, resolveSpriteUrl } from '../src/thumbnails.js';
import { backdropFor, bestImage, isTmdbImage, pickWidth, posterFor, resizeTmdbImage, TMDB_POSTER_WIDTHS } from '../src/images.js';
import { detectCapabilities, displayCeiling, estimateBandwidthMbps, isLowEndDevice, supportedCodecs } from '../src/capabilities.js';
import { bufferAhead, bufferBehind, bufferHealth, describeStats, droppedRatio } from '../src/stats.js';
import {
  DEFAULT_SUBTITLE_STYLE,
  nextVideoScale,
  normalizeSubtitleStyle,
  resolveSubtitleColor,
  shouldEnableSubtitles,
  subtitleCssVars,
  videoScaleCss,
  videoScaleLabel,
} from '../src/subtitleStyle.js';
import { audioChannelLabel, languageCode, languageName, streamLabelFor, videoCodecLabel } from '../src/labels.js';

const SPRITE_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:10.000
sprites/sheet1.jpg#xywh=0,0,320,180

2
00:00:10.000 --> 00:00:20.000
sprites/sheet1.jpg#xywh=320,0,320,180

3
00:00:20.000 --> 00:00:30.000
https://cdn.tld/sheet2.jpg#xywh=0,180,320,180
`;

describe('miniaturas de previsualizacion', () => {
  const sprites = parseSpritePlaylist(SPRITE_VTT, 'https://cdn.tld/master/playlist.vtt');

  it('parsea las hojas y resuelve las URLs relativas', () => {
    assert.equal(sprites.length, 3);
    assert.equal(sprites[0]?.url, 'https://cdn.tld/master/sprites/sheet1.jpg');
    assert.equal(sprites[2]?.url, 'https://cdn.tld/sheet2.jpg');
    assert.deepEqual({ x: sprites[1]?.x, y: sprites[1]?.y }, { x: 320, y: 0 });
  });

  it('devuelve el recorte del instante pedido', () => {
    assert.equal(thumbnailAt(sprites, 5000)?.startMs, 0);
    assert.equal(thumbnailAt(sprites, 15000)?.x, 320);
    assert.equal(thumbnailAt(sprites, 25000)?.url, 'https://cdn.tld/sheet2.jpg');
    assert.equal(thumbnailAt([], 5000), undefined);
  });

  it('genera el CSS del recorte', () => {
    const css = thumbnailCss(sprites[1]!, 160, 90);
    assert.match(css['backgroundImage'] ?? '', /sheet1\.jpg/);
    assert.equal(css['width'], '160px');
    assert.ok(css['backgroundPosition']?.includes('-'));
  });

  it('calcula la caja con la relacion del sprite', () => {
    assert.deepEqual(thumbnailBox(sprites, 240), { width: 240, height: 135 });
  });

  it('acepta regiones en porcentaje', () => {
    const percent = parseSpritePlaylist(
      'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nhttps://cdn/s.jpg#xywh=percent:25,0,25,50\n',
    );
    assert.equal(percent[0]?.x, 0.25);
    assert.equal(percent[0]?.sheetWidth, 1);
  });

  it('resuelve URLs absolutas y relativas', () => {
    assert.equal(resolveSpriteUrl('https://a/b.jpg', 'https://c/'), 'https://a/b.jpg');
    assert.equal(resolveSpriteUrl('b.jpg', 'https://c/x/y.vtt'), 'https://c/x/b.jpg');
  });
});

describe('imagenes de catalogos', () => {
  it('detecta las URLs de TMDb', () => {
    assert.equal(isTmdbImage('https://image.tmdb.org/t/p/w500/x.jpg'), true);
    assert.equal(isTmdbImage('https://cdn.addon.tld/poster.jpg'), false);
  });

  it('elige el ancho publicado mas pequeno que cubre el hueco', () => {
    assert.equal(pickWidth(120, TMDB_POSTER_WIDTHS), 154);
    assert.equal(pickWidth(4000, TMDB_POSTER_WIDTHS), 780);
  });

  it('reescribe el perfil de la URL de TMDb', () => {
    assert.equal(
      resizeTmdbImage('https://image.tmdb.org/t/p/original/abc.jpg', 200),
      'https://image.tmdb.org/t/p/w342/abc.jpg',
    );
    assert.equal(
      resizeTmdbImage('https://image.tmdb.org/t/p/w780/abc.jpg', 150, 'backdrop'),
      'https://image.tmdb.org/t/p/w300/abc.jpg',
    );
  });

  it('no toca las URLs de otros proveedores', () => {
    const url = 'https://cdn.addon.tld/poster.jpg';
    assert.equal(resizeTmdbImage(url, 200), url);
  });

  it('tiene en cuenta el devicePixelRatio', () => {
    assert.equal(posterFor('https://image.tmdb.org/t/p/original/a.jpg', 180, 2), 'https://image.tmdb.org/t/p/w500/a.jpg');
    assert.equal(backdropFor('https://image.tmdb.org/t/p/w300/a.jpg', 1200, 1), 'https://image.tmdb.org/t/p/w1280/a.jpg');
  });

  it('elige la mejor imagen disponible', () => {
    assert.equal(bestImage({ poster: 'p', background: 'b' }), 'p');
    assert.equal(bestImage({ background: 'b' }, 'landscape'), 'b');
    assert.equal(bestImage({ landscapePoster: 'l' }, 'landscape'), 'l');
  });
});

describe('capacidades del dispositivo', () => {
  it('deduce el techo de resolucion de la pantalla', () => {
    assert.equal(displayCeiling(1080, 1920), 1080);
    assert.equal(displayCeiling(2160, 3840), 2160);
    assert.equal(displayCeiling(720, 1280), 720);
    assert.equal(displayCeiling(undefined, undefined), 1080);
  });

  it('detecta los codecs reproducibles', () => {
    const codecs = supportedCodecs({
      canPlay: (mime) => (mime.includes('avc1') || mime.includes('hvc1') ? 'probably' : ''),
    });
    assert.deepEqual(codecs, ['hevc', 'h264']);
    assert.deepEqual(supportedCodecs({}), ['h264']);
  });

  it('estima el ancho de banda con margen y ahorro de datos', () => {
    assert.equal(estimateBandwidthMbps({ connection: { downlink: 20 } }), 15);
    assert.equal(estimateBandwidthMbps({ connection: { effectiveType: '3g' } }), 1.5);
    assert.equal(estimateBandwidthMbps({ connection: { downlink: 20, saveData: true } }), 1.5);
    assert.equal(estimateBandwidthMbps({}), undefined);
  });

  it('devuelve capacidades completas listas para el servidor', () => {
    const caps = detectCapabilities({
      screenHeight: 1080,
      screenWidth: 1920,
      devicePixelRatio: 1,
      hdrMediaQuery: true,
      canPlay: (mime) => (mime.includes('avc1') ? 'probably' : ''),
      hardwareConcurrency: 8,
      deviceMemory: 8,
      connection: { downlink: 40 },
    });
    assert.equal(caps.maxHeight, 1080);
    assert.equal(caps.supportsHdr, true);
    assert.deepEqual(caps.preferredCodecs, ['h264']);
    assert.equal(caps.maxBandwidthMbps, 30);
    assert.equal(caps.maxFrameRate, 60);
  });

  it('marca los dispositivos justos', () => {
    assert.equal(isLowEndDevice({ hardwareConcurrency: 2, deviceMemory: 1 }), true);
    assert.equal(isLowEndDevice({ hardwareConcurrency: 8, deviceMemory: 4 }), false);
  });
});

describe('estadisticas', () => {
  const buffered = {
    length: 2,
    start: (index: number) => (index === 0 ? 0 : 200),
    end: (index: number) => (index === 0 ? 120 : 260),
  };

  it('calcula el buffer por delante y por detras', () => {
    assert.equal(bufferAhead(buffered, 100), 20);
    assert.equal(bufferAhead(buffered, 210), 50);
    assert.equal(bufferAhead(null, 10), 0);
    assert.equal(bufferBehind(buffered, 100), 100);
  });

  it('clasifica la salud del buffer', () => {
    assert.equal(bufferHealth(30), 'good');
    assert.equal(bufferHealth(10), 'fair');
    assert.equal(bufferHealth(2), 'poor');
  });

  it('calcula el ratio de fotogramas descartados', () => {
    assert.equal(droppedRatio({ droppedFrames: 5, decodedFrames: 95 }), 0.05);
    assert.equal(droppedRatio({ droppedFrames: 0, decodedFrames: 0 }), 0);
  });

  it('prepara las filas del panel', () => {
    const rows = describeStats({
      currentLevel: 2,
      autoLevel: true,
      bandwidthEstimate: 12_000_000,
      bufferedAhead: 25,
      bufferBehind: 60,
      droppedFrames: 2,
      decodedFrames: 3000,
      stallCount: 1,
      stallTotalMs: 1200,
      bitrate: 6_000_000,
      activeLevel: { height: 1080, bitrate: 6_000_000, codecs: ['avc1.640028'] },
      timeToFirstFrameMs: 850,
    });
    const quality = rows.find((row) => row.label === 'Calidad');
    assert.equal(quality?.value, '1080p');
    assert.ok(rows.some((row) => row.label === 'Arranque'));
    assert.ok(rows.some((row) => row.value === '12 Mbps'));
  });
});

describe('estilo de subtitulos y modo de video', () => {
  it('completa y limita un estilo parcial', () => {
    const style = normalizeSubtitleStyle({ size: 99, opacity: -1, verticalPosition: 200 });
    assert.equal(style.size, 2.5);
    assert.equal(style.opacity, 0.2);
    assert.equal(style.verticalPosition, 40);
    assert.equal(normalizeSubtitleStyle(null).size, DEFAULT_SUBTITLE_STYLE.size);
    // El color guardado como identificador se resuelve al valor CSS.
    assert.equal(normalizeSubtitleStyle({ color: 'green' }).color, '#9dff9d');
    assert.equal(normalizeSubtitleStyle({ color: '#123456' }).color, '#123456');
  });

  it('genera las variables CSS', () => {
    const vars = subtitleCssVars({ color: 'yellow', edge: 'shadow', size: 1.25 });
    assert.equal(vars['--sub-scale'], '1.25');
    assert.ok(vars['--sub-shadow']?.includes('px'));
    // El identificador se resuelve al valor de la paleta (verde, gris, ...).
    assert.equal(vars['--sub-color'], '#ffe27a');
  });

  it('resuelve los colores por identificador', () => {
    assert.equal(resolveSubtitleColor('green'), '#9dff9d');
    assert.equal(resolveSubtitleColor('#ff0000'), '#ff0000');
  });

  it('cicla los modos de video y los etiqueta', () => {
    assert.equal(nextVideoScale('contain'), 'cover');
    assert.equal(nextVideoScale('zoom'), 'contain');
    assert.equal(videoScaleCss('cover').objectFit, 'cover');
    assert.equal(videoScaleCss('zoom').transform, 'scale(1.15)');
    assert.equal(videoScaleLabel('fill'), 'Estirar');
  });

  it('activa los subtitulos solo para audio extranjero', () => {
    assert.equal(
      shouldEnableSubtitles({ audioLanguage: 'en', contentLanguage: 'es', onlyForForeignAudio: true }),
      true,
    );
    assert.equal(
      shouldEnableSubtitles({ audioLanguage: 'es', contentLanguage: 'es', onlyForForeignAudio: true }),
      false,
    );
    assert.equal(
      shouldEnableSubtitles({ audioLanguage: 'es', contentLanguage: 'es', onlyForForeignAudio: false }),
      true,
    );
    assert.equal(
      shouldEnableSubtitles({ audioLanguage: 'es', contentLanguage: 'es', preferSubtitles: false }),
      false,
    );
  });
});

describe('etiquetas de pistas e idiomas', () => {
  it('normaliza codigos ISO 639-2 y variantes', () => {
    assert.equal(languageCode('spa'), 'es');
    assert.equal(languageCode('es-419'), 'es');
    assert.equal(languageCode('eng'), 'en');
    assert.equal(languageCode('pt-BR'), 'pt');
    assert.equal(languageCode(''), '');
  });

  it('devuelve el nombre nativo', () => {
    assert.equal(languageName('ja'), '日本語');
    assert.equal(languageName('spa'), 'Español');
    assert.equal(languageName('xx'), 'XX');
  });

  it('describe los canales de audio', () => {
    assert.equal(audioChannelLabel('6'), '5.1');
    assert.equal(audioChannelLabel('"2"'), 'Estéreo');
    assert.equal(audioChannelLabel(''), '');
  });

  it('describe el codec de video de un nivel', () => {
    assert.equal(videoCodecLabel({ codecs: ['hvc1.2.4.L153.B0'] }), 'HEVC');
    assert.equal(videoCodecLabel({ codecs: ['av01.0.05M.08'] }), 'AV1');
    assert.equal(videoCodecLabel({ codecs: ['avc1.640028', 'mp4a.40.2'] }), 'H.264');
    assert.equal(videoCodecLabel(null), '');
  });

  it('etiqueta un stream con calidad, HDR, audio y codec', () => {
    assert.equal(
      streamLabelFor({ description: '2160p HEVC HDR10 Atmos', url: 'https://cdn/a.m3u8' }),
      '4K' + ' · HDR · Atmos · HEVC',
    );
    assert.equal(streamLabelFor({ name: 'Vibe Flix', infoHash: 'abc' }), 'Torrent');
    assert.equal(streamLabelFor({ ytId: 'xyz' }), 'YouTube');
  });
});

describe('playlist HLS de imagenes (previsualizacion del salto)', () => {
  const PLAYLIST = [
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:20',
    '#EXT-X-VERSION:7',
    '#EXTINF:20.0,',
    'sheets/s1.jpg',
    '#EXTINF:20.0,',
    'sheets/s2.jpg',
    '',
  ].join('\n');

  it('reparte cada hoja entre sus mosaicos', () => {
    const thumbs = parseHlsImagePlaylist(PLAYLIST, {
      baseUrl: 'https://cdn.tld/images/index.m3u8',
      tileWidth: 320,
      tileHeight: 180,
      tilesX: 5,
      tilesY: 5,
    });
    // 2 hojas x 25 mosaicos.
    assert.equal(thumbs.length, 50);
    const first = thumbs[0]!;
    assert.equal(first.url, 'https://cdn.tld/images/sheets/s1.jpg');
    assert.equal(first.startMs, 0);
    assert.equal(first.endMs, 800, '20 s entre 25 mosaicos');
    assert.deepEqual([first.x, first.y, first.width, first.height], [0, 0, 320, 180]);
    assert.deepEqual([first.sheetWidth, first.sheetHeight], [1600, 900]);

    const sixth = thumbs[5]!;
    // El sexto mosaico (indice 5) es el primero de la segunda fila.
    assert.deepEqual([sixth.x, sixth.y], [0, 180]);
    assert.deepEqual([thumbs[4]!.x, thumbs[4]!.y], [1280, 0], 'el quinto cierra la primera fila');

    const lastSheet = thumbs[25]!;
    assert.equal(lastSheet.url, 'https://cdn.tld/images/sheets/s2.jpg');
    assert.equal(lastSheet.startMs, 20_000, 'la segunda hoja empieza donde acaba la primera');
  });

  it('funciona con una sola imagen por entrada', () => {
    const thumbs = parseHlsImagePlaylist('#EXTINF:4,\none.jpg\n#EXTINF:4,\ntwo.jpg\n', {
      baseUrl: 'https://cdn.tld/p.m3u8',
      tileWidth: 200,
      tileHeight: 112,
    });
    assert.equal(thumbs.length, 2);
    assert.equal(thumbs[1]?.startMs, 4000);
    assert.equal(thumbs[1]?.url, 'https://cdn.tld/two.jpg');
    assert.equal(thumbs[0]?.width, 200);
  });

  it('usa DURATION del master cuando el playlist no trae EXTINF', () => {
    const thumbs = parseHlsImagePlaylist('s1.jpg\ns2.jpg\n', { sheetSeconds: 10, tilesX: 2, tilesY: 1 });
    assert.equal(thumbs.length, 4);
    assert.equal(thumbs[3]?.startMs, 15_000);
  });

  it('acepta un WebVTT de sprites en el mismo sitio', () => {
    const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nsheet.jpg#xywh=0,0,320,180\n';
    const thumbs = parseHlsImagePlaylist(vtt, { baseUrl: 'https://cdn.tld/p.vtt' });
    assert.equal(thumbs.length, 1);
    assert.equal(thumbs[0]?.width, 320);
  });

  it('situa el instante en su miniatura', () => {
    const thumbs = parseHlsImagePlaylist(PLAYLIST, { tilesX: 5, tilesY: 5, tileWidth: 320, tileHeight: 180 });
    assert.equal(thumbnailAt(thumbs, 0)?.startMs, 0);
    assert.equal(thumbnailAt(thumbs, 900)?.x, 320);
    assert.equal(thumbnailAt(thumbs, 21_000)?.url.includes('s2.jpg'), true);
  });
});
