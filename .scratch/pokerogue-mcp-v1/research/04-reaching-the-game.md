# Research: reaching the running game from injected JS

Ticket: [#9 Reaching the running game from injected JS](https://github.com/IIxauII/pokerogue-mcp/issues/9)
Date: 2026-09-12

**Primary sources.** Two, kept separate throughout:

1. **The live game**, probed read-only over CDP against the tab that [#5](https://github.com/IIxauII/pokerogue-mcp/issues/5) left running: Chrome 152.0.7977.83 on port 9222, `https://pokerogue.net/`, `game.config.gameVersion === "1.12.0.11"`, Phaser `3.90.0`, `WebGLRenderer`. Every timing below is a **measured** full CDP round trip from a Node client on a warm websocket, not an estimate.
2. **Source code** — Phaser `v3.90.0` and `pagefaultgames/pokerogue`, plus the official Chrome DevTools Protocol docs. Cited inline in §7.

No button was ever pressed and no game state was written. The one global the probes created (`window.__pmcp_probe`) was deleted afterwards; verified `undefined`.

---

## 0. Answer up front

**Yes. There is a path, it is cheap, and #3 and #4 stand.**

The game is reachable from a bare `Runtime.evaluate` in the main world via Phaser's
**module-level `CanvasPool`**, which retains a reference to the `TextureManager`,
which back-references the `Game`:

```js
Phaser.Display.Canvas.CanvasPool.pool
  .find(e => e && e.parent && e.parent.game)   // the TextureManager's 1x1 scratch canvas
  .parent.game                                 // Phaser.Game
  .scene.getScene('battle')                    // BattleScene  <- the scene #3/#4 assume
```

A full settle-poll read through this path — [#3](https://github.com/IIxauII/pokerogue-mcp/issues/3)'s
predicate fields plus a lean snapshot (wave, money, biome, party, enemy field) —
costs **0.21 ms at p50** (min 0.14, p90 0.54, max 7.85 over 50 evaluates) and
returns **338 bytes**. Against a 100 ms settle poll that is **0.2 % of the interval**;
the sleep dominates by three orders of magnitude.

So the fallback the ticket asked about — abandoning the scene and living off
`window.gameInfo` plus screenshots — is **not needed**, and would not even be
cheaper: `window.gameInfo` alone measured **0.18 ms p50**, statistically
indistinguishable from reading the entire scene. `gameInfo`'s disadvantage is
purely that it is partial (no money, no enemy, no items, no `ui.mode`), never cost.

**#5's two findings were both correct; its inference was not.** Nothing *is* on
`window` — re-confirmed here, 244 keys, suspects only `Phaser`, `gameInfo`,
`ongamepadconnected`, `ongamepaddisconnected`. But "not on `window`" is not "not
reachable": the handle lives four levels inside the `Phaser` namespace, on a
module-level array that #5's one-level scan of `window`'s own values could not see.
The route was in fact already written down in `README.md` under "Why it's feasible"
— see §2 for the correction it needs.

---

## 1. Why the scene is reachable at all

Phaser's `CanvasPool` is a **module-level singleton array**, reachable as
`Phaser.Display.Canvas.CanvasPool.pool`. Each entry is `{ parent, canvas, type }`.
The pool exists so Phaser can recycle 2D canvases; the consequence for us is that it
**permanently retains a strong reference to whatever asked for a canvas**, including
the `TextureManager`, which is a `Game`-owned singleton carrying `.game`.

That is the whole trick. It is not a PokéRogue affordance and not a debug hook; it is
a side effect of Phaser's canvas recycling, and it works regardless of bundling
because `Phaser` itself is on `window`.

Live shape of the pool (measured):

| | |
|---|---|
| `pool.length` | 1653 -> 1666 over a few minutes of menu use; **+0 over 30 s idle** |
| entries whose `parent` is a `TextureManager` | **1** (index 0) |
| entries whose `parent` is a `Text` | 1615 |
| entries whose `parent` is a `BBCodeText` | 36 |
| entries whose `parent` is `null` (freed slot) | 1–5 |
| entries whose `canvas` is in the DOM | **0** |
| `type` of every entry | `1`, i.e. `Phaser.CANVAS` (live: `[AUTO, CANVAS, WEBGL, HEADLESS] === [0, 1, 2, 3]`) |

Two things follow:

- **The pool grows with text rendering, not with time.** Idle 30 s added nothing; a
  few minutes of menu navigation added 13. Freed slots are nulled in place and
  reused rather than spliced, so indices are stable.
- **The game's own display canvas is not in the pool.** The single DOM canvas is
  1920x1080 and *absent* from the pool. The source reason (§7.1) is sharper than
  "WebGL makes its own canvas": `CreateRenderer` *does* call
  `CanvasPool.create(game, …, config.renderType)`, but `CanvasPool` only
  `pool.push`es when the type is `CONST.CANVAS`. PokéRogue runs
  `renderType === 2` (`Phaser.WEBGL`, confirmed live), so the container is built,
  returned and discarded, never pooled. Confirmed
  `game.canvas === document.querySelector('canvas')`, and the DOM canvas carries
  **no** expando properties (own-property scan: empty).

## 2. Correction to `README.md`

The README records:

```js
const game = Phaser.Display.Canvas.CanvasPool.pool[0].parent.game;
```

This **works today but is right by accident**, and the README's framing invites a
wrong mental model. Precisely:

- `pool[0].parent` is **not** the `Game`. It is the **`TextureManager`**. `.parent.game`
  resolves only because `TextureManager` happens to hold a `.game` back-reference.
- `.parent.game` is `undefined` for **1651 of 1666** entries — every `Text` and
  `BBCodeText` parent. So the bare `[0]` index is load-bearing: hit any other index
  and the expression throws.
- Index `0` is stable *in practice* (the `TextureManager` requests its canvas during
  boot, before any text exists, and never frees it) but nothing in the contract
  guarantees it, and freed slots are reused in place.

Use a predicate, never an index. §5 gives the production form.

## 3. A second, independent route (the good fallback)

Every `Text` / `BBCodeText` in the pool is a **GameObject**, and every GameObject
carries `.scene`. That yields a completely separate path to the same object:

```js
Phaser.Display.Canvas.CanvasPool.pool
  .find(e => e && e.parent && e.parent.scene)
  .parent.scene            // BattleScene  — and .scene.sys.game gives the Game back
```

Measured: **1662 of 1666** entries satisfy this, and the result is **`===` identical**
to the object route A returns. Confirmed `.parent.scene.sys.game.constructor.name === "Game"`.

This is the stronger route by redundancy — 1662 ways in versus 1. Route A is kept
first only because it reaches the `Game` (and therefore `game.config.gameVersion`,
needed by [#2](https://github.com/IIxauII/pokerogue-mcp/issues/2)'s drift check) in
one hop. Layer both; see §5.

Two caveats, the second of which is a correctness trap:

1. Route B is empty **before the first text renders**, and route A is empty before the
   `TextureManager` boots — the TextureManager entry exists from `Game` *construction*,
   so route A is the one that resolves earliest. Both are lazy; see §6.
2. **Used standalone, route B must guard on the scene key.** `.parent.scene` is whichever
   scene owns that GameObject, and during boot that can be the **`LoadingScene`**
   (§7.5) — a scene with no `.ui`. Taking the first match blindly is the same class of
   bug as trusting `scenes[0]`.

   Measured: **post-boot the hazard is absent** — of 1677 entries, 1669 have a
   `.parent.scene`, every one of them keyed `battle`, and all 1669 are the **same single
   scene object** (`distinctSceneObjects: 1`). So this is a boot-window trap only, not a
   live one; the guard costs nothing and closes it:

   ```js
   for (const c of Phaser.Display.Canvas.CanvasPool.pool) {
     const s = c && c.parent && c.parent.scene;
     if (s && s.sys && s.sys.settings.key === 'battle') return s;   // === globalScene
   }
   ```

   §5's locator sidesteps this without the guard, because it uses route B only to reach
   the **`Game`** (`p.scene.game`) and then keys the scene with `getScene('battle')`. It
   also keeps the `Game` handle, which route B alone discards — and that handle is what
   [#2](https://github.com/IIxauII/pokerogue-mcp/issues/2)'s `game.config.gameVersion`
   drift check needs. That is why §5 resolves the Game first rather than grabbing the
   scene directly, despite route B's 1662-to-1 redundancy advantage.

## 4. Mechanisms measured and ranked

All figures are full CDP round trips, warm websocket, same live tab, ordered best
to worst.

| # | Mechanism | p50 | Verdict |
|---|---|---|---|
| **M1** | `Runtime.evaluate`, rediscover via `CanvasPool` **every call** | **0.20 ms** | **Chosen.** Stateless, no page mutation, no handle to invalidate. |
| M1b | discovery expression alone, no payload | 0.11 ms | Discovery is free; the payload is the cost. |
| M2 | `Runtime.evaluate` once -> keep `objectId` -> `Runtime.callFunctionOn` | 0.16 ms | **No faster than M1** (0.16 vs 0.20 ms, inside the noise) and adds a handle that dies on navigation/context destroy. Complexity for nothing. |
| M4 | `window.gameInfo` only | 0.18 ms | **Not cheaper than reading the whole scene.** Partial data at full price. |
| M3 | `Runtime.queryObjects` on `Phaser.Game.prototype` | **470 ms** | Works — finds exactly **1** `Game` — but ~2500x slower (heap scan). Unusable for polling; the right **fallback** if the `CanvasPool` route ever breaks, since it needs only the nameable `Phaser.Game` constructor. (The ticket called it `experimental`; §7.6 shows it is **not** — no experimental flag in `js_protocol.json`.) |
| M5 | `Debugger.pause` + `Debugger.evaluateOnCallFrame` | 16 ms **and freezes the game** | **Dead end**, see §4.1. |
| M6 | `Runtime.globalLexicalScopeNames` | — | Returns `[]`. Nothing to find. |

Worst case for M1's scan is bounded and negligible: forcing a **full** 1666-entry
traversal (`.filter`, no short-circuit) measured **0.24 ms p50**; a reverse scan that
finds the game entry last measured **0.20 ms p50**. `.find` short-circuits at index 0
in the normal case, so the scan is effectively O(1) and the pessimal case is still
sub-millisecond.

### 4.1 Why the `Debugger` route fails

The ticket asked specifically whether `Debugger.pause` + evaluate-on-call-frame
reaches module scope, and whether it is cheap enough per settle poll. Measured
answers: **it does not reach `globalScene`, and no.**

- A plain `Debugger.pause` lands on a **synthetic frame** with no PokéRogue code on
  the stack: one frame, scope chain `[local, closure, global]`, and
  `typeof globalScene` -> `"undefined"`. There is no PokéRogue module scope to see
  because no PokéRogue function is executing.
- Breaking *inside the game's own frame loop* (via
  `Debugger.setBreakpointOnFunctionCall` on `game.loop.step`) does produce a scope
  chain containing `module` — `[local, closure, closure, closure, module, global]` —
  but that is **Phaser's** module, not PokéRogue's, and `typeof globalScene` is still
  `"undefined"` on all four top frames. Reaching PokéRogue's module scope would
  require breaking inside a PokéRogue function specifically.
- Cost: the pause round trip alone was 16 ms, and breaking in the frame loop held
  the game frozen for **47 ms** per hit. Against a 100 ms poll that is a 47 % duty
  cycle of a stopped game. Categorically unusable.

Since M1 costs 0.20 ms and needs none of this, the whole `Debugger` branch is moot.

### 4.2 Bonus: the DevTools command-line API is available

`Runtime.evaluate` with `includeCommandLineAPI: true` does expose `queryObjects` and
`getEventListeners` to injected JS. Not needed, but it produced one correction:

**`README.md` says "Phaser listens on the document" — it does not.** Measured:

- `getEventListeners(window)` -> `keydown: 2`, `keyup: 1`, `mousedown`/`mouseup`,
  `touchstart`/`touchend`/`touchcancel`, `resize: 2`, `blur`, `focus`,
  `gamepadconnected`, ...
- `getEventListeners(document)` -> **no `keydown` at all** (only `DOMContentLoaded`,
  `visibilitychange`, pointerlock/fullscreen).
- `getEventListeners(canvas)` -> only `webglcontextlost` / `webglcontextrestored`.

Phaser's keyboard input is bound to **`window`**. The raw-keystroke fallback still
works in practice (`Input.dispatchKeyEvent` bubbles to `window`), but the README's
stated reason is wrong.

Listener *closures* remain unreadable from JS, so this is not an alternative route to
the scene — only a way to enumerate listener function objects.

## 5. The mechanism to build on

One expression, layered A-then-B, guarded so it **degrades instead of throwing** —
matching the map's "degrade, never block" rule. Returns `{ready: false, why}` rather
than raising, so the server can distinguish "game not up yet" from a real fault.

```js
(() => {
  const isGame = g => !!g && typeof g === 'object'
    && 'isBooted' in g && g.scene && Array.isArray(g.scene.scenes) && g.textures && g.loop;

  // route 0: free, and absent on pokerogue.net — but it costs one typeof, and it is
  // the cleanest handle in any build that bundles Phaser from source. See §7.3.
  let game = typeof globalThis.PHASER_GAME !== 'undefined' && isGame(globalThis.PHASER_GAME)
    ? globalThis.PHASER_GAME : null;

  const P = globalThis.Phaser;
  if (!game) {
    if (!P?.Display?.Canvas?.CanvasPool) return { ready: false, why: 'no-phaser' };
    const pool = P.Display.Canvas.CanvasPool.pool;
    if (!Array.isArray(pool) || pool.length === 0) return { ready: false, why: 'empty-pool' };
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i] && pool[i].parent;
      if (!p || typeof p !== 'object') continue;
      // p           — a Canvas-renderer game (CreateRenderer passes the Game as parent)
      // p.game      — route A: TextureManager
      // p.scene     — route B: any GameObject (Text, BBCodeText, TileSprite)
      // p.manager / p.renderer — DynamicTexture
      for (const cand of [p, p.game, p.scene && p.scene.game,
                          p.manager && p.manager.game, p.renderer && p.renderer.game]) {
        if (isGame(cand)) { game = cand; break; }
      }
      if (game) break;
    }
  }
  if (!game) return { ready: false, why: 'no-game-in-pool' };
  if (!game.isBooted || !game.isRunning) return { ready: false, why: 'not-booted' };

  const scene = game.scene.getScene('battle');   // key it; NEVER index scenes[0] — see below
  if (!scene || !scene.ui) return { ready: false, why: 'no-battle-scene' };
  return { ready: true, game, scene };
})()
```

The `parent` shapes come from §7.1's exhaustive call-site table, not from guessing: a
pooled entry's `parent` can be a `TextureManager` (`.game`), a GameObject
(`.scene`), a `DynamicTexture` (`.manager` / `.renderer`, **no `.game`**), the `Game`
itself (canvas renderer only), `undefined` (transient feature-test canvases), or even
the canvas element (`selfParent: true`). `isGame` duck-types rather than trusting
`constructor.name` — though names *are* reliable here, see §7.4.

**This exact block was then run verbatim against the live tab** (with `game`/`scene`
swapped for a serialisable summary so it could cross the wire; the discovery logic
byte-for-byte as above) — **0.15 ms p50** (min 0.11, p90 0.39, max 4.03 over 50
evaluates) ->
`{ready: true, version: "1.12.0.11", sceneCtor: "BattleScene", mode: 2, handlers: 48, handler: "CommandUiHandler", wave: 5}`.

Degradation verified by forcing each failure against the live page:

| Forced | Returns |
|---|---|
| `Phaser` absent | `{ready: false, why: 'no-phaser'}` |
| pool empty | `{ready: false, why: 'empty-pool'}` |
| every entry freed (`parent: null`) | `{ready: false, why: 'no-game-in-pool'}` |
| route A (`p.game`) removed | `{ready: true, sceneCtor: 'BattleScene'}` |
| routes A **and** B removed | `{ready: true, sceneCtor: 'BattleScene'}` — still resolves, via the `DynamicTexture` `.manager`/`.renderer` branches |

Nothing throws, and the candidate list is genuinely triply redundant rather than
nominally so.

`ui.handlers.length === 48` and `game.config.gameVersion === "1.12.0.11"` both read
straight off this, so [#2](https://github.com/IIxauII/pokerogue-mcp/issues/2)'s two
free drift checks come along for nothing.

### Scene accessor — key it, never index it

Live, `game.scene.scenes` contains **exactly one** scene: key `"battle"`, ctor
`BattleScene`, `active: true`, `visible: true`, `status: 5`, and
`getScene('battle') === scenes[0]` is `true`.

**That equality is a post-boot coincidence and must not be relied on.** The source
(§7.5) shows PokéRogue registers **two** scenes — `scene: [LoadingScene, BattleScene]`
— so `scenes[0]` is the **`LoadingScene`** until `battle-scene.ts` removes it, at which
point `SceneManager.remove` splices the array and `battle` slides into index 0. A
`scenes[0]` fallback is therefore not a harmless safety net: during boot it hands back
the wrong scene, one with no `.ui`, which is exactly when a locator is most likely to
run. **An earlier draft of this document recommended that fallback; it is wrong and has
been removed.** `getScene('battle')` is a plain key-map lookup that returns `null`
before the scene exists — gate on `null` and retry.

### Do not cache

The scene object **is** stable across evaluates (verified by stashing it on a global
and comparing identity on a later call: `true`). Caching is therefore *sound* — it is
just pointless. M1 rediscovers in 0.11 ms, so a cache buys nothing and costs an
invalidation path on reload, context destroy, and `globalScene.reset(true)` (the
title-screen case the map already flags under "Losing a run without wiping"). **Stay
stateless.** Do not write to `window`; do not hold an `objectId`.

## 6. Consequences for the rest of the map

- **#3 and #4 are not overturned.** Every object they name is reachable and was read
  live: `ui.mode`, `ui.modeChain`, `ui.handlers` (48), `ui.getHandler()`,
  `handler.active`, `handler.cursor`, `handler.awaitingActionInput`,
  `handler.onActionInput`, `phaseManager`, `phaseManager.currentPhase`, `party`,
  `money`, `currentBattle.waveIndex`, `arena.biomeType`.
- **Discovery is lazy, per page load.** The pool is empty until Phaser boots, so
  `Page.addScriptToEvaluateOnNewDocument` cannot capture the handle — it runs too
  early. The server must call the locator on demand and treat `ready: false` as
  "retry", which the existing settle-poll loop already does for free.
- **Two corrections #3 will need** (found incidentally, not this ticket's question,
  and flagged rather than fixed here):
  - `ui.overlayActive` is a **declared but uninitialised** property — `'overlayActive' in ui`
    is `true` while `typeof ui.overlayActive === 'undefined'`. A predicate reading it
    must treat `undefined` as falsy, not expect a boolean. (`ui` also has a separate
    `overlay` key.)
  - `phaseManager.phaseQueue` is **not an array on this build** — it is a `PhaseTree`.
    #3's "`phaseQueue` is non-empty while the player sits at the command menu" needs
    restating against `PhaseTree`'s API. `PhaseManager`'s own keys are
    `phaseQueue`, `dynamicQueueManager`, `currentPhase`, `standbyPhase`;
    `getCurrentPhase()`, `hasPhaseOfType()`, `clearPhaseQueue()` and friends are on the
    prototype. `phaseManager.currentPhase.constructor.name` reads cleanly
    (observed `SelectModifierPhase`) and is the better signal.
- **`window.gameInfo` keeps a narrow job.** Not a fallback and not a cost saving. Its
  one real advantage is that it needs no locator at all — see §8, where the parallel
  work on [#10](https://github.com/IIxauII/pokerogue-mcp/issues/10) narrows that job
  further still.

### 6.1 What a read costs, by payload

Same locator, three payload sizes, plus a screenshot for scale. All measured on the
live tab.

| Payload | p50 | bytes |
|---|---|---|
| locator only (`ready`, version, mode, handler count) | 0.20 ms | ~80 |
| **lean** — #3's settle predicate + wave/money/biome/party/enemy | **0.21 ms** | **338** |
| **fat** — full party (IVs, stats, moveset + PP), full enemy party, held modifiers, pokéball counts, score | **0.27 ms** | **950** |
| `Page.captureScreenshot` (JPEG q70) | **29 ms** | **86,452** (base64) |

The text path is **~100x faster and ~91x smaller than a single screenshot**, which
settles the map's "screenshots stay an optional sanity check" decision on measured
grounds rather than intuition.

It also means **CDP cost is not what tiering is for.** Fat costs 0.06 ms more than
lean; the transport difference is noise. The map's tiered-verbosity decision is
justified by *Claude's* token budget, not by the wire — worth keeping straight when
[#7](https://github.com/IIxauII/pokerogue-mcp/issues/7) shapes the tool surface, and
worth re-measuring against a full party of six rather than the one-pokémon party
available here.

---

## 7. Source corroboration

The live probes above say *that* the route works. This section says *why*, from source,
and it corrected three things the probes alone got wrong. Full citations — file, line,
permalink, quoted code — are in the companion file **[`04-sources.md`](./04-sources.md)**,
read from the Phaser `v3.90.0` tarball, the PokéRogue `v1.12.0.11` tarball, all nine
live `pokerogue.net` chunks, the canonical CDP `js_protocol.json`, and V8's
`src/inspector` where the CDP docs are silent. Section numbers below match it.

### 7.1 `CanvasPool` — why the route exists, and why index 0 is incidental

`var pool = []` is module-scoped and created at import; Phaser's own comment calls it a
singleton *"instantiated as soon as Phaser loads, before a Phaser.Game instance has even
been created"*. It is exported as `pool` on the namespace, which is what makes it
nameable.

Two mechanics decide everything:

- **`pool.push` happens only for `CONST.CANVAS`.** A WebGL canvas is created, returned
  and discarded — never pooled. `Phaser.CANVAS` is `1` and `Phaser.WEBGL` is `2`
  (verified live), PokéRogue runs `renderType: 2`, and every live pool entry is `type: 1`.
  Consistent both ways.
- **`remove`/`free` never splice** — they null `container.parent` and shrink the canvas
  to 1x1, leaving the entry forever. Entries are then **re-owned in place**
  (`container.parent = parent` on the reuse branch), so a given `pool[i]` outlives many
  owners.

Why index 0 is the `TextureManager`: Phaser's `Device` modules eagerly feature-test at
import (before any `Game` exists), pooling a 2D canvas and then freeing it. `Game`'s
constructor runs `this.textures = new TextureManager(this)`, whose constructor calls
`CanvasPool.create2D(this)` — which takes that one free slot. Hence index 0, and hence
`parent.game` resolving: `TextureManager` sets `this.game = game`. It is **never freed**
until the game is destroyed.

So index 0 is **incidental but deterministic — not contractual.** Nothing in Phaser
documents, asserts or tests it, and the companion file names four ways the ordering can
shift with no API change: the **async** blend-mode feature test, whose `onload` can land
either side of `Game` construction and append a second entry; a host page constructing a
`Phaser.Text` or a second `Game` first and taking the slot; a browser without
`WebGLRenderingContext`, which skips the WebGL feature test entirely; and a
`selfParent: true` path whose `parent` is the canvas element itself. Plus ordinary churn
— `Text`/`TileSprite`/rex-plugin canvases appending and reclaiming freed slots.
**Scan, don't index** — §5.

One sharper correction than my §2. Had the game canvas been pooled, `parent` would be
the **`Game`** (`CreateRenderer` passes `game`), and `Phaser.Game` has **no `.game`
property** — so `.parent.game` would be `undefined` and the correct expression would be
`pool[i].parent` alone. The README's expression conflates the two cases. §5's locator
accepts both shapes.

### 7.2 `Phaser.GAMES` does not exist in Phaser 3 at all

Not a bundling artifact, not an ESM-vs-UMD difference: `grep -rn "GAMES"` over the whole
`v3.90.0` tarball — `src/`, `dist/`, `types/`, `config/` — returns **nothing**. It was a
Phaser 2 / Phaser-CE feature. The namespace is an object literal in `src/phaser.js`
extended with `src/const.js`; nothing anywhere pushes a `Game` into a module-level
collection. This retires the question rather than answering it, and it refines #5's note:
`Phaser.GAMES` being absent said nothing about bundling.

`window.Phaser` exists under Vite only because `src/phaser.js` ends with
`global.Phaser = Phaser` (and the UMD wrapper does `root["Phaser"] = factory()`), which
is exactly why the namespace is reachable but "bare".

### 7.3 `window.PHASER_GAME` — real in source, dead-coded out of the build

`Game.boot()` ends with:

```js
if (typeof WEBGL_DEBUG && window) { window.PHASER_GAME = this; }
```

Read from source you would conclude it always fires — `typeof X` is a non-empty string,
hence truthy. It does not, because Phaser's build replaces the whole token
`"typeof WEBGL_DEBUG"` via webpack `DefinePlugin`, and the **dist** config sets it to
`false`, eliminating the branch. `grep -c PHASER_GAME` over `dist/phaser.js`,
`phaser.min.js` and `phaser.esm.js` is `0 0 0`, and it is absent from all nine live
chunks. PokéRogue's Vite has no `resolve.mainFields` override, so a prebuilt `dist`
entry is what ships.

**Verified live: `typeof window.PHASER_GAME === 'undefined'`.** It costs one `typeof`, so
§5's locator probes it anyway — it would be the cleanest possible handle in any build
that bundled Phaser from source.

### 7.4 `globalScene` — module-scoped, and our handle is identity-equal to it

`src/global-scene.ts` is four lines: `export let globalScene: BattleScene` plus an
`initGlobalScene(scene)` setter. `BattleScene`'s constructor calls
`super("battle"); … initGlobalScene(this)`. So it is a module-scoped `export let`
singleton — a live binding inside the bundle's module closure, **never** attached to
`window` in any build configuration.

A grep of the whole `src/` tree for `window.<ident> =`, `window["…"] =`,
`globalThis.<ident> =` and `(window as any)` returns four hits, of which exactly one
assigns game state:

```
src/battle-scene.ts:3264:    window["gameInfo"] = gameInfo;      // with a `// TODO: Don't store it here`
```

The rest are a Phaser container's `.width` and two UA sniffs. **No `import.meta.env.DEV`
exposure, no `window.game`, no `window.scene`, no `__PHASER__` hook, no devtools bridge.**
So the ticket's question "does the game deliberately expose anything else" is answered:
no, `window.gameInfo` is the only deliberate export, and it carries no object references.

The payoff: because `BattleScene` is constructed exactly once and calls
`initGlobalScene(this)`, **`game.scene.getScene('battle') === globalScene` by object
identity**. We are not approximating the module singleton; we hold it.

Two supporting facts from `vite.config.ts`, both verified live:

- **`keepNames: true`** across minify/mangle/compress, so class and function names
  survive. Live: `Game`, `BattleScene`, `UI`, `BattleMessageUiHandler`, `TextureManager`,
  `PhaseManager` all read back correctly from `constructor.name`. Usable as runtime
  discriminators — §5's locator duck-types anyway, but the probes rely on this.
- **No production sourcemaps**, and `console.log`/`console.debug` are dropped as pure.
  So there is no name recovery and no lifecycle logging to lean on — which is what makes
  the `Debugger.setBreakpointByUrl` fallback impractical (§7.6).

### 7.5 The scene key, and the `scenes[0]` trap

`super("battle")` in `BattleScene`; `LoadingScene.KEY = "loading"`. `main.ts` passes
`scene: [LoadingScene, BattleScene]` — **two** classes, LoadingScene first.
`LoadingScene` starts `"battle"` when assets finish, then `battle-scene.ts` removes
`LoadingScene`, and `SceneManager.remove` deletes the key and **splices the array**.

Hence: `scenes[0]` is the LoadingScene before that point, the BattleScene after.
`getScene(key)` is a plain lookup in `this.keys`, returning `null` when absent. This is
the correction folded into §5.

Also: `globalScene.game` works because Phaser injects `game` onto the Scene via its
Injection Map; `scene.sys.game` is the belt-and-braces form, which is what route B uses.

### 7.6 CDP, from the protocol and from V8

- **The `Debugger` sequence** (`enable` → `pause` → `paused` event → `callFrameId` →
  `evaluateOnCallFrame` → `resume`) is confirmed, and `Debugger.Scope.type` does include
  `module` and `closure` as first-class scope types. So `evaluateOnCallFrame` resolves
  `globalScene` **if and only if** you pause in a frame whose scope chain includes
  PokéRogue's `global-scene` module — which a blind `pause`, landing in Phaser's rAF
  tick, does not. That is precisely what §4.1 measured. Don't pass
  `terminateOnResume`; it kills the running script.
- **Pause cost is not documented.** The CDP docs say nothing about rAF or lost time;
  the companion file marks that UNDETERMINED rather than inventing a citation, and
  reasons from Phaser's `TimeStep` instead: after a long stall `smoothDelta` discards the
  huge delta, so *game-world* time does not jump, though the real-world accumulator,
  tweens, timers and audio scheduling all drift. My measured 47 ms freeze is the reason
  to avoid it regardless.
- 🔴 **`Runtime.queryObjects` is not experimental** — no flag in `js_protocol.json`.
  Corrects the ticket's premise. It needs a prototype `RemoteObjectId`, which is free
  because `Phaser.Game` is nameable. Note it matches the *exact* prototype, so the same
  trick on `Phaser.Scene.prototype` will **not** find `BattleScene` (whose chain is
  `BattleScene → SceneBase → Phaser.Scene`); go via the Game.
- 🔴 **The command-line `queryObjects()` is not a shortcut.** `includeCommandLineAPI`
  does expose it (live: `typeof queryObjects === 'function'`), but V8's
  `v8-console.cc` shows the callback sets **no return value** — it only emits a
  `Runtime.inspectRequested` notification with a `{queryObjects: true}` hint, and the
  DevTools *frontend* is what then issues the real command. **Verified live:
  `String(queryObjects(Phaser.Game))` → `"undefined"`.** A prediction from V8 source that
  the live tab confirmed exactly. Use the `Runtime.queryObjects` command, never the
  helper.
- **`Runtime.globalLexicalScopeNames`** returns global `let`/`const`/`class` only, so a
  module-scoped `export let` is invisible to it. Live: `[]`. Worth stating because it is
  the obvious-looking answer and it is wrong.
- 🟢 **A non-freezing closure route exists**, unused but worth recording:
  `Runtime.getProperties` exposes `[[Scopes]]` on function objects (V8's
  `v8-debugger.cc` creates it with no `enabled()` guard), so
  `DOMDebugger.getEventListeners(window)` → the `keydown` handler → `[[Scopes]]` →
  `_this.manager.game` reaches the Game **without stopping the page**. Phaser also
  assigns `window.onblur` / `window.onfocus` as plain properties (verified live: both
  `function`), whose closure holds `game.events` — and which double as a nameable
  "a Phaser game is running here" probe. Strictly better than `Debugger.pause` if the
  primary route ever dies. Not verified end to end here.

### 7.7 Where source and live probing disagreed

Worth recording, because it is the argument for doing both:

| Claim | Source said | Live said | Resolution |
|---|---|---|---|
| Render-type constants | `CANVAS: 0`, `WEBGL: 1` | `[AUTO, CANVAS, WEBGL, HEADLESS] === [0,1,2,3]`; pool entries `type: 1`; `renderType: 2` | **Live is right.** The *conclusion* (WebGL canvases aren't pooled) holds either way. |
| `scenes[0]` | a boot-time race — LoadingScene first | one scene, `getScene('battle') === scenes[0]` | **Source is right**; live only looks safe because boot finished. Fallback removed from §5. |
| `queryObjects` experimental? | not experimental | n/a | Source; ticket's premise corrected. |
| Command-line `queryObjects()` usable? | returns `undefined`, fires `inspectRequested` | `"undefined"` | Agreed — source predicted, live confirmed. |
| `window.PHASER_GAME` | stripped from dist | `undefined` | Agreed. |

## 8. Confirmed independently, and one finding that strengthens the verdict

While this ticket was in flight, the session working
[#10](https://github.com/IIxauII/pokerogue-mcp/issues/10) reproduced the locator from a
bare `Runtime.evaluate` on the same live run at wave 4 — 1677 pool entries, **exactly
one** with `parent.constructor.name === "TextureManager"`, reaching
`gameVersion "1.12.0.11"`, one `BattleScene`, `ui.mode`, `money`,
`currentBattle.waveIndex 4`, `enemyParty`, `modifiers.length`. Independent confirmation
on a different wave, by a different session. **The locator holds.**

It also reported a result that settles the `gameInfo` question on grounds stronger than
cost: **`window.gameInfo` is stale at settled decision points.** Updates are
event-driven and coarse — none observed across menu navigation, 30 s idle at a command
menu, a full turn that dealt damage, the faint/EXP/level-up chain, or the reward screen;
only at wave transitions and turn init. At the wave-3 reward screen the screen read
Fuecoco Lv.6 6/24 while `gameInfo` still read L5 9/22 — level, currentHP **and** maxHP
all stale by a turn's damage plus a level-up.

So `gameInfo` is a **wave/turn-boundary snapshot, not a settled-state snapshot**, and it
was never viable for `get_state` regardless of the 0.03 ms it saves. That session also
verified it is write-safe to clobber (nulled mid-battle, no errors, repopulated on the
next update) — consistent with the `// TODO: Don't store it here` in §7.4 and with
nothing reading it back.

**One caveat on my own "useful liveness check" line above**, raised by that session and
worth carrying forward: `gameInfo` does read `gameMode: "Title"` on the title screen, but
because updates are event-driven it is **not established** that a mid-run
`globalScene.reset(true)` rewrites it. If it doesn't, a `gameInfo`-based liveness check
would report `Classic`/wave N for a run that no longer exists — exactly the map's
"Losing a run without wiping" failure. **So: use `gameInfo` at most as an "is the page
alive" probe, and determine run-over from the scene, not from `gameInfo`.** For a pure
liveness probe, `typeof window.onblur === 'function'` (§7.6) is narrower and cheaper
still, since it says "a Phaser game is running" without asserting anything about the run.
