import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Meta } from '../types';

/** URL de poster con fallback cuando el CDN falla. */
export function posterUrl(url: string | undefined, shape: 'poster' | 'landscape' = 'poster'): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url;
}

export interface PosterProps {
  meta: Meta;
  onSelect: (meta: Meta) => void;
  progress?: number;
  badge?: string;
  className?: string;
}

export function Poster({ meta, onSelect, progress, badge, className }: PosterProps) {
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const landscape = meta.posterShape === 'landscape' || Boolean(meta.landscapePoster);
  const image = failed ? '' : landscape ? (meta.landscapePoster ?? meta.poster) : meta.poster;
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openMenu = () => setMenuOpen(true);
  const closeMenu = () => setMenuOpen(false);
  const onPointerDown = () => { timerRef.current = setTimeout(openMenu, 650); };
  const onPointerUp = () => { if (timerRef.current) clearTimeout(timerRef.current); };
  return (
    <>
      <button
        type="button"
        data-focusable="true"
        className={`poster ${landscape ? 'poster--landscape' : ''} ${className ?? ''}`}
        data-meta-id={meta.id}
        data-meta-type={meta.type ?? undefined}
        onClick={() => onSelect(meta)}
        onContextMenu={(e) => { e.preventDefault(); openMenu(); }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onErrorCapture={() => setFailed(true)}
        aria-label={meta.name ?? meta.id}
      >
        {image ? (
          <img src={posterUrl(image)} alt={meta.name ?? ''} loading="lazy" decoding="async" />
        ) : (
          <div className="poster__fallback" aria-hidden="true">
            <span>{meta.name?.slice(0, 2).toUpperCase() ?? '—'}</span>
          </div>
        )}
        {badge ? <span className="poster__badge">{badge}</span> : null}
        {typeof progress === 'number' && progress > 0 ? (
          <span className="poster__progress" style={{ width: `${Math.min(progress, 100)}%` }} />
        ) : null}
      </button>
      {menuOpen ? (
        <Modal title={meta.name ?? meta.id} onClose={closeMenu}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button onClick={() => { closeMenu(); onSelect(meta); }}>Ver detalles</Button>
            <Button variant="ghost" onClick={() => { closeMenu(); window.dispatchEvent(new CustomEvent('vibeflix:hide', { detail: meta })); }}>No mostrar</Button>
            <Button variant="ghost" onClick={closeMenu}>Cerrar</Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

export interface RowProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  emptyLabel?: string;
}

export function Row({ title, subtitle, children, emptyLabel }: RowProps) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  if (count === 0 && emptyLabel === undefined) return null;
  return (
    <section className="row">
      <header className="row__header">
        <h2>{title}</h2>
        {subtitle ? <span className="row__subtitle">{subtitle}</span> : null}
      </header>
      {count === 0 ? (
        <p className="row__empty">{emptyLabel}</p>
      ) : (
        <div className="row__items">{children}</div>
      )}
    </section>
  );
}

/**
 * Bloque de esqueleto (shimmer).
 *
 * Mientras llegan los catálogos se muestran formas en lugar de un spinner:
 * la pantalla parece llena desde el primer frame y el contenido entra
 * en su sitio sin saltos.
 */
export function Skeleton({
  width,
  height,
  radius,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      className={`skeleton ${className ?? ''}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

/** Fila de esqueletos con el aspecto de una fila de posters. */
export function SkeletonRow({ count = 8 }: { count?: number }) {
  return (
    <section className="row">
      <header className="row__header">
        <Skeleton width={180} height={18} radius={8} />
      </header>
      <div className="row__items">
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} height={252} radius={16} />
        ))}
      </div>
    </section>
  );
}

export function Loader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loader" role="status">
      <span className="loader__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" data-focusable="true" className="button" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-focusable="true"
      className={`button button--${variant} ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    ref.current?.querySelector<HTMLElement>('[data-focusable="true"]')?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal__panel" ref={ref}>
        <header className="modal__header">
          <h2>{title}</h2>
          <button type="button" data-focusable="true" className="button button--ghost" onClick={onClose}>
            Cerrar
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

/** Resuelve el backdrop de un titulo (background > landscapePoster > poster). */
export function useBackdrop(meta: Meta | null): string {
  return useMemo(() => {
    if (!meta) return '';
    return meta.background ?? meta.landscapePoster ?? meta.poster ?? '';
  }, [meta]);
}
