/**
 * What the Chrome Web Store and AMO listing forms ask for, as one table (§3, §6 of
 * `docs/spec/extension-distribution.md`). The copy itself is `docs/listing/`, because a human pastes it into a form;
 * this file holds the few strings that must agree with the extension and with each other, and the asset table that
 * `render.ts` draws and `src/listing.test.ts` checks.
 *
 * Artwork never ships (§1.9): every asset here is either the mark, drawn in the design project and copied in, or a
 * fixture render of the HUD on the game's own letterbox colour. No game canvas, no franchise art, no capture of a
 * real run.
 */
import { fileURLToPath } from "node:url";

/** The fixed line, on every listing and inside the extension (§3). The HUD and the manifest each carry their own
 * copy — the HUD because it is plain JS the extension bundles rather than imports — and the test pins all three. */
export const DISCLAIMER = "Unofficial. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.";

/** GitHub Pages, from `master` / root, which is why `PRIVACY.md` carries Jekyll front matter (§3). */
export const PRIVACY_URL = "https://iixauii.github.io/coachemon/PRIVACY";

/** Support is email only; the repo is public but not a support surface (§3). */
export const SUPPORT_EMAIL = "xauyxau+coachemon@gmail.com";

/** One list for both forms. It was two — five in `description.md`, three in `store-disclosure.md`, with nothing
 * saying why — which left a human filling the CWS and AMO forms with two different answers to one question. No
 * keyword is a franchise word and the game is not among them (§3). */
export const KEYWORDS = ["coach", "overlay", "turn advice", "battle helper", "roguelite"];

/** The fixture scenes `scripts/listing/fixtures.js` builds. Named rather than free text: a name that file does not
 * have leaves the panel unmounted, and a blank shot is still a PNG of the right size, so nothing downstream notices. */
export type Fixture = "battle" | "learn" | "rewards";

/** The fixture a shot renders from, and the factor the stage it stands on is scaled by. The panel has one fidelity,
 * so there is no view to pick. */
export type Shot = { fixture: Fixture; zoom: number };

export type ListingAsset = {
  /** Relative to `docs/listing/`, which is the folder a human uploads from; the icons climb out of it to where the
   * extension already keeps them, rather than being copied in to drift. */
  file: string;
  width: number;
  height: number;
  /** Which form field it answers. */
  what: string;
  /** Absent for the icons and the promo tiles, which both come from the design project. An asset without one is
   * still size-checked; it is only `render.ts` that skips it. */
  shot?: Shot;
};

/**
 * Sizes are the stores' own: CWS screenshots are 1280×800, its small promo tile 440×280 and its marquee 1400×560;
 * AMO takes any size and reuses the same screenshots. `zoom` is the factor the *stage* is scaled by, picked so the
 * card fills the frame without cropping — the panel is laid out at a pinned game width of 1920, where it is 449 px
 * wide, and 449 px is unreadable in a 1280 px frame otherwise (`page.ts`). A fractional factor is accepted
 * and softens both pixel faces, so a whole one is worth keeping where one fits.
 *
 * **The factor is not independent of the panel's width share.** It was 3 while the panel was 300 px, and the wider
 * panel (#389) put 3 over the frame: 449 × 3 is 1348 px against a 1280 px shot, which crops the card rather than
 * framing it, and a cropped shot is what ships to the store. Moving `SHARE` means re-checking it here.
 */
export const LISTING_ASSETS: ListingAsset[] = [
  { file: "assets/screenshot-battle.png", width: 1280, height: 800, what: "CWS and AMO screenshot 1",
    shot: { fixture: "battle", zoom: 2 } },
  { file: "assets/screenshot-learn.png", width: 1280, height: 800, what: "CWS and AMO screenshot 2",
    shot: { fixture: "learn", zoom: 2 } },
  { file: "assets/screenshot-rewards.png", width: 1280, height: 800, what: "CWS and AMO screenshot 3",
    shot: { fixture: "rewards", zoom: 2 } },
  // Both tiles are the mark set beside the wordmark, drawn in the design project rather than here — see
  // `docs/listing/README.md`. They carry no `shot` on purpose: one would make `render.ts` photograph the panel over
  // the top of them on the next redraw, which is how the panel ended up on a branding tile in the first place.
  { file: "assets/promo-small.png", width: 440, height: 280, what: "CWS small promo tile" },
  { file: "assets/promo-marquee.png", width: 1400, height: 560, what: "CWS marquee promo tile" },
  { file: "assets/icon-1024.png", width: 1024, height: 1024, what: "Safari app icon master (§14.6)" },
  { file: "../../extension/public/icons/128.png", width: 128, height: 128, what: "CWS and AMO store icon" },
];

/** An asset that is photographed, as opposed to the icons and the tiles the design project draws. The narrowing
 * lives beside the table because it is a fact about the table: an asset with a `shot` is a row `render.ts` draws. */
export type ShotAsset = ListingAsset & { shot: Shot };

const root = new URL("../../", import.meta.url);

export const repoPath = (rel: string): string => fileURLToPath(new URL(rel, root));
export const listingPath = (rel: string): string => fileURLToPath(new URL(`docs/listing/${rel}`, root));

const MAGIC = Buffer.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

/** A PNG's pixel size, off its IHDR: the one check that a committed asset is what a form will accept. */
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || !png.subarray(0, 8).equals(MAGIC)) throw new Error("not a PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
