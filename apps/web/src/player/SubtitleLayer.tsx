/**
 * Capa de subtitulos propia.
 *
 * Por que no usar `<track>` nativo ni el pintado de hls.js:
 *  - Solo entienden WebVTT en UTF-8 y dependen del CORS del origen (por eso los
 *    subtitulos de muchos addons simplemente no aparecen en el navegador).
 *  - No permiten desfase en caliente, Clean SDH ni cambiar tamano/color/borde
 *    sin recargar la pista: justo los ajustes que WuPlay expone desde v0.8.3.
 *
 * Aqui se pintan las cues que devuelve `/api/subtitles/proxy` (o las de una
 * pista del manifest, leidas del `TextTrack` con `mode = 'hidden'`) con CSS
 * generado por `subtitleCssVars()`, que es el mismo codigo que usa el APK.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { activeCues, subtitleCssVars, type Cue, type SubtitleStyle } from '@vibeflix/player-core';

export interface SubtitleLayerProps {
  /** Cues normalizadas (proxy del servidor). */
  cues: Cue[];
  /** Instante actual de la reproduccion, en milisegundos. */
  timeMs: number;
  /** Desfase aplicado por el usuario (ms; positivo = retrasar). */
  delayMs?: number;
  /** Estilo (tamano, color, opacidad, borde, posicion). */
  style?: Partial<SubtitleStyle>;
  /** Elemento de video: se usa para leer las pistas del manifest. */
  video?: HTMLVideoElement | null;
  /** Indice de la pista del manifest activa (`-1`/`null` = ninguna). */
  nativeTrackIndex?: number | null;
}

/** Lineas de las cues activas de un `TextTrack` (pistas del manifest). */
function readNativeCues(track: TextTrack | undefined): string[][] {
  if (!track) return [];
  const cues = Array.from(track.activeCues ?? []);
  return cues
    .map((cue) => {
      const text = (cue as VTTCue).text ?? '';
      return text
        .split(/\r?\n/)
        .map((line) => line.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);
    })
    .filter((lines) => lines.length > 0);
}

export function SubtitleLayer({
  cues,
  timeMs,
  delayMs = 0,
  style,
  video,
  nativeTrackIndex = null,
}: SubtitleLayerProps) {
  const [native, setNative] = useState<string[][]>([]);

  // Pistas del manifest: hls.js rellena el TextTrack, pero se pinta aqui para
  // que el estilo y el desfase sean los mismos que con los subtitulos externos.
  useEffect(() => {
    if (!video || nativeTrackIndex === null || nativeTrackIndex < 0) {
      setNative([]);
      return;
    }
    const track = video.textTracks[nativeTrackIndex];
    if (!track) {
      setNative([]);
      return;
    }
    // `hidden` mantiene los eventos de cue activos sin pintar nada.
    track.mode = 'hidden';
    const onChange = () => setNative(readNativeCues(track));
    track.addEventListener('cuechange', onChange);
    onChange();
    return () => track.removeEventListener('cuechange', onChange);
  }, [video, nativeTrackIndex, cues.length]);

  const own = useMemo(() => {
    if (!cues.length) return [];
    return activeCues(cues, Math.max(0, timeMs - delayMs)).map((cue) => cue.lines.filter(Boolean));
  }, [cues, timeMs, delayMs]);

  const lines = own.length ? own : native;
  const vars = useMemo(() => subtitleCssVars(style), [style]);

  if (!lines.length) return null;

  return (
    <div className="subs" style={vars as CSSProperties} aria-live="polite" aria-atomic="false">
      {lines.map((entry, index) => (
        // Las cues simultaneas son raras (dialogos solapados); el indice basta
        // como clave porque la lista se rehace en cada cambio de tiempo.
        <p className="subs__cue" key={`${entry[0] ?? ''}-${index}`}>
          {entry.map((line, position) => (
            <span className="subs__line" key={position}>
              {line}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
