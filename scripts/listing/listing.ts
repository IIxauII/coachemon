/**
 * The listing strings that must agree with the extension, and the asset table (extension-distribution.md §3, §6). The
 * copy a human pastes into the forms is `docs/listing/`.
 */
import { fileURLToPath } from "node:url";

/** The HUD and the manifest carry their own copies, and `src/listing.test.ts` pins all three (extension-distribution.md §3). */
export const DISCLAIMER = "Unofficial. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.";

/** GitHub Pages, from `master` / root, which is why `PRIVACY.md` carries Jekyll front matter (extension-distribution.md §3). */
export const PRIVACY_URL = "https://iixauii.github.io/coachemon/PRIVACY";

export const SUPPORT_EMAIL = "xauyxau+coachemon@gmail.com";

/** One list for both forms. No keyword may be a franchise word or the game's name (extension-distribution.md §3). */
export const KEYWORDS = ["coach", "overlay", "turn advice", "battle helper", "roguelite"];

/** The keys of `window.__fixtures` in `fixtures.js`: a name it does not have leaves the panel unmounted, and the blank
 * shot is still a PNG of the right size. */
export type Fixture = "battle" | "learn" | "rewards";

export type Shot = { fixture: Fixture; zoom: number };

export type ListingAsset = {
  /** Relative to `docs/listing/`. */
  file: string;
  width: number;
  height: number;
  /** Which form field it answers. */
  what: string;
  /** Absent for an asset the design project draws: `render.ts` skips it, the size check does not. */
  shot?: Shot;
};

/**
 * `zoom` scales the 1920-wide stage, where the panel is 449 px, and has to keep the card inside the frame: 3 did while
 * the panel was 300 px, and the wider panel put 449 × 3 = 1348 px over a 1280 px shot, cropping the card that ships to
 * the store (#389). Moving `SHARE` in `hud/90-render.js` means re-checking it here.
 */
export const LISTING_ASSETS: ListingAsset[] = [
  { file: "assets/screenshot-battle.png", width: 1280, height: 800, what: "CWS and AMO screenshot 1",
    shot: { fixture: "battle", zoom: 2 } },
  { file: "assets/screenshot-learn.png", width: 1280, height: 800, what: "CWS and AMO screenshot 2",
    shot: { fixture: "learn", zoom: 2 } },
  { file: "assets/screenshot-rewards.png", width: 1280, height: 800, what: "CWS and AMO screenshot 3",
    shot: { fixture: "rewards", zoom: 2 } },
  // No `shot` on the tiles, which the design project draws (`docs/listing/README.md`): one makes `render.ts`
  // photograph the panel over the tile on the next redraw, which is how the panel ended up on a branding tile (#330).
  { file: "assets/promo-small.png", width: 440, height: 280, what: "CWS small promo tile" },
  { file: "assets/promo-marquee.png", width: 1400, height: 560, what: "CWS marquee promo tile" },
  { file: "assets/icon-1024.png", width: 1024, height: 1024, what: "Safari app icon master (extension-distribution.md §14.6)" },
  { file: "../../extension/public/icons/128.png", width: 128, height: 128, what: "CWS and AMO store icon" },
];

export type ShotAsset = ListingAsset & { shot: Shot };

const root = new URL("../../", import.meta.url);

export const repoPath = (rel: string): string => fileURLToPath(new URL(rel, root));
export const listingPath = (rel: string): string => fileURLToPath(new URL(`docs/listing/${rel}`, root));

const MAGIC = Buffer.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || !png.subarray(0, 8).equals(MAGIC)) throw new Error("not a PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
