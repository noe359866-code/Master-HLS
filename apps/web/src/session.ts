/**
 * Token del dispositivo (sincronizacion multi-dispositivo).
 *
 * La biblioteca vive en el servidor, asi que para compartirla entre varios
 * dispositivos hace falta vincular cada uno con un codigo. El token que se
 * entrega en la vinculacion se guarda en el navegador y se envia en cada
 * peticion (`X-Vibe-Flix-Token`).
 */

const TOKEN_KEY = 'vibe-flix.device-token';

export function getDeviceToken(): string | undefined {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setDeviceToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Si el almacenamiento no esta disponible, se sigue sin token.
  }
}

export function clearDeviceToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin efecto.
  }
}


/** Token de administración del servidor (solo se guarda en este navegador). */
const ADMIN_TOKEN_KEY = 'vibe-flix.admin-token';

export function getAdminToken(): string | undefined {
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setAdminToken(token: string | undefined): void {
  try {
    if (token) window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // Sin almacenamiento: el token solo vale para la pestaña actual.
  }
}
