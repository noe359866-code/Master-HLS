import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  addonBaseUrl,
  buildConfigureUrl,
  buildResourceUrl,
  encodeContentId,
  manifestQuery,
  mergeQuery,
  normalizeManifestUrl,
  serializeExtra,
} from '../src/url.js';

describe('normalizeManifestUrl', () => {
  it('normaliza la raiz a /manifest.json', () => {
    assert.equal(normalizeManifestUrl('https://host.tld'), 'https://host.tld/manifest.json');
    assert.equal(normalizeManifestUrl('https://host.tld/'), 'https://host.tld/manifest.json');
  });

  it('quita el flag configure', () => {
    assert.equal(
      normalizeManifestUrl('https://host.tld/manifest.json?configure=true'),
      'https://host.tld/manifest.json',
    );
  });

  it('conserva la query de configuracion (api key)', () => {
    assert.equal(
      normalizeManifestUrl('https://host.tld/manifest.json?apiKey=abc'),
      'https://host.tld/manifest.json?apiKey=abc',
    );
  });

  it('rechaza protocolos no http(s)', () => {
    assert.throws(() => normalizeManifestUrl('ftp://host.tld/manifest.json'));
  });
});

describe('addonBaseUrl', () => {
  it('quita el sufijo manifest.json', () => {
    assert.equal(addonBaseUrl('https://host.tld/manifest.json'), 'https://host.tld');
    assert.equal(addonBaseUrl('https://host.tld/sub/manifest.json'), 'https://host.tld/sub');
  });
});

describe('buildResourceUrl', () => {
  it('hereda la query del manifest (api key) en los recursos', () => {
    const url = buildResourceUrl('https://host.tld/manifest.json?apiKey=abc', 'catalog', [
      'movie',
      'top',
    ]);
    assert.equal(url, 'https://host.tld/catalog/movie/top.json?apiKey=abc');
  });

  it('codifica los ids con caracteres especiales', () => {
    const url = buildResourceUrl('https://host.tld/manifest.json', 'meta', [
      'series',
      'tt1234567:1:2',
    ]);
    assert.equal(url, 'https://host.tld/meta/series/tt1234567%3A1%3A2.json');
  });

  it('anade el extra de catalogos', () => {
    const url = buildResourceUrl('https://host.tld/manifest.json', 'catalog', ['movie', 'top'], {
      extra: { genre: 'Action', skip: 0 },
    });
    assert.ok(url.includes('genre=Action'));
    assert.ok(url.includes('skip=0'));
  });

  it('da prioridad a la configuracion sobre la query del manifest', () => {
    const url = buildResourceUrl('https://host.tld/manifest.json?apiKey=old', 'stream', ['movie', 'tt1'], {
      config: { apiKey: 'new' },
    });
    assert.ok(url.includes('apiKey=new'));
    assert.ok(!url.includes('apiKey=old'));
  });

  it('soporta addons con ruta base anidada', () => {
    const url = buildResourceUrl('https://host.tld/x/manifest.json?k=1', 'stream', ['movie', 'tt1']);
    assert.equal(url, 'https://host.tld/x/stream/movie/tt1.json?k=1');
  });
});

describe('buildConfigureUrl', () => {
  it('añade configure=true conservando el resto de parametros', () => {
    const url = buildConfigureUrl('https://host.tld/manifest.json?apiKey=abc');
    assert.ok(url.includes('apiKey=abc'));
    assert.ok(url.includes('configure=true'));
  });
});

describe('mergeQuery', () => {
  it('elimina configure', () => {
    const params = mergeQuery('https://host.tld/manifest.json?configure=true&a=1');
    assert.equal(params.get('configure'), null);
    assert.equal(params.get('a'), '1');
  });
});

describe('manifestQuery', () => {
  it('extrae los parametros del manifest', () => {
    const query = manifestQuery('https://host.tld/manifest.json?apiKey=abc&x=1');
    assert.deepEqual(query, { apiKey: 'abc', x: '1' });
  });
});

describe('helpers de id', () => {
  it('codifica y decodifica ids de contenido', () => {
    assert.equal(encodeContentId('tt1:2:3'), 'tt1%3A2%3A3');
  });
});

describe('serializeExtra', () => {
  it('ignora valores vacios', () => {
    assert.equal(serializeExtra({ a: '1', b: undefined, c: '' }), 'a=1');
  });
});
