import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Teclado en pantalla para TV (estilo WuPlay).
 *
 * En una TV no hay teclado fisico: la busqueda se escribe con el mando. Este
 * componente dibuja un teclado completo (letras, numeros, simbolos y la ñ) en
 * el que se navega con el D-pad, porque cada tecla es un boton enfocable con
 * `data-focusable="true"` y la navegacion espacial los recorre por rectangulos.
 *
 * Detalles de la interaccion con el mando:
 *  - **Borrar**: pulsacion corta borra un caracter; mantener pulsado (o pulsar
 *    dos veces seguidas) borra la consulta entera, como en WuPlay.
 *  - **Mayus**: alterna entre minusculas, mayusculas y numeros/simbolos.
 *  - **Espacio**: inserta un espacio.
 *  - **Buscar**: entrega el texto (o dispara la busqueda si no hay texto).
 */

export interface KeyboardProps {
  value: string;
  onChange: (value: string) => void;
  /** Se llama al pulsar "Buscar" o Enter. */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  /** Etiqueta del boton principal ("Buscar", "Aceptar"…). */
  submitLabel?: string;
}

const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const SYMBOL_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['!', '?', ',', '.', ':', ';', '-', '_', "'", '"'],
  ['+', '=', '/', '\\', '*', '&', '%', '$', '#', '@'],
];

/** Milisegundos que hay que mantener pulsado "borrar" para limpiar todo. */
const HOLD_TO_CLEAR_MS = 700;

export function Keyboard({
  value,
  onChange,
  onSubmit,
  placeholder = 'Escribe para buscar…',
  submitLabel = 'Buscar',
}: KeyboardProps) {
  const [layout, setLayout] = useState<'letters' | 'symbols'>('letters');
  const [uppercase, setUppercase] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const holdFired = useRef(false);

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  useEffect(() => clearHold, [clearHold]);

  const type = useCallback(
    (char: string) => {
      onChange(value + char);
    },
    [onChange, value],
  );

  const backspace = useCallback(() => {
    if (holdFired.current) {
      holdFired.current = false;
      return;
    }
    onChange(value.slice(0, -1));
  }, [onChange, value]);

  const startHold = useCallback(() => {
    holdFired.current = false;
    clearHold();
    holdTimer.current = window.setTimeout(() => {
      // Pulsacion larga: se borra la consulta entera.
      holdFired.current = true;
      onChange('');
    }, HOLD_TO_CLEAR_MS);
  }, [clearHold, onChange]);

  const submit = useCallback(() => {
    onSubmit?.(value);
  }, [onSubmit, value]);

  // Atajos de teclado fisico (util en escritorio).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        onChange(value.slice(0, -1));
        return;
      }
      if (event.key.length === 1) {
        event.preventDefault();
        type(event.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange, submit, type, value]);

  const rows = layout === 'letters' ? LETTER_ROWS : SYMBOL_ROWS;

  return (
    <div className="keyboard">
      <div className="keyboard__preview">
        <span className="keyboard__text">{value || <em>{placeholder}</em>}</span>
        <span className="keyboard__caret" aria-hidden="true" />
      </div>

      <div className="keyboard__keys">
        {rows.map((row, rowIndex) => (
          <div className="keyboard__row" key={rowIndex}>
            {row.map((char) => (
              <button
                key={char}
                type="button"
                data-focusable="true"
                className="keyboard__key"
                onClick={() => type(uppercase ? char.toUpperCase() : char)}
              >
                {uppercase ? char.toUpperCase() : char}
              </button>
            ))}
          </div>
        ))}

        <div className="keyboard__row keyboard__row--actions">
          <button
            type="button"
            data-focusable="true"
            className="keyboard__key keyboard__key--wide"
            onClick={() => {
              setLayout((current) => (current === 'letters' ? 'symbols' : 'letters'));
              setUppercase(false);
            }}
          >
            {layout === 'letters' ? '123' : 'ABC'}
          </button>
          <button
            type="button"
            data-focusable="true"
            className="keyboard__key keyboard__key--wide"
            onClick={() => setUppercase((current) => !current)}
            aria-label="Mayúsculas"
          >
            ⇧
          </button>
          <button
            type="button"
            data-focusable="true"
            className="keyboard__key keyboard__key--wide"
            onClick={() => type(' ')}
          >
            espacio
          </button>
          <button
            type="button"
            data-focusable="true"
            className="keyboard__key keyboard__key--wide"
            onClick={backspace}
            onPointerDown={startHold}
            onPointerUp={clearHold}
            onPointerLeave={clearHold}
            aria-label="Borrar (mantener pulsado para borrar todo)"
          >
            ⌫
          </button>
          <button
            type="button"
            data-focusable="true"
            className="keyboard__key keyboard__key--submit"
            onClick={submit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
