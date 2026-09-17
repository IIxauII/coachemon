// Draws the extension's icons into public/icons/. Run: node scripts/icons.mjs
//
// The mark is a whistle wearing a bandit mask (§3 of docs/spec/extension-distribution.md): no ball, no red/white split
// circle, no creature silhouette, nothing from PokéRogue's logo or favicon. Artwork never ships (§1.9), so this is
// drawn from primitives here rather than pulled from anywhere, and the listing ticket replaces it with the real mark.
//
// Rendered by supersampling a coverage test per pixel, which is all the antialiasing a 16 px tile needs.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const INK = [16, 18, 34]; // the mask and the outline
const BODY = [232, 235, 245]; // the whistle
const FIELD = [58, 96, 168]; // the tile
const SLIT = [126, 208, 255]; // the eye slits

// Everything below is in a 0..1 square, so one description serves every size.
const roundRect = (x, y, w, h, r) => (px, py) => {
  const dx = Math.max(Math.abs(px - (x + w / 2)) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(py - (y + h / 2)) - (h / 2 - r), 0);
  return Math.hypot(dx, dy) <= r;
};
const circle = (cx, cy, r) => (px, py) => Math.hypot(px - cx, py - cy) <= r;

const tile = roundRect(0.02, 0.02, 0.96, 0.96, 0.22);
// The whistle: a barrel, its mouthpiece to the left, and the air hole punched out of the top right.
const barrel = roundRect(0.26, 0.36, 0.56, 0.34, 0.17);
const mouth = roundRect(0.1, 0.45, 0.2, 0.16, 0.06);
const hole = circle(0.68, 0.45, 0.075);
// The mask: a band across the barrel's eyes, with two slits cut out of it.
const band = roundRect(0.22, 0.4, 0.64, 0.16, 0.07);
const slitL = roundRect(0.36, 0.445, 0.1, 0.055, 0.027);
const slitR = roundRect(0.55, 0.445, 0.1, 0.055, 0.027);

/** The colour at one point, or null for transparent. Order is the painting order. */
const at = (x, y) => {
  if (!tile(x, y)) return null;
  const whistle = barrel(x, y) || mouth(x, y);
  if (whistle && hole(x, y)) return FIELD;
  if (band(x, y) && whistle) return slitL(x, y) || slitR(x, y) ? SLIT : INK;
  return whistle ? BODY : FIELD;
};

function render(size) {
  const n = 4; // subsamples per axis
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = at((px + (sx + 0.5) / n) / size, (py + (sy + 0.5) / n) / size);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const hits = a / 255;
      const i = (py * size + px) * 4;
      if (hits === 0) continue;
      rgba[i] = Math.round(r / hits);
      rgba[i + 1] = Math.round(g / hits);
      rgba[i + 2] = Math.round(b / hits);
      rgba[i + 3] = Math.round(a / (n * n));
    }
  }
  return rgba;
}

const CRC = Int32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = buf => {
  let c = ~0;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
};

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // Each scanline is prefixed with its filter type, 0 (none).
  const raw = Buffer.concat(
    Array.from({ length: size }, (_, y) => Buffer.concat([Buffer.of(0), rgba.subarray(y * size * 4, (y + 1) * size * 4)])),
  );
  return Buffer.concat([
    Buffer.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`${dir}${size}.png`, png(size, render(size)));
  process.stdout.write(`icons/${size}.png\n`);
}
