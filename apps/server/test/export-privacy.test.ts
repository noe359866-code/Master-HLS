import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeExportAddons } from '../src/routes/library.js';

describe('sanitizeExportAddons', () => {
  it('masks addon credentials while preserving non-sensitive configuration', () => {
    const addons = [{
      id: 'example.addon',
      name: 'Example',
      manifestUrl: 'https://example.com/manifest.json',
      installedAt: 123,
      config: {
        apiKey: 'secret-api-key',
        accessToken: 'secret-token',
        password: 'secret-password',
        language: 'es',
        quality: '1080p',
      },
    }];

    assert.deepEqual(sanitizeExportAddons(addons), [{
      ...addons[0],
      config: {
        apiKey: '••••',
        accessToken: '••••',
        password: '••••',
        language: 'es',
        quality: '1080p',
      },
    }]);

    // La función devuelve una copia y no modifica la configuración en memoria.
    assert.equal(addons[0]?.config?.apiKey, 'secret-api-key');
  });

  it('preserves addons without configuration', () => {
    const addon = {
      id: 'plain.addon',
      name: 'Plain',
      manifestUrl: 'https://example.com/manifest.json',
      installedAt: 123,
    };
    assert.deepEqual(sanitizeExportAddons([addon]), [addon]);
  });
});
