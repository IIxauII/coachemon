# Reaching the PokéRogue game object from a bare CDP `Runtime.evaluate`

**Refs actually read** (all primary, all verified by downloading the tree, not by search snippets):

| Source | Ref | How read |
|---|---|---|
| `phaserjs/phaser` | tag **`v3.90.0`** | full tarball `codeload.github.com/phaserjs/phaser/tar.gz/refs/tags/v3.90.0`, incl. the prebuilt `dist/` that ships on npm |
| `pagefaultgames/pokerogue` | tag **`v1.12.0.11`** (tag exists; no fallback to `beta` needed) | full tarball |
| **The live build** | `https://pokerogue.net/` + all 9 `assets/*.js` chunks, fetched 2026-09-12 | grepped the actual shipped minified bundles |
| CDP | `chromedevtools.github.io/devtools-protocol/tot/...` + the canonical `json/js_protocol.json` / `json/browser_protocol.json` | fetched |
| V8 inspector (for what CDP docs leave unsaid) | `v8/v8` `main` | `src/inspector/v8-console.cc`, `v8-debugger.cc`, `v8-runtime-agent-impl.cc` |

PokéRogue `v1.12.0.11` declares `"phaser": "^3.90.0"` ([`package.json`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/package.json)), so v3.90.0 is the right Phaser to read.

---

## 1. CanvasPool

### What is in the pool, and what `parent` is

[`src/display/canvas/CanvasPool.js#L11`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/canvas/CanvasPool.js#L11) — a single module-scoped array, created once at import:

```js
// The pool into which the canvas elements are placed.
var pool = [];
```

It is a true cross-game singleton ([L17-L26](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/canvas/CanvasPool.js#L17-L26)): *"This singleton is instantiated as soon as Phaser loads, before a Phaser.Game instance has even been created."* And it is exported on the namespace: `pool: pool` at [L248](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/canvas/CanvasPool.js#L248), reachable as `Phaser.Display.Canvas.CanvasPool.pool` via [`display/index.js#L16`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/index.js#L16) → [`display/canvas/index.js#L14`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/canvas/index.js#L14).

Entry shape — [`CanvasPool.js#L50-L67`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/canvas/CanvasPool.js#L50-L67):

```js
var canvas;
var container = first(canvasType);

if (container === null)
{
    container = {
        parent: parent,
        canvas: document.createElement('canvas'),
        type: canvasType
    };

    if (canvasType === CONST.CANVAS)
    {
        pool.push(container);
    }

    canvas = container.canvas;
}
else
{
    container.parent = parent;
    canvas = container.canvas;
}
```

Three things follow, and the third is the one that matters:

1. `{ parent, canvas, type }` — `type` is `Phaser.CANVAS` (`0`) or `Phaser.WEBGL` (`1`) per [`src/const.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/const.js).
2. **Containers are recycled, and `parent` is reassigned in place** (`container.parent = parent` on the reuse branch). So a given `pool[i]` object outlives many owners.
3. 🔴 **`pool.push(container)` only happens for `canvasType === CONST.CANVAS`.** A **WebGL canvas is never added to the pool at all** — the container object is created, returned, and then garbage. `first()` reinforces this, returning `null` immediately for WebGL ([L139-L142](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/canvas/CanvasPool.js#L139-L142)).

`free`/`remove` do not splice — [`remove`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/canvas/CanvasPool.js#L166-L180) just nulls `container.parent` and resets the canvas to 1×1, leaving the entry in the array forever. Indices are therefore stable once assigned, but entries are silently re-owned.

### What `parent` is when the *Game* creates its canvas

[`src/core/CreateRenderer.js#L74`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/CreateRenderer.js#L74):

```js
game.canvas = CanvasPool.create(game, width, height, config.renderType);
```

So for the game canvas, `parent` **is the `Phaser.Game` instance itself** — not a Scene, not a texture. `Phaser.Game` has no `.game` property (grep of [`src/core/Game.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/Game.js) finds `this.canvas`, `this.scene`, `this.textures`, … and no `this.game`).

### 🔴 LOUD CORRECTION TO THE RECON NOTE

The recon note says:

```js
const game = Phaser.Display.Canvas.CanvasPool.pool[0].parent.game;
```

**The expression works, but every part of the stated reasoning is wrong, and the note's own framing is dangerous.** Specifically:

- **The game canvas is not in the pool.** PokéRogue's config is explicitly `type: Phaser.WEBGL` ([`main.ts#L25`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/main.ts#L25)), so `CreateRenderer` calls `CanvasPool.create(game, …, CONST.WEBGL)` and the `pool.push` at [L63](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/canvas/CanvasPool.js#L63) is skipped. **No pool entry ever has the Game as its `parent` in this game.**
- **If the game canvas *had* been in the pool, `.parent.game` would be `undefined`** — `parent` would be the Game, and `Game` has no `.game`. The correct expression in that world is `pool[i].parent`, full stop. The note conflates the two; the difference is exactly the one the ticket asked about.
- **`pool[0].parent` is in fact the `TextureManager`**, and `.game` works because *TextureManager* has a `game` property. Chain of evidence:
  - [`Game.js#L176`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/Game.js#L176) — `this.textures = new TextureManager(this);` (in the Game **constructor**, before `boot()`/`CreateRenderer`).
  - [`TextureManager.js#L72`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/TextureManager.js#L72) — `this.game = game;`
  - [`TextureManager.js#L110`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/TextureManager.js#L110) — `this._tempCanvas = CanvasPool.create2D(this);` → parent = the TextureManager, `type === CANVAS`, so it *is* pooled, and it is **never freed** until [`TextureManager.js#L1640`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/TextureManager.js#L1640) on game destroy.

So the recon expression is right by coincidence. Treat it as `pool[<index of the TextureManager's temp canvas>].parent.game`.

### Why index `0` happens to be the TextureManager

Everything that pools a 2D canvas before the Game exists, frees it again. Complete list of `CanvasPool.create*` call sites in v3.90.0 (exhaustive grep of `src/`):

| Call site | `parent` arg | Type | Pooled? | Freed? |
|---|---|---|---|---|
| [`device/Features.js#L110`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/Features.js#L110) `createWebGL(this)` | — | WEBGL | **no** | — |
| [`device/Features.js#L114`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/Features.js#L114) `create2D(this)` | `undefined` (called as bare `testWebGL()`) | CANVAS | yes → **pool[0]** | yes, [L126](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/Features.js#L126) |
| [`device/CanvasFeatures.js#L71`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/CanvasFeatures.js#L71) `create2D(this, 2)` | `undefined` | CANVAS | reuses pool[0] | yes, [L95](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/CanvasFeatures.js#L95) |
| [`device/CanvasFeatures.js#L41`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/CanvasFeatures.js#L41) `create2D(yellow, 6)` | an `Image` | CANVAS | reuse-or-push, **async** (inside `Image.onload`) | yes, [L56](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/CanvasFeatures.js#L56) |
| [`textures/TextureManager.js#L110`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/TextureManager.js#L110) | the **TextureManager** | CANVAS | yes | only on destroy |
| [`core/CreateRenderer.js#L74`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/CreateRenderer.js#L74) | the **Game** | **WEBGL here** | **no** | n/a |
| [`gameobjects/text/Text.js#L139`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/gameobjects/text/Text.js#L139) `create(this)` | a `Text` GameObject (`.scene`, no `.game`) | CANVAS | yes, held until destroy | on destroy |
| [`gameobjects/text/MeasureText.js#L21`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/gameobjects/text/MeasureText.js#L21) | `undefined` | CANVAS | transient | yes |
| [`gameobjects/tilesprite/TileSprite.js#L181,L277`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/gameobjects/tilesprite/TileSprite.js#L181) | a `TileSprite` | CANVAS | held | on destroy |
| [`textures/DynamicTexture.js#L89`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/DynamicTexture.js#L89) | a `DynamicTexture` (`.manager`, `.renderer`; **no `.game`**) | CANVAS | held | on destroy |
| [`textures/TextureManager.js#L426,L666,L702`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/TextureManager.js#L426) | the TextureManager, or **the canvas itself** (`selfParent: true` at L702) | CANVAS | varies | varies |
| [`create/GenerateTexture.js#L66`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/create/GenerateTexture.js#L66) | `undefined` | CANVAS | transient | — |
| [`renderer/snapshot/*.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/renderer/snapshot/WebGLSnapshot.js#L61) `createWebGL` | — | WEBGL | **no** | — |

Ordering in the live build: `src/phaser.js` does `Game: require('./core/Game')` ([L32](https://github.com/phaserjs/phaser/blob/v3.90.0/src/phaser.js#L32)), `Game.js` requires `../device` ([L17](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/Game.js#L17)), and [`device/index.js#L30-L40`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/index.js#L30-L40) eagerly evaluates `Features` then `CanvasFeatures` at import. So by the time `new Phaser.Game(...)` runs, `pool` is `[{parent: null, type: CANVAS}]`, and `TextureManager`'s `create2D` takes that free slot via [`first()`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/canvas/CanvasPool.js#L135-L155). Hence index 0.

**But do not rely on the index.** Failure modes: the async `checkBlendMode` `onload` can land either side of Game construction and push a second entry; `Text`/`TileSprite`/rex-plugin canvases append and reclaim freed slots; `selfParent: true` at [`TextureManager.js#L702`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/TextureManager.js#L702) produces an entry whose `parent` is *the canvas element*; a second `Phaser.Game` on the page would share the pool.

### Robust way to find the game's own entry

Scan, don't index, and accept any of the shapes the table above produces:

```js
(() => {
  const P = window.Phaser;
  if (!P || !P.Display || !P.Display.Canvas) return null;
  const isGame = g => !!g && typeof g === 'object'
    && 'isBooted' in g && g.scene && Array.isArray(g.scene.scenes) && g.textures && g.loop;
  for (const c of P.Display.Canvas.CanvasPool.pool) {
    const p = c && c.parent;
    if (!p || typeof p !== 'object') continue;
    for (const cand of [p, p.game, p.scene && p.scene.game, p.manager && p.manager.game,
                        p.renderer && p.renderer.game]) {
      if (isGame(cand)) return cand;
    }
  }
  return null;
})()
```

`p.game` covers TextureManager ([L72](https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/TextureManager.js#L72)); `p` itself covers a Canvas-renderer game; `p.scene.game` covers `Text`/`TileSprite` (GameObject sets only `this.scene` — [`GameObject.js#L51`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/gameobjects/GameObject.js#L51) — and `scene.game` is injected, see §5); `p.manager.game` / `p.renderer.game` cover `DynamicTexture`.

### ✅ Live corroboration (measured by the team lead against the running tab)

The source reading above predicts the live shape exactly, and the measurement is worth recording because it changes which branch of the scan you should reach for first:

- **1666 pool entries. Exactly 1 has a `.parent` with `.game`** — the TextureManager. Matches §1: it is the only pooled 2D canvas that is never freed.
- **1651 entries have `Text`/`BBCodeText` parents with no `.game`** — matches the `Text.js#L139` / rex-plugin rows of the table above, and confirms the pool grows without bound during play. **This is the strongest argument against indexing:** 99.9% of entries are useless, and the one useful entry is only at index 0 by the boot accident described below.
- **1662 of 1666 entries are GameObjects whose `.parent.scene` is the same BattleScene** (identity-equal). 🟢 **This exposes a shorter and far more redundant path than going via the Game:**
  ```js
  // `p.scene` IS the BattleScene, i.e. === globalScene — no Game hop, no getScene() call.
  for (const c of Phaser.Display.Canvas.CanvasPool.pool) {
    const s = c && c.parent && c.parent.scene;
    if (s && s.sys && s.sys.settings.key === 'battle') return s;   // === globalScene
  }
  ```
  With ~1662 independent entries pointing at it, this is vastly more robust to index drift and pool churn than the single TextureManager entry — though it only works *after* GameObjects exist, whereas the TextureManager entry exists from Game construction. Use `.parent.scene` as the primary and `.parent.game` as the early-boot fallback; the combined scan in the Verdict does both.
- `Phaser.GAMES` absent at runtime; WebGL display canvas absent from the pool and carrying no expandos; only one scene registered with key `"battle"`; `Debugger.pause` reaching only a synthetic frame and `game.loop.step` giving Phaser's module scope (so `globalScene` undefined either way); `queryObjects` on `Phaser.Game.prototype` finding exactly 1 Game in **470 ms**. All four match §2, §3, §5 and §6 respectively. The 470 ms figure is the concrete cost behind "it enumerates the heap, so it is not cheap" — it makes `queryObjects` a genuine fallback, not a hot path.

### Is index 0 guaranteed or incidental? — **Incidental, but deterministic. Not contractual.**

Since this is the question the priority trim turns on, stated plainly:

**Who calls `create2D` with the TextureManager as parent, and when:** [`TextureManager.js#L110`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/TextureManager.js#L110), `this._tempCanvas = CanvasPool.create2D(this);`, inside the `TextureManager` **constructor**, which runs from [`Game.js#L176`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/Game.js#L176) — i.e. in the **`Game` constructor**, synchronously, *before* `boot()` and therefore before `CreateRenderer` makes the display canvas. It is the first thing a Game does that touches the pool.

**Why it lands at index 0:** nothing that pools a 2D canvas earlier still holds it. At Phaser import time, [`device/index.js#L30-L40`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/index.js#L30-L40) eagerly evaluates `Features` then `CanvasFeatures`; `Features.testWebGL` pushes the pool's first and only entry ([`Features.js#L114`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/Features.js#L114)) and frees it at [L126](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/Features.js#L126); `CanvasFeatures.checkInverseAlpha` reuses and re-frees the same slot ([L71](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/CanvasFeatures.js#L71), [L95](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/CanvasFeatures.js#L95)). So `pool` is `[{parent: null, type: CANVAS}]` when the Game is constructed, and [`first()`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/display/canvas/CanvasPool.js#L135-L155) hands that free slot to the TextureManager.

**Why it is not a contract:** nothing in Phaser documents, asserts or tests this ordering. It is an emergent consequence of (a) module-evaluation order, (b) device probes tidying up after themselves, and (c) `remove()` nulling `parent` in place rather than splicing. Three concrete ways it could differ without any Phaser API change: the **async** `CanvasFeatures.checkBlendMode` `onload` ([L41](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/CanvasFeatures.js#L41), [L56](https://github.com/phaserjs/phaser/blob/v3.90.0/src/device/CanvasFeatures.js#L56)) can land after Game construction and append a second entry; a host page that constructed a `Phaser.Text` or a second `Phaser.Game` before this one would shift ownership; and a browser without `window.WebGLRenderingContext` skips `testWebGL` entirely, changing which probe creates the first entry. **Scan for the shape; never assert the index.**

---

## 2. `Phaser.GAMES` and other registries

**`Phaser.GAMES` does not exist in Phaser v3.90.0 — not in the module surface, not in the UMD build, not anywhere.**

```
$ grep -rn "GAMES" .            # entire v3.90.0 tarball: src/, dist/, types/, config/
(no matches)
```

So the earlier recon's observation that `Phaser.GAMES` is "absent" is **not** a bundling artifact and **not** an ESM-vs-UMD difference — there is nothing to be absent from. The namespace is built literally in [`src/phaser.js#L16-L52`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/phaser.js#L16-L52) (an object literal of sub-namespaces) then `Phaser = Extend(false, Phaser, CONST)` at [L76](https://github.com/phaserjs/phaser/blob/v3.90.0/src/phaser.js#L76), where `CONST` is [`src/const.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/const.js) (`VERSION`, `AUTO`, `CANVAS`, `WEBGL`, `HEADLESS`, blend modes, …). No registry array, and nothing anywhere in `src/` pushes a Game into a module-level collection (grep for `push(game)` / `push(this)` / `games = []` → nothing).

`Phaser.GAMES` was a **Phaser 2 / Phaser-CE** feature. It is not part of Phaser 3's API at this version. Stop looking for it.

Worth noting anyway, because it explains why `window.Phaser` exists at all under a bundler — [`src/phaser.js#L89`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/phaser.js#L89):

```js
global.Phaser = Phaser;
```

and, in the shipped UMD `dist/phaser.js`, the wrapper's final fallback `root["Phaser"] = factory()`. Either path plants the namespace on `window` even though PokéRogue only ever does `import Phaser from "phaser"`. That is why `window.Phaser` is reachable but "bare" — it is the library namespace, with no instance data.

---

## 3. Other reachable-from-globals routes in Phaser v3.90.0

### 🟢 `window.PHASER_GAME` — exists in source, **dead-coded out of the shipped build**

This is the one genuinely interesting find, and it needs the caveat as loudly as the find. [`src/core/Game.js#L398-L401`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/Game.js#L398-L401), at the end of `Game.boot()`:

```js
if (typeof WEBGL_DEBUG && window)
{
    window.PHASER_GAME = this;
}
```

Read from source alone you would conclude this *always* fires: `typeof X` yields a string, and every string except `""` is truthy. But Phaser's build replaces the **whole token** `"typeof WEBGL_DEBUG"` via webpack `DefinePlugin`, and the dist config sets it to `false` — [`config/webpack.dist.config.js#L59`](https://github.com/phaserjs/phaser/blob/v3.90.0/config/webpack.dist.config.js#L59) and again at [L119](https://github.com/phaserjs/phaser/blob/v3.90.0/config/webpack.dist.config.js#L119) for the ESM output:

```js
"typeof WEBGL_DEBUG": JSON.stringify(false),
```

(the dev config at [`config/webpack.config.js#L39`](https://github.com/phaserjs/phaser/blob/v3.90.0/config/webpack.config.js#L39) sets it `true`.) So `if (false && window)` is eliminated. Verified against the artifacts:

```
$ grep -c PHASER_GAME dist/phaser.js dist/phaser.min.js dist/phaser.esm.js
0 0 0
```

And verified against **the live game**:

```
$ grep -l PHASER_GAME live-entry.js live/*.js     # all 9 pokerogue.net chunks
(no matches)
```

**Conclusion: `window.PHASER_GAME` is NOT available on pokerogue.net.** PokéRogue's `package.json` sets `main: ./src/phaser.js`, `module: ./dist/phaser.esm.js`, `browser: ./dist/phaser.js`, and Vite's browser-targeted `resolve.mainFields` picks a prebuilt `dist` entry, so the `DefinePlugin`-stripped code is what ships. It is still worth a one-line probe at runtime (free, and it would be by far the cleanest handle), and it *would* appear if anyone ever bundled Phaser from `main`/source.

### 🔴 `ScaleManager` — dead end from plain JS

[`src/scale/ScaleManager.js#L1549-L1582`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/scale/ScaleManager.js#L1549-L1582) registers `window.addEventListener('resize', listeners.windowResize)`, `'orientationchange'`, and `document` fullscreen listeners. The `listeners` object is an instance property of the ScaleManager, not a global. **DOM listener lists are not enumerable from JavaScript** — there is no `getEventListeners` in the language. Dead end for `Runtime.evaluate`; see the CDP route in §6.

### 🔴 `InputManager` — dead end from plain JS, but the closures are rich

[`src/input/InputManager.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/InputManager.js) registers nothing itself; the per-device managers do:

- [`mouse/MouseManager.js#L470-L472`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/mouse/MouseManager.js#L470-L472) on `this.target`, which defaults to `this.manager.game.canvas` ([L254](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/mouse/MouseManager.js#L254)) but is taken from `config.inputMouseEventTarget` ([L244](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/mouse/MouseManager.js#L244)) — PokéRogue sets `input.mouse.target: "app"` / `input.touch.target: "app"` ([`main.ts#L58-L66`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/main.ts#L58-L66)), so these land on the `#app` div, **not** the canvas.
- [`touch/TouchManager.js#L332-L335`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/touch/TouchManager.js#L332-L335), same targeting.
- [`keyboard/KeyboardManager.js#L164`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/keyboard/KeyboardManager.js#L164) — `this.target = window;` by default, then [L230-L231](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/keyboard/KeyboardManager.js#L230-L231) `target.addEventListener('keydown'/'keyup', …)`.

Those handlers close over `var _this = this` and reference `_this.manager.events` ([`KeyboardManager.js#L194-L196`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/keyboard/KeyboardManager.js#L194-L196)), i.e. the closure holds the KeyboardManager → `.manager` (InputManager) → `.game`. Unreachable from JS; reachable via `DOMDebugger.getEventListeners` + `[[Scopes]]` (§6).

### 🔴 `TextureManager` / `Cache` / `Renderer` / `PluginCache` — no game-retaining singleton

`TextureManager`, `CacheManager`, `WebGLRenderer` are all per-Game instances constructed in the `Game` constructor/boot; none registers itself anywhere module-level. The only module-level state in the plugin system is [`src/plugins/PluginCache.js#L9,L13`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/plugins/PluginCache.js#L9) — `var corePlugins = {}` and `var customPlugins = {}` — which hold plugin **classes and mappings**, never Game or Scene instances. The only module-level object that transitively retains a live Game is **`CanvasPool.pool`** (§1). That is precisely why §1 is the verdict.

### 🔴 Canvas expandos — none

Grep of `src/` for `canvas.__`, `__phaser`, `dataset`, `setAttribute('data…` finds nothing on the game canvas. The only `dataset` use is on `<audio>` tags in [`loader/filetypes/HTML5AudioFile.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/loader/filetypes/HTML5AudioFile.js#L152-L166), and the only canvas attribute is `data-pixel-ratio` inside the vendored matter.js debug renderer. [`CreateRenderer.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/CreateRenderer.js) sets `game.canvas` and `game.renderer`; [`dom/AddToDOM.js#L47`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/dom/AddToDOM.js#L47) just `target.appendChild(element)`. **The Game → canvas reference is strictly one-way.** `document.querySelector('canvas')` gives you a dead end, which matches the recon's "canvas element with no obvious backref".

### 🟡 `visibilitychange` / `beforeunload` / rAF / `DOMContentLoaded`

- [`src/core/VisibilityHandler.js#L65`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/VisibilityHandler.js#L65) — `document.addEventListener(hiddenVar, onChange, false)`: not enumerable.
- 🟡 [`VisibilityHandler.js#L68-L76`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/VisibilityHandler.js#L68-L76) — **assigned as properties, so these ARE readable from a bare `Runtime.evaluate`**:
  ```js
  window.onblur = function () { eventEmitter.emit(Events.BLUR); };
  window.onfocus = function () { eventEmitter.emit(Events.FOCUS); };
  ```
  Confirmed present in the live bundle (`grep -oE 'window\.[A-Za-z_$]+=' ` over the pokerogue.net chunks yields `window.onblur=`, `window.onfocus=`). `typeof window.onblur === 'function'` is a reliable **"a Phaser game is running here"** probe from plain JS. The closure holds `eventEmitter = game.events` ([L26](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/VisibilityHandler.js#L26)) — but a function's closure is opaque to JavaScript, so plain `Runtime.evaluate` gets the probe and nothing more. With CDP it becomes a real route (§6).
- No `beforeunload` handler anywhere in `src/`.
- rAF: [`TimeStep.js#L61`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/TimeStep.js#L61) `this.raf = new RequestAnimationFrame()`, started at [L548](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/TimeStep.js#L548). A pending rAF callback is not enumerable or nameable. Note [`src/polyfills/requestAnimationFrame.js`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/polyfills/requestAnimationFrame.js) can *reassign* `window.requestAnimationFrame`, but only on browsers lacking it — irrelevant on modern Chrome, and it would not hold a game reference anyway.
- [`src/dom/DOMContentLoaded.js#L52-L53`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/dom/DOMContentLoaded.js#L52-L53) adds and then removes its own listeners; leaves no global trace.

### Nameable from a bare `Runtime.evaluate` — the honest list

| Route | Nameable? | Gives you the Game? |
|---|---|---|
| `Phaser.Display.Canvas.CanvasPool.pool` | ✅ yes | ✅ **yes**, via `.parent` chains (§1) |
| `window.PHASER_GAME` | ✅ yes *if present* | ✅ directly — but **absent in the shipped build** |
| `window.gameInfo` (PokéRogue) | ✅ yes | ❌ plain data snapshot only (§4) |
| `window.onblur` / `window.onfocus` | ✅ the function object | ❌ not from JS (closure opaque); ✅ with CDP `[[Scopes]]` |
| `window.Phaser.Game` (the constructor) | ✅ yes | ❌ from JS; ✅ with `Runtime.queryObjects` on its `.prototype` |
| `document.querySelector('canvas')` / `#app` | ✅ yes | ❌ no backref, no expando |
| ScaleManager / Input / Visibility DOM listeners | ❌ not from JS | ✅ only via `DOMDebugger.getEventListeners` |
| `Phaser.GAMES`, TextureManager/Cache/Renderer/PluginCache singletons | ❌ do not exist / hold no game | ❌ |

---

## 4. PokéRogue's `globalScene`

### Declaration and assignment

[`src/global-scene.ts`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/global-scene.ts) is the whole file:

```ts
import type { BattleScene } from "#app/battle-scene";

export let globalScene: BattleScene;

export function initGlobalScene(scene: BattleScene): void {
  globalScene = scene;
}
```

Assigned from the `BattleScene` constructor — [`src/battle-scene.ts#L360-L365`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/battle-scene.ts#L360-L365):

```ts
constructor() {
  super("battle");
  this.phaseManager = new PhaseManager();
  this.updateGameInfo();
  initGlobalScene(this);
}
```

**Yes: a module-scoped `export let` singleton, and nothing more.** It is a live binding inside the bundle's module closure. It is **never** attached to `window` in any build configuration — a grep of the whole `src/` tree for `window.<ident> =`, `window["…"] =`, `globalThis.<ident> =` and `(window as any)` returns exactly four hits, and only one is an assignment of game state:

```
src/battle-scene.ts:3264:    window["gameInfo"] = gameInfo;
src/ui/containers/dropdown.ts:705:  this.window.width = …          (a Phaser container, not the global)
src/touch-controls.ts:248,257,259:  window["opera"], (window as any).MSStream   (reads, UA sniffing)
```

There is **no** `import.meta.env.DEV`-gated exposure, no `window.game`, no `window.scene`, no `__PHASER__` hook, no devtools bridge. `globalScene` is genuinely unreachable by name.

### What `window.gameInfo` actually is

[`src/battle-scene.ts#L3083`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/battle-scene.ts#L3083) `public updateGameInfo(): void`, ending at [L3263-L3264](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/battle-scene.ts#L3263-L3264):

```ts
    // TODO: Don't store it here
    window["gameInfo"] = gameInfo;
```

A **plain serializable snapshot** (mode, biome, wave, party stats/shiny/variant/fusion, `gameInfoVersion: "2.1.0"`), refreshed by callers in `ui/ui.ts`, `phases/encounter-phase.ts`, `phases/command-phase.ts` and `battle-scene.ts:1216`, and first written in the constructor at [L363](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/battle-scene.ts#L363) — *before* `initGlobalScene`. Useful as a **liveness/readiness signal** (`window.gameInfo != null` ⇒ BattleScene has been constructed) and as cheap read-only telemetry. It carries **no object references**, so it is not a path to the scene. The `// TODO: Don't store it here` is a warning that it may move.

### Vite config

[`vite.config.ts`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/vite.config.ts) — relevant to what you can see at runtime:

- `build.sourcemap: mode !== "production"` ([L17](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/vite.config.ts#L17)) — **no sourcemaps in production.** Confirmed on the live build (no `//# sourceMappingURL`, no `.map` files). So no name recovery via sourcemaps.
- `build.minify: "oxc"` with **`keepNames: true`** in `output`, `output.minify.mangle.keepNames`, and `output.minify.compress.keepNames: { class: true, function: true }` ([L44-L55](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/vite.config.ts#L44-L55)). 🟢 **This is load-bearing for us: class and function names survive minification**, so `obj.constructor.name === "BattleScene"` / `"TextureManager"` / `"Game"` are usable runtime discriminators. (Phaser's own `Class` util produces named functions too, and `TextureManager` additionally self-labels with `this.name = 'TextureManager'` at [`TextureManager.js#L82`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/textures/TextureManager.js#L82).)
- `resolve: { tsconfigPaths: true }` ([L59-L61](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/vite.config.ts#L59-L61)) — **no `resolve.mainFields` override**, so Vite's browser default applies and `phaser` resolves to a prebuilt `dist` bundle. This is what kills `window.PHASER_GAME` (§3).
- No `define:` block at all → no `WEBGL_DEBUG` definition from PokéRogue's side either; irrelevant given the above.
- `treeshake.propertyReadSideEffects: false` and `manualPureFunctions: ["console.debug","console.log"]` in production ([L36-L42](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/vite.config.ts#L36-L42)) — `console.debug`/`console.log` calls are dropped in production, so don't expect the scene-lifecycle debug logs.
- `rolldownOptions.checks.eval: false` with the comment *"Phaser uses direct eval when loading scene classes"* ([L29-L33](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/vite.config.ts#L29-L33)).

I also read the only other Vite-adjacent files, `plugins/vite/vite-minify-json-plugin.ts` and `plugins/vite/namespaces-i18n-plugin.ts` — asset/i18n transforms, nothing touching globals.

---

## 5. The scene key

**The key is exactly `"battle"`** — [`src/battle-scene.ts#L361`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/battle-scene.ts#L361): `super("battle");` on `class BattleScene extends SceneBase` ([L179](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/battle-scene.ts#L179)), and `SceneBase extends Phaser.Scene` ([`src/scene-base.ts#L6`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/scene-base.ts#L6)).

What is passed to `new Phaser.Game` — [`src/main.ts#L24-L74`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/main.ts#L24-L74):

```ts
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: "app",
  scale: { width: 1920, height: 1080, mode: Phaser.Scale.FIT },
  plugins: { global: [rexInputTextPlugin, rexBBCodeTextPlugin, rexTransitionImagePackPlugin], scene: [rexUI] },
  input: { mouse: { target: "app" }, touch: { target: "app" }, gamepad: true },
  dom: { createContainer: true },
  antialias: false,
  pipeline: [InvertPostFX],
  scene: [LoadingScene, BattleScene],
  version,
});
```

Note `scene: [LoadingScene, BattleScene]` — **two scene classes, LoadingScene first.** `LoadingScene`'s key is `"loading"` ([`src/loading-scene.ts#L18`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/loading-scene.ts#L18): `public static readonly KEY = "loading";`, used at [L23](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/loading-scene.ts#L23) `super(LoadingScene.KEY)`).

### ✅ `game.scene.getScene('battle')` is correct

[`src/scene/SceneManager.js#L895-L916`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/scene/SceneManager.js#L895-L916):

```js
getScene: function (key)
{
    if (typeof key === 'string')
    {
        if (this.keys[key])
        {
            return this.keys[key];
        }
    }
    …
    return null;
}
```

A straight lookup in the key map. Since `BattleScene` is instantiated exactly once and its constructor calls `initGlobalScene(this)`, **`game.scene.getScene('battle') === globalScene` by object identity.** `game.scene.keys.battle` is the same thing with one less call. Both return `null`/`undefined` before the scene is created, so gate on it.

### 🔴 `game.scene.scenes[0]` is NOT equivalent — it is a timing-dependent trap

- Immediately after boot, `scenes` is `[LoadingScene, BattleScene]` → `scenes[0]` is the **LoadingScene**.
- Once assets are loaded, [`src/loading-scene.ts#L535`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/loading-scene.ts#L535) does `this.scene.start("battle")`, and [`src/battle-scene.ts#L411`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/battle-scene.ts#L411) does `this.scene.remove(LoadingScene.KEY)`.
- [`SceneManager.remove`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/scene/SceneManager.js#L426-L458) then **splices the array and deletes the key**:
  ```js
  delete this.keys[sceneKey];
  this.scenes.splice(index, 1);
  …
  sceneToRemove.sys.destroy();
  ```
- **So `scenes[0]` is the LoadingScene before that point and the BattleScene after.** Index-based access is a race. Always key by `'battle'`.

Also relevant: `globalScene.game` works, because Phaser injects it — [`src/scene/InjectionMap.js#L19`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/scene/InjectionMap.js#L19) maps `game: 'game'` onto the Scene, matching the doc at [`src/scene/Scene.js#L38-L47`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/scene/Scene.js#L38-L47) (*"This property will only be available if defined in the Scene Injection Map"*). `globalScene.sys.game` ([`src/scene/Systems.js#L326`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/scene/Systems.js#L326)) is the belt-and-braces version. And the `phaseManager` the recon looked for on `window` lives at `globalScene.phaseManager` ([`battle-scene.ts#L362`](https://github.com/pagefaultgames/pokerogue/blob/v1.12.0.11/src/battle-scene.ts#L362)).

---

## 6. CDP fallbacks

### `Debugger.pause` → `evaluateOnCallFrame`: the exact sequence

1. **`Debugger.enable`** — [docs](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#method-enable). Optional `maxScriptsCacheSize`; returns `debuggerId` (experimental). Required first: the domain must be enabled before pause/paused events flow.
2. **`Debugger.pause`** — [docs](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#method-pause). No parameters. `js_protocol.json` description: *"Stops on the next JavaScript statement."*
3. **`Debugger.paused` event** — [docs](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#event-paused). Carries `callFrames` (*"Call stack the virtual machine stopped on."*), `reason` (here `other` or `debugCommand`), `data`, `hitBreakpoints`, `asyncStackTrace`.
4. Take `callFrames[i].callFrameId` — [`Debugger.CallFrame`](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#type-CallFrame): *"Call frame identifier. This identifier is only valid while the virtual machine is paused."* Each frame also exposes `scopeChain: Scope[]`, `this`, `functionName`, `functionLocation`.
5. **`Debugger.evaluateOnCallFrame`** — [docs](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#method-evaluateOnCallFrame), *"Evaluates expression on a given call frame."* Params: `callFrameId`, `expression`, `objectGroup`, `includeCommandLineAPI`, `silent`, `returnByValue`, `generatePreview`, `throwOnSideEffect`, `timeout`, and **`scopeNumber`** (experimental) — *"Specifies the scope number to evaluate the expression in (default: 0, innermost scope)."* Returns `result: RemoteObject` and `exceptionDetails`.
6. **`Debugger.resume`** — [docs](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#method-resume), optional `terminateOnResume` (*"Set to true to terminate execution upon resuming execution"* — **do not set it**, it kills the running script).

**What it can and cannot see.** It evaluates in the paused frame's **full scope chain**, not just its own lexical block. [`Debugger.Scope`](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#type-Scope) enumerates `type` as `global | local | with | closure | catch | block | script | eval | module | wasm-expression-stack` — **`module` and `closure` are first-class scope types**, and `object` is *"Object representing the scope. For `global` and `with` scopes it represents the actual object; for the rest of the scopes, it is artificial transient object enumerating scope variables."*

So: **if and only if you pause inside a frame whose scope chain includes PokéRogue's `global-scene` module scope**, `evaluateOnCallFrame("globalScene")` resolves. A blind `Debugger.pause` lands on whatever runs next — almost certainly a Phaser rAF tick, whose module scope is Phaser's, not PokéRogue's. That does **not** reach `globalScene`. This is the key limitation and it makes blind pausing a poor primary strategy. Two ways to make it land usefully:

- Pause with a **breakpoint inside a PokéRogue module** (`Debugger.setBreakpointByUrl` on a chunk) rather than `Debugger.pause`. Defeated in practice by minification + no sourcemaps (§4).
- Better: skip pausing and read the scope chain **without stopping the page** — see `[[Scopes]]` below.

**Cost / side effects of pausing.** The official CDP docs say nothing about rAF, frame scheduling, or lost time — that is **UNDETERMINED from the docs**, and I will not invent a citation. What the docs *do* establish: `pause` *"Stops on the next JavaScript statement"*, `callFrameId` is valid only while paused, and `resume` can optionally terminate execution. Structurally, a paused renderer main thread runs no JS, so rAF callbacks cannot fire while paused. What that does to Phaser is answerable from Phaser's source: after a long stall the next `TimeStep.step` sees a huge `rawDelta` ([`TimeStep.js#L711-L730`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/TimeStep.js#L711-L730)), and `smoothDelta` discards it — [`TimeStep.js#L576-L585`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/TimeStep.js#L576-L585):

```js
if (delta > this._min)
{
    //  Probably super bad start time or browser tab context loss,
    //  so use the last 'sane' delta value
    delta = history[idx];
    delta = Math.min(delta, this._min);
}
```

So game-world time does **not** jump by the pause duration (only `this.time`, the real-world accumulator at [L722](https://github.com/phaserjs/phaser/blob/v3.90.0/src/core/TimeStep.js#L722), does). Pausing is mostly safe for a turn-based game, but it visibly freezes rendering, and any `setTimeout`/tween/audio scheduling drifts. Treat it as a last resort.

### `Runtime.queryObjects` — the strongest CDP fallback

[docs](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-queryObjects). Params: `prototypeObjectId` (`RemoteObjectId`, *"Identifier of the prototype to return objects for."*) and optional `objectGroup`. Returns `objects: RemoteObject` — *"Array with objects."*

🔴 **Correction to the ticket's premise: `Runtime.queryObjects` is NOT marked experimental.** In the canonical `json/js_protocol.json` the command carries no `"experimental": true` flag (only `generatePreview`/`timeout` on sibling commands do), and the rendered docs page shows no experimental badge. It is a stable command. It *does* require a `RemoteObjectId` for the prototype, as the ticket says — you cannot pass a name — so it is a two-step:

```
1. Runtime.evaluate { expression: "window.Phaser.Game.prototype" }   → result.objectId
2. Runtime.queryObjects { prototypeObjectId: <that objectId> }       → objects (array RemoteObject)
3. Runtime.callFunctionOn / getProperties on that array              → the live Phaser.Game
```

This is excellent for us because `window.Phaser.Game` **is** nameable (§2), so the prototype handle is free, and it finds the Game **no matter how it is referenced** — no CanvasPool, no index, no closure. It enumerates the heap, so it is not cheap; and it only finds objects whose prototype is exactly that one. The same trick on `window.Phaser.Scene.prototype` will *not* find `BattleScene` (whose prototype chain is `BattleScene.prototype → SceneBase.prototype → Phaser.Scene.prototype`); go via the Game instead.

### 🔴 The command-line `queryObjects()` does NOT work from a plain `Runtime.evaluate`

`Runtime.evaluate`'s `includeCommandLineAPI` is documented only as *"Determines whether Command Line API should be available during the evaluation"* ([docs](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate)) — it does not enumerate the API. Going to the implementation settles it. `queryObjects` **is** installed on the command-line API object — [`v8/src/inspector/v8-console.cc#L949-L951`](https://github.com/v8/v8/blob/main/src/inspector/v8-console.cc#L949-L951):

```cpp
      context, commandLineAPI, data, "queryObjects",
      &V8Console::call<&V8Console::queryObjectsCallback>);
```

But look at what the callback does — [`v8-console.cc#L830-L851`](https://github.com/v8/v8/blob/main/src/inspector/v8-console.cc#L830-L851) resolves a constructor to its `.prototype` and then calls `inspectImpl(info, arg, sessionId, kQueryObjects, m_inspector)`, and `inspectImpl` ([L774-L804](https://github.com/v8/v8/blob/main/src/inspector/v8-console.cc#L774-L804)) does:

```cpp
  if (request == kRegular) info.GetReturnValue().Set(value);   // NOT taken for kQueryObjects
  …
  } else if (request == kQueryObjects) {
    hints->setBoolean("queryObjects", true);
  }
  …
    session->runtimeAgent()->inspect(std::move(wrappedObject), std::move(hints), …);
```

**It sets no return value and does the query nowhere.** It merely emits a `Runtime.inspectRequested` notification carrying the prototype plus the hint `{queryObjects: true}`; the *DevTools frontend* is what then issues the real `Runtime.queryObjects`. So `Runtime.evaluate { expression: "queryObjects(Phaser.Game)", includeCommandLineAPI: true }` evaluates to **`undefined`** and you must handle an out-of-band `Runtime.inspectRequested`. Also note `queryObjects` is in V8's `UnsafeCommandLineAPIFns` set ([`v8-console.cc#L1045-L1049`](https://github.com/v8/v8/blob/main/src/inspector/v8-console.cc#L1045-L1049)) — *"get-ting these functions from the global proxy is considered a side-effect"* — so it interacts badly with `throwOnSideEffect: true`. **Use the `Runtime.queryObjects` command, never the CLI helper.**

### `Runtime.globalLexicalScopeNames` — will not find `globalScene`

[docs](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-globalLexicalScopeNames); `js_protocol.json` description: *"Returns all let, const and class variables from global scope."* Params: optional `executionContextId`; returns `names: string[]`. Not experimental.

**Useless here.** `globalScene` is an `export let` in a *module* scope inside the Vite bundle, not a top-level `let` in the page's global lexical scope. Worth one call to enumerate the surface, but expect nothing. (This is worth stating because it is the obvious-looking answer and it is wrong.)

### 🟢 `Runtime.getProperties` → `[[Scopes]]`: read closures without pausing

`Runtime.getProperties` ([docs](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getProperties)) returns `internalProperties: InternalPropertyDescriptor[]` — *"Internal object properties (only of the element itself)"*, the type being *"Object internal property descriptor. This property isn't normally visible in JavaScript code."* The CDP docs **do not mention `[[Scopes]]`** (UNDETERMINED from docs alone), so I went to V8. [`v8/src/inspector/v8-debugger.cc#L1011-L1018`](https://github.com/v8/v8/blob/main/src/inspector/v8-debugger.cc#L1011-L1018), inside `V8Debugger::internalProperties`:

```cpp
  if (value->IsFunction()) {
    v8::Local<v8::Function> function = value.As<v8::Function>();
    v8::Local<v8::Value> scopes;
    if (functionScopes(context, function).ToLocal(&scopes)) {
      createDataProperty(context, properties, properties->Length(),
                         toV8StringInternalized(m_isolate, "[[Scopes]]"));
      createDataProperty(context, properties, properties->Length(), scopes);
    }
  }
```

`functionScopes` → `getTargetScopes(..., FUNCTION)` ([L811-L893](https://github.com/v8/v8/blob/main/src/inspector/v8-debugger.cc#L811-L893)) drives a `v8::debug::ScopeIterator::CreateForFunction` and labels each scope `Global`/`Local`/`Closure`/`Script`/`Module`/… — with **no `enabled()` guard in that code path**. So in principle:

```
1. Runtime.evaluate { expression: "window.onblur" }        → objectId of the VisibilityHandler closure
2. Runtime.getProperties { objectId, ownProperties: true } → internalProperties contains [[Scopes]]
3. walk into the Closure scope object                      → `eventEmitter` === game.events
```

`game.events` is not the Game, but it is a foothold (its eventemitter3 `_events` entries carry `context` values, and `Game.boot`/`start` register listeners with the Game as context). The same technique on a handler returned by `DOMDebugger.getEventListeners` is more direct: that command is **not experimental** and returns `handler`/`originalHandler` as `Runtime.RemoteObject` (*"Event handler function value."*) per [`browser_protocol.json` `DOMDebugger.EventListener`](https://chromedevtools.github.io/devtools-protocol/tot/DOMDebugger/#type-EventListener); run it on the `window` object to get Phaser's `keydown` handler, whose closure holds `_this` = the KeyboardManager → `.manager.game` ([`KeyboardManager.js#L194-L196`](https://github.com/phaserjs/phaser/blob/v3.90.0/src/input/keyboard/KeyboardManager.js#L194-L196)). **This never freezes the page** — the big advantage over `Debugger.pause`. I have not executed it against the live page, so whether `[[Scopes]]` is served without `Debugger.enable` is **UNDETERMINED empirically**; the V8 source shows no guard, but enable it if the array comes back without `[[Scopes]]`.

---

## Verdict

### Single most robust expression from a bare `Runtime.evaluate`

One self-contained expression, no CDP domains beyond `Runtime`, no index assumptions, returning the Game *and* the BattleScene (`=== globalScene`):

```js
(() => {
  // 0. Free win if anyone ever bundles Phaser from source (main field) — absent on pokerogue.net.
  const direct = typeof window.PHASER_GAME !== 'undefined' ? window.PHASER_GAME : null;

  const isGame = g => !!g && typeof g === 'object'
    && 'isBooted' in g && g.scene && Array.isArray(g.scene.scenes) && g.textures && g.loop;

  let game = isGame(direct) ? direct : null;

  // 1. The only module-level singleton in Phaser 3.90.0 that transitively retains a live Game.
  if (!game) {
    const P = window.Phaser;
    const pool = P && P.Display && P.Display.Canvas && P.Display.Canvas.CanvasPool.pool;
    for (const c of (pool || [])) {
      const p = c && c.parent;
      if (!p || typeof p !== 'object') continue;
      for (const cand of [p, p.game, p.scene && p.scene.game,
                          p.manager && p.manager.game, p.renderer && p.renderer.game]) {
        if (isGame(cand)) { game = cand; break; }
      }
      if (game) break;
    }
  }
  if (!game) return { ok: false, reason: 'no game reachable' };

  // 2. Key the scene — never index it.
  //    (Or skip the Game entirely: ~1662 of 1666 live pool entries have
  //     `parent.scene === globalScene`, so scanning for `parent.scene` with
  //     sys.settings.key === 'battle' is the more redundant path once GameObjects exist.
  //     The Game hop below still wins during early boot, before any GameObject exists.)
  const scene = game.scene.getScene('battle');   // === globalScene, by identity
  return {
    ok: !!scene,
    booted: game.isBooted,
    sceneKeys: game.scene.scenes.map(s => s.sys.settings.key),
    hasGameInfo: typeof window.gameInfo !== 'undefined',
    // hand `game` / `scene` back out of this IIFE in real use rather than returning by value
  };
})()
```

In practice the working handle is `Phaser.Display.Canvas.CanvasPool.pool[0].parent.game` → `.scene.getScene('battle')`, but write the scan, not the index.

**Failure modes, in the order they will bite you:**

1. **Too early.** `pool[0].parent` is only the TextureManager once `new Phaser.Game(...)` has run, and `getScene('battle')` is `null` until the BattleScene is constructed. Poll; gate on `game.isBooted` and on a non-null scene. `window.gameInfo != null` is a cheap readiness proxy (§4).
2. **Index drift.** Do not hardcode `pool[0]`: the async `CanvasFeatures.checkBlendMode` canvas can push a second entry, and `Text`/`TileSprite`/rex-plugin canvases append and reclaim freed slots (§1).
3. **`scenes[0]` is the LoadingScene** until `battle-scene.ts:411` removes it and `SceneManager.remove` splices the array. Key by `'battle'` always (§5).
4. **A Phaser upgrade could break this.** `CanvasPool` is internal API; `TextureManager._tempCanvas` is a private field. If Phaser ever stops pooling a 2D canvas in the TextureManager constructor, or `Game` starts passing something else as `parent`, the scan's `p.game`/`p` branches are what save you.
5. **`globalScene` is only *equal* to `getScene('battle')`, not the same binding.** If PokéRogue ever re-created the BattleScene, both would follow — fine — but you are reading the SceneManager's map, not the module variable.
6. **Renderer type.** If PokéRogue ever switched off `Phaser.WEBGL`, the game canvas *would* enter the pool with `parent === game`; the scan's bare `p` branch already covers that.

### Ranked fallbacks

1. **`Runtime.queryObjects` on `window.Phaser.Game.prototype`** — stable (not experimental), needs only the nameable `Phaser.Game` constructor, immune to CanvasPool internals. Two round-trips plus a heap walk; the right answer if the CanvasPool route ever breaks. Then `→ .scene.getScene('battle')`.
2. **`DOMDebugger.getEventListeners(window)` → handler → `Runtime.getProperties` → `[[Scopes]]` → `_this.manager.game`** — does not freeze the page; `[[Scopes]]` is V8-guaranteed for functions but undocumented in CDP, so verify empirically (may need `Debugger.enable`).
3. **`Runtime.evaluate("window.onblur")` → `getProperties` → `[[Scopes]]` → `eventEmitter` (= `game.events`)** — same mechanism from a plain global; one hop further from the Game.
4. **`Debugger.setBreakpointByUrl` in a PokéRogue chunk → `Debugger.paused` → `evaluateOnCallFrame("globalScene")`** — the only route that reads the actual module binding, but it needs a location in minified, sourcemap-less code, and it stops the world.
5. **Blind `Debugger.pause` → `evaluateOnCallFrame`** — last resort. It lands in Phaser's rAF tick, whose scope chain does **not** include PokéRogue's `global-scene` module scope, so `globalScene` will not resolve. Freezes rendering for the duration.
6. **`Runtime.globalLexicalScopeNames`** — listed for completeness; it returns global `let`/`const`/`class` only and will not see a module-scoped `export let`. Expect nothing.

**Do not bother with:** `Phaser.GAMES` (does not exist at v3.90.0), `window.PHASER_GAME` as a *plan* (dead-coded out of every shipped Phaser dist, verified absent from all 9 live chunks — but do probe it, it is free), canvas expandos (none), `window.gameInfo` as a path to the scene (plain data only), and the command-line `queryObjects()` via `includeCommandLineAPI` (returns `undefined`; fires `Runtime.inspectRequested` instead).
