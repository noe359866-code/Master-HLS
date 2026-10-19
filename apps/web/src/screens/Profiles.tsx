import { useState } from 'react';

import { useApp } from '../store';
import { Button, EmptyState } from '../components/ui';

const AVATARS = ['👤', '🧑', '👩', '👨', '🧒', '🐱', '🐼', '🚀', '🎬', '⚽'];
const COLORS = ['#5b8cff', '#ff5b8c', '#4cd964', '#ffb340', '#9d7bff', '#40c8e0'];

export function ProfilesScreen() {
  const { profiles, activeProfile, setActiveProfile, navigate } = useApp();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]!);
  const [color, setColor] = useState(COLORS[0]!);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { api } = await import('../api');
    await api.createProfile({ name: trimmed, avatar, color });
    setName('');
    navigate({ name: 'home' });
    // Recarga para actualizar la lista de perfiles.
    window.location.reload();
  };

  return (
    <div className="screen profiles">
      <h1>¿Quién está viendo?</h1>

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
                void setActiveProfile(profile.id).then(() => navigate({ name: 'home' }));
              }}
            >
              <span className="profile__avatar" style={{ background: profile.color }}>
                {profile.avatar}
              </span>
              <span className="profile__name">{profile.name}</span>
            </button>
          ))}
        </div>
      )}

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
        <Button onClick={() => void create()}>Crear perfil</Button>
      </section>
    </div>
  );
}
