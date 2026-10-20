/**
 * Titulos ocultos (WuPlay v0.6.5 "Hide Everywhere" / v0.7.x "Don't Show Again").
 *
 * Permite ocultar un titulo en todos los catalogos y busquedas de la app.
 * Se guarda por perfil y se aplica en el servidor, asi que todos los
 * dispositivos (web, APK, addon) respetan el mismo ocultado.
 */

import type { MetaPreview } from '@vibeflix/addon-engine';
import type { HiddenTitle } from '../model.js';

export function isHidden(meta: MetaPreview, hidden: HiddenTitle[] | undefined): boolean {
  if (!hidden?.length) return false;
  return hidden.some((entry) => entry.id === meta.id);
}

export function applyHiddenFilter(metas: MetaPreview[], hidden: HiddenTitle[] | undefined): MetaPreview[] {
  if (!hidden?.length) return metas;
  const set = new Set(hidden.map((entry) => entry.id));
  return metas.filter((meta) => !set.has(meta.id));
}

export function hiddenIdsForProfile(data: { hiddenTitles?: Record<string, HiddenTitle[]> }, profileId: string): Set<string> {
  const hidden = data.hiddenTitles?.[profileId] ?? [];
  return new Set(hidden.map((entry) => entry.id));
}
