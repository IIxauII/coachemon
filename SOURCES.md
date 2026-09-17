# Building Coachemon from source

This is the sources archive for the Firefox (AMO) build of the Coachemon extension, as required for a reviewed
add-on. It contains the extension package, the shared code it imports from this repository, and the coach overlay's
own source.

```
Requires Node >= 23.6 (TypeScript type stripping) and npm.
cd extension && npm ci && npx wxt build -b firefox --mode store
Output: extension/.output/firefox-mv3-store/
```

The build is offline: nothing is fetched and no data table is generated, so the output reproduces. `hud.js` is
produced by `skills/coach-pokerogue/scripts/hud-bundle.mjs` from `skills/coach-pokerogue/scripts/hud/`, concatenated
in file-name order and comment-stripped; `src/enums/generated.ts` is committed and is read by that bundler.

Licence: AGPL-3.0-only (`LICENSE`). Third-party material is listed in `THIRD_PARTY_NOTICES.md`.
