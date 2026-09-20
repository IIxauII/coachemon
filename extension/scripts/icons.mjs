// Draws the mark: the extension's icons into public/icons/, and the 1024 master the Safari app icon set is generated
// from into docs/listing/assets/ (§14.6), which is also the folder the store listings upload from. Run:
// node scripts/icons.mjs
//
// The mark is a capped coachemon face (§3 of docs/spec/extension-distribution.md): no ball, no red/white split circle,
// no creature silhouette, nothing from PokéRogue's logo or favicon. Artwork never ships (§1.9), so the drawing lives
// here as a pixel grid rather than as a PNG pulled from anywhere — the grid below *is* the source, and the committed
// PNGs are its output.
//
// It is authored once at 16×16, the size that has to survive the toolbar, and doubled to 32×32 for every size above
// it, so no size is a downsample of another and the 16 px tile is drawn rather than guessed. Earlier passes authored
// a 32-grid first and lost detail on the way down to 16; this way round the toolbar icon is the one that is exact.
//
// Rendered by supersampling a coverage test per pixel, which is all the antialiasing a 16 px tile needs. The store
// promo tiles are not drawn here — they set this mark in type, so `scripts/listing/render.ts` photographs them.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

/** The tile behind the mark. Not in `PALETTE`: it is what `.` means, and nothing else may paint it. */
const FIELD = [0x2a, 0x1b, 0x54];

const PALETTE = {
  B: [0xff, 0xc2, 0x4b], // the face
  H: [0xff, 0xe7, 0xa8], // the lit band under the brim
  S: [0xd9, 0x82, 0x2b], // the shade along the jaw
  K: [0x16, 0x12, 0x2b], // ink: the brim, the eyes, the grin
  C: [0x63, 0xe6, 0xff], // the cap crown, and the glints either side
  D: [0x33, 0xb6, 0xde], // the cap's lower crown, so it reads as a cap rather than a beanie
  W: [0xf4, 0xf1, 0xe8], // the white of the eye
};

// The 16×16 authoring grid. The cap is given a crown button and a darker lower band so the silhouette is a cap and
// not a beanie; the eyes carry a glint and the mouth is open, which is what separates a coach from a mascot.
const SMALL = [
  ".......CC.......",
  "......CCCC......",
  ".....CCCCCCC....",
  "....CCCCCCCCCC..",
  "...DDDDDDDDDDDD.",
  "KKKKKKKKKKKKKKK.",
  "..BBHHHHHHHHHBB.",
  "..BBBBBBBBBBBBB.",
  "..BBWKBBBBWKBBB.",
  "..BBKKBBBBKKBBB.",
  ".CCBBBBBBBBBBCC.",
  "..BBBKKKKKKBBB..",
  "..BBBBKKKKBBBB..",
  "...SBBBBBBBBS...",
  "....SSSSSSSS....",
  "................",
];

/** Every size above the toolbar draws this: the 16×16 with each cell as a 2×2 block, so it is the same drawing. */
const BIG = SMALL.flatMap(row => {
  const doubled = [...row].map(ch => ch + ch).join("");
  return [doubled, doubled];
});

const CORNER = 0.22; // tile corner radius, as a fraction of the tile

/** Whether a point in the 0..1 square is inside the rounded tile; sampled, so the corner stays smooth at every size. */
const inTile = (x, y) => {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - CORNER), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - CORNER), 0);
  return Math.hypot(dx, dy) <= CORNER;
};

function render(size) {
  const grid = size <= 16 ? SMALL : BIG;
  const n = grid.length;
  const rgba = Buffer.alloc(size * size * 4);
  const sub = 4; // subsamples per axis
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const x = (px + (sx + 0.5) / sub) / size;
          const y = (py + (sy + 0.5) / sub) / size;
          if (!inTile(x, y)) continue;
          const ch = grid[Math.min(n - 1, Math.floor(y * n))][Math.min(n - 1, Math.floor(x * n))];
          const c = ch === "." ? FIELD : PALETTE[ch];
          r += c[0]; g += c[1]; b += c[2]; hits++;
        }
      }
      if (!hits) continue;
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r / hits);
      rgba[i + 1] = Math.round(g / hits);
      rgba[i + 2] = Math.round(b / hits);
      // Only the rounded corner is ever partly covered, so coverage is the alpha.
      rgba[i + 3] = Math.round((255 * hits) / (sub * sub));
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
// The master is not shipped in the artifact — the store listings, the promo tiles and the Safari app icon set want it
// — so it lands with the rest of the listing assets rather than in `public/`.
write(new URL("../../docs/listing/assets/icon-1024.png", import.meta.url), 1024);
