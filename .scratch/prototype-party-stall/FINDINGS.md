# #19 The party-overlay stall, with input withheld — prototype findings

Prototype for [#19](https://github.com/IIxauII/pokerogue-mcp/issues/19). Driven live on the dev's
account (`xauyxau2`, new Classic run in empty slot 0, game `1.12.0.11`, `gameSpeed 3`), Chrome on
port 9222. Throwaway.

## Verdict

**The stall is not a game tail. It is the page being hidden.** While the Chrome window is hidden,
the browser stops `requestAnimationFrame`, so the Phaser loop stops advancing. Any `ui.setMode`
that fades in and out freezes with `ui.overlayActive === true`. It stays that way **for exactly as
long as the page stays hidden**, and **there is no self-recovery**. It clears about 0.2–1.2 s after
the page becomes visible again.

- **Visible tab, 63 trials on the stall path, 0 stalls.** Of these, 60 were CANCEL on the party
  list, run2's path: 20 each after Iron, Rare Candy and TM098. They settled at p50 **412 ms**,
  p95 417 ms and max **418 ms**, and `overlayActive` was never held for more than **105 ms**. The
  other 3 were applies, one of which was **Rare Candy → Apply, run4's exact path: 617 ms**. The
  other two applies are 2 272 ms and 3 071 ms, which is `CHANGE_GRACE_MS`, not overlay time (for
  those, `overlayActive` was ≤ 103 ms and 0 ms). `document.visibilityState` was `"visible"` on
  every one of the 382 logged polls.
- **Hidden window, reproduced on demand, 2 of 2.** CANCEL from the party list to the shop, and
  ACTION from the shop to the party list. Both press nothing further:

  | trial | hidden for | during hold | after restore |
  |---|---|---|---|
  | CANCEL PARTY→shop | 6.96 s (dev restored the window) | `ui-transition`, overlay tween `progress 0`, frame 92942→92947 | shop settled in ~200 ms |
  | ACTION shop→PARTY | **180 s**, clean | `ui-transition`, `overlayActive: true`, tween `progress 0`, frame **108073→108073** (0 frames), one log row the whole hold | PARTY settled in **1.16 s** |

  This is byte for byte the signature of the four historic timeouts: `reason: "ui-transition"`,
  `mode` 8 or 6, `SelectModifierPhase`, fingerprint frozen.

## Why — read from the deployed build (`String(ui.fadeOut)` etc., #11's method)

```js
fadeOut(e){ ... if(this.overlayActive) return t(); this.overlayActive = true; ...
            B.tweens.add({ targets: this.overlay, alpha: 1, duration: e, onComplete: () => t() }) }
fadeIn(e){  ... B.tweens.add({ ... alpha: 0 ... }), this.overlayActive = false }
setModeInternal: this.fadeOut(250).then(() => { B.time.delayedCall(100, () => { doSetMode(); this.fadeIn(250) }) })
```

`overlayActive` is set **synchronously** by the press, and only `fadeIn` clears it. `fadeIn` runs
only after a 250 ms **tween** `onComplete` and a 100 ms **scene clock** `delayedCall`. Both are
driven by the game loop, and the game loop is driven by rAF. With no frames, it never gets there.
Meanwhile `UI.processInput` returns `false` unconditionally while `overlayActive` is set, so no
press can help either. That explains the historic "refused" presses.

## What the settle predicate gets wrong while hidden

Measured with the window minimized at a settled menu (`hidden.mjs`): the frame counter froze for
6 s, **yet the predicate still said `settled: true, reason: "menu-open"`**, and
`game.loop.running === true`. Neither signal notices. So a hidden page does not only stall
transitions. It also makes an idle screen *look* settled, and the next press will then freeze.
**`document.visibilityState` is the direct signal** (0.2 ms, same `Runtime.evaluate`). A
loop-frame delta across two polls is the ground truth behind it.

## Is this what happened in #6? — consistent, not proven

The #6 transcripts never recorded visibility, so this can't be proven after the fact. But
everything fits:

- all four timeouts are on a fade transition;
- the presses during those stalls were refused (`overlayActive` gates `processInput`);
- run2's CANCEL "returned `false` and then moved the state", which is what a press refused during
  the stall, followed by the window becoming visible again, looks like;
- recovery took 34.6 s and ~67 s, a human-attention timescale.

In #6, three sessions shared one tab on the dev's desktop.

**Not excluded:** a *visible-tab* stall at run2's rate. 63 clean trials cannot rule out a
1-in-146 event (rule of three: this sample bounds it below ~5 %). The mechanism above needs a
frozen loop, though, and nothing else on a visible tab stops it.

Also unmeasured: whether hiding stalls non-fade settles (`text-animating` / `resolving` in
battle). Source says it must, since the text timers and battle tweens are on the same loop. Only
fades were driven hidden.

## What it changes

- **#14's constants are not sizing a game distribution.** On a visible tab, the healthy
  party-path settle is ≤ 0.62 s (overlay ≤ 105 ms), so `CALL_BUDGET_MS = 30 000` costs a healthy
  reward **zero** resumes. On a hidden tab the tail is **unbounded and equals hidden time**, so no
  budget can be sized for it. #14's "no fatal clock" stands, now with a cause.
  `NO_PROGRESS_NOTICE_MS` / `BEYOND_OBSERVED_MS` stay labels. There is no tail left to measure.
- **The diagnostic can name it.** `timed_out` (and the busy reason) should carry
  `reason: "page-hidden"` when `document.visibilityState !== "visible"`, taking precedence over
  `ui-transition`. The fix is not waiting. It is making the page visible.
- **The scaffold owns this.** Owned Chrome can be launched so it keeps rendering. Attached Chrome
  cannot be controlled. Either way, the server has to check visibility before it presses.

## Files

| file | what |
|---|---|
| `stall.mjs` | plays a run; at each shop, 20 CANCEL trials plus 1 apply, each input-free until it settles by itself (cap 180 s, then halt without pressing) |
| `probe.mjs` | settle predicate plus `overlayActive`, overlay tween state, timer counts, loop frame, `visibilityState` / `hasFocus` |
| `hidden.mjs` | minimize, sample, restore — no game input |
| `hidden-trial.mjs` | one transition press while hidden, hold, restore, measure |
| `stall.jsonl` | visible-tab run: 63 trials, 3 shops, waves 1–3 (the first line block is a 3 s aborted start, `re.test` bug) |
| `hidden-trial.jsonl` | the three hidden trials. The first is mis-aimed: CANCEL closed the Teach options submenu, which is not a transition, and the fingerprint is blind to `optionsMode` |
| `lib.mjs`, `game.mjs`, `peek.mjs` | copied from `prototype/one-wave` |

The driver stopped on its own oscillation guard. TM098 was taught to a Pokémon that can't learn
it, and the Teach attempt kept re-opening the party list. That was a policy bug, not a stall. The
run is left alive at wave 3, `PARTY/TM_MODIFIER`, slot 0, with Bulbasaur fainted.
