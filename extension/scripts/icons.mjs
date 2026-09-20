// Draws the mark: the extension's icons into public/icons/, and the 1024 master the Safari app icon set is generated
// from into docs/listing/assets/ (§14.6), which is also the folder the store listings upload from. Run:
// node scripts/icons.mjs
//
// The mark is a whistle wearing a bandit mask (§3 of docs/spec/extension-distribution.md): no ball, no red/white split
// circle, no creature silhouette, nothing from PokéRogue's logo or favicon. Artwork never ships (§1.9), so it is drawn
// from primitives here rather than pulled from anywhere.
//
// The silhouette has to survive 16 px, so it is one tapered capsule — lip to chamber — with the mask across it, a
// lanyard hole punched through, and an ink outline against the tile. Nothing protrudes past the capsule: every version
// with a ring hung off the chamber read as a head with an ear.
//
// Rendered by supersampling a coverage test per pixel, which is all the antialiasing a 16 px tile needs.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
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
/** A shape turned about a point, so the mask can sit at an angle the axis-aligned primitives cannot reach. */
const rot = (shape, cx, cy, a) => (px, py) => {
  const dx = px - cx, dy = py - cy, c = Math.cos(a), s = Math.sin(a);
  return shape(cx + dx * c + dy * s, cy - dx * s + dy * c);
};

const tile = roundRect(0.02, 0.02, 0.96, 0.96, 0.22);

// One outline width. A shape is drawn twice: once as itself and once swollen by this much, and what is inside the
// swollen one but outside the shape is the ink edge.
const OUT = 0.026;
/**
 * A capsule whose radius tapers from one end to the other — the whole whistle is one of these. Takes the two ends
 * (centre and radius each), and returns the shape as a function of how far to grow it.
 */
const cone = (ax, ay, ra, bx, by, rb) => grow => (px, py) => {
  const bax = bx - ax, bay = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * bax + (py - ay) * bay) / (bax * bax + bay * bay)));
  return Math.hypot(px - (ax + bax * t), py - (ay + bay * t)) <= ra + (rb - ra) * t + grow;
};

// The whistle: a narrow lip on the left flaring into the round chamber on the right, which is the pea-whistle profile
// and the one silhouette that survives 16 px without a second shape. Nothing sticks out past it — every ring hung off
// the chamber turned the mark into a head with an ear, which §3 rules out as much as any borrowed art does.
const whistle = cone(0.14, 0.455, 0.088, 0.67, 0.545, 0.19);
// The lanyard hole is punched through the chamber, under the mask.
const cord = circle(0.72, 0.43, 0.032);
const cordRim = circle(0.72, 0.43, 0.032 + OUT);

const body = whistle(0);
const outline = whistle(OUT);

// The mask: a band across the eyes, tilted, with two slits cut out of it. Clipped to the whistle, so it reads as worn
// rather than as a stripe across the tile, and thins to a strap where it crosses the lip.
const TILT = -0.05;
const band = rot(roundRect(0.08, 0.485, 0.92, 0.14, 0.05), 0.68, 0.555, TILT);
const slitL = rot(roundRect(0.55, 0.525, 0.095, 0.052, 0.026), 0.68, 0.555, TILT);
const slitR = rot(roundRect(0.71, 0.525, 0.095, 0.052, 0.026), 0.68, 0.555, TILT);

/** The colour at one point, or null for transparent. Order is the painting order. */
const at = (x, y) => {
  if (!tile(x, y)) return null;
  if (body(x, y)) {
    if (cordRim(x, y)) return cord(x, y) ? FIELD : INK;
    if (band(x, y)) return slitL(x, y) || slitR(x, y) ? SLIT : INK;
    return BODY;
  }
  return outline(x, y) ? INK : FIELD;
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

const repo = fileURLToPath(new URL("../../", import.meta.url));
const write = (path, size) => {
  mkdirSync(fileURLToPath(new URL(".", path)), { recursive: true });
  writeFileSync(fileURLToPath(path), png(size, render(size)));
  process.stdout.write(`${relative(repo, fileURLToPath(path))} (${size}px)\n`);
};

for (const size of [16, 32, 48, 128]) write(new URL(`../public/icons/${size}.png`, import.meta.url), size);
// The master is not shipped in the artifact — only the store listings and the Safari app icon set want it — so it
// lands with the rest of the listing assets rather than in `public/`.
write(new URL("../../docs/listing/assets/icon-1024.png", import.meta.url), 1024);
