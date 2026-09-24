/**
 * The page a listing screenshot is photographed from (§3, [#349 §12](https://github.com/IIxauII/coachemon/issues/349)).
 *
 * It is two documents, and the seam between them is the whole point. The **stage** is a pinned 1920×1080 viewport
 * holding the real HUD over a fixture scene; the **frame** is the store-sized window that holds the stage and scales
 * it to fill. They cannot be one document: the panel's footprint is a share of `min(100vw, 177.78vh)` (#349 §4), so a
 * 1280 px shot window would lay the panel out at about 200 px on a rung no player sees. An iframe gives the panel the
 * viewport of a game at 1080p — the reference width *and* the reference rung — and a scale on the frame's side
 * then fits the whole stage to the store's size. Fractional factors are accepted; both faces are pixel designs and
 * soften at them.
 *
 * Nothing here comes from a live game: no canvas, no capture, no sprite atlas (§1.9, §3). What the game does lend is
 * the two things a shot cannot be honest without — **its two faces**, because a fixture page carries none of the
 * game's font rules and would otherwise draw the panel in a face nobody plays with, and **its letterbox colour**,
 * because off 16:9 the panel really does sit on it. The font files are read out of the pinned clone and inlined into
 * the page as data URLs: **rendered, never committed or redistributed**, since the game's own licence file does not
 * annotate them. That is what makes this pipeline depend on a provisioned clone.
 */
import { existsSync, readFileSync } from "node:fs";
import { repoPath } from "./listing.ts";
import type { ListingAsset, Shot } from "./listing.ts";

/** The game's own letterbox colour, `body { background }` of the clone's `index.css` — the colour a player sees
 * beside a canvas that is not 16:9, and where the panel sits. It replaces a neutral grey on which the panel's gold
 * authorship rule falls to about 1.5:1 and its edge disappears; against the letterbox the rule measures the 5.33:1 it
 * already relies on (#349 §8, §12). It is the game's colour rather than an invented one, and it is not franchise art. */
export const LETTERBOX = "#484050";

/** The pinned game the stage is laid out at: the fitted canvas of a player at 1080p. Both numbers matter — the
 * panel's footprint is `min(100vw, 177.78vh)`, so a short stage would pin the height instead of the width. */
export const STAGE = { width: 1920, height: 1080 };

/** The two faces the panel's registers name (`REGISTER` in `hud/90-render.js`), and the files the game declares them
 * from in its own `index.html`. The panel blends into the game by wearing the game's own rule — its default face for
 * chrome, its dense face at half the size for rows — so a shot that draws in neither is a shot of a panel that does
 * not ship. */
export const FONT_FILES = { emerald: "pokemon-emerald-pro.ttf", pkmnems: "pkmnems.ttf" };

/** The game version the clone is pinned to — the same pin the drift check and the encounter oracle read, so a shot
 * and a re-read are always of one game. */
export const GAME_VERSION: string =
  JSON.parse(readFileSync(repoPath("src/escape-ladder/reviewed.json"), "utf8")).pinned.gameVersion;

/** A face as the page receives it: a family and a URL to draw it from. The page never opens a file itself, which is
 * what lets a test check the declaration without a provisioned clone. */
export type Face = { family: string; url: string };

/** Where the clone keeps its fonts: the `assets` submodule, which `drift:check` alone does not leave behind. */
const fontsDir = (): string => repoPath(`.cache/pokerogue/v${GAME_VERSION}/assets/fonts`);

/**
 * The game's faces, read out of the pinned clone and inlined as data URLs. Inlined rather than linked because a
 * `file://` page fetches a font under CORS and an opaque origin fails that check silently — a shot drawn in the
 * fallback face is still a PNG of the right size, so nothing downstream would notice.
 */
export const gameFonts = (): Face[] => {
  const dir = fontsDir();
  if (!existsSync(dir)) {
    throw new Error(
      `No game fonts at ${dir}.\n\n` +
        `  npm run drift:check    # clones .cache/pokerogue/v${GAME_VERSION}\n` +
        `  cd .cache/pokerogue/v${GAME_VERSION} && git submodule update --init --depth 1 assets\n`,
    );
  }
  return Object.entries(FONT_FILES).map(([family, file]) => ({
    family,
    url: `data:font/ttf;base64,${readFileSync(`${dir}/${file}`).toString("base64")}`,
  }));
};

/** An asset that is photographed, as opposed to the icons and tiles the design project draws. */
export type ShotAsset = ListingAsset & { shot: Shot };

/** The stage: the panel at the pinned game, over a fixture scene and nothing else. */
export const stagePage = (
  { fixture, fixtures, hud, fonts }: { fixture: Shot["fixture"]; fixtures: string; hud: string; fonts: Face[] },
): string => `<!doctype html>
<meta charset="utf-8">
<style>
${fonts.map(f => `  @font-face { font-family: "${f.family}"; src: url(${f.url}) format("truetype"); }`).join("\n")}
  /* Transparent, not the letterbox: the frame paints that once, behind a stage that may overflow it. */
  html, body { margin: 0; height: 100%; background: transparent; }
  body { display: grid; place-items: center; }
  /* The panel is fixed to the top-left corner of a game tab; for a shot it sits in the middle of the frame instead.
     Relative rather than static, because the panel's close control is positioned against the panel's own corner:
     a static panel is no containing block, and the control would land in the stage's corner instead. */
  #coach-hud {
    position: relative !important; display: block !important;
    box-shadow: 0 6px 24px rgba(16, 18, 34, .28);
  }
</style>
<body>
<!-- In the body, not the head: the HUD appends its panel to document.body the moment it runs (§5.2). -->
<script>${fixtures}</script>
<script>window.__mountFixture(${JSON.stringify(fixture)});</script>
<script>${hud}</script>
`;

/** The frame: the store's own window size, the letterbox behind it, and the stage scaled to fill it. */
export const framePage = (asset: ShotAsset, stage = "stage.html"): string => `<!doctype html>
<meta charset="utf-8">
<style>
  /* Flat, not a gradient: a dithered gradient costs a quarter of a megabyte per shot in PNG and says nothing. */
  html, body { margin: 0; height: 100%; background: ${LETTERBOX}; overflow: hidden; }
  iframe {
    position: absolute; top: 50%; left: 50%; width: ${STAGE.width}px; height: ${STAGE.height}px; border: 0;
    /* A scale about the stage's own centre, which is where the stage centres the panel — so the panel is centred in
       the frame at every factor, and a stage larger than the frame is cropped evenly around it. Centring the iframe
       as a grid item instead does not survive that crop: an overflowing grid item is clamped to the start edge, and
       the panel walks off the corner as the factor grows.
       A transform and not CSS zoom, though a factor is all either one is here: zoom would re-lay the frame's own box
       out, and it is the stage's 1920 that must not move. The panel keeps the rung it was laid out on either way. */
    transform: translate(-50%, -50%) scale(${asset.shot.zoom});
  }
</style>
<body><iframe src="${stage}" scrolling="no"></iframe>
`;
