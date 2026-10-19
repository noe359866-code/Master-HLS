import { useApp } from '../store';
import { NAV_ITEMS } from '../navigation-items';
import { Icon, type IconName } from './icons';

/**
 * Rail lateral de navegación (estilo WuPlay, acabado moderno).
 *
 * Sustituye a la barra superior: ocupa 92 px, deja todo el ancho a la
 * contenido y cada sección se reconoce por su icono sin leer texto. El
 * icono de la sección activa se marca con una barra de gradiente.
 */

/** Icono asociado a cada sección del menú. */
const ICONS: Record<string, IconName> = {
  home: 'home',
  discover: 'discover',
  genres: 'genres',
  decades: 'decades',
  search: 'search',
  lists: 'lists',
  history: 'history',
  addons: 'addons',
  settings: 'settings',
};

export function SideRail() {
  const { route, navigate, activeProfile, settings } = useApp();

  // Se respeta la personalización del menú guardada en el servidor.
  const items = NAV_ITEMS.filter((item) => {
    const preference = (settings?.sidebar ?? []).find((entry) => entry.id === item.id);
    return !preference?.hidden;
  }).sort((a, b) => {
    const order = (id: string, fallback: number) =>
      (settings?.sidebar ?? []).find((entry) => entry.id === id)?.order ?? fallback;
    return order(a.id, NAV_ITEMS.indexOf(a)) - order(b.id, NAV_ITEMS.indexOf(b));
  });

  const activeId = items.find((item) => item.route.name === route.name)?.id;

  return (
    <nav className="rail" aria-label="Navegación principal">
      <span className="rail__brand" aria-hidden="true">
        V
      </span>

      <div className="rail__nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            data-focusable="true"
            className={`rail__item ${activeId === item.id ? 'rail__item--active' : ''}`}
            onClick={() => navigate(item.route)}
            aria-current={activeId === item.id ? 'page' : undefined}
          >
            <Icon name={ICONS[item.id] ?? 'home'} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        data-focusable="true"
        className="rail__profile"
        onClick={() => navigate({ name: 'profiles' })}
        aria-label="Perfiles"
      >
        <span
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: activeProfile?.color ?? 'var(--accent)',
          }}
        >
          {activeProfile?.avatar ?? '👤'}
        </span>
      </button>
    </nav>
  );
}
