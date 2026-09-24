/**
 * Draws the listing screenshots into `docs/listing/assets/` (§3). Run: node scripts/listing/render.ts
 *
 * Every shot is the real HUD — `bundle("hud")`, the same source the extension ships — mounted over a fixture snapshot
 * in a headless Chrome and photographed. Nothing comes from a live game: no canvas, no capture of a real run, and no
 * sprite atlas, so every icon falls back to the name it stands for (§1.9, §3).
 *
 * The page itself — the pinned stage, the letterbox behind it and the game's two faces — is `page.ts`, which says why
 * each of them is what it is. **It needs a provisioned pinned clone**, because the faces are read out of it.
 *
 * Chrome is asked for one screenshot per asset and nothing else: `--headless --screenshot` sizes the shot by
 * `--window-size`, which is why the store sizes in `listing.ts` are the window and the stage is fitted by scaling it
 * in the page rather than by scaling the image afterwards — a scaled stage is re-rasterised at the frame's own scale
 * and stays sharp, a scaled PNG does not. `--virtual-time-budget` gives the HUD's first tick time to land before the
 * shutter.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../skills/coachemon/scripts/hud-bundle.mjs";
import { LISTING_ASSETS, listingPath, pngSize, repoPath } from "./listing.ts";
import { STAGE_FILE, framePage, gameFonts, stagePage } from "./page.ts";
import type { ShotAsset } from "./listing.ts";

/** The assets that are photographed; the icons and promo tiles in the table come from the design project instead. */
const shots = LISTING_ASSETS.filter((a): a is ShotAsset => a.shot !== undefined);

/** Read, bundled and inlined once rather than per shot: `stagePage()` runs for every asset, and the HUD, the fixtures
 * and the faces are the same in all of them, so re-reading them six times only makes the run slower. Since the fonts
 * are several megabytes of base64 apiece, doing it per shot is the difference between a pause and a coffee. */
const fixtures = readFileSync(repoPath("scripts/listing/fixtures.js"), "utf8");
const hud = bundle("hud");
const fonts = gameFonts();

/** Spelled out rather than taken from `src/cdp/session.ts`: that module's `DEFAULTS.chromePath` already resolves this
 * same variable, so reading it there bought nothing and tied the renderer to a module §13.2 deletes at the flip. */
const chrome = process.env.COACHEMON_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const work = mkdtempSync(join(tmpdir(), "coachemon-listing-"));

/** How long one shot may take before the run gives up on it, and how often the file is looked at. */
const SHUTTER = { limit: 120_000, poll: 250 };

/**
 * Take one shot, into `out` — **a path inside the work dir, never the committed asset**: a run that fails or times
 * out must leave what is committed alone, and the picture only moves into `docs/listing/assets/` once it is one.
 *
 * **The run waits for the picture, not for the browser**: a headless Chrome that has written its screenshot does not
 * always exit — it is a whole browser with nothing left to do — and a renderer that waits for it never comes back.
 * So the shot is complete when the PNG has appeared and stopped growing, and the browser is then dismissed.
 */
const shoot = (args: string[], out: string): Promise<void> => {
  rmSync(out, { force: true });
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk; });
    const deadline = Date.now() + SHUTTER.limit;
    let last = -1;
    const finish = (err?: Error): void => {
      clearInterval(timer);
      child.kill("SIGKILL");
      err ? reject(err) : resolve();
    };
    const timer = setInterval(() => {
      const size = statSync(out, { throwIfNoEntry: false })?.size ?? -1;
      if (size > 0 && size === last) finish();
      else if (Date.now() > deadline) finish(new Error(`${out}: Chrome wrote no shot in ${SHUTTER.limit} ms\n${stderr}`));
      last = size;
    }, SHUTTER.poll);
    child.on("error", err => finish(err));
    // A Chrome that has exited without writing is a Chrome nothing is coming from, whatever it exited with: say so
    // now rather than watch an empty path until the deadline.
    child.on("exit", code => {
      if (statSync(out, { throwIfNoEntry: false }) === undefined) {
        finish(new Error(`${out}: Chrome exited ${code} without writing a shot\n${stderr}`));
      }
    });
  });
};

try {
  for (const asset of shots) {
    const frame = join(work, "frame.html");
    const shot = join(work, "shot.png");
    const out = listingPath(asset.file);
    // Two files rather than one `srcdoc`: the stage carries megabytes of inlined font, and an attribute is no place
    // for it. They are rewritten per shot because the stage names the fixture and the frame names the zoom.
    writeFileSync(join(work, STAGE_FILE), stagePage({ fixture: asset.shot.fixture, fixtures, hud, fonts }));
    writeFileSync(frame, framePage(asset));
    mkdirSync(dirname(out), { recursive: true });
    await shoot([
      "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      // Its own profile, inside the temp dir: without this Chrome reaches for the developer's real one, which the
      // repo's own server may already hold open.
      `--user-data-dir=${join(work, "profile")}`,
      `--window-size=${asset.width},${asset.height}`, "--virtual-time-budget=4000",
      `--screenshot=${shot}`, `file://${frame}`,
    ], shot);
    const png = readFileSync(shot);
    const size = pngSize(png);
    if (size.width !== asset.width || size.height !== asset.height) {
      throw new Error(`${asset.file}: Chrome wrote ${size.width}×${size.height}, not ${asset.width}×${asset.height}`);
    }
    writeFileSync(out, png);
    process.stdout.write(`${asset.file} ${size.width}×${size.height} (${asset.shot.fixture} @ ${asset.shot.zoom}×)\n`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
