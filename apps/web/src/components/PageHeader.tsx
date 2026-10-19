import type { ReactNode } from 'react';

/**
 * Encabezado de página.
 *
 * Todas las pantallas de la app empiezan igual: título grande, subtítulo
 * opcional y acciones a la derecha. Es lo que hace que la interfaz sea
 * "fácil": siempre se sabe dónde estás y qué puedes hacer aquí.
 */
export function PageHeader({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {hint ? <p>{hint}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
