import { useCallback, useEffect, useRef } from 'react';

/**
 * Navegacion espacial para mandos de TV (D-pad).
 *
 * En lugar de una jerarquia de tabs, se calcula el elemento focusable mas
 * cercano en la direccion pulsada usando los rectangulos reales: funciona
 * con cualquier disposicion (filas horizontales, rejillas, paneles) sin tener
 * que describir la estructura.
 */

export interface FocusOptions {
  /** Contenedor donde buscar elementos focusables (por defecto, document). */
  container?: () => HTMLElement | null;
  /** Selector de los elementos focusables. */
  selector?: string;
  /** Ignora elementos ocultos o deshabilitados. */
  isCandidate?: (element: HTMLElement) => boolean;
}

const DEFAULT_SELECTOR = '[data-focusable="true"]';

function defaultIsCandidate(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(element);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return true;
}

export function useSpatialNavigation(options: FocusOptions = {}) {
  const containerRef = useRef<(() => HTMLElement | null) | null>(null);

  const getElements = useCallback((): HTMLElement[] => {
    const root = options.container?.() ?? containerRef.current?.() ?? document.body;
    const selector = options.selector ?? DEFAULT_SELECTOR;
    const isCandidate = options.isCandidate ?? defaultIsCandidate;
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(isCandidate);
  }, [options.container, options.selector, options.isCandidate]);

  const focusElement = useCallback((element: HTMLElement) => {
    element.focus({ preventScroll: false });
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  const move = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const elements = getElements();
      if (!elements.length) return;

      const active = document.activeElement as HTMLElement | null;
      const current = active && elements.includes(active) ? active : undefined;

      if (!current) {
        focusElement(elements[0]!);
        return;
      }

      const origin = current.getBoundingClientRect();
      const originX = origin.left + origin.width / 2;
      const originY = origin.top + origin.height / 2;

      let best: { element: HTMLElement; distance: number } | undefined;

      for (const element of elements) {
        if (element === current) continue;
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = centerX - originX;
        const dy = centerY - originY;

        let valid = false;
        let primary = 0;
        let secondary = 0;

        if (direction === 'left') {
          valid = dx < -8;
          primary = Math.abs(dx);
          secondary = Math.abs(dy);
        } else if (direction === 'right') {
          valid = dx > 8;
          primary = Math.abs(dx);
          secondary = Math.abs(dy);
        } else if (direction === 'up') {
          valid = dy < -8;
          primary = Math.abs(dy);
          secondary = Math.abs(dx);
        } else {
          valid = dy > 8;
          primary = Math.abs(dy);
          secondary = Math.abs(dx);
        }

        if (!valid) continue;
        // Se prioriza la distancia en el eje principal y se penaliza el desvio.
        const distance = primary + secondary * 1.6;
        if (!best || distance < best.distance) {
          best = { element, distance };
        }
      }

      if (best) focusElement(best.element);
    },
    [focusElement, getElements],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // No interferir con la escritura de texto ni con la barra del navegador.
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;

      const map: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      const direction = map[event.key];
      if (!direction) return;
      // Si el foco esta en un campo de texto, las flechas se comportan normal.
      if (target && target.tagName === 'INPUT') return;
      event.preventDefault();
      move(direction);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move]);

  return { move, focusElement, getElements };
}
