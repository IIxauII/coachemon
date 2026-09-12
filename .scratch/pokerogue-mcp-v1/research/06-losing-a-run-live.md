# Research: telling a wipe from a run lost to a failed save (live half)

Ticket: [#11 Telling a wipe from a run lost to a failed save](https://github.com/IIxauII/pokerogue-mcp/issues/11)
Date: 2026-09-12

## Sources

- **[live]** `https://pokerogue.net` in the persistent profile from [#5](https://github.com/IIxauII/pokerogue-mcp/issues/5) (`~/.pokerogue-mcp/chrome-profile`, port 9222), logged in as `xauyxau2`. Chrome 152.0.7977.83, `game.config.gameVersion === "1.12.0.11"` — the build [#2](https://github.com/IIxauII/pokerogue-mcp/issues/2) pinned to. Every probe was a bare `Runtime.evaluate` over a raw CDP websocket from a Node 25 client, plus passive `Network.enable` / `Runtime.enable` / `Log.enable` listeners and one `Page.captureScreenshot`.
- **[live]** `localStorage` values read out over CDP and decrypted **client-side, in Node**, with the hardcoded public `saveKey = "x0i2O7WRiANTqPmZ"` (`constants.ts:56`). #10 noted this was possible but did not exercise it; it is exercised here. Nothing was written back.
- The scene locator and the timing method are [#9](https://github.com/IIxauII/pokerogue-mcp/issues/9)'s, reused verbatim.
- The companion source-side write-up is [`06-losing-a-run-source.md`](./06-losing-a-run-source.md).

Claims are tagged **[verified]** (measured here), **[inferred]** (reasoned from measurements, not exercised), or **[not exercised]**.

**This session was strictly read-only.** The CDP client refused `Input.*`, `Fetch.*`, `Network.emulate*`, `Page.navigate`/`reload`/`close` and `Storage.clear` at the `send()` layer. No button was pressed, no `processInput`, `saveAll`, `reset` or `clearSession` call was made, and no storage key was written, cleared or deleted.

---

## 0. Answer up front

**The stateless discriminator is `runHistoryData_<user>`. It is local-only, it is written on a wipe and cannot be written on a save failure, and it needs no scene handle.**

| After the run is gone | wipe | save failure |
|---|---|---|
| `runHistoryData_<user>` | **new entry appended**, keyed by end-timestamp, carrying `isVictory: false` | **[inferred]** unchanged |
| `gameData.gameStats` | **[verified]** unchanged but for `playTime` | unchanged |
| `window.gameInfo` | Title payload | Title payload — identical, per #10 |
| `sessionData_<user>` | **removed** | ~~left behind, stale~~ — **not a discriminator, see below** |

The wipe column is **measured**, not reasoned: a real run ended during this session (§1) and I captured the before/after.

**Two things I got wrong in an earlier draft, both corrected by reading the game's own live function bodies (§7).** I am stating them up front because I had already reported both as findings:

- **`sessionData_<user>` presence is not the signal.** `saveAll` writes `localStorage` **before** it calls the network and never rolls back, so a failed save leaves the session key written *fresh*, not stale — and two of the four teardown paths delete it anyway, cutting across the wipe/failure line. The measurement (a wipe deleted the key) stands; what it *proves* does not.
- **`lastSavePlayTime` is not a save-failure canary.** `B.lastSavePlayTime = 0` runs after the `await`, gated only on the `sync` flag and **not on the outcome**, so a failed sync save resets it just like a successful one; it measures time since the last sync save *attempt*. My two live verifications of the reset stand — but both were against saves that succeeded, so they could not tell the two readings apart. **Both halves of this ticket confirm this independently**, from opposite directions: the deployed bytes (§6) and the source at the pinned ref (`game-data.ts:1379-1387`). And §6 gives the stronger reason no such alarm can exist at all — there is no state in which a save has failed and the run is still playable.

**The live signal is `phaseManager.getCurrentPhase().phaseName`**, which the companion source read establishes and which I costed here at **0.21 ms / 21 bytes** (§9) — 0.2 % of a 100 ms settle poll. `"GameOverPhase"` means wipe; `"LoginPhase"` mid-session means a `reset(true)` teardown. It is a **settle-loop** signal: the phase is gone by the time the title screen settles, so a server that only looks afterwards has missed it, and falls back to run history.

---

## 1. What happened while I was probing: the run ended

This has to come first, because it is both the reason the findings below are measured rather than inferred, and a real loss to a real person.

The brief said the tab held a Classic run parked at roughly wave 5. It did not. **The run ended at `2026-09-12T15:05:54.241Z`, about three minutes after I started probing.** I did not cause it, and the evidence is in the timeline:

| Time (from in-page timestamps) | Observed |
|---|---|
| `14:49:29.730Z` | `sessionData_xauyxau2` last written: `waveIndex 6`, saved and quit. #10's wave-5 run, advanced one wave. |
| `15:02:58Z` | I join. Probe 1: `ui.mode 1` (**TITLE**), `TitlePhase`, `party.length 0`, `currentBattle null`, `money 0`. `sessionData_xauyxau2` present (5632 b). `runHistoryData_xauyxau2` present but **the empty string**. |
| between probes 1 and 3 | Probe 3 catches the scene **mid-battle**: `ui.mode 0` (MESSAGE), `phaseManager.currentPhase === "DamageAnimPhase"`, `currentBattle` populated. |
| `15:05:54.241Z` | The run ends. A run-history entry is written with exactly this timestamp. |
| `15:05:54.242Z` | `data_<user>` (the account save) is rewritten, 1 ms later. |
| after | `ui.mode 1` / `TitlePhase` again; `sessionData_xauyxau2` **gone**; `runHistoryData_xauyxau2` grown **0 → 5996 bytes**. |

Going from a settled title screen to *in a battle taking damage* requires pressing Continue and then choosing a move. My client blocks `Input.*` at the send layer and every call I made was a side-effect-free `Runtime.evaluate`. So the tab was being driven by something outside this session.

**The actor was identified afterwards:** a peer session working ticket #6, the "one wave driven by script" prototype. It resumed wave 6 via Continue, ran a deliberately dumb policy (always Fight, move slot 0), KO'd a Weedle on turn 3, and lost Fuecoco to a Bidoof on turn 4 with no reserves. Its own log records `MESSAGE (mode 0)` "Fuecoco fainted!" → one ACTION press → 3.9 s of transition → `TITLE (mode 1)`. My `DamageAnimPhase` sighting is that battle.

So **two sessions were on the dev's real account at once** — this one read-only, the prototype pressing buttons — while this ticket had been told the run was parked. That is a coordination bug, and it is the reason the run is gone.

Ground truth for the ending, from `Page.captureScreenshot`: the title menu reads **"New Game / Load Game / Run History / Settings"**. There is no "Continue". The session is gone and is not recoverable.

Later the tab moved to `ui.mode 10` / `SelectStarterPhase` (**STARTER_SELECT**) as the #8 session began a fresh run, so it was in use throughout.

**The upside, stated plainly:** the ticket asked what a wipe leaves behind, and said the title screen could not be reached without destroying the run. The run was destroyed by someone else, so I got the measurement for free and did not have to spend it. Everything in §3, §4 and §5 is a real before/after across a real wipe.

### A caveat that applies to everything below

**Every measurement in this document was taken on a contended tab** — #6 through the wipe, then #8 starting a fresh run. So:

- Any two readings taken apart in time may have had the game moved under them. Where a claim depends on a before/after pair I say so, and say what could have moved between.
- The before/after across the wipe (§3, §4, §5) is sound *because* the peer's actions are what produced the transition — I am measuring its effects, not racing it.
- The listener windows in §10 are **not** controlled idles. They are "what the game did while someone else was using it", and are labelled that way rather than as a quiet game.
- Single-shot reads were preferred throughout over anything assuming stability across calls.
- One measurement was **too short because of the contention**, and it cost an inference: §6's 330 s window never crossed a wave boundary, which is exactly what would have separated a one-wave sawtooth from a five-wave one.

## 2. The `localStorage` inventory

Eight keys before the wipe, seven after. Sizes are `String.length` of the stored value.

| Key | Bytes | Encrypted | What it is |
|---|---|---|---|
| `data_xauyxau2` | 297 408 | **yes** | the account save — dex, starters, `gameStats`, unlocks, eggs |
| `sessionData_xauyxau2` | 5 632 | **yes** | the in-progress run. **Removed by the wipe.** |
| `runHistoryData_xauyxau2` | 0 → 5 996 | **yes** | ended-run archive. **Written by the wipe.** |
| `settings` | 45 | no | `{"PLAYER_GENDER":0,"gameVersion":"1.12.0.11"}` |
| `mappingConfigs` | 1 469 | no | key→button bindings |
| `tutorials` | 156 | no | seen-tutorial flags |
| `seenDialogues` | 39 | no | seen-dialogue flags |
| `prLang` | 2 | no | `"en"` — the locale #10 warns about |

`sessionStorage` is empty. `indexedDB` exists but the game does not appear to use it for saves. One cookie, `pokerogue_sessionId` (#5's). `window.CryptoJS` is `undefined` — the library is bundled, not global, so decryption has to happen outside the page (which is what I did).

The three encrypted values are all CryptoJS-passphrase / OpenSSL `Salted__` format (`U2FsdGVkX1…` base64). Decrypting them is EVP_BytesToKey with MD5, one iteration, 32-byte key + 16-byte IV, AES-256-CBC — about 20 lines of Node `crypto`, no dependency:

```js
const raw = Buffer.from(b64, 'base64');            // "Salted__" + 8-byte salt + ciphertext
const salt = raw.subarray(8, 16);
let d = Buffer.alloc(0), prev = Buffer.alloc(0);
while (d.length < 48) { prev = crypto.createHash('md5')
  .update(Buffer.concat([prev, Buffer.from(SAVE_KEY, 'binary'), salt])).digest(); d = Buffer.concat([d, prev]); }
const dec = crypto.createDecipheriv('aes-256-cbc', d.subarray(0, 32), d.subarray(32, 48));
JSON.parse(Buffer.concat([dec.update(raw.subarray(16)), dec.final()]).toString('utf8'));
```

**[verified]** All three decrypt cleanly. Cost is negligible — §9.

## 3. `runHistoryData_<user>` — the stateless signal

This is the ticket's answer for a server that was **not watching** when the run ended. (For one that is watching, the live signal is `phaseName` — §11.) Before the wipe the key held the **empty string**; after, 5 996 bytes of ciphertext decrypting to 4 473 bytes of JSON:

```json
{ "1789225554241": { "entry": { … }, "isVictory": false, "isFavorite": false } }
```

**[verified] Shape:** an **object keyed by end-timestamp in epoch ms** (not an array), one property per ended run. `1789225554241` is `2026-09-12T15:05:54.241Z`. Each value has exactly three keys: `entry`, `isVictory`, `isFavorite`.

**[verified] `isVictory: false`** — the flag the ticket hoped for, and it is a sibling of `entry`, not buried inside it.

**[verified] `entry` is a full `SessionSaveData`** — the same shape as `sessionData_<user>`, snapshotted at the end:

```
seed, playTime 917, gameMode 0, arena{biome 0}, pokeballCounts, money 1110, score 88,
waveIndex 6, battleType 0, trainer null, gameVersion "1.12.0.11",
timestamp 1789225554241, challenges [], mysteryEncounterType -1,
mysteryEncounterSaveData, playerFaints 1
```

with `party: [{species 909, level 8, hp 0}]` and `enemyParty: [{species 13, level 5, hp 0}, {species 399, level 5, hp 21}]`.

Three things in there are load-bearing:

- **`playerFaints: 1`** — a field `sessionData` does *not* carry. It is present on the run-history entry only.
- **`party[].hp` is `0`** — the recorded party is the wiped party. A victory or a save-and-quit would not look like this.
- **`entry.waveIndex 6`** matches the pre-wipe `sessionData.waveIndex 6`, so the entry tells the server exactly how far the lost run got — which is what an agent needs to report.

**[verified] The in-memory copy is not a substitute.** `scene.gameData.runHistory` read `{}` at the title screen *while* `localStorage["runHistoryData_xauyxau2"]` held 5 996 bytes. It is lazily populated (`GameData.getRunHistoryData()` is on the prototype and was not called). **Read the `localStorage` key, not the scene field.** A server that checked `gameData.runHistory` would have concluded no run had ever ended.

**[inferred] Why this separates the two cases.** A wipe ends through `GameOverPhase`, which is presumably what archives the run; the save-failure path at `encounter-phase.ts:304` calls `globalScene.reset(true)` directly, with no game over, so there would be nothing to archive. **From the live side I can only assert the measured half** — a wipe writes an entry. Whether the save-failure path reaches `saveRunHistory` is a source question, and the companion document owns it — its answer is that `GameOverPhase` (`game-over-phase.ts:215`) is the only writer repo-wide, which makes the asymmetry real. §7 adds the live half of the argument: the write path is **local-only**, so the network condition that causes a save failure cannot also suppress the history entry.

**A caveat the server must handle.** The key existed and held the **empty string** before any run had ended. `''` is not valid ciphertext — decryption throws on the `Salted__` check. So the presence of the key proves nothing; the server must treat empty-or-unparseable as "no history" rather than as an error. §7 gives the cause: `getRunHistoryData()` *creates* the key empty when it is absent.

### The fresh-run window, and why it is not a hazard

A worry worth closing: between a wipe and the next run's first save, is there a window in which a freshly-started run and a wiped account look storage-identical — so that a `run_over` check fires on a run that is actually alive?

**[verified] No, not at settle granularity.** My 5 s probe across the peer's fresh start caught the transition in a single sample:

| probe | phase | `sessionData` key | wave |
|---|---|---|---|
| t=85 s | `SelectStarterPhase` | **absent** | — |
| t=90 s | `EncounterPhase` | **present** | 1 |

The session key, `currentBattle` and a non-empty `party` all appear **together**, in the same sample, at the same moment the first save POSTs (§10). There is no observed interval where the run is live but storage is empty. A peer session independently reported the same flip at settle granularity, and reported the committed key at 6 316 bytes.

The residue is that my sampling was 5 s, not 100 ms, so a sub-second window could hide inside it. But the two states that would matter — "party non-empty" and "session key present" — are both false before and both true after, so a `run_over` predicate built on `party.length === 0` is safe regardless of which flips first within that window.

## 4. `gameStats` — a measured negative

The ticket named `gameStats.sessionsWon` as a candidate. **It is not the signal, and neither is anything else in the object.**

**[verified]** Full `gameStats`, 36 keys, read off `scene.gameData.gameStats` before and after the wipe:

| Counter | before | after |
|---|---|---|
| `playTime` | 1903 | 2003 → 2150 (ticks at 1 Hz) |
| `battles` | 22 | **22** |
| `classicSessionsPlayed` | 3 | **3** |
| `sessionsWon` | 0 | **0** |
| `trainersDefeated` | 5 | **5** |
| `pokemonDefeated` | 35 | **35** |
| `highestLevel` | 9 | **9** |
| `highestMoney` | 1110 | **1110** |
| `highestDamage` | 21 | **21** |

Everything else (`ribbonsOwned`, the daily/endless counters, the seen/caught/hatched families, `pokemonFused`, the egg counters) was zero throughout.

**Nothing moved across the wipe except the free-running `playTime` clock.** Two consequences:

- **`classicSessionsPlayed` increments at run *start*, not at run *end*.** It was 3 before the wipe and 3 after, on an account that had just finished its third classic run. So it cannot mark an ending of either kind.
- **`sessionsWon` only moves on a victory**, which is neither of the two cases this ticket is about. Comparing it across a run end will read `0 → 0` for a wipe and `0 → 0` for a save failure.

A server could in principle snapshot `gameStats` before a wave and diff it after, but there is no counter whose movement distinguishes the paths, so the diff would be uninformative. **Drop `gameStats` as a candidate.**

## 5. `sessionData_<user>` — decrypted, and removed by the wipe

**[verified]** Decrypted pre-wipe, 4 202 bytes of JSON, 22 top-level keys:

```
seed, playTime, gameMode, party, enemyParty, modifiers, enemyModifiers, arena,
pokeballCounts, money, score, victoryCount, faintCount, reviveCount, waveIndex,
battleType, trainer, gameVersion, timestamp, challenges, mysteryEncounterType,
mysteryEncounterSaveData
```

Values at the parked wave: `waveIndex 6`, `money 1110`, `score 88`, `playTime 892`, `gameVersion "1.12.0.11"`, `timestamp 1789224569730`, party `[{species 909, level 8, hp 24}]`, enemy `[{species 13, L5, hp 19}, {species 399, L5, hp 21}]`, modifiers `TEMP_STAT_STAGE_BOOSTER` and `LURE`.

This confirms #10's list and adds the fields it did not name: **`victoryCount`, `faintCount`, `reviveCount`, `score`, `seed`, `challenges`, `timestamp`**. Note `sessionData` has **no `playerFaints`** — that field appears only on the run-history entry (§3) — and **no `isVictory`**.

**[verified] The wipe removed the key entirely.** `localStorage.getItem('sessionData_xauyxau2')` returned `null` afterwards, and the key was absent from `Object.keys(localStorage)`.

**[verified] The game agrees, at three independent levels.** The title menu offers no "Continue" (screenshot); `TitleUiHandler.config.options` reads `["New Game", "Load Game", "Run History", "Settings"]`; and the browser's buffered log carries the game's own `GET https://api.pokerogue.net/savedata/session/get?slot=0&clientSessionId=…` returning **404** with the body `"save does not exist\n"` — i.e. the server-side session is gone too. So "no resumable run" is not just a local-storage fact.

**~~The save-failure case is the mirror image.~~ Withdrawn.** An earlier draft of this document — and a status message I sent on the strength of it — claimed that a failed `saveAll` would leave `sessionData_<user>` behind stale, making key presence a one-call discriminator. **That is wrong, twice over:**

- **§7** shows `saveAll` writes both `localStorage` keys *before* it calls the network and never rolls back. A save failure therefore leaves the session key written **fresh, at the current wave** — the local copy always succeeds; only the server copy is missing.
- **[from source]** the key is cleared on **two of the four** endings and kept on the other two, and the split cuts *across* the wipe/failure line rather than following it:

| Ending | `sessionData<slot>_<user>` |
|---|---|
| clean wipe | **cleared** — `tryClearSession` → `removeItem` (`game-data.ts:1218`) |
| save failure, `verify()` / "out of date" flavour | **cleared** — `reinitializeSaveData` → `clearLocalData()` (`game-data.ts:612-620`) |
| save failure, plain "server said no" | **written fresh** |
| Save & Quit | **written fresh** |

**So state the measurement precisely: this wipe removed the key.** Not "wipes remove it and failures keep it" — that generalisation is false, and an earlier draft of this document asserted it. The key does not discriminate in either direction, and it is slot-scoped besides (§7.1).

**[from source] The premise the ticket was written on is also gone.** A clean wipe calls `globalScene.reset()` with `clearScene = false`; only *failure* paths pass `true`. So the two endings are **structurally different teardowns**, not the shared `reset(true)` that #10 and this ticket assumed — which is why a phase trace separates them cleanly and a stored artefact does not.

The discriminator is `phaseName` live and run history after the fact (§11).

## 6. `lastSavePlayTime` — what it measures, and what it does not

Found while inventorying the scene, and it is the most useful thing in this document after §3, because it catches the fault *before* the run is lost rather than explaining it afterwards.

**[verified]** `BattleScene` carries two sibling counters, `sessionPlayTime` and `lastSavePlayTime`. Both tick at 1 Hz off the scene's `playTimeTimer`, alongside `gameStats.playTime` — measured 24 increments each over 25.0 s wall-clock.

**`lastSavePlayTime` is seconds since the last sync save *attempt*.** I first read it as "since the last successful save" and verified *that* two independent ways — but both verifications happened to be against saves that succeeded, which is exactly why they could not distinguish the two readings. The code (below) settles it in favour of "attempt". The measurements are unaffected; only the label changes.

**First**, against the account save's own write timestamp. `data_<user>` carries a `timestamp` field, and the wipe rewrote it at `15:05:54.242Z`. Sampling both every 5 s:

| wall-clock age of that save | `lastSavePlayTime` | drift |
|---|---|---|
| 310.3 s | 310 | 0.3 s |
| 315.3 s | 315 | 0.3 s |
| 320.3 s | 320 | 0.3 s |
| 325.3 s | 325 | 0.3 s |
| 330.3 s | 329 | 1.3 s |
| 335.3 s | 334 | 1.3 s |

The counter tracks the real age of the last successful save to within 1.3 s over five and a half minutes — the drift is 1 Hz quantisation plus whatever the timer loses when the tab is throttled.

**Second, and better: correlated directly against a save on the wire.** Someone started a fresh run while my passive listener was attached (§10), which gave me the reset as it happened. Sampling the canary every 5 s alongside `Network` events:

| dt | phase | `lastSavePlayTime` | `sessionPlayTime` | `sessionData` key | on the wire |
|---|---|---|---|---|---|
| 85.0 s | `SelectStarterPhase` | 555 | 1472 | absent | |
| **89.3 s** | | | | | **`POST /savedata/updateall`** |
| **90.4 s** | | | | | **→ `200`, 1042 ms** |
| 90.0 s | `EncounterPhase`, wave 1 | **0** | **0** | **present** | |
| 95.0 s | `CheckSwitchPhase`, wave 1 | 4 | 5 | present | |

**`lastSavePlayTime` goes 555 → 0 across an observed successful save**, at the same instant `sessionData_<user>` reappears in `localStorage`. That is the reset behaviour, verified mid-run against ground truth rather than inferred from the field name. (`sessionPlayTime` also zeroes there — it is per-*run*, and the run had just begun.)

**[verified] It does not reset within a wave, and it is not on a timer.** Across **330 s sitting inside wave 1** — through `CheckSwitchPhase`, `SwitchPhase`, a long idle at `CommandPhase`, the battle itself, and a long idle at `SelectModifierPhase` — `lastSavePlayTime` climbed `0 → 329` monotonically with **no reset and no second `updateall`**.

I originally read that as "the sawtooth is one wave long". **It is five** — see the correction below. The observation above cannot distinguish the two, because it never crossed a wave boundary.

### What it does on a *failed* save — refuted

I inferred here, and reported, that "the reset sits in the success path, so a failed `saveAll` leaves the counter running", making this an early-warning canary for save failures. **Reading `saveAll`'s live body (§7) refutes that.**

**Both halves of this ticket reached this independently, from opposite directions** — the deployed bytes below, and the source at the pinned ref (`game-data.ts:1379-1387`), where the reset sits above the `if (!saveError)` check under an `if (sync)` of its own. The pinned ref and the deployed build agree. The bytes are kept here because they are how the live half established it, and because the mechanical checks are reusable.

The deployed tail of `saveAll`, read with `String(scene.gameData.saveAll)` and quoted verbatim:

```
let C=await z.savedata.updateAll(S);return t&&(B.lastSavePlayTime=0,B.ui.savingIcon.hide()),C?(C.startsWith(`session out of date`)&&(B.phaseManager.clearPhaseQueue(),await this.reinitializeSaveData()),console.error(C),!1):!0
```

Mechanically checked on that string, not eyeballed:

| Check | Result |
|---|---|
| characters between `updateAll(` and `lastSavePlayTime=0` | `` `updateAll(S);return t&&(B.` `` |
| an `if` between them? | **no** |
| a ternary `?` between them? | **no** |
| does the reset precede the first `console.error`? | **yes** |

So it is `return (t && (reset, hide)), (C ? failure : success)` — a comma expression. The reset runs **after the request resolves and before `C` is examined at all**; its only guard is the `sync` flag `t`. Deminified:

```js
const err = await z.savedata.updateAll(payload);
if (sync) { globalScene.lastSavePlayTime = 0; globalScene.ui.savingIcon.hide(); }  // not in the err branch
if (err) { …; console.error(err); return false; }
return true;
```

**A sync save that the server rejects resets the counter exactly like one that succeeds**, so this cannot detect a save that was attempted and failed — which is precisely this ticket's case.

### And the stronger reason: no such alarm can exist

Even if the reset *were* success-gated, the early-warning alarm I proposed could never fire, for a structural reason **[from source]**: **there is no state in which a save has failed and the run is still playable.** A failed `saveAll` returns `false`, and `EncounterPhase` tears the run down in the same tick — single attempt, no retry (§10). So on any run that is still alive, "time since the last attempt" and "time since the last success" are necessarily the same instant.

That closes the idea for good, and it closes it more cleanly than the code reading does. The counter cannot warn of a save failure because a save failure does not leave anything to warn.

### What survives, and what it is actually good for

**[verified] measurements, all unaffected:** the 1 Hz tick, the reset on an observed successful save (twice, independently), and the monotone climb across 330 s inside one wave.

**A correction to my own claim.** I wrote that the sawtooth is one wave long. **[from source]** it is **five**: the non-sync branch returns before ever reaching the reset, so four waves in five never zero it. It zeroes on waves ≡ 1 (mod 5), and on any wave start where it has already reached 300. My 330 s observation was taken entirely *inside* wave 1 and is consistent with both readings — **a climb across two or three wave boundaries would have separated them**, and that is the measurement I should have taken. It is the one place in this document where a slightly longer observation would have replaced an inference with a fact.

The counter's real uses, both worth carrying into #7:

- **A sync-wave predictor.** `nextWave % 5 === 1 || lastSavePlayTime >= 300` tells the server, *before* advancing, whether the coming transition will touch the network. That is when to arm the network watch and allow a longer settle budget — and only then, which keeps the other four waves in five cheap.
- **A staleness bound.** `seconds_since_last_sync` is what makes a reported `last_saved_wave` honest, because `saveAll` writes `localStorage` every wave but only POSTs on sync waves (§7) — **the local key runs ahead of the server**, and without this number the server would report progress the server-side save does not have.

**One residue, now minor:** if the request *throws* rather than resolving to an error string, the reset never runs. Given the structural argument above it changes nothing about alarms, but it is still unestablished whether `z.savedata.updateAll` catches (§13).

This section is the clearest case in this document for doing both halves of a research ticket — and for doing them independently. Every live measurement here was correct; the conclusion drawn from them was wrong until the code was read, and the *reason* it was wrong turned out to be structural rather than a code-reading detail.

Two things it is not. It is **not** a per-session signal: at the title screen `sessionPlayTime - lastSavePlayTime` held constant at 917 because both counters tick together, so the *difference* is inert — read `lastSavePlayTime` on its own.

And it is **emphatically not** a wall-clock threshold — which matters even now that it is a predictor rather than an alarm. The 330 s above was mostly a human idling at a reward screen, and the counter climbed the whole time with nothing wrong. An agent that pauses to think does the same. **A fixed "`lastSavePlayTime > N` ⇒ fault" rule would fire on every slow turn**, and it is the kind of thing that gets built wrong by default. The `>= 300` term in the sync-wave predictor above is not that rule: it predicts *that a save will happen*, it does not diagnose that one failed.

## 7. Reading the game's own function bodies, live

A method worth recording on its own, because it settled four questions that neither the storage diffing nor the network watching could, and it is completely read-only: **`String(fn)` on a live method returns its source**, minified but intact, because #9 established the Vite build keeps `keepNames: true` and ships no sourcemaps but does not strip function bodies.

```js
String(scene.gameData.saveAll)          // 999 chars
String(scene.gameData.saveRunHistory)   // the write path
String(scene.gameData.getRunHistoryData)
```

This is the live build, not the pinned ref — so it is evidence about *the bytes actually running on the dev's machine*, which is a different and complementary thing from the companion source read. Where the two agree, the build matches the tag.

### `saveAll` — the order of operations is the whole story

Deminified, with the mangled identifiers named from context (`Yo(slot)` builds the session key, `Ei`/`vi` are encrypt/decrypt, `B` is the scene, `z.savedata` is the API client):

```js
async saveAll(skipVerification = false, sync = false, useCachedSession = false, useCachedSystem = false) {
  if (!skipVerification) { const [ok] = await updateUserInfo(); if (!ok) return false; }
  const session = useCachedSession ? … : this.getSessionSaveData();
  const system  = useCachedSystem  ? … : this.getSystemSaveData();
  if (!this.validateSystemData(system)) return this.reinitializeSaveData({ message: FAILED_VALIDATION });
  sync && B.ui.savingIcon.show();
  const payload = { system, session, sessionSlotId: B.sessionSlotId, clientSessionId };

  localStorage.setItem(`data_${username}`, Ei(JSON.stringify(system), false));   // (1) local writes,
  localStorage.setItem(Yo(B.sessionSlotId), Ei(JSON.stringify(session), false)); //     before any network

  if (!sync) { const v = await this.verify(); B.ui.savingIcon.hide(); return v; } // (2) no POST at all

  const err = await z.savedata.updateAll(payload);                                // (3) the POST
  sync && (B.lastSavePlayTime = 0, B.ui.savingIcon.hide());                       // (4) UNCONDITIONAL
  return err
    ? (err.startsWith('session out of date') && (B.phaseManager.clearPhaseQueue(), await this.reinitializeSaveData()),
       console.error(err), false)                                                 // (5) logs at error
    : true;
}
```

Five consequences, in order of how much they change things:

1. **[verified] The local write happens before the network call and is never rolled back.** So a save failure does **not** leave `sessionData_<user>` stale at the last good wave — it leaves it written *fresh*, with the current wave, and only the server copy is missing. This is what kills the storage asymmetry as a discriminator, independently of the teardown-path argument.
2. **[verified] `lastSavePlayTime = 0` is not gated on success.** Line (4) runs after the `await` and before `err` is even examined; its only guard is `sync`. **A failed sync save resets the canary exactly like a successful one.** My §6 inference was wrong. What the counter actually measures is *time since the last sync save attempt*. (One caveat left: if the request **throws** rather than resolving to an error string, line (4) never runs — so an offline failure may behave differently from a server-rejected one. Whether `z.savedata.updateAll` catches is unestablished.)
3. **[verified] The failure path logs at `console.error`** with the server's error string, line (5). That is observable over CDP and survives the production build (§10) — so **destructive-test item 4 is answered without running the test**: there *is* a console surface, and it carries the server's own message.
4. **[verified] Not every save touches the network.** With `sync === false` the method writes `localStorage`, runs `verify()`, and returns — no `updateAll`. So the single POST I observed (§10) is a *sync* save; a network watcher will not see the others.
5. **[verified] `"session out of date"` is a distinct, harsher path** — it clears the phase queue and reinitialises save data, which is a teardown of its own.

### `saveRunHistory` / `getRunHistoryData` — local-only, and a ring of 25

```js
async getRunHistoryData() {
  const k = `runHistoryData_${username}`, raw = localStorage.getItem(k);
  if (raw) return raw ? JSON.parse(vi(raw, false)) : {};
  localStorage.setItem(k, '');            // creates the key EMPTY on first read
  return {};
}

async saveRunHistory(entry, isVictory) {
  const hist = await this.getRunHistoryData();
  let keys = Object.keys(hist).map(Number);
  while (keys.length >= 25) {                              // bounded ring
    delete hist[Math.min(...keys).toString()];             // evict oldest by timestamp
    keys = Object.keys(hist).map(Number);
  }
  hist[entry.timestamp.toString()] = { entry, isVictory, isFavorite: false };
  localStorage.setItem(`runHistoryData_${username}`, Ei(JSON.stringify(hist), false));
  return true;
}
```

This answers the two questions that could have undermined the signal:

- **[verified] Run history is local-only.** Neither function makes a network call — no `z.savedata.*`, no `fetch`, no `await` of anything remote. **A network partition, which is exactly the condition that causes a save failure, cannot prevent the history entry from being written.** That was the one thing that could have broken the discriminator, and it does not.
- **[verified] It is a bounded ring of 25**, evicting the numerically smallest (oldest) timestamp key while `length >= 25`. So a server must compare against a remembered previous state rather than assume monotonic growth — though eviction only bites after 25 endings.
- **[verified] And this explains the empty key.** `getRunHistoryData()` **creates the key as the empty string** when it is absent. So "present but empty" is the documented baseline for an account that has never ended a run, not a bug and not evidence that the game never writes it. My §3 caveat stands and now has a cause.
- **[verified] It is account-wide, not slot-scoped** — one key per username, no slot in the name. That is a positive argument for preferring it over any session-key check (§7.1).

### 7.1 Save slots: five of them, and the key names are not all observable

**[verified] There are five slots.** `clearLocalData` is explicit:

```js
clearLocalData() {
  localStorage.removeItem(`data_${username}`);
  for (let i = 0; i < 5; i++) localStorage.removeItem(Yo(i));
}
```

**[verified]** Slot 0's key is the unsuffixed `sessionData_xauyxau2`; `scene.sessionSlotId === 0`. **[not exercised]** The names for slots 1–4 are built by the helper `Yo(slot)`, which is module-scoped and not reachable from injected JS, and no suffixed key exists on this account — so I cannot observe the pattern, and **absence proves nothing about naming**. The companion source read owns `Yo`'s definition.

**Why this matters:** a server that checks only `sessionData_<user>` goes blind to a run in slot 3. This is a further argument for the run-history signal, which is account-wide and dodges the problem entirely.

### `getSession` — and the false positive from §10, explained

```js
async getSession(slot) {
  if (slot < 0) return;
  if (localStorage.getItem(Yo(slot))) { … return this.parseSessionData(vi(raw, false)); }
  const body = await z.savedata.session.get({ slot, clientSessionId });
  if (body == null || body.length === 0 || body.charAt(0) !== '{') { console.error('Invalid save data JSON detected!', body); return; }
  localStorage.setItem(Yo(slot), Ei(body, false));
  return this.parseSessionData(body);
}
```

**[verified]** This is the exact source of the five `console.error("Invalid save data JSON detected!", "save does not exist\n")` calls in §10: for each empty slot, `localStorage` has nothing, the server answers 404 with a body that does not start with `{`, and the guard logs. **It is normal operation on any empty slot**, which is why a console detector must not match on it.

## 8. What the settled title screen actually holds

Inventoried directly, which the ticket assumed impossible. `ui.mode 1`, `domUiMode "TITLE"`, `TitleUiHandler`, `TitlePhase`.

| Read | Value | Use |
|---|---|---|
| `ui.mode` | `1` | the mode int; `UiMode.TITLE` |
| `#touchControls.dataset.uiMode` | `"TITLE"` | #10's locator-free mode read, confirmed at title |
| `ui.modeChain` | `[]` | empty — no overlay stack |
| `ui.overlayActive` | `false`, `typeof "boolean"` | **corrects #9** — see below |
| `ui.handlers.length` | `48` | #2's drift check, unchanged at title |
| `phaseManager.currentPhase` | `TitlePhase` | own keys `["phaseName", "loaded", "gameMode"]` |
| `TitlePhase.loaded` | `false` | whether a save slot was loaded into this title visit |
| `phaseManager.standbyPhase` | `null` | |
| `phaseManager.phaseQueue` | `PhaseTree`, keys `["levels","currentLevel","deferredActive"]` | #9's correction to #3 holds |
| `TitleUiHandler.config.options` | `["New Game","Load Game","Run History","Settings"]` | **no "Continue" ⇒ no resumable session** |
| `scene.party` / `currentBattle` / `money` / `modifiers` | `[]` / `null` / `0` / `[]` | the run is zeroed |
| `scene.seed` / `waveSeed` | `"OP3tNcCUyV0ovC6UzkW4YnIl"` | **reseeded** — not the ended run's `"JBZa8QqLgGo6k9aAPaZyA3VF"` |
| `scene.gameData.runHistory` | `{}` | lazily loaded; **not** a substitute for the storage key (§3) |

**A correction to #9.** #9 recorded `ui.overlayActive` as "declared but uninitialised — `'overlayActive' in ui` true while `typeof ui.overlayActive === 'undefined'`", and #3 inherited a note to treat `undefined` as falsy. At the title screen it is a real `false`. So the property **becomes defined during a run** and is `undefined` only before whatever first assigns it. #3's advice is still correct and still necessary — treat `undefined` as falsy — but the reason is "sometimes not yet assigned", not "never assigned".

**No residue of the ended run survives on the scene.** `GameOverPhase` is not reachable at the title screen: `phaseManager.currentPhase` is `TitlePhase` and `standbyPhase` is `null`, so the ticket's idea of reading `GameOverPhase.isVictory` off the live phase object **fails on reachability, before TS-`private`-erasure even matters**. The seed has already been rolled over. Everything that distinguishes the two endings has left the scene by the time the title screen settles — which is exactly why a server that only looks *after* the fact must fall back to `runHistoryData_<user>`, and why a server that can watch should latch `phaseName` instead (§11).

**The "Continue" absence is a real signal, with a catch.** `TitleUiHandler.config.options` is a live, one-hop read that says whether a resumable session exists. But those labels are i18next strings that follow `prLang` (#10's field-by-field localisation finding), so **match on the option count / index, never on the string `"Continue"`**. The `localStorage` check in §5 is strictly better: same information, locale-free, no scene handle.

## 9. Cost

Method is #9's: full CDP `Runtime.evaluate` round trips, `returnByValue`, warm websocket, 5 warm-up calls discarded, p50 over the next 50. Bytes are the returned JSON string length.

| Signal | p50 ms | min | p90 | max | bytes |
|---|---|---|---|---|---|
| `window.gameInfo` only (#9 baseline 0.18) | 0.15 | 0.10 | 0.23 | 0.61 | 103 |
| lean scene read (#9 baseline 0.21) | 0.18 | 0.14 | 0.22 | 0.92 | 68 |
| run-over predicate, `gameInfo` only | 0.15 | 0.13 | 0.19 | 0.47 | 16 |
| **session-save presence** (`localStorage`, no locator) | **0.15** | 0.13 | 0.20 | 0.51 | 20 |
| session presence + run-history byte count | 0.14 | 0.13 | 0.18 | 0.73 | 43 |
| **`lastSavePlayTime` canary** (scene) | **0.15** | 0.13 | 0.18 | 0.85 | 47 |
| **full discriminator** (locator + canary + both storage checks) | **0.11** | 0.10 | 0.14 | 0.16 | 91 |
| run-history ciphertext over the wire | 0.15 | 0.14 | 0.17 | 0.57 | 6 005 |
| `uiMode` via DOM only, no locator | 0.14 | 0.13 | 0.16 | 0.44 | 22 |

And the two signals §11 actually recommends, measured in a later run against the live wave-1 run (same method, N=50):

| Signal | p50 ms | min | p90 | max | bytes | sample |
|---|---|---|---|---|---|---|
| **`phaseName` alone — the settle-loop signal** | **0.21** | 0.14 | 0.32 | 0.58 | **21** | `"SelectModifierPhase"` |
| `phaseName` + `ui.mode` (minimal settle tuple) | 0.21 | 0.14 | 0.38 | 0.58 | 33 | `{"n":"SelectModifierPhase","m":8}` |
| `constructor.name` instead (minification-fragile) | 0.15 | 0.13 | 0.22 | 0.89 | 21 | `"SelectModifierPhase"` |
| **run-history byte length — the stateless fallback** | **0.21** | 0.13 | 0.41 | 0.63 | **4** | `5996` |

**Both recommended signals cost 0.21 ms — 0.2 % of a 100 ms settle poll**, and 21 and 4 bytes respectively. Neither needs decryption in the loop. `constructor.name` is nominally cheaper but the gap is inside the run-to-run noise of this whole table, and it trades a load-bearing string for an incidental one; take `phaseName`.

**Everything is the same price.** A second interleaved trial (3 rounds, same N) gave the full discriminator 0.13–0.17 ms, the bare session-presence check 0.07–0.16 ms, and the run-history ciphertext 0.18–0.21 ms. The only candidate that is reliably distinguishable is the 6 KB run-history blob, and it costs about **+0.05 ms** — so payload size starts to register somewhere around a few KB, and below that the round trip dominates, exactly as #9 found.

The lean-scene row reads 68 bytes here against #9's 338 because the party was empty at the title screen. Not a regression — a different game state.

**Decrypting is free.** AES-256-CBC + `JSON.parse` of the 5 996-byte run-history blob, in Node: **0.02 ms p50**, 0.05 ms p90 over 200 iterations. (A single cold call measured 0.59 ms; that is JIT warm-up, not the steady-state cost.) The 223 KB account save takes about 1 ms to decrypt and is not something the settle loop should touch.

**Where each signal belongs:**

- The **full discriminator** at 0.11 ms / 91 bytes is 0.1 % of a 100 ms settle poll. It is cheap enough for the settle loop, and it needs no decryption — presence of `sessionData_<user>` and the byte length of `runHistoryData_<user>` are both raw `localStorage` reads.
- **Decrypt the run history only on a transition**, i.e. when the server has just observed the run disappear and needs `isVictory` and `waveIndex` for the report. At 6 KB + 0.02 ms that is still trivial, but there is no reason to pay it 10x a second.
- **`lastSavePlayTime` would belong in the settle loop** if it works — its whole value is catching the fault early — but see the dispute in §6 before building on it.

## 10. The save path over the network, and the console surface

### The save request, captured

**[verified]** Passive `Network.enable` (listener only — no `Fetch` domain, no interception, no throttling, `maxPostDataSize: 131072`) across two windows totalling 15 minutes (300 s + 600 s). Someone started a fresh run inside the second window, which caught the save I could not have provoked:

```
POST https://api.pokerogue.net/savedata/updateall   → 200, 1042 ms, response body EMPTY (0 bytes)
```

Request headers: `Authorization`, `PKR-Client-Version`, `Content-Type`, `Referer` and the usual UA hints. So auth on the save is an `Authorization` header, and the client stamps its own version — a server that wants to detect a build change has `PKR-Client-Version` on every save.

**This is `saveAll`'s endpoint**: one POST covering both the system and session saves, which matches the name and matches the observation that `data_<user>` and `sessionData_<user>` are written together (§1, the two `localStorage` writes 1 ms apart at the wipe).

**[verified] It is slow.** 1042 ms for the round trip — four orders of magnitude more than any state read in §9. That is the window in which a save can fail, and it is easily long enough for a 100 ms settle poll to observe an intermediate state.

**[verified] Not periodic; [from source] every fifth wave, not every wave.** Exactly one `updateall` fired, at the start of wave 1, and over the following 330 s inside wave 1 — battle, reward screen and all — there was no second one (§6). The game also does **not** save on a timer while idle at the title screen.

I first wrote this up as "per-wave". **It is per *sync* wave — waves ≡ 1 (mod 5)**, plus any wave start where `lastSavePlayTime >= 300`. On the other four waves in five, `saveAll` takes the non-sync branch: it writes `localStorage` and returns without touching the network (§7). My window covered exactly one wave and so could not tell the two apart. **The consequence for a network watcher is real: four wave transitions in five produce no save traffic at all**, so absence of a POST at a wave boundary is not evidence of anything.

It also means **the local session key runs ahead of the server** between sync waves — which is what the staleness bound in §6 exists to report.

**[not exercised] The request body was not captured.** `postLen` came back `0` with `maxPostDataSize` set to 128 KB, so the payload is not exposed as `postData` — most likely sent as a `Blob`/typed array rather than a string. Reading it would need `Fetch.getRequestPostData` or request interception, which the safety constraints rule out. **What the server sends is therefore unknown**; only the endpoint, method, headers, status and timing are established.

**Retry behaviour: there is none.** **[from source]** No retry anywhere in the codebase — `EncounterPhase` makes **one** save attempt and tears the run down; the only backoff is a login-recovery loop. **[verified]** consistent with `saveAll`'s live body (§7): a single `await`, then straight into the error branch. **One dropped packet at a sync-wave boundary ends the run.** That is worth stating plainly for two reasons: it is why no early-warning signal can exist (§6, §11) — the failure and the teardown are the same tick — and it is why the `phaseName` trace has to be watched continuously rather than sampled on suspicion. There is no second chance to catch.

**[verified] What counts as success, and it is not the status code.** My captured save returned `200` with a **completely empty body** (0 bytes), and `saveAll` branches on `C ? failure : success` where `C` is the response *body* (§7) — it never reads `response.status`. So **an empty body is success and a non-empty body is failure**, which is exactly what the source read says. Two consequences: a server watching the wire must key on the body, not the status; and any middlebox that injects a body into a `200` would look to the game like a failed save.

**[verified] The deployed API base is `https://api.pokerogue.net`** — observed on every request in both listener windows, distinct from the `https://pokerogue.net` asset origin.

### The Load Game path, and a false-positive trap

**[verified]** Opening the save-slot screen fires five parallel requests, one per slot:

```
GET https://api.pokerogue.net/savedata/session/get?slot=0..4&clientSessionId=rdixVK1WbdjHk97A2YaDPeHzX2Q0gOKR
```

All five returned **404** with the plain-text body `"save does not exist\n"` (the account had no saved sessions after the wipe). Note the auth shape differs from the save: a `clientSessionId` **query parameter**, not just the header.

**And each 404 produced a `console.error`.** This is the trap:

```
console.error("Invalid save data JSON detected!", "save does not exist\n")
```

fired **five times in 250 ms — once per empty slot — as completely normal operation.** A server that watched the console for save trouble and matched on that string would report an infrastructure fault every single time the player opened the Load Game screen with any empty slot. **The console surface is noisy, and this particular error is not a fault signal.** Any console-based detector has to key on whatever the *save* path emits, not on this.

### The console surface survives the production build

**[verified]** The game does emit its own `console.error` calls in the shipped build, as the string above proves. This matters because of a constraint #9 established from source: PokéRogue's Vite config drops `console.log` and `console.debug` **as pure** in the production bundle, so any diagnostic emitted through those is simply absent from the live build and can never be observed over CDP. `console.error` and `console.warn` survive.

So **a CDP `Runtime.consoleAPICalled` listener is a viable save-failure detector only for whatever the failure path logs at `error`/`warn`** — and, per the trap above, only if the matched string is specific to that path. The source half needs to check which level `saveAll`'s failure path actually uses, and whether it logs at all.

**[verified] Buffered console replays on attach.** Both listener sessions received that same `console.error`, with identical arguments, within 5–10 ms of calling `Runtime.enable` — i.e. Chrome replayed it from its buffer rather than it firing twice. So **a server that attaches *after* a save failure can still see the error**, as long as the buffer has not rolled and the page has not navigated. That is a genuinely useful property for an attach-to-existing-tab design (#5's), and it is worth not relying on for anything load-bearing, because the buffer is bounded.

**[not exercised]** Whether the game surfaces a save failure in the **UI** — a toast, a message box, a modal — was not determined. I could not induce one, and nothing in the idle title screen exercised it.

## 11. What the server can detect, and when

Pulling §3, §7 and §10 into one shape. Naming the reports is the source half's job (it holds `CONTEXT.md`'s vocabulary); this is what the live side says is *detectable*, and at what cost.

**Three signals, complementary rather than competing, in time order:**

| # | Signal | When it fires | Exactness | Needs |
|---|---|---|---|---|
| 1 | **`phaseName` trace** | at the transition | **exact** — names which ending it was | having been watching |
| 2 | **`runHistoryData_<user>`** | after the fact, durably | good enough to reconcile | nothing — locator-free, survives a reconnect |

**These two are what v1 should be built on**: 1 to classify, 2 to recover when the server was not watching.

**There is no third, earlier signal, and there cannot be one.** I proposed `lastSavePlayTime` as an early warning; it does not work, for a structural reason rather than an implementation detail — a failed `saveAll` tears the run down in the same tick, so there is no window in which a save has failed and the run is still alive to be warned about (§6). The counter keeps two other jobs — predicting which wave transitions touch the network, and bounding how stale the server-side save is — but neither is a fault detector.

### 1. In the settle loop — `phaseName`

The phase the game is in *is* the answer, and it is gone by the time the title screen settles. So this is a settle-loop concern, not a `get_state` one.

```js
// 0.21 ms, 21 bytes — 0.2 % of a 100 ms poll
(() => { const p = scene.phaseManager.getCurrentPhase(); return p ? p.phaseName : null; })()
```

| observed `phaseName` | reading |
|---|---|
| `"GameOverPhase"` | **wipe** — the normal end |
| `"LoginPhase"` mid-session | **`reset(true)` teardown** — the infrastructure fault |
| `"GameOverPhase"` then `"LoginPhase"` | a wipe whose own post-game-over save then failed |

**[verified] `phaseName` survives the production bundle** — the companion source read listed this as an open item for the live side, and it is answered. `getCurrentPhase()` exists and returns the same object as `.currentPhase`; `phaseName` is an **own property** on the instance, not a prototype getter and not `constructor.name`. It read `"SelectModifierPhase"` on the live run, and §8's independent title-screen dump shows `phaseManager.currentPhase` own keys as exactly `["phaseName", "loaded", "gameMode"]`. Since it is a string *value* rather than an identifier, minification cannot rename it — which is why it is the right handle and `constructor.name` is not.

**[from source]** the mapping in the table above, and that `GameOverPhase` dwells ≥ 6 s (a 1000 ms `delayedCall` plus a 5000 ms fade) — comfortably longer than a 100 ms poll. `"LoginPhase"` appears mid-session because `clearScene = true` destroys the UI and re-runs `launchBattle()`, which routes through `LoginPhase` before `TitlePhase`. **Neither value was observed live** (§13): the one wipe in this session happened before I was polling phases.

`constructor.name` reads the same value and measured marginally cheaper (0.15 ms), but it depends on `keepNames` surviving in every future build. **Use `phaseName`** — it is the string the game itself compares against at runtime, so it is load-bearing rather than incidental.

### 2. After the fact — `runHistoryData_<user>`

For a server that reconnects, or was not watching when the run ended. Locator-free, account-wide, and — critically — **written by a local-only code path** (§7), so the network failure that causes a save failure cannot also suppress the entry.

```js
// 0.21 ms, 4 bytes — the length alone is enough for the loop
(localStorage.getItem('runHistoryData_<user>') || '').length
```

Watch the **length** in the settle loop; **decrypt only on a change** (0.02 ms) and read the newest key:

| newest run-history key vs. the one remembered at run start | reading |
|---|---|
| a **new** key appeared | **wipe** — report the end, with `isVictory`, `waveIndex`, `playerFaints` off the entry |
| **unchanged** while the run is gone | **[inferred] not a wipe** — a `reset(true)` teardown of some kind |

**Three things the server must get right.**

- `runHistoryData_<user>` is created as the **empty string** on first read (§7), and `''` is not decryptable. Treat empty-or-unparseable as "no history", never as an error.
- The comparison must be against a key remembered **at run start**, because the key is an end-timestamp. A server that only asks "is there any history entry" will see the *previous* run's entry and call every teardown a wipe.
- It is a **ring of 25** (§7), evicting oldest-first. Growth is not monotonic, so compare remembered state rather than counting.

### What is *not* the signal

- **`sessionData_<user>` presence.** `saveAll` writes it before the network call and never rolls back (§7), so a failed save leaves it written, not stale; and per the source read it is cleared on two of the four endings, cutting across the wipe/failure line. My measurement that the wipe deleted it stands — it just does not discriminate. It is also **slot-scoped** (five slots, §7.1), so a server checking only the unsuffixed key would miss a run in slot 3 — a further reason to prefer run history, which is account-wide.
- **`lastSavePlayTime`.** Reset is gated on `sync`, not on success (§7). It measures time since the last save *attempt*. Still worth reading as a general health indicator — a counter that stops resetting across wave boundaries means saves stopped being attempted — but it does not detect a save that was attempted and failed, which is this ticket's case.
- **`gameStats`.** Measured negative (§4), and the source read agrees independently.
- **`GameOverPhase.isVictory`.** Not blocked by TS `private` (erased at runtime) but by reachability: `PhaseManager` keeps no phase history, so the object is garbage by the time the title settles (§8). Read `runHistoryData[newest].isVictory` instead.

## 12. The destructive experiment I did **not** run

**Forcing a `saveAll` failure and watching the loss path end to end.** The brief forbade it, and it is the right call: the mechanism is CDP's `Fetch` domain (or `Network.emulateNetworkConditions` offline) to fail the save request, and my client refuses both at the `send()` layer so it could not happen by accident.

**What it would confirm**, in priority order. The list has shrunk since I first wrote it: reading the game's own function bodies (§7) answered three of the seven items without touching anything, and withdrew a fourth. Struck-through items no longer need the test.

1. **That no `runHistoryData_<user>` entry is appended on a save failure.** This is now the whole discriminator (§3, §7). Everything else on the list is secondary to it.
2. **That `phaseName` goes `"LoginPhase"` on the failure path and `"GameOverPhase"` on a wipe**, and that both dwell long enough for a 100 ms poll. The source read establishes both; neither has been seen live, because no run has failed to save and the one wipe happened before I was watching phases.
3. ~~That `sessionData_<user>` survives a save-failure teardown.~~ **Withdrawn** — §7 shows `saveAll` writes `localStorage` before the network call, so the key is written regardless, and the source read shows it is cleared on two of the four endings. It is not a discriminator and the test need not ask about it.
4. ~~That `lastSavePlayTime` is not reset by a failed save.~~ **Answered, negatively, from the live function body** (§7): the reset is gated on `sync`, not on the outcome. One residue worth testing: whether a request that *throws* (offline) skips the reset, where a server-returned error does not.
5. ~~What the failure path logs.~~ **Answered from the live function body** (§7): `console.error(<server error string>)`, which survives the production build and is observable. What remains is the exact text for a non-`"session out of date"` failure.
6. ~~Whether it retries, and what the client counts as failure.~~ **Answered** (§10): no retry anywhere, and failure is a **non-empty response body**, not a status code. Only the request *body* remains unobserved.
7. **Whether anything appears in the UI** before the teardown runs. `saveAll` shows and hides a `savingIcon`, so there is at least an icon; whether a failure surfaces anything more is unknown.
8. **How much of a window there is** between the failed request and the title screen settling — whether a 100 ms settle poll can see the intermediate state. The measured 1042 ms save round trip (§10) says the window is at least that wide on the request side, which is encouraging.

The test is cheaper to specify than when this ticket was written, because §10 pins the target exactly — fail one `POST https://api.pokerogue.net/savedata/updateall` — and §7 says what to watch: `phaseName`, and the run-history key's length.

**How to run it safely**, when someone authorises it: on a **throwaway run**, not a parked one — start a fresh Classic run, play to wave 2 or 3 so there is something to lose, and only then fail the request. Fail exactly one save (`Fetch.failRequest` on a single matching request, then `Fetch.disable`) rather than blanket-blocking the domain, so the account is not left in a half-offline state. Snapshot the `localStorage` values and `gameStats` immediately before, and poll `phaseName` at 100 ms throughout — that is the observation the test exists to make. The run genuinely dies; that is the point, so it costs one throwaway run and should not be pointed at a run anyone cares about.

**Status: the human has ruled this test out.** The save-failure column therefore stays inferred-from-source in both documents, and is labelled as such throughout.

## 13. What I could not establish

- **The entire save-failure column of §0.** Everything about that path is inferred from the wipe measurements plus the source read. The human has ruled out the destructive test, so it stays inferred. See §12.
- **`phaseName` on the two endings, seen live.** The values and dwell times come from the companion source read. I verified the *mechanism* — `getCurrentPhase()`, the own-property `phaseName`, and its cost — but never observed `"GameOverPhase"` or `"LoginPhase"`, because the one wipe in this session happened before I was polling phases.
- **The save request's body.** Not exposed as `postData`; reading it needs interception, which is ruled out. (The failure predicate and retry behaviour, previously on this list, are resolved in §10.)
- **Whether `z.savedata.updateAll` catches a thrown request** rather than resolving to an error string — i.e. whether an *offline* failure behaves differently from a *server-rejected* one (§6). Now a minor question: the structural argument in §6 means it changes nothing about what the server can detect.
- **The `localStorage` key names for save slots 1–4** (§7.1). Five slots are confirmed from `clearLocalData`; the name helper is module-scoped and unreachable, and no suffixed key exists on this account, so absence proves nothing.
- **Whether a save failure surfaces in the UI** beyond the `savingIcon` that `saveAll` shows and hides.
- **Whether `isVictory: true` looks how I assume.** Only the `false` case was observed; nobody has won a run on this account (`sessionsWon: 0`).

Two items that were on this list are now **resolved**, both by reading live function bodies (§7) rather than by experiment:

- ~~Whether `runHistoryData_<user>` is a local cache of a server resource.~~ **It is not.** Neither `getRunHistoryData` nor `saveRunHistory` makes any network call. This was the one thing that could have undermined the signal — a network partition cannot suppress the history entry — and it does not.
- ~~How many entries run history retains.~~ **25**, evicting the numerically oldest timestamp key.

## 14. Tab state left behind

I changed nothing. No input, no navigation, no storage write, no game mutation.

The passive domains I enabled (`Network`, `Runtime`, `Log`) were explicitly disabled at the end of the first listener window. The second was terminated early when I tore down the background job, so its `disable` calls did not run — but CDP domain state is per-connection, and killing the process closed the websocket, which detaches the session and drops them anyway. Verified afterwards: the game is running normally, wave 1, `SelectModifierPhase`.

The tab itself is **not** as the brief described it, and not because of me. The wave-6 run ended at `15:05:54Z` (§1), killed by the #6 prototype session, and the #8 session then started a fresh one. At the time of writing it holds:

```
ui.mode 6 (MODIFIER_SELECT), SelectModifierPhase, wave 1, turn 3, ₱1000
party: Bulbasaur L5 15/20, Charmander L5 19/19, Squirtle L5 20/20
sessionData_xauyxau2 rewritten 15:15:14.765Z at waveIndex 1
```

Two things follow. **The dev should be told the wave-6 run is gone**, and that two sessions were on their account at once while this ticket believed the run was parked. And the new run is a **three-starter party**, the first party larger than one this project has seen — worth re-measuring #9's lean/fat payload costs against, since #9 explicitly flagged that its figures came from a one-pokémon party.

One correction inherited from a peer and worth repeating wherever `press` gets specified: **`ui.processInput()` returning `false` does not mean the input was rejected** — STATS on `STARTER_SELECT` returns `false` while acting. Nothing in this document uses it, and nothing should use it as a liveness signal.

One incidental corroboration from the new run: `runHistoryData_<user>` stayed at exactly 5 996 bytes throughout starter select, wave 1, and the reward screen. **Run history is written at an ending, not during play** — which is what makes "did the newest key change?" a clean transition test (§11).
