import { useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import { ProfilePreferences, languageLabel } from './ProfilePreferences';
import { PageHeader } from '../components/PageHeader';
import { Button, EmptyState, Modal } from '../components/ui';

const AVATARS = ['👤', '🧑', '👩', '👨', '🧒', '🐱', '🐼', '🚀', '🎬', '⚽'];
const COLORS = ['#5b8cff', '#ff5b8c', '#4cd964', '#ffb340', '#9d7bff', '#40c8e0'];

export function ProfilesScreen() {
  const { profiles, activeProfile, setActiveProfile, refreshAll, navigate } = useApp();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]!);
  const [color, setColor] = useState(COLORS[0]!);
  const [pinProfile, setPinProfile] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreateError(null);
    try {
      const profile = await api.createProfile({ name: trimmed, avatar, color });
      await refreshAll();
      await setActiveProfile(profile.id);
      setName('');
      navigate({ name: 'home' }); // el nuevo perfil elegirá su idioma al entrar
    } catch (cause) {
      setCreateError((cause as Error).message);
    }
  };

  return (
    <div className="screen profiles">
      <PageHeader title="¿Quién está viendo?" hint="Elige un perfil o crea uno nuevo." />

      {profiles.length === 0 ? (
        <EmptyState title="No hay perfiles" hint="Crea uno para empezar." />
      ) : (
        <div className="profile-grid">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              data-focusable="true"
              className={`profile ${profile.id === activeProfile?.id ? 'profile--active' : ''}`}
              onClick={() => {
                // Perfil protegido por PIN: se pide antes de activar.
                if (profile.pin) {
                  setPinProfile(profile.id);
                  setPin('');
                  setPinError(null);
                  return;
                }
                void setActiveProfile(profile.id).then(() => navigate({ name: 'home' }));
              }}
            >
              <span className="profile__avatar" style={{ background: profile.color }}>
                {profile.avatar}
              </span>
              <span className="profile__name">{profile.name}</span>
              <span className="profile__language">{languageLabel(profile.contentLanguage)}</span>
            </button>
          ))}
        </div>
      )}

      {pinProfile ? (
        <Modal title="Introduce el PIN" onClose={() => setPinProfile(null)}>
          <div className="pin-dialog">
            <input
              className="pin-dialog__input"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void setActiveProfile(pinProfile, pin)
                    .then(() => {
                      setPinProfile(null);
                      navigate({ name: 'home' });
                    })
                    .catch((cause: Error) => setPinError(cause.message));
                }
              }}
            />
            {pinError ? <p className="pin-dialog__error">{pinError}</p> : null}
            <Button
              onClick={() => {
                void setActiveProfile(pinProfile, pin)
                  .then(() => {
                    setPinProfile(null);
                    navigate({ name: 'home' });
                  })
                  .catch((cause: Error) => setPinError(cause.message));
              }}
            >
              Entrar
            </Button>
          </div>
        </Modal>
      ) : null}

      {activeProfile && activeProfile.contentLanguage ? (
        <div className="profiles__edit">
          <p>Perfil activo: <strong>{activeProfile.name}</strong> · {languageLabel(activeProfile.contentLanguage)}</p>
          <Button variant="ghost" onClick={() => setEditing(true)}>Editar nombre e idioma</Button>
        </div>
      ) : null}

      {editing && activeProfile ? (
        <Modal title="Editar perfil" onClose={() => setEditing(false)}>
          <ProfilePreferences
            key={activeProfile.id}
            profile={activeProfile}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      ) : null}

      <section className="panel profile-create">
        <h2>Nuevo perfil</h2>
        <input
          className="profile-create__input"
          type="text"
          value={name}
          placeholder="Nombre del perfil"
          onChange={(event) => setName(event.target.value)}
        />
        <div className="profile-create__avatars">
          {AVATARS.map((option) => (
            <button
              key={option}
              type="button"
              data-focusable="true"
              className={`avatar-pick ${avatar === option ? 'avatar-pick--active' : ''}`}
              onClick={() => setAvatar(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="profile-create__colors">
          {COLORS.map((option) => (
            <button
              key={option}
              type="button"
              data-focusable="true"
              className={`color-pick ${color === option ? 'color-pick--active' : ''}`}
              style={{ background: option }}
              onClick={() => setColor(option)}
              aria-label={`Color ${option}`}
            />
          ))}
        </div>
        {createError ? <p className="pin-dialog__error" role="alert">{createError}</p> : null}
        <Button onClick={() => void create()} disabled={!name.trim()}>Crear perfil</Button>
      </section>
    </div>
  );
}
