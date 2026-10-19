/**
 * Iconos del cliente de TV.
 *
 * SVG en línea (sin dependencias, sin peticiones extra y sin fuente de
 * iconos): es la forma más rápida de pintar la interfaz. Todos comparten el
 * mismo trazo (1.7) y el color lo hereda del botón (`currentColor`).
 */
import type { ReactNode } from 'react';

export type IconName =
  | 'home'
  | 'discover'
  | 'genres'
  | 'decades'
  | 'search'
  | 'lists'
  | 'history'
  | 'addons'
  | 'settings'
  | 'profile'
  | 'play'
  | 'info'
  | 'sparkle';

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3.5 10.6 12 3.8l8.5 6.8V20a1 1 0 0 1-1 1h-4.8v-6.2H9.3V21H4.5a1 1 0 0 1-1-1z" />,
  discover: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M15.2 8.8 13.6 13.6 8.8 15.2 10.4 10.4z" />
    </>
  ),
  genres: (
    <>
      <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.4" />
      <path d="M8.2 4.8v14.4M15.8 4.8v14.4M3.4 9.4h17.2M3.4 14.6h17.2" />
    </>
  ),
  decades: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.6" />
      <path d="m16 16 4.4 4.4" />
    </>
  ),
  lists: (
    <>
      <path d="M4 6.5h2M4 12h2M4 17.5h2M9 6.5h11M9 12h11M9 17.5h11" />
    </>
  ),
  history: (
    <>
      <path d="M3.8 12a8.2 8.2 0 1 0 2.6-6" />
      <path d="M3.4 3.6v4.2h4.2M12 7.6V12l3 1.8" />
    </>
  ),
  addons: (
    <>
      <path d="M10 3.6h4v2.2a1.8 1.8 0 0 0 3.2 1.1l2-.9 2 3.4-1.6 1.3a1.8 1.8 0 0 0 0 3l1.6 1.3-2 3.4-2-.9a1.8 1.8 0 0 0-3.2 1.1v2.2h-4v-2.2a1.8 1.8 0 0 0-3.2-1.1l-2 .9-2-3.4 1.6-1.3a1.8 1.8 0 0 0 0-3L2.2 9.4l2-3.4 2 .9A1.8 1.8 0 0 0 9.4 5.8z" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h6M14 17h6" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="12" cy="17" r="2" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.4" r="3.8" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  play: <path d="M8 5.4 19 12 8 18.6z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.4M12 7.8h.01" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.2 13.8 9 19.6 10.8 13.8 12.6 12 18.4 10.2 12.6 4.4 10.8 10.2 9z" />
      <path d="M18.4 3.4v3M16.9 4.9h3" />
    </>
  ),
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {PATHS[name]}
    </svg>
  );
}
