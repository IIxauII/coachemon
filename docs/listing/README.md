# Listing assets

Everything the Chrome Web Store and AMO forms ask for, kept in the repo so the hand-made 1.0.0 listings are a paste
job rather than an afternoon (§3, §6 of [the spec](../spec/extension-distribution.md); ticket
[#208](https://github.com/IIxauII/coachemon/issues/208)).

| File | What it is |
|---|---|
| [`description.md`](description.md) | title, keywords, summary and the description body for both stores |
| [`store-disclosure.md`](store-disclosure.md) | single purpose, host access, remote code, data usage, licence, source submission |
| [`../../PRIVACY.md`](../../PRIVACY.md) | the privacy policy, served at <https://iixauii.github.io/coachemon/PRIVACY> |
| `assets/screenshot-*.png` | 1280×800 screenshots, three of them |
| `assets/promo-small.png` | 440×280 small promo tile: the mark beside the wordmark |
| `assets/promo-marquee.png` | 1400×560 marquee promo tile: the same, set larger |
| `assets/icon-1024.png` | the master the Safari app icon set is generated from ([§14.6](../runbooks/safari-release.md)) |
| `../../extension/public/icons/128.png` | the store icon both listings show |

`scripts/listing/listing.ts` is the table those files are checked against: `src/listing.test.ts` fails if an asset is
missing or the wrong size, or if a text drifts from the disclaimer, the privacy URL or a form field. The answers that
restate something the extension ships are pinned to it rather than copied — the summary and the AMO data-collection
filing to the manifest, the reviewer note's port to `STORE_PORT`, the source zip to what the release builds — because
a filing that no longer matches the artifact is a false statement to a store, not a stale doc.

## Redrawing

Only the screenshots are generated. `render.ts` is deterministic and writes over what is committed; commit the diff,
it *is* the change.

**Prerequisite: a provisioned pinned clone.** The shots declare the game's own two faces, read out of
`.cache/pokerogue/v<pin>/assets/fonts` — a fixture page carries none of the game's font rules and would otherwise draw
the panel in a face nobody plays with (§3, [#349 §12](https://github.com/IIxauII/coachemon/issues/349)). The files are
rendered into the page and never committed or redistributed. `drift:check` clones the pin; the fonts live in its
`assets` submodule, which that clone alone does not fill in.

```sh
npm run drift:check             # clones .cache/pokerogue/v<pin>
cd .cache/pokerogue/v<pin> && git submodule update --init --depth 1 assets
npm run listing:render          # the screenshots (needs Chrome installed)
```

Everything that carries the mark — the four icon sizes, the 1024 master and the two promo tiles — is drawn in the
[Coachemon Icon design project](https://claude.ai/design/p/b6448111-99f6-40b8-a24c-ac83059404e3) and copied in.
Nothing here redraws them, so change the mark there and copy *every* size in the same pass: no check in this repo can
tell that one size, or a tile, is still showing last season's face.

The design project's PNG export carries a C2PA `caBX` manifest and an `eXIf` chunk, together about 5.8 KB per file.
Strip them before committing — keep `IHDR/PLTE/tRNS/IDAT/IEND/sRGB/gAMA` and drop the rest, which leaves the pixels
byte-identical. These files are uploaded to the stores, and that metadata has no business going with them.

The shots are the real HUD — the same `bundle("hud")` the extension ships — mounted over the fixture scenes in
`scripts/listing/fixtures.js` inside a headless Chrome, with no sprite atlas, so every icon falls back to the name it
stands for. Nothing is captured from a live game: no canvas, no franchise art, no real run (§1.9). Set
`COACHEMON_CHROME` if Chrome is not at the default macOS path.

Each shot is two documents, which `scripts/listing/page.ts` explains: a **stage** pinned to a game width of 1920,
where the panel is the 449 px one a player at 1080p sees, and a store-sized **frame** that scales the stage to fill
it. The panel's footprint follows the viewport, so a shot laid out in the 1280 px frame itself would photograph a
300 px panel on a rung nobody plays at. `zoom` in `LISTING_ASSETS` is that per-asset factor; a fractional one is
accepted and softens both pixel faces.

To add a shot, add a fixture to `fixtures.js` and a row to `LISTING_ASSETS`; the test picks it up from the table.

One artefact of the fallback path, on purpose rather than by oversight: a fallback sits flush against the text
before it — "CharizardFire" on the battle row, "Espeon learnsEspeon" on the learn strip — because two sprites need no
space between them, and with no atlas both fall back to the name they stand for. It is what §3 asked for — the shot
is the panel as it draws without sprites, not a retouched picture of it — and removing it means changing the shipped
HUD, which no listing ticket does.

Its twin is gone with the group layout: the doubled enemy name ("Paras **Paras** L34") was a row of the old whole-card
view, and the drawer these shots open on is `act`, which draws no enemy rows. Open the shots on `foes` and it is back.

One more that looks like a framing mistake and is not. The learn shot truncates a line, because that is the panel at
the 449 px it actually ships at; the frame's factor scales the whole card uniformly, so no factor unwraps a line and
only overriding the width would — which would photograph the panel at a width no player ever sees.

The promo tiles are not shots any more. They used to be: both were the panel at whatever zoom fitted, and the
small one had to sit at `zoom: 1` because 320 × 1.4 already overflowed a 440 px frame, so it read as a cropped card
rather than a tile. They are branding surfaces, and the screenshots are what show the panel — so they now carry
the mark, the wordmark and "Turn-by-turn coach overlay" on the mark's own field. Neither names the game, which is the
rule the title and the keywords follow (§3).

They are the one pair of assets a redraw cannot regenerate, so `LISTING_ASSETS` deliberately gives them no `shot`:
with one they would be photographed over on the next `listing:render`. The size check still covers them.

## Before submitting

1. GitHub Pages is on for `master` / root, so the privacy URL resolves. Check it:
   `curl -sI https://iixauii.github.io/coachemon/PRIVACY | head -1`.
2. The listing email is reachable — it is the only support channel there is.
3. The screenshots are the *current* HUD: redraw them if the panel changed since the last release.
