import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  contentLanguages,
  createTranslator,
  DEFAULT_LOCALE,
  formatNumber,
  hasDictionary,
  interpolate,
  isRtl,
  localeInfo,
  localeLabel,
  LOCALES,
  onLocaleChange,
  resolveLocale,
  setLocale,
  t,
  typeLabel,
} from '../src/index.js';
import { DICTIONARIES, EN, ES } from '../src/strings.js';

describe('resolveLocale', () => {
  it('normaliza etiquetas y regiones', () => {
    assert.equal(resolveLocale('es-ES'), 'es');
    assert.equal(resolveLocale('ES_es'), 'es');
    assert.equal(resolveLocale('en'), 'en');
    assert.equal(resolveLocale('en-US'), 'en');
  });

  it('cae al idioma por defecto cuando no hay diccionario', () => {
    assert.equal(resolveLocale('ja-JP'), DEFAULT_LOCALE);
    assert.equal(resolveLocale(''), DEFAULT_LOCALE);
    assert.equal(resolveLocale(null), DEFAULT_LOCALE);
  });

  it('marca los locales con diccionario', () => {
    assert.equal(hasDictionary('es'), true);
    assert.equal(hasDictionary('en-US'), true);
    assert.equal(hasDictionary('ar-AR'), false);
  });
});

describe('interpolate', () => {
  it('sustituye marcadores posicionales (%s) como stremio-translations', () => {
    assert.equal(interpolate('Ends at %s', ['22:40']), 'Ends at 22:40');
    assert.equal(interpolate('%s of %d', ['3', 10]), '3 of 10');
    assert.equal(interpolate('Ends at %s', { time: '22:40' }), 'Ends at 22:40');
  });

  it('sustituye marcadores con nombre ({{ }})', () => {
    assert.equal(interpolate('Play in {{device}}', { device: 'TV' }), 'Play in TV');
    assert.equal(interpolate('{{a}} y {{b}}', { a: 1, b: 2 }), '1 y 2');
    assert.equal(interpolate('sin {{nada}}', {}), 'sin ');
  });

  it('sin parametros devuelve la plantilla', () => {
    assert.equal(interpolate('Hola'), 'Hola');
  });
});

describe('createTranslator', () => {
  it('traduce en espanol por defecto', () => {
    const translator = createTranslator();
    assert.equal(translator.locale, 'es');
    assert.equal(translator.dir, 'ltr');
    assert.equal(translator.t('PLAYER_PLAY'), 'Reproducir');
    assert.equal(translator.t('SUBTITLES'), 'Subtítulos');
  });

  it('traduce en ingles', () => {
    const translator = createTranslator('en-US');
    assert.equal(translator.t('PLAYER_PLAY'), 'Play');
    assert.equal(translator.t('SETTINGS_SHORTCUT_EXIT_BACK'), 'Exit Fullscreen / Go Back');
  });

  it('usa las mismas claves y textos que stremio-translations', () => {
    const en = createTranslator('en');
    const es = createTranslator('es');
    assert.equal(en.t('PLAYER_CLOCK_ENDS_AT', ['22:40']), 'Ends at 22:40');
    assert.equal(es.t('PLAYER_CLOCK_ENDS_AT', ['22:40']), 'Termina a las 22:40');
    assert.equal(es.t('PLAYER_PLAYBACK_SPEED'), 'Velocidad de reproducción');
  });

  it('reserva al ingles cuando falta la clave y a la clave en ultimo extremo', () => {
    const translator = createTranslator('es');
    assert.equal(translator.t('CLAVE_INVENTADA'), 'CLAVE_INVENTADA');
    assert.equal(translator.has('PLAYER_PLAY'), true);
    assert.equal(translator.has('CLAVE_INVENTADA'), false);
  });

  it('marca la direccion de escritura de los idiomas RTL', () => {
    // Sin diccionario arabe se reserva al espanol: el layout sigue al texto.
    assert.equal(createTranslator('ar-AR').dir, 'ltr');
    assert.equal(createTranslator('ar-AR').requested, 'ar-AR');
    assert.equal(isRtl('ar-AR'), true);
    assert.equal(isRtl('he-IL'), true);
    assert.equal(isRtl('ur-PK'), true);
    assert.equal(isRtl('es-ES'), false);
  });
});

describe('cobertura de diccionarios', () => {
  it('el espanol cubre todas las claves del ingles', () => {
    const keys = Object.keys(EN) as Array<keyof typeof EN>;
    const missing = keys.filter((key) => !ES[key]);
    assert.deepEqual(missing, []);
  });

  it('no hay claves de mas en el espanol', () => {
    const extra = Object.keys(ES).filter((key) => !(key in EN));
    assert.deepEqual(extra, []);
  });

  it('todos los diccionarios tienen el mismo conjunto de claves', () => {
    const reference = Object.keys(EN).sort().join(',');
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      assert.equal(Object.keys(dictionary).sort().join(','), reference, locale);
    }
  });
});

describe('locales de stremio-translations', () => {
  it('ofrece los 51 locales del proyecto upstream', () => {
    assert.equal(LOCALES.length, 51);
    assert.equal(LOCALES.filter((locale) => locale.translated).length, 2);
  });

  it('cada locale tiene nombre nativo y en ingles', () => {
    for (const locale of LOCALES) {
      assert.ok(locale.nativeName, locale.tag);
      assert.ok(locale.englishName, locale.tag);
      assert.equal(locale.language.length, 2, locale.tag);
    }
  });

  it('expone nombres y la lista de idiomas de contenido sin duplicar', () => {
    assert.equal(localeLabel('es-ES'), 'Español');
    assert.equal(localeLabel('ja'), '日本語');
    const languages = contentLanguages();
    assert.equal(new Set(languages.map((entry) => entry.code)).size, languages.length);
    assert.ok(languages.some((entry) => entry.code === 'ar'));
  });

  it('resuelve la informacion por etiqueta o por idioma', () => {
    assert.equal(localeInfo('pt-BR')?.language, 'pt');
    assert.equal(localeInfo('pt')?.tag, 'pt-BR');
    assert.equal(localeInfo('xx'), undefined);
  });
});

describe('instancia activa', () => {
  it('cambia de idioma y avisa a los suscriptores', () => {
    const seen: string[] = [];
    const unsubscribe = onLocaleChange((translator) => seen.push(translator.locale));
    setLocale('en-US');
    assert.equal(t('PLAYER_PLAY'), 'Play');
    setLocale('es');
    assert.equal(t('PLAYER_PLAY'), 'Reproducir');
    assert.deepEqual(seen, ['en', 'es']);
    unsubscribe();
    setLocale('en');
    assert.deepEqual(seen, ['en', 'es']);
    setLocale('es');
  });

  it('localiza numeros con digitos estandar', () => {
    setLocale('es');
    assert.equal(formatNumber(1234.5, { maximumFractionDigits: 1 }), '1234,5');
  });

  it('etiqueta los tipos de contenido', () => {
    setLocale('es');
    assert.equal(typeLabel('movie'), 'Película');
    assert.equal(typeLabel('series'), 'Series');
    assert.equal(typeLabel('desconocido'), 'desconocido');
    setLocale('en');
    assert.equal(typeLabel('movie'), 'Movie');
    setLocale('es');
  });
});
