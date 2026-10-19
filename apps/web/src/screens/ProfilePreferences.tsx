import { useEffect, useState } from 'react';

import { api, ApiError } from '../api';
import { useApp } from '../store';
import type { Genre, MaturityLevel, Profile } from '../types';
import { Button } from '../components/ui';
import { useI18n } from '../i18n';

/** Niveles del control parental (NuvioTV: ParentalGuide). */
const MATURITY_LEVELS: Array<{ id: MaturityLevel; key: 'PARENTAL_LEVEL_OFF' | 'PARENTAL_LEVEL_KIDS' | 'PARENTAL_LEVEL_TEEN' | 'PARENTAL_LEVEL_ADULT' }> = [
  { id: 'off', key: 'PARENTAL_LEVEL_OFF' },
  { id: 'kids', key: 'PARENTAL_LEVEL_KIDS' },
  { id: 'teen', key: 'PARENTAL_LEVEL_TEEN' },
  { id: 'adult', key: 'PARENTAL_LEVEL_ADULT' },
];

/** Idiomas configurables; solo hay streams si existe un proveedor compatible. */
export const CONTENT_LANGUAGES = [
  { code: 'es-419', label: 'Español latino', detail: 'América Latina' },
  { code: 'es-ES', label: 'Español de España', detail: 'Castellano' },
  { code: 'en', label: 'English', detail: 'Inglés' },
  { code: 'pt', label: 'Português', detail: 'Portugués' },
  { code: 'fr', label: 'Français', detail: 'Francés' },
  { code: 'de', label: 'Deutsch', detail: 'Alemán' },
  { code: 'it', label: 'Italiano', detail: 'Italiano' },
  { code: 'pl', label: 'Polski', detail: 'Polaco' },
  { code: 'ja', label: '日本語', detail: 'Japonés' },
  { code: 'ko', label: '한국어', detail: 'Coreano' },
  { code: 'zh', label: '中文', detail: 'Chino' },
] as const;

export function languageLabel(code?: string): string {
  if (!code) return 'Sin elegir';
  return CONTENT_LANGUAGES.find((option) => option.code === code)?.label ?? code;
}

/** Alta inicial o edición: nombre e idioma se guardan en el perfil del servidor. */
export function ProfilePreferences({
  profile,
  welcome = false,
  onSaved,
  onCancel,
}: {
  profile: Profile;
  welcome?: boolean;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { updateProfile } = useApp();
  const { t } = useI18n();
  const [name, setName] = useState(
    profile.id === 'default' && profile.name === 'Perfil principal' && !profile.contentLanguage
      ? '' : profile.name,
  );
  const [language, setLanguage] = useState(profile.contentLanguage ?? '');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Control parental (NuvioTV: ParentalGuide + PIN de perfil de WuPlay).
  const [maxMaturity, setMaxMaturity] = useState<MaturityLevel>(profile.parental?.maxMaturity ?? 'off');
  const [blockedGenres, setBlockedGenres] = useState<string[]>(profile.parental?.blockedGenres ?? []);
  const [requirePin, setRequirePin] = useState(profile.parental?.requirePin ?? true);
  const [genres, setGenres] = useState<Genre[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.genres()
      .then((result) => { if (!cancelled) setGenres(result.genres); })
      .catch(() => { /* sin red: el selector de géneros queda vacío */ });
    return () => { cancelled = true; };
  }, []);

  const parentalChanged =
    maxMaturity !== (profile.parental?.maxMaturity ?? 'off') ||
    requirePin !== (profile.parental?.requirePin ?? true) ||
    [...blockedGenres].sort().join(',') !== [...(profile.parental?.blockedGenres ?? [])].sort().join(',');

  const hasStoredPin = Boolean(profile.pin);
  // Cambiar o quitar un PIN exige demostrar que se conoce el actual.
  const pinChanged = removePin || newPin.trim().length > 0;

  const save = async () => {
    if (!name.trim() || !language || busy) return;
    if (pinChanged) {
      if (!removePin && !/^\d{4,12}$/.test(newPin.trim())) {
        setError('El PIN nuevo debe tener entre 4 y 12 dígitos.');
        return;
      }
      if (hasStoredPin && !currentPin) {
        setError('Escribe tu PIN actual para cambiarlo o quitarlo.');
        return;
      }
    }
    // Cambiar el control parental de un perfil con PIN exige conocerlo: si no,
    // cualquiera podría relajar las reglas desde el propio perfil.
    if (parentalChanged && hasStoredPin && !currentPin) {
      setError('Escribe tu PIN actual para cambiar el control parental.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateProfile(profile.id, {
        name: name.trim(),
        contentLanguage: language,
        ...(parentalChanged
          ? {
              parental: maxMaturity === 'off' && !blockedGenres.length
                ? null
                : { maxMaturity, blockedGenres, requirePin },
            }
          : {}),
        ...(pinChanged
          ? { pin: removePin ? '' : newPin.trim() }
          : {}),
        // El PIN actual viaja siempre que haga falta demostrarlo (cambio de PIN
        // o del control parental en un perfil protegido).
        ...(hasStoredPin && currentPin && (pinChanged || parentalChanged)
          ? { currentPin }
          : {}),
      });
      setCurrentPin('');
      setNewPin('');
      setRemovePin(false);
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && cause.requiresPin) {
        setError(cause.message);
      } else {
        setError((cause as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`profile-preferences ${welcome ? 'profile-preferences--welcome' : 'panel'}`}>
      {welcome ? <div className="profile-preferences__mark" aria-hidden="true">V</div> : null}
      <p className="profile-preferences__eyebrow">VIBE FLIX · PERFIL</p>
      <h1>{welcome ? 'Tu espacio, a tu manera.' : 'Tu perfil'}</h1>
      <p className="profile-preferences__intro">
        Dinos cómo te llamas y en qué idioma prefieres ver películas, series, anime y doramas.
        Vibe Flix buscará las fuentes compatibles automáticamente.
      </p>

      <label className="profile-preferences__field">
        <span>¿Cómo te llamas?</span>
        <input
          type="text"
          maxLength={80}
          autoComplete="nickname"
          data-focusable="true"
          value={name}
          placeholder="Nombre para tu perfil"
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <div className="profile-preferences__field">
        <span id="language-label">¿Qué idioma prefieres?</span>
        <div className="profile-preferences__languages" role="group" aria-labelledby="language-label">
          {CONTENT_LANGUAGES.map((option) => (
            <button
              key={option.code}
              type="button"
              data-focusable="true"
              aria-pressed={language === option.code}
              className={`profile-preferences__language ${language === option.code ? 'profile-preferences__language--selected' : ''}`}
              onClick={() => setLanguage(option.code)}
            >
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </button>
          ))}
        </div>
      </div>
      <p className="profile-preferences__note">
        Se guarda en este perfil, junto a tus listas y progreso. Las fuentes disponibles dependen
        de los addons y sitios que configures; elegir un idioma no crea contenido nuevo.
      </p>

      <div className="profile-preferences__field profile-preferences__pin">
        <span>
          PIN del perfil {hasStoredPin ? '(activo)' : '(opcional)'}
        </span>
        <p className="panel__hint">
          {hasStoredPin
            ? 'Para cambiar o quitar el PIN hace falta el actual. Sin él, los demás datos del perfil se pueden editar igualmente.'
            : 'Con un PIN, este perfil pedirá el código antes de activarse. Se guarda como hash scrypt en el servidor, nunca en claro.'}
        </p>
        {hasStoredPin ? (
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            data-focusable="true"
            maxLength={12}
            value={currentPin}
            placeholder="PIN actual"
            onChange={(event) => setCurrentPin(event.target.value)}
          />
        ) : null}
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          data-focusable="true"
          maxLength={12}
          value={newPin}
          disabled={removePin}
          placeholder={hasStoredPin ? 'PIN nuevo (vacío = conservar)' : 'PIN opcional (4–12 dígitos)'}
          onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ''))}
        />
        {hasStoredPin ? (
          <label className="profile-preferences__checkbox">
            <input
              type="checkbox"
              data-focusable="true"
              checked={removePin}
              onChange={(event) => setRemovePin(event.target.checked)}
            />
            <span>Quitar el PIN de este perfil</span>
          </label>
        ) : null}
      </div>
      <div className="profile-preferences__field profile-preferences__parental">
        <span>{t('PARENTAL_TITLE')}</span>
        <p className="panel__hint">{t('PARENTAL_HELP')}</p>
        <label className="setting">
          <span>{t('PARENTAL_LEVEL')}</span>
          <select
            data-focusable="true"
            value={maxMaturity}
            onChange={(event) => setMaxMaturity(event.target.value as MaturityLevel)}
          >
            {MATURITY_LEVELS.map((level) => (
              <option key={level.id} value={level.id}>{t(level.key)}</option>
            ))}
          </select>
        </label>
        {genres.length ? (
          <div className="profile-preferences__genres" role="group" aria-label={t('PARENTAL_BLOCKED_GENRES')}>
            <span>{t('PARENTAL_BLOCKED_GENRES')}</span>
            <div className="profile-preferences__genre-chips">
              {genres.map((genre) => {
                const active = blockedGenres.includes(genre.id);
                return (
                  <button
                    key={genre.id}
                    type="button"
                    data-focusable="true"
                    aria-pressed={active}
                    className={`chip ${active ? 'chip--active' : ''}`}
                    onClick={() => setBlockedGenres((current) =>
                      active
                        ? current.filter((entry) => entry !== genre.id)
                        : [...current, genre.id],
                    )}
                  >
                    {genre.emoji} {genre.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <label className="profile-preferences__checkbox">
          <input
            type="checkbox"
            data-focusable="true"
            checked={requirePin}
            disabled={!hasStoredPin}
            onChange={(event) => setRequirePin(event.target.checked)}
          />
          <span>
            {t('PARENTAL_REQUIRE_PIN')}
            {hasStoredPin ? '' : ` · ${t('VIBE_PIN_REQUIRED')}: —`}
          </span>
        </label>
        {hasStoredPin && parentalChanged ? (
          <p className="panel__hint">{t('PARENTAL_PIN_HINT')}</p>
        ) : null}
      </div>
      {error ? <p className="pin-dialog__error" role="alert">{error}</p> : null}
      <div className="profile-preferences__actions">
        <Button disabled={busy || !name.trim() || !language} onClick={() => void save()}>
          {busy ? 'Guardando…' : welcome ? 'Entrar a Vibe Flix' : 'Guardar perfil'}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            {welcome ? 'Elegir otro perfil' : 'Cancelar'}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
