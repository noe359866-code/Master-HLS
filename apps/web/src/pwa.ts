/**
 * Registro de la PWA.
 *
 * Master-HLS se puede instalar como app en la TV (Android TV, Fire TV o
 * cualquier navegador con "Instalar aplicacion") sin necesidad del APK: es el
 * equivalente web de lo que hacen WuPlay y NuvioTV, y evita depender de la
 * cadena de compilacion de Android.
 */

let installPrompt: (BeforeInstallPromptEvent & { prompt: () => Promise<void> }) | null = null;
const listeners = new Set<() => void>();

/** Evento `beforeinstallprompt` (no estandar, solo Chromium/Android). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Registra el service worker (silencioso si el navegador no lo soporta). */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  });
}

/** Prepara la instalacion de la app (boton "Instalar app"). */
export function setupInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    notify();
  });
}

/** true si la app se puede instalar ahora mismo. */
export function canInstall(): boolean {
  return installPrompt !== null;
}

/** true si ya esta instalada (se ejecuta en modo standalone). */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  return Boolean(standalone) || (window.navigator as { standalone?: boolean }).standalone === true;
}

/** Lanza el dialogo de instalacion. Devuelve true si el usuario acepta. */
export async function promptInstall(): Promise<boolean> {
  if (!installPrompt) return false;
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    installPrompt = null;
    notify();
    return true;
  }
  return false;
}

/** Se suscribe a los cambios del estado de instalacion. */
export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
