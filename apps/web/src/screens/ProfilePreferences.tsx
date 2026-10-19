import { useState } from 'react';

import { useApp } from '../store';
import type { Profile } from '../types';
import { Button } from '../components/ui';

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
  const [name, setName] = useState(
    profile.id === 'default' && profile.name === 'Perfil principal' && !profile.contentLanguage
      ? '' : profile.name,
  );
  const [language, setLanguage] = useState(profile.contentLanguage ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim() || !language || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile(profile.id, { name: name.trim(), contentLanguage: language });
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
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
