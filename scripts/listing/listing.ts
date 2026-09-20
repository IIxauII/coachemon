/**
 * What the Chrome Web Store and AMO listing forms ask for, as one table (§3, §6 of
 * `docs/spec/extension-distribution.md`). The copy itself is `docs/listing/`, because a human pastes it into a form;
 * this file holds the few strings that must agree with the extension and with each other, and the asset table that
 * `render.ts` draws and `src/listing.test.ts` checks.
 *
 * Artwork never ships (§1.9): every asset here is either the drawn mark (`extension/scripts/icons.mjs`) or a fixture
 * render of the HUD on a neutral background. No game canvas, no capture of a real run.
 */
import { fileURLToPath } from "node:url";

/** The fixed line, on every listing and inside the extension (§3). The HUD and the manifest each carry their own
 * copy — the HUD because it is plain JS the extension bundles rather than imports — and the test pins all three. */
export const DISCLAIMER = "Unofficial. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.";

/** GitHub Pages, from `master` / root, which is why `PRIVACY.md` carries Jekyll front matter (§3). */
export const PRIVACY_URL = "https://iixauii.github.io/coachemon/PRIVACY";

/** Support is email only; the repo is public but not a support surface (§3). */
export const SUPPORT_EMAIL = "xauyxau+coachemon@gmail.com";

/** The fixture scenes `scripts/listing/fixtures.js` builds. Named rather than free text: a name that file does not
 * have leaves the panel unmounted, and a blank shot is still a PNG of the right size, so nothing downstream notices. */
export type Fixture = "battle" | "learn" | "rewards";

/** The view the HUD renders a shot in, and the fixture it renders from. */
export type Shot = { view: "full" | "mini"; fixture: Fixture; zoom: number };

export type ListingAsset = {
  /** Relative to `docs/listing/`, which is the folder a human uploads from; the icons climb out of it to where the
   * extension already keeps them, rather than being copied in to drift. */
  file: string;
  width: number;
  height: number;
  /** Which form field it answers. */
  what: string;
  /** Absent for the icons, which `extension/scripts/icons.mjs` draws. */
  shot?: Shot;
};

/**
 * Sizes are the stores' own: CWS screenshots are 1280×800, its small promo tile 440×280 and its marquee 1400×560;
 * AMO takes any size and reuses the same screenshots. `zoom` is the CSS zoom the panel is drawn at, picked so the
 * card fills the frame without cropping — a 320 px panel is unreadable at 1280 px wide otherwise.
 */
export const LISTING_ASSETS: ListingAsset[] = [
  { file: "assets/screenshot-battle.png", width: 1280, height: 800, what: "CWS and AMO screenshot 1",
    shot: { view: "full", fixture: "battle", zoom: 2 } },
  { file: "assets/screenshot-learn.png", width: 1280, height: 800, what: "CWS and AMO screenshot 2",
    shot: { view: "full", fixture: "learn", zoom: 2 } },
  { file: "assets/screenshot-rewards.png", width: 1280, height: 800, what: "CWS and AMO screenshot 3",
    shot: { view: "full", fixture: "rewards", zoom: 2 } },
  { file: "assets/screenshot-mini.png", width: 1280, height: 800, what: "CWS and AMO screenshot 4",
    shot: { view: "mini", fixture: "battle", zoom: 2.4 } },
  { file: "assets/promo-small.png", width: 440, height: 280, what: "CWS small promo tile",
    shot: { view: "mini", fixture: "battle", zoom: 1 } },
  { file: "assets/promo-marquee.png", width: 1400, height: 560, what: "CWS marquee promo tile",
    shot: { view: "mini", fixture: "battle", zoom: 2.2 } },
  { file: "assets/icon-1024.png", width: 1024, height: 1024, what: "Safari app icon master (§14.6)" },
  { file: "../../extension/public/icons/128.png", width: 128, height: 128, what: "CWS and AMO store icon" },
];

const root = new URL("../../", import.meta.url);

export const repoPath = (rel: string): string => fileURLToPath(new URL(rel, root));
export const listingPath = (rel: string): string => fileURLToPath(new URL(`docs/listing/${rel}`, root));

const MAGIC = Buffer.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

/** A PNG's pixel size, off its IHDR: the one check that a committed asset is what a form will accept. */
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || !png.subarray(0, 8).equals(MAGIC)) throw new Error("not a PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
