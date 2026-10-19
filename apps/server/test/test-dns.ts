import type { HostLookup } from '@vibeflix/scrapers';

/**
 * Resolutor DNS de pruebas.
 *
 * El guardia SSRF resuelve cada host antes de descargar; los tests usan
 * dominios ficticios (`site.example`, `meta.tld`), así que aquí se responde
 * con una IP pública fija. Los tests de bloqueo inyectan su propio resolutor
 * con direcciones privadas.
 */
export const publicLookup: HostLookup = async () => [
  { address: '93.184.216.34', family: 4 },
];
