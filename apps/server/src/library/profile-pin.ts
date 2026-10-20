import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Los clientes solo necesitan saber si existe un PIN, nunca su valor/hash. */
export const PIN_PLACEHOLDER = '••••';
const PREFIX = 'scrypt$';

export function isHashedPin(value: string): boolean {
  return /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(value);
}

export function hashProfilePin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 32).toString('hex');
  return `${PREFIX}${salt}$${hash}`;
}

export function verifyProfilePin(stored: string, given: string): boolean {
  if (isHashedPin(stored)) {
    const [, salt, hash] = stored.split('$');
    const expected = Buffer.from(hash!, 'hex');
    return timingSafeEqual(scryptSync(given, salt!, expected.length), expected);
  }
  // Compatibilidad con perfiles antiguos que aún conservan un PIN en claro.
  const expected = Buffer.from(stored);
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export function publicProfile<T extends { pin?: string }>(profile: T): T {
  return { ...profile, pin: profile.pin ? PIN_PLACEHOLDER : undefined };
}
