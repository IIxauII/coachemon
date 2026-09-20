/**
 * Draws the listing screenshots and promo tiles into `docs/listing/assets/` (§3). Run: node scripts/listing/render.ts
 *
 * Every shot is the real HUD — `bundle("hud")`, the same source the extension ships — mounted over a fixture snapshot
 * in a headless Chrome and photographed. Nothing comes from a live game: no canvas, no capture of a real run, and no
 * sprite atlas, so every icon falls back to the name it stands for (§1.9, §3).
 *
 * Chrome is asked for one screenshot per asset and nothing else: `--headless --screenshot` sizes the shot by
 * `--window-size`, which is why the store sizes in `listing.ts` are the window and the panel is fitted with CSS
 * `zoom` rather than by scaling the image afterwards — a zoomed panel re-lays out and stays sharp, a scaled PNG does
 * not. `--virtual-time-budget` gives the HUD's first tick time to land before the shutter.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../skills/coachemon/scripts/hud-bundle.mjs";
import { DEFAULTS } from "../../src/cdp/session.ts";
import { LISTING_ASSETS, listingPath, pngSize, repoPath } from "./listing.ts";
import type { ListingAsset, Shot } from "./listing.ts";

/** The assets that are photographed; the icons in the table are drawn by `extension/scripts/icons.mjs` instead. */
type ShotAsset = ListingAsset & { shot: Shot };
const shots = LISTING_ASSETS.filter((a): a is ShotAsset => a.shot !== undefined);

/** The neutral background the store asks nothing about and the spec asks everything about: no art, no game, no text. */
const page = (asset: ShotAsset): string => `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; }
  /* Flat, not a gradient: a dithered gradient costs a quarter of a megabyte per shot in PNG and says nothing. */
  body { display: grid; place-items: center; background: #e7eaf1; }
  /* The panel is fixed to the top-left corner of a game tab; for a shot it sits in the middle of the frame instead. */
  #coach-hud {
    position: static !important; display: block !important;
    zoom: ${asset.shot.zoom};
    box-shadow: 0 6px 24px rgba(16, 18, 34, .28);
  }
</style>
<body>
<!-- In the body, not the head: the HUD appends its panel to document.body the moment it runs (§5.2). -->
<script>${readFileSync(repoPath("scripts/listing/fixtures.js"), "utf8")}</script>
<script>window.__mountFixture(${JSON.stringify(asset.shot.fixture)}, ${JSON.stringify(asset.shot.view)});</script>
<script>${bundle("hud")}</script>
`;

const chrome = process.env.COACHEMON_CHROME ?? DEFAULTS.chromePath;
const work = mkdtempSync(join(tmpdir(), "coachemon-listing-"));

try {
  for (const asset of shots) {
    const html = join(work, "shot.html");
    const out = listingPath(asset.file);
    writeFileSync(html, page(asset));
    mkdirSync(dirname(out), { recursive: true });
    execFileSync(chrome, [
      "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      `--window-size=${asset.width},${asset.height}`, "--virtual-time-budget=4000",
      `--screenshot=${out}`, `file://${html}`,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const size = pngSize(readFileSync(out));
    if (size.width !== asset.width || size.height !== asset.height) {
      throw new Error(`${asset.file}: Chrome wrote ${size.width}×${size.height}, not ${asset.width}×${asset.height}`);
    }
    process.stdout.write(`${asset.file} ${size.width}×${size.height} (${asset.shot.fixture}, ${asset.shot.view})\n`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
