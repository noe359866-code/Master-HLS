import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectQuality,
  extractStreams,
  normalizeUrl,
  resolveEmbed,
  unbase,
  unpackPacker,
} from '../src/embed.js';

describe('extractores de embed', () => {
  it('extrae el HLS de un player con "hls"', () => {
    const html = `<script>var player = {"hls": "https://cdn.example.com/hls/master.m3u8","poster":"x.jpg"};</script>`;
    const found = extractStreams(html);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.url, 'https://cdn.example.com/hls/master.m3u8');
  });

  it('extrae el "file" de un player clasico', () => {
    const html = `{"file":"https://cdn.example.com/movie.mp4","title":"Demo"}`;
    const found = extractStreams(html);
    assert.equal(found[0]!.url, 'https://cdn.example.com/movie.mp4');
  });

  it('extrae todas las fuentes de un array "sources" con su etiqueta', () => {
    const html = `{"sources":[{"file":"https://a.example.com/720.mp4","label":"720p"},{"file":"https://a.example.com/1080.mp4","label":"1080p"}]}`;
    const found = extractStreams(html);
    assert.equal(found.length, 2);
    assert.equal(found[0]!.quality, '720p');
    assert.equal(found[1]!.quality, '1080p');
  });

  it('extrae la fuente de un <video> o <source>', () => {
    const html = `<video src="https://cdn.example.com/v.mp4" controls></video>`;
    assert.equal(extractStreams(html)[0]!.url, 'https://cdn.example.com/v.mp4');
  });

  it('encuentra un m3u8 literal en la pagina', () => {
    const html = `<script>var url="https://cdn.example.com/live/index.m3u8";</script>`;
    assert.equal(extractStreams(html)[0]!.url, 'https://cdn.example.com/live/index.m3u8');
  });

  it('resuelve las URLs relativas y protocol-relative', () => {
    assert.equal(
      normalizeUrl('//cdn.example.com/a.mp4'),
      'https://cdn.example.com/a.mp4',
    );
    assert.equal(
      normalizeUrl('/media/a.mp4', 'https://site.example/watch/1'),
      'https://site.example/media/a.mp4',
    );
    assert.equal(normalizeUrl('javascript:void(0)'), undefined);
  });

  it('detecta la calidad en el nombre o en la URL', () => {
    assert.equal(detectQuality('Movie 1080p'), '1080p');
    assert.equal(detectQuality('https://cdn.example.com/movie-720P.mp4'), '720p');
    assert.equal(detectQuality('sin calidad'), undefined);
  });
});

describe('desempaquetador de JavaScript', () => {
  it('decodifica un payload empaquetado', () => {
    const packed =
      `eval(function(p,a,c,k,e,d){e=function(c){return(c<a?'':e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};` +
      `if(!''.replace(/^/,String)){while(c--){d[e(c)]=k[c]||e(c)}k=[function(e){return d[e]};e=function(){return'\\\\w+'};c=1};` +
      `while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}` +
      `('0="https://cdn.example.com/master.m3u8"',62,1,'a'.split('|'),0,{}))`;

    const unpacked = unpackPacker(packed);
    assert.ok(unpacked);
    assert.match(unpacked!, /https:\/\/cdn\.example\.com\/master\.m3u8/);
  });

  it('decodifica la tabla de cadenas', () => {
    const packed =
      `eval(function(p,a,c,k,e,d){` +
      `while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+c+'\\\\b','g'),k[c])}}return p}` +
      `('var _0=["https://cdn.example.com/v.m3u8"];a=_0[1]',62,2,'a|0'.split('|'),0,{}))`;

    const unpacked = unpackPacker(packed);
    assert.ok(unpacked);
    assert.match(unpacked!, /https:\/\/cdn\.example\.com\/v\.m3u8/);
  });

  it('devuelve undefined si no hay nada empaquetado', () => {
    assert.equal(unpackPacker('var a = 1;'), undefined);
  });

  it('convierte palabras en base 62', () => {
    assert.equal(unbase('0', 62), 0);
    assert.equal(unbase('9', 62), 9);
    assert.equal(unbase('a', 62), 10);
    assert.equal(unbase('A', 62), 36);
    assert.equal(unbase('10', 62), 62);
    assert.equal(unbase('ff', 16), 255);
  });
});

describe('resolucion de embed', () => {
  it('descarga la pagina y devuelve los enlaces', async () => {
    const html = `<script>{"hls":"https://cdn.example.com/x/master.m3u8"}</script>`;
    const found = await resolveEmbed('https://embed.example/e/abc', {
      fetchText: async () => html,
    });
    assert.equal(found.length, 1);
    assert.equal(found[0]!.url, 'https://cdn.example.com/x/master.m3u8');
  });

  it('devuelve una lista vacia si la pagina falla', async () => {
    const found = await resolveEmbed('https://embed.example/e/abc', {
      fetchText: async () => {
        throw new Error('sin red');
      },
    });
    assert.deepEqual(found, []);
  });
});
