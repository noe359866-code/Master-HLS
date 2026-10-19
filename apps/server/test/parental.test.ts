import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import type { MetaPreview } from '@vibeflix/addon-engine';

import {
  DEFAULT_PARENTAL,
  applyParentalFilters,
  isParentalRestricted,
  normalizeParental,
  parentalBlockReason,
  ratingAgeOf,
  resetParentalPinAttempts,
  verifyParentalPin,
} from '../src/library/parental.js';
import { hashProfilePin } from '../src/library/profile-pin.js';
import { DEFAULT_SETTINGS, emptyData, normalizeData } from '../src/model.js';

function meta(partial: Partial<MetaPreview>): MetaPreview {
  return { id: 'tt1', type: 'movie', name: 'Título', ...partial };
}

describe('normalizeParental', () => {
  it('devuelve los valores por defecto con entrada vacía', () => {
    assert.deepEqual(normalizeParental(undefined), DEFAULT_PARENTAL);
    assert.deepEqual(normalizeParental({}), DEFAULT_PARENTAL);
  });

  it('acepta un nivel válido y normaliza los géneros', () => {
    const rules = normalizeParental({
      maxMaturity: 'kids',
      blockedGenres: ['Terror', 'ciencia ficción', 42, ''],
      requirePin: false,
    });
    assert.equal(rules.maxMaturity, 'kids');
    assert.deepEqual(rules.blockedGenres, ['horror', 'sci fi']);
    assert.equal(rules.requirePin, false);
  });

  it('rechaza niveles desconocidos y limita la lista de géneros', () => {
    const rules = normalizeParental({
      maxMaturity: 'extreme',
      blockedGenres: Array.from({ length: 100 }, (_, index) => `g${index}`),
    });
    assert.equal(rules.maxMaturity, 'off');
    assert.equal(rules.blockedGenres.length, 32);
  });
});

describe('ratingAgeOf', () => {
  it('interpreta las clasificaciones habituales', () => {
    assert.equal(ratingAgeOf(meta({ contentRating: 'PG' })), 12);
    assert.equal(ratingAgeOf(meta({ contentRating: 'PG-13' })), 15);
    assert.equal(ratingAgeOf(meta({ contentRating: 'TV-14' })), 15);
    assert.equal(ratingAgeOf(meta({ contentRating: 'R' })), 18);
    assert.equal(ratingAgeOf(meta({ contentRating: 'TV-MA' })), 18);
    assert.equal(ratingAgeOf(meta({ contentRating: '18' })), 18);
    assert.equal(ratingAgeOf(meta({ certification: '+16' })), 15);
  });

  it('devuelve null cuando no hay clasificación reconocible', () => {
    assert.equal(ratingAgeOf(meta({})), null);
    assert.equal(ratingAgeOf(meta({ contentRating: 'desconocida' })), null);
  });
});

describe('parentalBlockReason', () => {
  it('sin reglas no bloquea nada', () => {
    assert.equal(parentalBlockReason(meta({ genres: ['Horror'] }), undefined), null);
  });

  it('el nivel off solo respeta los géneros bloqueados por el usuario', () => {
    const rules = normalizeParental({ maxMaturity: 'off', blockedGenres: ['horror'] });
    assert.equal(parentalBlockReason(meta({ genres: ['Horror'] }), rules), 'Género bloqueado (horror)');
    assert.equal(parentalBlockReason(meta({ genres: ['Comedia'] }), rules), null);
  });

  it('kids solo permite géneros infantiles cuando se declaran géneros', () => {
    const rules = normalizeParental({ maxMaturity: 'kids' });
    assert.equal(parentalBlockReason(meta({ genres: ['Animación', 'Familiar'] }), rules), null);
    assert.equal(parentalBlockReason(meta({ genres: ['Crimen'] }), rules), 'Género no apto para perfiles infantiles');
    // Sin géneros declarados no se inventa bloqueo (mandan las palabras clave).
    assert.equal(parentalBlockReason(meta({}), rules), null);
  });

  it('kids y teen bloquean vocabulario adulto; off no', () => {
    const adult = meta({ name: 'Título XXX', genres: ['Comedia'] });
    assert.notEqual(parentalBlockReason(adult, normalizeParental({ maxMaturity: 'kids' })), null);
    assert.notEqual(parentalBlockReason(adult, normalizeParental({ maxMaturity: 'teen' })), null);
    assert.notEqual(parentalBlockReason(adult, normalizeParental({ maxMaturity: 'adult' })), null);
    assert.equal(parentalBlockReason(adult, normalizeParental({ maxMaturity: 'off' })), null);
  });

  it('teen bloquea clasificaciones ≥16 pero permite PG-13', () => {
    const rules = normalizeParental({ maxMaturity: 'teen' });
    assert.equal(parentalBlockReason(meta({ contentRating: 'PG-13', genres: ['Drama'] }), rules), null);
    assert.equal(parentalBlockReason(meta({ contentRating: 'R', genres: ['Drama'] }), rules), 'Clasificación no permitida para este perfil');
  });

  it('adult solo bloquea contenido marcado como adulto', () => {
    const rules = normalizeParental({ maxMaturity: 'adult' });
    assert.equal(parentalBlockReason(meta({ contentRating: 'R', genres: ['Drama'] }), rules), null);
    assert.notEqual(parentalBlockReason(meta({ genres: ['Adult'] }), rules), null);
  });

  it('una clasificación declarada manda sobre las heurísticas de género', () => {
    const rules = normalizeParental({ maxMaturity: 'kids' });
    // Animación con clasificación R: la clasificación manda y se bloquea.
    assert.notEqual(
      parentalBlockReason(meta({ genres: ['Animación'], contentRating: 'R' }), rules),
      null,
    );
    // Crimen sin clasificación se bloquea por género en kids...
    assert.notEqual(parentalBlockReason(meta({ genres: ['Crimen'] }), rules), null);
    // ...pero con clasificación infantil declarada, la clasificación manda.
    assert.equal(parentalBlockReason(meta({ genres: ['Crimen'], contentRating: 'TV-Y7' }), rules), null);
  });
});

describe('applyParentalFilters', () => {
  it('filtra las metas restringidas y conserva el orden', () => {
    const rules = normalizeParental({ maxMaturity: 'teen' });
    const metas = [
      meta({ id: 'a', genres: ['Comedia'] }),
      meta({ id: 'b', genres: ['Adult'] }),
      meta({ id: 'c', contentRating: 'TV-MA', genres: ['Drama'] }),
    ];
    assert.equal(isParentalRestricted(metas[1]!, rules), true);
    assert.equal(isParentalRestricted(metas[0]!, rules), false);
    assert.deepEqual(applyParentalFilters(metas, rules).map((entry) => entry.id), ['a']);
  });

  it('sin reglas no toca la lista', () => {
    const metas = [meta({ id: 'a' }), meta({ id: 'b' })];
    assert.equal(applyParentalFilters(metas, undefined), metas);
    assert.equal(applyParentalFilters(metas, DEFAULT_PARENTAL), metas);
  });
});

describe('verifyParentalPin', () => {
  beforeEach(() => {
    resetParentalPinAttempts();
  });

  it('acepta el PIN correcto y rechaza los incorrectos', () => {
    const stored = hashProfilePin('1234');
    assert.equal(verifyParentalPin('p1', stored, '1234'), true);
    assert.equal(verifyParentalPin('p1', stored, '0000'), false);
  });

  it('bloquea tras varios intentos fallidos', () => {
    const stored = hashProfilePin('1234');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      verifyParentalPin('p2', stored, '0000');
    }
    // Incluso con el PIN correcto: bloqueo temporal activo.
    assert.equal(verifyParentalPin('p2', stored, '1234'), false);
  });

  it('rechaza entradas vacías', () => {
    const stored = hashProfilePin('1234');
    assert.equal(verifyParentalPin('p3', stored, ''), false);
    assert.equal(verifyParentalPin('p3', stored, 'x'.repeat(200)), false);
  });
});

describe('normalizeData', () => {
  it('trae uiMode por defecto y rechaza valores desconocidos', () => {
    const withoutMode = normalizeData({
      ...emptyData(),
      settings: { language: 'es' } as never,
    });
    assert.equal(withoutMode.settings.uiMode, DEFAULT_SETTINGS.uiMode);

    const withBogus = normalizeData({
      ...emptyData(),
      settings: { ...DEFAULT_SETTINGS, uiMode: 'hacker' as never },
    });
    assert.equal(withBogus.settings.uiMode, 'advanced');

    const essential = normalizeData({
      ...emptyData(),
      settings: { ...DEFAULT_SETTINGS, uiMode: 'essential' },
    });
    assert.equal(essential.settings.uiMode, 'essential');
  });

  it('completa las reglas parentales de los perfiles', () => {
    const data = normalizeData({
      ...emptyData(),
      profiles: [
        {
          id: 'p1',
          name: 'Peque',
          avatar: 'x',
          color: '#fff',
          autoplay: true,
          autoplayFirstStream: false,
          createdAt: 0,
          parental: { maxMaturity: 'kids', blockedGenres: ['Terror'] } as never,
        },
      ],
    });
    assert.deepEqual(data.profiles[0]?.parental, {
      maxMaturity: 'kids',
      blockedGenres: ['horror'],
      requirePin: true,
    });
  });
});
