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
| `type` of every entry | `1` (CANVAS/2D) |

Two things follow:

- **The pool grows with text rendering, not with time.** Idle 30 s added nothing; a
  few minutes of menu navigation added 13. Freed slots are nulled in place and
  reused rather than spliced, so indices are stable.
- **The game's own display canvas is not in the pool.** The single DOM canvas is
  1920x1080 and *absent* from the pool — as expected for a `WebGLRenderer`, which
  creates its canvas directly. Confirmed `game.canvas === document.querySelector('canvas')`,
  and the DOM canvas carries **no** expando properties (own-property scan: empty).

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

Caveat worth stating: route B is empty **before the first text renders**, and route A
is empty before the `TextureManager` boots. Both are therefore lazy — see §6.

## 4. Mechanisms measured and ranked

All figures are full CDP round trips, warm websocket, same live tab, ordered best
to worst.

| # | Mechanism | p50 | Verdict |
|---|---|---|---|
| **M1** | `Runtime.evaluate`, rediscover via `CanvasPool` **every call** | **0.20 ms** | **Chosen.** Stateless, no page mutation, no handle to invalidate. |
| M1b | discovery expression alone, no payload | 0.11 ms | Discovery is free; the payload is the cost. |
| M2 | `Runtime.evaluate` once -> keep `objectId` -> `Runtime.callFunctionOn` | 0.16 ms | **No faster than M1** (0.16 vs 0.20 ms, inside the noise) and adds a handle that dies on navigation/context destroy. Complexity for nothing. |
| M4 | `window.gameInfo` only | 0.18 ms | **Not cheaper than reading the whole scene.** Partial data at full price. |
| M3 | `Runtime.queryObjects` on `Phaser.Game.prototype` | **470 ms** | Works — finds exactly **1** `Game` — but ~2500x slower (heap scan), and `experimental`. Unusable for polling; only a diagnostic. |
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
  const P = globalThis.Phaser;
  if (!P?.Display?.Canvas?.CanvasPool) return { ready: false, why: 'no-phaser' };
  const pool = P.Display.Canvas.CanvasPool.pool;
  if (!Array.isArray(pool) || pool.length === 0) return { ready: false, why: 'empty-pool' };

  let game = null;
  for (let i = 0; i < pool.length; i++) {              // route A: TextureManager -> .game
    const p = pool[i] && pool[i].parent;
    if (p && p.game && p.game.scene) { game = p.game; break; }
  }
  if (!game) for (let i = 0; i < pool.length; i++) {   // route B: any GameObject -> .scene.sys.game
    const p = pool[i] && pool[i].parent;
    if (p && p.scene && p.scene.sys && p.scene.sys.game) { game = p.scene.sys.game; break; }
  }
  if (!game) return { ready: false, why: 'no-game-in-pool' };
  if (!game.isBooted || !game.isRunning) return { ready: false, why: 'not-booted' };

  const scene = game.scene.getScene('battle') ?? game.scene.scenes[0] ?? null;
  if (!scene || !scene.ui) return { ready: false, why: 'no-battle-scene' };
  return { ready: true, game, scene };
})()
```

Measured on the live tab, returning a small summary instead of the raw objects:
**0.20 ms p50** (min 0.12, p90 0.34, max 2.75 over 50 evaluates) ->
`{ready: true, version: "1.12.0.11", sceneCtor: "BattleScene", mode: 6, handlers: 48}`.

Degradation verified by simulating each failure against the live page:

| Simulated | Returns |
|---|---|
| `Phaser` absent | `{ready: false, why: 'no-phaser'}` |
| pool empty | `{ready: false, why: 'empty-pool'}` |
| every entry freed (`parent: null`) | `{ready: false, why: 'no-game-in-pool'}` |
| route A disabled | `{ready: true, ...}` — **falls through to B and still works** |

`ui.handlers.length === 48` and `game.config.gameVersion === "1.12.0.11"` both read
straight off this, so [#2](https://github.com/IIxauII/pokerogue-mcp/issues/2)'s two
free drift checks come along for nothing.

### Scene accessor

`game.scene.scenes` contains **exactly one** scene, key `"battle"`, ctor
`BattleScene`, `active: true`, `visible: true`, `status: 5`. So
`getScene('battle') === scenes[0]` — confirmed `true` live. No `LoadingScene`
remains registered after boot, so the index cannot shift, but `getScene('battle')`
with a `scenes[0]` fallback costs nothing and survives a future second scene.

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
  one real advantage is that it needs no locator at all, which makes it a useful
  liveness check.
