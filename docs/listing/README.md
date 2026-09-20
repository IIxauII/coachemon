# Listing assets

Everything the Chrome Web Store and AMO forms ask for, kept in the repo so the hand-made 1.0.0 listings are a paste
job rather than an afternoon (§3, §6 of [the spec](../spec/extension-distribution.md); ticket
[#208](https://github.com/IIxauII/coachemon/issues/208)).

| File | What it is |
|---|---|
| [`description.md`](description.md) | title, keywords, summary and the description body for both stores |
| [`store-disclosure.md`](store-disclosure.md) | single purpose, host access, remote code, data usage, licence, source submission |
| [`../../PRIVACY.md`](../../PRIVACY.md) | the privacy policy, served at <https://iixauii.github.io/coachemon/PRIVACY> |
| `assets/screenshot-*.png` | 1280×800 screenshots, four of them |
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

Both generators are deterministic and write over what is committed; commit the diff, it *is* the change.

```sh
cd extension && npm run icons   # the icon set and the 1024 master
npm run listing:render          # the screenshots (needs Chrome installed)
```

The two promo tiles are the exception: neither generator writes them. They are the mark set in type, and they are
drawn in the [Coachemon Icon design project](https://claude.ai/design/p/b6448111-99f6-40b8-a24c-ac83059404e3), which
is also where the icon grid came from. To change one, change it there and copy the PNG in — and change the mark in
the *same* pass, because nothing here can tell that a tile is showing last season's face.

The shots are the real HUD — the same `bundle("hud")` the extension ships — mounted over the fixture scenes in
`scripts/listing/fixtures.js` inside a headless Chrome, with no sprite atlas, so every icon falls back to the name it
stands for. Nothing is captured from a live game: no canvas, no franchise art, no real run (§1.9). Set
`COACHEMON_CHROME` if Chrome is not at the default macOS path.

To add a shot, add a fixture to `fixtures.js` and a row to `LISTING_ASSETS`; the test picks it up from the table.

Two artefacts of the fallback path, on purpose rather than by oversight. A name reads twice on the enemy rows
("Paras **Paras** L34") because the panel draws the icon and then the name, and with no atlas the icon falls back to
that same name; and a fallback sits flush against the text before it ("CharizardFire"), because two sprites need no
space between them. Both are what §3 asked for — the shot is the panel as it draws without sprites, not a retouched
picture of it — and removing them means changing the shipped HUD, which this ticket does not.

One more that looks like a framing mistake and is not. The learn shot wraps its header and truncates a line, because
that is the panel at the 320 px it actually ships at; `zoom` scales the whole card uniformly, so no zoom unwraps it
and only overriding the width would — which would photograph the panel at a width no player ever sees.

The promo tiles are not shots any more. They used to be: both were the mini panel at whatever zoom fitted, and the
small one had to sit at `zoom: 1` because 320 × 1.4 already overflowed a 440 px frame, so it read as a cropped card
rather than a tile. They are branding surfaces, and the four screenshots are what show the panel — so they now carry
the mark, the wordmark and "Turn-by-turn coach overlay" on the mark's own field. Neither names the game, which is the
rule the title and the keywords follow (§3).

They are the one pair of assets a redraw cannot regenerate, so `LISTING_ASSETS` deliberately gives them no `shot`:
with one they would be photographed over on the next `listing:render`. The size check still covers them.

## Before submitting

1. GitHub Pages is on for `master` / root, so the privacy URL resolves. Check it:
   `curl -sI https://iixauii.github.io/coachemon/PRIVACY | head -1`.
2. The listing email is reachable — it is the only support channel there is.
3. The screenshots are the *current* HUD: redraw them if the panel changed since the last release.
