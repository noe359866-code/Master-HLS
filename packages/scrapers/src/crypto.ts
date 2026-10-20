/**
 * Port of StreamFlix's AesHelper.kt (itself ported from CloudStream's
 * AesHelper). Used by several upstream providers (Chillx/Jean/Moviesapi,
 * FilmPalast clones, etc.) that hide the player JSON behind AES-CBC
 * encrypted with OpenSSL-compatible EVP_BytesToKey (MD5 KDF).
 *
 * Cipher: AES/CBC/PKCS5PADDING
 * KDF: MD5, keyLength=32 (AES-256), ivLength derived from payload.iv
 * Data format: JSON { ct: base64(ciphertext), iv: hex, s: hex(salt) }
 *
 * Source mirrors:
 * - https://git.gay/streamflix-reborn2/streamflix/src/branch/main/app/src/main/java/com/streamflixreborn/streamflix/utils/AesHelper.kt
 * - https://github.com/recloudstream/cloudstream/blob/master/library/src/commonMain/kotlin/com/lagradost/cloudstream3/extractors/helper/AesHelper.kt
 */

import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';

export interface AesPayload {
  ct: string; // base64 ciphertext
  iv: string; // hex
  s: string; // hex salt
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Must have an even length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) throw new Error('Invalid hex');
    out[i / 2] = byte;
  }
  return out;
}

/**
 * OpenSSL EVPKDF_BytesToKey with count=1 (the variant used by StreamFlix).
 * Derives (key + iv) in one buffer then slices as [0:keyLen) + [keyLen:keyLen+ivLen).
 */
export function generateKeyAndIv(
  password: Uint8Array,
  salt: Uint8Array,
  opts: {
    hashAlgorithm?: 'md5' | 'sha256';
    keyLength?: number;
    ivLength: number;
    saltLength: number;
    iterations?: number;
  },
): { key: Uint8Array; iv: Uint8Array } | null {
  const hashAlg = opts.hashAlgorithm ?? 'md5';
  const keyLen = opts.keyLength ?? 32;
  const iterations = opts.iterations ?? 1;
  const target = keyLen + opts.ivLength;
  if (opts.ivLength < 0 || target <= 0) return null;

  const digestLen = hashAlg === 'md5' ? 16 : 32;
  const blocks = Math.ceil(target / digestLen);
  const out = new Uint8Array(blocks * digestLen);
  let written = 0;

  try {
    for (let block = 0; block < blocks; block += 1) {
      const h = createHash(hashAlg);
      if (written > 0) h.update(out.subarray(written - digestLen, written));
      h.update(password);
      h.update(salt.subarray(0, opts.saltLength));
      let digest = h.digest();
      for (let it = 1; it < iterations; it += 1) {
        digest = createHash(hashAlg).update(digest).digest();
      }
      out.set(digest, written);
      written += digestLen;
    }
    return {
      key: out.slice(0, keyLen),
      iv: out.slice(keyLen, target),
    };
  } catch {
    return null;
  }
}

/**
 * Decrypts (encrypt=false) or encrypts (encrypt=true) the AesPayload JSON
 * blob. Returns plaintext string on success or null on failure.
 *
 * The upstream Kotlin expects `data` to be the raw JSON string that was
 * embedded as `'ENCRYPTED_JSON'` in HTML (captured as content group 1).
 */
export function cryptoAesHandler(
  data: string,
  pass: Uint8Array,
  encrypt = false,
  padding: 'aes-256-cbc' | 'aes-128-cbc' = 'aes-256-cbc',
): string | null {
  let parsed: AesPayload;
  try {
    parsed = JSON.parse(data) as AesPayload;
    if (typeof parsed.ct !== 'string' || typeof parsed.iv !== 'string' || typeof parsed.s !== 'string') return null;
  } catch {
    return null;
  }

  const ivLen = parsed.iv.length / 2;
  const saltLen = parsed.s.length / 2;
  const saltBytes = hexToBytes(parsed.s);
  const derived = generateKeyAndIv(pass, saltBytes, {
    hashAlgorithm: 'md5',
    keyLength: 32,
    ivLength: ivLen,
    saltLength: saltLen,
    iterations: 1,
  });
  if (!derived) return null;

  // Node requires key+iv lengths to match algorithm: aes-256-cbc needs 32+16.
  // Some payloads have ivLen != 16; pad/truncate to 16 for CBC.
  const key = derived.key;
  let iv = derived.iv;
  if (iv.length !== 16) {
    const fixed = new Uint8Array(16);
    fixed.set(iv.subarray(0, Math.min(16, iv.length)));
    iv = fixed;
  }

  try {
    if (!encrypt) {
      const decipher = createDecipheriv(padding, Buffer.from(key), Buffer.from(iv));
      decipher.setAutoPadding(true);
      const ctBuf = Buffer.from(parsed.ct, 'base64');
      let out = decipher.update(ctBuf);
      out = Buffer.concat([out, decipher.final()]);
      return out.toString('utf8');
    }
    const cipher = createCipheriv(padding, Buffer.from(key), Buffer.from(iv));
    const pt = Buffer.from(parsed.ct, 'utf8');
    let out = cipher.update(pt);
    out = Buffer.concat([out, cipher.final()]);
    return out.toString('base64');
  } catch {
    return null;
  }
}

/**
 * Tries to extract and decrypt a Chillx-style payload from HTML.
 * Returns decrypted JSON string or null.
 */
export function decryptChillxPayload(
  html: string,
  key: string,
): string | null {
  const match = /\s*=\s*'([^']+)/.exec(html);
  if (!match) return null;
  const content = match[1];
  if (!content) return null;
  return cryptoAesHandler(content, Buffer.from(key, 'utf8'), false);
}
