/** The **stage** lays the HUD out at a pinned 1080p viewport and the **frame** scales it to the store's window: laid out
 * at 1280 px, the panel would be about 200 px (#349). The game's faces are rendered, **never committed**
 * (extension-distribution.md §3). */
import { existsSync, readFileSync } from "node:fs";
import { repoPath } from "./listing.ts";
import type { Fixture, ShotAsset } from "./listing.ts";

/** `body { background }` of the game's `index.css`. The panel's gold rule relies on the 5.33:1 it measures against it,
 * and falls to about 1.5:1 on a neutral grey (#349). */
export const LETTERBOX = "#484050";

/** Both numbers matter: the panel's footprint is `min(100vw, 177.78vh)`, so a shorter stage would pin the height
 * instead of the width. */
export const STAGE = { width: 1920, height: 1080 };

/** Keyed by the families `REGISTER` in `hud/90-render.js` names, from the files the game's own `index.html` declares. */
export const FONT_FILES = { emerald: "pokemon-emerald-pro.ttf", pkmnems: "pkmnems.ttf" };

export const GAME_VERSION: string =
  JSON.parse(readFileSync(repoPath("src/escape-ladder/reviewed.json"), "utf8")).pinned.gameVersion;

/** The page is handed its faces and never opens a file, so a test needs no provisioned clone. */
export type Face = { family: string; url: string };

const fontsDir = (): string => repoPath(`.cache/pokerogue/v${GAME_VERSION}/assets/fonts`);

/** Inlined, not linked: a `file://` page fetches a font under CORS, the opaque origin fails that check silently, and
 * the shot comes out in the fallback face. */
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

export const STAGE_FILE = "stage.html";

export const stagePage = (
  { fixture, fixtures, hud, fonts }: { fixture: Fixture; fixtures: string; hud: string; fonts: Face[] },
): string => `<!doctype html>
<meta charset="utf-8">
<style>
${fonts.map(f => `  @font-face { font-family: "${f.family}"; src: url(${f.url}) format("truetype"); }`).join("\n")}
  /* Transparent, not the letterbox: the frame paints that once, behind a stage that may overflow it. */
  html, body { margin: 0; height: 100%; background: transparent; }
  body { display: grid; place-items: center; }
  /* Relative, not static: the close control is positioned against the panel, and a static panel is no containing
     block, so the control would land in the stage's corner. */
  #coach-hud {
    position: relative !important; display: block !important;
    box-shadow: 0 6px 24px rgba(16, 18, 34, .28);
  }
</style>
<body>
<!-- In the body, not the head: the HUD appends its panel to document.body the moment it runs (extension-distribution.md §5.2). -->
<script>${fixtures}</script>
<script>window.__mountFixture(${JSON.stringify(fixture)});</script>
<script>${hud}</script>
`;

export const framePage = (asset: ShotAsset): string => `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; background: ${LETTERBOX}; overflow: hidden; }
  iframe {
    position: absolute; top: 50%; left: 50%; width: ${STAGE.width}px; height: ${STAGE.height}px; border: 0;
    /* Centred by transform, not as a grid item: an overflowing grid item is clamped to the start edge, and the panel
       walks off the corner as the factor grows. A scale, not CSS zoom: zoom re-lays the box out, and the stage's
       1920 must not move. */
    transform: translate(-50%, -50%) scale(${asset.shot.zoom});
  }
</style>
<body><iframe src="${STAGE_FILE}" scrolling="no"></iframe>
`;
