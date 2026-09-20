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
| `assets/promo-small.png` | 440×280 small promo tile |
| `assets/promo-marquee.png` | 1400×560 marquee promo tile |
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
npm run listing:render          # the screenshots and promo tiles (needs Chrome installed)
cd extension && npm run icons   # the icon set and the 1024 master
```

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

Two more that look like framing mistakes and are not. The learn shot wraps its header and truncates a line, because
that is the panel at the 320 px it actually ships at; `zoom` scales the whole card uniformly, so no zoom unwraps it
and only overriding the width would — which would photograph the panel at a width no player ever sees. And
`promo-small.png` is drawn at `zoom: 1` because it must be: the tile is 440 px wide and 320 × 1.4 already overflows
it, so anything larger crops the card rather than enlarging it. The marquee is the tile that shows the panel big.

## Before submitting

1. GitHub Pages is on for `master` / root, so the privacy URL resolves. Check it:
   `curl -sI https://iixauii.github.io/coachemon/PRIVACY | head -1`.
2. The listing email is reachable — it is the only support channel there is.
3. The screenshots are the *current* HUD: redraw them if the panel changed since the last release.

## Submitting

```sh
scripts/release/listing-wizard.sh
```

Twelve stages, from the two developer accounts to the `extension-v1.0.0` commit that submits itself, capturing the six
store secrets on the way ([#322](https://github.com/IIxauII/coachemon/issues/322)). It opens each page and says what
to paste from the files above; stage 1 is the three checks above. Stop with Ctrl-C and re-run: values already captured
come back as defaults from `~/.coachemon-listing.env`, which is outside the checkout because this repo does not ignore
`.env`.

The order it walks is not §14.4's prose. `submitsToStores` is `major >= 1` and `verifyRelease` runs
`submit-extension.ts --verify`, so **1.0.0 submits through the API and will not release while a credential is
missing** — every website step happens before that commit is pushed.
