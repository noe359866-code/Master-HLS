/**
 * Protección SSRF para todo lo que el servidor descarga por indicación del
 * usuario: proveedores por configuración, pruebas de scrapers, proxy HLS y
 * subtítulos de addons.
 *
 * Un simple chequeo de la cadena no basta: `http://127.0.0.1`, `http://[::1]`,
 * `http://2130706433` o un nombre que resuelve a una IP privada son el mismo
 * destino. Por eso aquí se combinan tres capas:
 *
 *  1. Validación sintáctica y de literales (esquema, credenciales, IP privada).
 *  2. Resolución DNS y verificación de **todas** las direcciones devueltas.
 *  3. Redirecciones seguidas manualmente, validando cada salto.
 *
 * Las IP privadas, de loopback, link-local, CGNAT, multicast, documentación y
 * reservadas quedan bloqueadas por defecto. `allowPrivate` existe únicamente
 * para instalaciones locales que reproducen archivos alojados en su propia
 * LAN (se activa con `ALLOW_PRIVATE_HOSTS=1`) y nunca debe usarse expuesto a
 * Internet.
 */

import { lookup as dnsLookup } from 'node:dns/promises';

export interface ResolvedAddress {
  address: string;
  family: number;
}

/** Resolutor DNS inyectable (tests o entornos con DNS propio). */
export type HostLookup = (hostname: string) => Promise<ResolvedAddress[]>;

export interface PublicUrlOptions {
  /** URL base para enlaces relativos. */
  base?: string;
  /** Resolutor DNS; por defecto el del sistema. */
  lookup?: HostLookup;
  /** Permite destinos privados (solo desarrollo/LAN de confianza). */
  allowPrivate?: boolean;
}

export interface GuardedFetchOptions extends PublicUrlOptions {
  /** `fetch` subyacente (tests). */
  fetchImpl?: typeof fetch;
  /** Máximo de redirecciones seguidas manualmente. */
  maxRedirects?: number;
}

/** Error propio para distinguir un bloqueo SSRF de un fallo de red. */
export class BlockedDestinationError extends Error {
  readonly code = 'blocked-destination';

  constructor(message: string) {
    super(message);
    this.name = 'BlockedDestinationError';
  }
}

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
]);

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.home.arpa',
  '.lan',
  '.intranet',
  '.corp',
  '.private',
];

function ipv4Parts(address: string): number[] | undefined {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!match) return undefined;
  const parts = match.slice(1).map((part) => Number(part));
  return parts.some((part) => part > 255) ? undefined : parts;
}

function blockedIpv4(parts: number[]): boolean {
  const [a, b, c] = parts;
  if (a === undefined || b === undefined || c === undefined) return true;
  // 0.0.0.0/8, 10/8, 127/8
  if (a === 0 || a === 10 || a === 127) return true;
  // 100.64/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 169.254/16 (link-local, incluido el endpoint de metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24, 192.0.2.0/24, 192.88.99.0/24, 192.168/16
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 192 && b === 168) return true;
  // 198.18/15 (benchmark), 198.51.100/24 (TEST-NET-2)
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;
  // 224/4 multicast y 240/4 reservado (incluye 255.255.255.255)
  if (a >= 224) return true;
  return false;
}

function ipv6Groups(address: string): number[] | undefined {
  const text = address.toLowerCase().split('%')[0] ?? '';
  if (!text || text.includes(':::')) return undefined;
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const parse = (value: string): number[] | undefined => {
    if (!value) return [];
    const groups = value.split(':');
    if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return undefined;
    return groups.map((group) => Number.parseInt(group, 16));
  };
  const head = parse(halves[0] ?? '');
  const tail = parse(halves[1] ?? '');
  if (!head || !tail) return undefined;
  if (halves.length === 1) return head.length === 8 ? head : undefined;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return undefined;
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

function blockedIpv6(address: string): boolean {
  const text = address.toLowerCase().split('%')[0] ?? '';
  // IPv4 embebida en notación decimal (::ffff:127.0.0.1, ::192.168.0.1…).
  const embedded = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(text)?.[1];
  if (embedded) {
    const parts = ipv4Parts(embedded);
    return parts ? blockedIpv4(parts) : true;
  }
  if (!text.includes(':')) return true;
  if (text === '::' || text === '::1') return true;
  const groups = ipv6Groups(text);
  if (!groups) return true;
  const [first, second] = groups as [number, number, ...number[]];
  // ::/96 (IPv4-compatible, obsoleto), incluida la forma hex ::7f00:1.
  if (groups.slice(0, 6).every((group) => group === 0)) return true;
  // ::ffff:0:0/96 en forma hexadecimal.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const tail = groups.slice(6);
    const v4 = [((tail[0] ?? 0) >> 8) & 0xff, (tail[0] ?? 0) & 0xff,
      ((tail[1] ?? 0) >> 8) & 0xff, (tail[1] ?? 0) & 0xff];
    return blockedIpv4(v4);
  }
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 (site-local obsoleto)
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  if (first === 0x2001 && second === 0x0000) return true; // Teredo
  if (first === 0x2001 && second === 0x0db8) return true; // documentación
  if (first === 0x0064 && second === 0xff9b) return true; // NAT64
  if (first === 0x2002) return true; // 6to4
  return false;
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

/** true para IP privadas, de loopback, link-local o reservadas. */
export function isPrivateAddress(address: string): boolean {
  const host = normalizeHostname(address.trim());
  const v4 = ipv4Parts(host);
  if (v4) return blockedIpv4(v4);
  if (host.includes(':')) return blockedIpv6(host);
  return true;
}

/** true si el hostname es local o una IP bloqueada (sin consultar DNS). */
export function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  const v4 = ipv4Parts(host);
  if (v4) return blockedIpv4(v4);
  if (host.includes(':')) return blockedIpv6(host);
  return false;
}

function isIpLiteral(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return Boolean(ipv4Parts(host)) || host.includes(':');
}

/**
 * Normaliza y valida una URL sin hacer red. Devuelve `undefined` si no es
 * http/https, lleva credenciales o apunta a un destino bloqueado.
 */
export function publicHttpUrl(value: string, base?: string): string | undefined {
  return parseHttpUrl(value, base, false);
}

function parseHttpUrl(value: string, base: string | undefined, allowPrivate: boolean): string | undefined {
  if (!value || !value.trim()) return undefined;
  let raw = value.trim().replace(/\\\//g, '/').replace(/&amp;/g, '&');
  if (raw.startsWith('//')) raw = `https:${raw}`;
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.username || url.password) return undefined;
    if (!allowPrivate && isBlockedHostname(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

const defaultLookup: HostLookup = async (hostname) => {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.map((entry) => ({ address: entry.address, family: Number(entry.family) }));
};

async function resolve(hostname: string, lookup: HostLookup): Promise<ResolvedAddress[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout de resolución DNS')), 4_000);
    });
    return await Promise.race([lookup(hostname), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Valida una URL y, si el host no es una IP literal, comprueba que **todas**
 * sus direcciones resueltas sean públicas.
 *
 * Lanza `BlockedDestinationError` con un mensaje apto para el cliente. No se
 * devuelve la URL como válida si DNS falla: fallar cerrado evita que un
 * resolutor lento se convierta en una vía de escape.
 */
export async function assertPublicHttpUrl(
  value: string | URL,
  options: PublicUrlOptions = {},
): Promise<URL> {
  const text = typeof value === 'string' ? value : value.toString();
  const normalized = parseHttpUrl(text, options.base, Boolean(options.allowPrivate));
  if (!normalized) {
    throw new BlockedDestinationError(
      'URL no permitida: solo se aceptan destinos http(s) públicos y sin credenciales',
    );
  }
  const url = new URL(normalized);
  if (options.allowPrivate) return url;

  const hostname = normalizeHostname(url.hostname);
  if (isIpLiteral(hostname)) return url;

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolve(hostname, options.lookup ?? defaultLookup);
  } catch {
    throw new BlockedDestinationError(`No se pudo resolver el destino «${hostname}»`);
  }
  if (!addresses.length) {
    throw new BlockedDestinationError(`El destino «${hostname}» no tiene direcciones`);
  }
  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) {
      throw new BlockedDestinationError(
        `Destino bloqueado: «${hostname}» resuelve a una dirección privada o reservada`,
      );
    }
  }
  return url;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/**
 * `fetch` con protección SSRF: valida la URL inicial, cada redirección y las
 * direcciones DNS. Fuerza `redirect: 'manual'` para no perder de vista un
 * salto hacia la red interna.
 */
export function createGuardedFetch(options: GuardedFetchOptions = {}): typeof fetch {
  const inner = options.fetchImpl ?? globalThis.fetch;
  const maxRedirects = options.maxRedirects ?? 5;

  const guarded = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    let url = await assertPublicHttpUrl(rawUrl, options);
    let method = (init?.method ?? 'GET').toUpperCase();
    let body = init?.body;

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const response = await inner(url.toString(), {
        ...init,
        method,
        body,
        redirect: 'manual',
      });

      const location = response.headers.get('location');
      if (!REDIRECT_STATUS.has(response.status) || !location) return response;
      if (hop === maxRedirects) {
        throw new BlockedDestinationError('Demasiadas redirecciones');
      }

      const next = new URL(location, url);
      url = await assertPublicHttpUrl(next, options);
      // 303 y (301/302 con POST) degradan a GET, como en la especificación.
      if (response.status === 303 ||
          ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
      // El cuerpo de la redirección no se usa; liberar la conexión.
      await response.body?.cancel().catch(() => undefined);
    }

    throw new BlockedDestinationError('Demasiadas redirecciones');
  };

  return guarded as typeof fetch;
}
