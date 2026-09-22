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
import { LISTING_ASSETS, listingPath, pngSize, repoPath } from "./listing.ts";
import type { ListingAsset, Shot } from "./listing.ts";

/** The assets that are photographed; the icons and promo tiles in the table come from the design project instead. */
type ShotAsset = ListingAsset & { shot: Shot };
const shots = LISTING_ASSETS.filter((a): a is ShotAsset => a.shot !== undefined);

/** Read and bundled once rather than per shot: `page()` runs for every asset, and the HUD is the same source in all
 * of them, so re-bundling it six times only makes the run slower. */
const fixtures = readFileSync(repoPath("scripts/listing/fixtures.js"), "utf8");
const hud = bundle("hud");

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
<script>${fixtures}</script>
<script>window.__mountFixture(${JSON.stringify(asset.shot.fixture)});</script>
<script>${hud}</script>
`;

/** Spelled out rather than taken from `src/cdp/session.ts`: that module's `DEFAULTS.chromePath` already resolves this
 * same variable, so reading it there bought nothing and tied the renderer to a module §13.2 deletes at the flip. */
const chrome = process.env.COACHEMON_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const work = mkdtempSync(join(tmpdir(), "coachemon-listing-"));

try {
  for (const asset of shots) {
    const html = join(work, "shot.html");
    const out = listingPath(asset.file);
    writeFileSync(html, page(asset));
    mkdirSync(dirname(out), { recursive: true });
    execFileSync(chrome, [
      "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      // Its own profile, inside the temp dir: without this Chrome reaches for the developer's real one, which the
      // repo's own server may already hold open.
      `--user-data-dir=${join(work, "profile")}`,
      `--window-size=${asset.width},${asset.height}`, "--virtual-time-budget=4000",
      `--screenshot=${out}`, `file://${html}`,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const size = pngSize(readFileSync(out));
    if (size.width !== asset.width || size.height !== asset.height) {
      throw new Error(`${asset.file}: Chrome wrote ${size.width}×${size.height}, not ${asset.width}×${asset.height}`);
    }
    process.stdout.write(`${asset.file} ${size.width}×${size.height} (${asset.shot.fixture})\n`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
