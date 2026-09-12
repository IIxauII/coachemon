# Prototype: one wave, driven by a raw script

Ticket: [#6 One wave, driven by a raw script](https://github.com/IIxauII/pokerogue-mcp/issues/6)
Date: 2026-09-12
Build: live `pokerogue.net`, Chrome 152.0.7977.83, CDP 1.3, `gameSpeed === 3` (not Turbo), tutorials **on**.

**Verdict: the control loop works.** Three waves were cleared end to end with no MCP server, no
abstractions and no vision — structured state in, `ui.processInput` out. The predicate from #3, the
locator from #9 and the family table from #4 all survive contact with a live battle. Four things
need correcting, one of them a genuine hazard.

Everything below is **[live]** unless marked otherwise. The transcripts are the primary evidence:
`run.jsonl` (attempt 1, wiped), `run2.jsonl`–`run6.jsonl` (attempts 2–5).

---

## 1. What was built

| File | What it is |
|---|---|
| `lib.mjs` | Minimal CDP client with round-trip/byte counters; the #9 locator as an injectable prelude |
| `game.mjs` | #3's settle predicate, a generic menu reader over #4's families, a lean snapshot, `press` |
| `one-wave.mjs` | The settle loop + a deliberately dumb policy; drives N waves and logs everything |
| `peek.mjs` | One-shot read of predicate + reader + snapshot |

Run: `node one-wave.mjs --waves 1`. Requires the Chrome from
[#5](https://github.com/IIxauII/pokerogue-mcp/issues/5) on port 9222 with a run in progress.

It is throwaway. It is evidence, not the server.

---

## 2. Does the settle predicate hold across a whole wave?

**Yes, with one correction and one hazard.** Zero settle timeouts across the two clean waves
(31 settles, 424 predicate polls). It never returned early and never hung, except in the case in §6.

**Every in-battle branch #3 could only derive from source actually fired**, which was the main
thing this ticket owed #3:

| `reason` | Fired | Was source-only in #3 |
|---|---|---|
| `resolving` | yes, 191 polls | **yes** — now confirmed |
| `awaiting-action` | yes, 95 polls | **yes** — now confirmed |
| `text-animating` | yes, 49 polls | **yes** — now confirmed |
| `pending-prompt` | yes, 22 polls | no |
| `ui-transition` | yes, 666 polls | no |
| `menu-open` | yes, 153 polls | no |
| `hatching` | **never** | still unverified — no egg hatched |
| `block-input` / `block-input-overlay` / `transitioning` / `block-exit` / `modal-blocking` | **never** | still unverified |

So `hatching` and the five gate branches remain unexercised. Everything on a normal wave's critical
path is now confirmed live.

**`phaseManager.currentPhase.constructor.name` reads cleanly the whole way**, confirming #9's
correction. It never disagreed with `phaseName`. `phaseQueue` is a `PhaseTree`; queue depth is
`levels.reduce(...)`, and it is diagnostics-only as #3 said.

**`ui.overlayActive` is `undefined`, not `false`, until first use** — #9's correction holds, and the
predicate's `=== true` test is the right shape.

### Correction to #3: "two identical consecutive samples" is not sufficient

A press is handled asynchronously, so the first samples after it still describe the *pre-press*
state and the loop can exit before the game has moved. Session #8 hit this independently on
STARTER_SELECT and fixed it with 3 samples + a 500 ms floor.

The sharper fix is to make the settle **relative to the press**: require N agreeing samples *and*
that the fingerprint has left its pre-press value, with a grace window so a genuinely inert press
still returns. With that condition in place, instrumentation shows the 2-sample rule would have
exited early **0 times out of 31 settles** — i.e. the sample count was never the real variable.

```
settled  ⟺  agree ≥ 3  ∧  (fp ≠ preFp  ∨  elapsed > grace)
```

**Cost of the fp-change rule, and it is real:** a press that legitimately does not move the
fingerprint pays the full grace window. This happens — three consecutive identical
`"Bulbasaur grew to\nLv. 6!"` messages are indistinguishable, because `fp` includes the message
text. Measured: 3.06 s, 3.08 s, 3.06 s for those three presses against ~205 ms for a normal
menu-to-menu settle. A shorter grace (500 ms, per #8) buys most of the safety for a fifteenth of
the worst case.

### Correction to #3: the 20 s and 90 s timeouts

Measured on ordinary waves, both are **far** oversized — but see §6 before shrinking either.

| | #3's budget | Observed, clean waves | Observed, worst case |
|---|---|---|---|
| No-progress gap | 20 s | **3.06 s** max | **>20 s** (§6, three times) |
| Total settle | 90 s | **4.29 s** max | **67 s** (§6) |

The clean-wave numbers say 20 s is ~6× larger than needed. The §6 anomaly says do not touch it.

---

## 3. Does generic label + cursor reading survive a wave?

**Yes — every `UiMode` encountered was readable, once SUMMARY was mapped.**

| Mode | Name | Family | Readable | Sample labels read |
|---|---|---|---|---|
| 0 | MESSAGE | F11 | yes | (no options; `message.text`) |
| 1 | TITLE | F1 | yes | `Continue / New Game / Load Game / Run History / Settings` |
| 2 | COMMAND | F3 | yes | `Fight / Ball / Pokémon / Run` |
| 3 | FIGHT | F3 | yes | `Tackle / Growl / Vine Whip / -` |
| 5 | TARGET_SELECT | F9 | yes | `Weedle (HP 19/19) / Bidoof (HP 21/21)` |
| 6 | MODIFIER_SELECT | F5 | yes | `Reroll / Manage Items / Check Team / Lock Rarities / TM036 - Double Team / Dire Hit` |
| 8 | PARTY | F4 | yes | slots, and options `Apply / Send Out / Teach` |
| 9 | SUMMARY | F10 | **initially NO** | fell through to `unmapped`; now mapped |
| 14 | CONFIRM | F1 | yes | `Yes / No` |

Nine modes. **No mode was reached that #4's table failed to describe** — the one unreadable case
was a family I had not implemented, not a family that does not exist. `ui.handlers[ui.mode]`
identified the handler correctly every time, and `handler.constructor.name` always matched.

### Correction to #4: the party option list sorts by `y` ASCENDING, not descending

#4 says the option phase is "rendered bottom-up — sort text children by `y` **descending**, and
index *i* of that sorted list is `optionsCursor === i`".

**That is backwards, and it silently selects the wrong option.** Sorting descending produced
`[Cancel, Pause Evolution, Rename, Pokédex, Summary, Apply]`; acting on `optionsCursor === 1` under
that order picked what the reader called "Pause Evolution" and the game opened **Summary**.
Sorting **ascending** gives `[Apply, Summary, Pokédex, Rename, Pause Evolution, Cancel]`, which
matches the cursor exactly.

Confirmed three times, with three different verbs at index 0:

| Trigger | `partyUiMode` | Index 0 (ascending) | Outcome |
|---|---|---|---|
| Rare Candy | 4 `MODIFIER` | `Apply` | Bulbasaur → Lv. 6 |
| Bulbasaur fainted | 1 `FAINT_SWITCH` | `Send Out` | Charmander sent out |
| TM036 Double Team | 6 `TM_MODIFIER` | `Teach` | Charmander learned Double Team |

The action verb is always index 0 and `Cancel` is always last — which is also the sane default for a
`select_option` implementation.

**The general rule this implies** (sharpened by session #8, whose starter-select path never hit the
bug): **check for `handler.config.options` first, and never touch scene geometry when it exists.**
That array is already in cursor order and its labels come back clean — #8 read
`[Classic, Daily Run, Cancel]`, `[Add to Party, Toggle IVs, …, Cancel]` and `[Yes, No]` straight off
it with no BBCode and no sorting. Both the ordering bug and the BBCode stripping below are
artefacts of the **PARTY option phase specifically**, which has no `config.options` and forces the
reader to reconstruct order from the scene graph. Framing it as "did you check `config.options`
first?" turns a whole class of ordering bugs into a single early return.

### Correction to #4: party option labels are BBCode

They come back as `[shadow]Apply[/shadow]`. They must be stripped (`/\[\/?[^\]]*\]/g`) before being
shown to Claude or matched against. #4 mentions BBCode for mystery-encounter options but the party
option phase needs it too.

### Addition: `PARTY` is two different questions behind one `UiMode`, and cancelling the wrong one loops forever

This was the single worst failure of the prototype (§7). `partyUiMode` distinguishes them and
**must** be read:

- **Dismissible** — 0 `SWITCH`, 2 `POST_BATTLE_SWITCH`, 8 `MODIFIER_TRANSFER`, 11 `CHECK`. CANCEL exits.
- **Must answer** — 1 `FAINT_SWITCH`, 3 `REVIVAL_BLESSING`, 4 `MODIFIER`, 5 `MOVE_MODIFIER`,
  6 `TM_MODIFIER`, 7 `REMEMBER_MOVE_MODIFIER`, 12 `SELECT`. **CANCEL re-opens the screen**, because
  `SelectModifierPhase` has not been satisfied.

Values 4 and 6 were read live; the rest are the source enum order and should be treated as
source-derived.

---

## 4. Is `processInput` alone sufficient?

**Yes for every screen on a wave's critical path — but its return value cannot be trusted.**

Across all runs: **51 presses, 49 returned `true`, 0 screens required the raw keyboard.** The one
raw-keyboard fallback that fired (§6) also did nothing, so it bought nothing.

**The return value lies in both directions.** Session #8 found `Button.STATS` on STARTER_SELECT
returning `false` while performing the action. I logged the same shape independently:

- **1 false negative** — `processInput` returned `false`, and the state moved anyway
  (`kind: "processInput-LIED"` in `run4.jsonl`).
- **1 true refusal** — returned `false`, state did not move.

A press tool that retries on `false` will **double-apply**. The rule is: *treat the return value as
a hint, decide by re-reading state.* The settle loop already re-reads state, so the check is free —
compare the post-settle fingerprint against the pre-press one.

`setCursor`/`setRowCursor` fast paths were used only for the shop (F5, `setRowCursor(1)` then
`setCursor(0)`), exactly as #4 sanctions, and worked every time. Everything else was press-driven.

---

## 5. What does one wave actually cost?

Two clean waves, measured end to end from one COMMAND prompt to the next, shop included.

| | Wave 3 → 4 | Wave 4 → 5 |
|---|---|---|
| Wall clock | **13.9 s** | **26.6 s** |
| Presses (decisions + navigation) | 11 | 18 |
| Screens read (`READER` calls) | 11 | 18 |
| Settles | 12 | 19 |
| Predicate polls | 146 | 278 |
| **Total CDP round-trips** | **170** | **316** |
| **Bytes returned** | **43.3 KB** | **82.5 KB** |
| Settle timeouts | 0 | 0 |
| p50 round-trip | 0.97 ms | 0.96 ms |

Wave 4→5 is the expensive one because it contained a faint + forced switch, a TM reward with a
party target, and a trainer encounter.

**The shape of the cost matters more than the total.** Round-trips break down as roughly
**86 % settle polls, 7 % screen reads, 7 % presses**. The polls are nearly free per call (~1 ms,
~300 bytes) but they dominate the count, and **none of them ever reach Claude** — they are the
server talking to itself.

What Claude actually sees is one screen read per decision: **11–18 reads per wave**. That is the
number that sizes the token budget, and it is small. At ~200–400 tokens per lean snapshot, a wave
costs Claude on the order of **4–7 K tokens**, not 80 KB.

Two consequences for the server:

1. **Tiering is confirmed as a token decision, not a wire decision** — #9 already measured the
   fat/lean gap at 0.06 ms. Nothing here contradicts that.
2. **Navigation presses are worth eliminating.** 1 of 11 and 1 of 18 presses were pure cursor
   movement here only because the policy mostly wanted index 0. A wave where Claude picks move 3
   and party slot 4 would add several round-trips per decision; the `setCursor` fast path for
   F1/F2/F3/F5/F9 removes them.

---

## 6. The hazard: `overlayActive` stuck true for 67 s

**The one thing that broke badly.** Applying a **Rare Candy** from the wave-1 shop left the
predicate reporting `reason: "ui-transition"` — i.e. `ui.overlayActive === true` — continuously for
**~67 s**, tripping three consecutive 20 s no-progress timeouts before the game recovered on its own
and displayed `"Bulbasaur grew to\nLv. 6!"`.

Evidence it is not an artifact of my own presses: **the first 20 s window contains zero input.** The
Apply press is at `t=3305`; the first timeout fires at `t=23374` with no press in between.

```
 3305  PRESS ACTION party:option "Apply"
23374  *** SETTLE-TIMEOUT no-progress   reason=ui-transition mode=8 PARTY  (no input since 3305)
43465  *** SETTLE-TIMEOUT no-progress   reason=ui-transition
63572  *** SETTLE-TIMEOUT no-progress   (raw keyboard fallback also did nothing)
70454  settled after 6877 ms            → MESSAGE "Bulbasaur grew to Lv. 6!"
```

This **contradicts #3's claim** that `fadeIn` clears `overlayActive` synchronously so
"a straight `overlayActive === true ⇒ busy` rule has no false-busy tail". There is a tail, and on
this path it is three orders of magnitude longer than the 250 ms fade #3 reasoned from.

I did **not** determine the cause, and I am not going to guess between "the level-up display runs
under an overlay", "`fadeIn` is not called on the `SelectModifierPhase` → `LevelUpPhase` path" and
"`processInput` returning `false` under `overlayActive` deadlocked the prompt". It reproduced once,
in one run, and the later waves applied a TM through the same party path with no stall — so it is
**not** every party-targeted reward.

Practical consequences, and they are the load-bearing part:

- **Do not shrink the 20 s no-progress timeout** on the clean-wave evidence in §2. It would have
  fired three times here on a run that was fine.
- **A settle timeout must not be treated as fatal.** Had the server aborted the run at the first
  timeout, it would have killed a perfectly healthy game 47 s before it recovered. The right
  behaviour is to report and keep polling to the hard timeout.
- **`overlayActive` alone is not a sufficient busy signal.** It needs a corroborator, or the
  timeout model in "Timeout and error model" (still fog on the map) has to be built assuming
  false-busy stalls of ~1 minute are possible.

This is the one finding here that should change a decision, and it belongs with
[#13 Detecting and escaping a stuck screen](https://github.com/IIxauII/pokerogue-mcp/issues/13).
It is the **mirror image** of the trap #13 was filed from: #13's SUMMARY case is
*stuck but looks settled*; this is *settled-looking work that looks stuck*. A detector that only
handles one will make the other worse — a server that declares "stuck" at 20 s and starts pressing
to escape would have pressed blindly into a healthy game for 47 s here, which is exactly how a live
run gets corrupted. Both cases need the same detector, and it cannot be a timeout alone.

---

## 7. What else broke

**Infinite loop: shop ↔ party, 147 iterations.** The first real attempt picked "Rare Candy" (a
party-targeted reward), got the PARTY screen, treated it as a menu it could back out of, pressed
CANCEL, and landed straight back in the shop. Forever. Caught by the human watching, not by the
script.

Two lessons, both cheap:

1. The fix is §3's `partyUiMode` MUST_ANSWER set.
2. **A same-mode streak counter does not catch this**, because the mode alternates 6 → 8 → 6 → 8.
   A *fingerprint* repetition counter over a sliding window does, and caught it in 8 actions on the
   next attempt. Any unattended loop needs the fingerprint version.

**The SUMMARY trap.** PARTY → ACTION on the wrong option → SUMMARY (mode 9), where ACTION is
rejected indefinitely and only CANCEL exits. Flagged by session #8 before it cost me anything;
combined with the ascending/descending bug in §3, a naive "pick the first option" policy walks into
it every time.

**The run I started on was wiped.** Attempt 1 resumed the dev's real wave-6 save, fought a double
battle with a policy that always picked move slot 0, and lost. `sessionData_xauyxau2` was deleted
and `Continue` disappeared from TITLE. This is the risk
[#5](https://github.com/IIxauII/pokerogue-mcp/issues/5) recorded and accepted, and it is also the
cleanest evidence anyone has for
[#11](https://github.com/IIxauII/pokerogue-mcp/issues/11): there is **no distinct game-over
`UiMode`** — `GameOverPhase` runs in MESSAGE and hands off to TITLE — so the discriminator is
`Continue` vanishing from TITLE's F1 options, plus the `sessionData` key being *deleted* rather than
stale.

**Three sessions shared one browser tab.** Sessions #6, #8 and #11 were live against the same
canvas on the same real account. Nothing was corrupted, but only because we coordinated by hand.
Worth noting for "Server scaffold and CDP session": **tab ownership needs an explicit answer**, not
just attach-else-launch.

---

## 8. Settings the profile still needs

Neither #8 nor I changed these, deliberately — they are global settings on the dev's real account
and changing them mid-measurement would have invalidated both our numbers.

| Setting | Now | #3 recommends | Evidence from this run |
|---|---|---|---|
| Game Speed | **3** | 5 (Turbo) | all timings here are at 3; Turbo should cut scaled animation ~1.7× |
| Tutorials | **on** | off | five tutorial MESSAGE prompts fired *mid-battle* at wave 6, +5 round-trips and the `tutorialActive` trap |

`tutorialActive` never actually fired on the waves I drove, so the trap in #3 §6 case 1 remains
source-derived — but the tutorials themselves are real and cost presses.
