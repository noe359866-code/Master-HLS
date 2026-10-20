#!/usr/bin/env node
/**
 * Genera los iconos de la PWA, el logo del addon Stremio y el fondo.
 *
 * Se hace a mano (PNG crudo con zlib) para no añadir dependencias al repo:
 * el repositorio solo lleva codigo de la app, no herramientas de build.
 *
 *   node scripts/gen-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../apps/web/public');

/* ---------------------------------------------------------------- PNG ---- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // profundidad de bits
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- dibujo ---- */

const lerp = (a, b, t) => a + (b - a) * t;

function mix(colorA, colorB, t) {
  return [
    Math.round(lerp(colorA[0], colorB[0], t)),
    Math.round(lerp(colorA[1], colorB[1], t)),
    Math.round(lerp(colorA[2], colorB[2], t)),
  ];
}

const NAVY = [11, 14, 20];
const BLUE = [91, 140, 255];
const VIOLET = [155, 92, 255];

/**
 * Icono: fondo degradado, un triangulo de "reproducir" y una barra de
 * lista (el concepto de la app:Streaming + HLS).
 */
function drawIcon(size, { padding = 0.18, rounded = true } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = rounded ? size * 0.22 : 0;
  const inset = size * padding;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const t = (x / size) * 0.5 + (y / size) * 0.5;
      let [r, g, b] = mix(NAVY, mix(BLUE, VIOLET, t), 0.35 + 0.65 * t);

      // Mascara redondeada (o circulo para el icono "maskable").
      let inside = true;
      if (rounded) {
        const cx = Math.min(Math.max(x, radius), size - radius);
        const cy = Math.min(Math.max(y, radius), size - radius);
        const dx = x - cx;
        const dy = y - cy;
        inside = dx * dx + dy * dy <= radius * radius;
      }
      if (!inside) {
        rgba[offset + 3] = 0;
        continue;
      }

      // Triangulo de reproduccion.
      const tx = (x - inset) / (size - inset * 2);
      const ty = (y - inset) / (size - inset * 2);
      const inTriangle =
        tx >= 0.14 && tx <= 0.52 && Math.abs(ty - 0.5) <= (0.52 - tx) * 0.72;
      if (inTriangle) {
        r = 255;
        g = 255;
        b = 255;
      }

      // Barras de "playlist" a la derecha.
      const barX = size * 0.62;
      const bars = [0.16, 0.26, 0.36];
      for (let i = 0; i < bars.length; i += 1) {
        const barY = size * bars[i];
        const barH = size * 0.055;
        const inBar =
          x >= barX && x <= barX + size * 0.22 && y >= barY && y <= barY + barH;
        if (inBar) {
          r = 255;
          g = 255;
          b = 255;
        }
      }

      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = 255;
    }
  }

  return encodePng(size, size, rgba);
}

/** Fondo degradado simple para el manifest del addon. */
function drawBackground(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const t = (x / width) * 0.35 + (y / height) * 0.65;
      const [r, g, b] = mix(NAVY, mix(BLUE, VIOLET, t), 0.18 + 0.5 * t);
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}

/* --------------------------------------------------------------- main ---- */

mkdirSync(path.join(outDir, 'icons'), { recursive: true });

const files = [
  ['icons/icon-192.png', drawIcon(192)],
  ['icons/icon-512.png', drawIcon(512)],
  ['icons/icon-maskable-512.png', drawIcon(512, { padding: 0.26 })],
  ['logo.png', drawIcon(512)],
  ['background.png', drawBackground(1280, 720)],
];

for (const [name, data] of files) {
  const target = path.join(outDir, name);
  writeFileSync(target, data);
  console.log(`[icons] ${path.relative(process.cwd(), target)} (${data.length} bytes)`);
}
