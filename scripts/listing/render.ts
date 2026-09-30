/**
 * `--screenshot` sizes the shot by `--window-size`, so the stage is fitted by a scale inside the page, which
 * re-rasterises sharp where a scaled PNG would not. `--virtual-time-budget` gives the HUD's first tick time to land.
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

const shots = LISTING_ASSETS.filter((a): a is ShotAsset => a.shot !== undefined);

const fixtures = readFileSync(repoPath("scripts/listing/fixtures.js"), "utf8");
const hud = bundle("hud");
const fonts = gameFonts();

/** Not from `src/cdp/session.ts`, which extension-distribution.md §13.2 deletes at the flip. */
const chrome = process.env.COACHEMON_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const work = mkdtempSync(join(tmpdir(), "coachemon-listing-"));

const SHUTTER = { limit: 120_000, poll: 250 };

/**
 * `out` is **a path in the work dir, never the committed asset**, so a failed run leaves that alone. Done when the PNG
 * stops growing, not when Chrome exits: a headless Chrome that has written its shot does not always exit.
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
    writeFileSync(join(work, STAGE_FILE), stagePage({ fixture: asset.shot.fixture, fixtures, hud, fonts }));
    writeFileSync(frame, framePage(asset));
    mkdirSync(dirname(out), { recursive: true });
    await shoot([
      "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      // Without its own profile Chrome takes the developer's, which the repo's own server may hold open.
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
