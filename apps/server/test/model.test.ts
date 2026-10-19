import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { emptyData, normalizeData, DEFAULT_SETTINGS } from '../src/model.js';

describe('normalizeData', () => {
  it('completa los ajustes que falten en datos antiguos', () => {
    const legacy = {
      ...emptyData(),
      settings: { language: 'es' } as never,
    };
    const data = normalizeData(legacy);
    assert.equal(data.settings.builtInMetadata, DEFAULT_SETTINGS.builtInMetadata);
    assert.equal(data.settings.builtInMetadataUrl, DEFAULT_SETTINGS.builtInMetadataUrl);
    assert.equal(data.settings.device.maxHeight, DEFAULT_SETTINGS.device.maxHeight);
  });

  it('conserva los ajustes existentes', () => {
    const data = normalizeData({
      ...emptyData(),
      settings: { ...DEFAULT_SETTINGS, builtInMetadata: false } as never,
    });
    assert.equal(data.settings.builtInMetadata, false);
  });

  it('rellena el perfil activo si falta', () => {
    const data = normalizeData({
      ...emptyData(),
      profiles: [
        {
          id: 'p1',
          name: 'Perfil',
          avatar: '👤',
          color: '#fff',
          autoplay: true,
          autoplayFirstStream: false,
          createdAt: 0,
        },
      ],
    });
    assert.equal(data.activeProfileId, 'p1');
  });
});
