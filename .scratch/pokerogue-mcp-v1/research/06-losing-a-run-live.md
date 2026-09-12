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
- **`lastSavePlayTime` is not a save-*failure* canary.** `B.lastSavePlayTime = 0` runs after the `await`, gated only on the `sync` flag and **not on the outcome** — so a failed sync save resets it just like a successful one. It measures time since the last save *attempt*. My two live verifications of the reset stand; the inference I drew from them was wrong.

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

Going from a settled title screen to *in a battle taking damage* requires pressing Continue and then choosing a move. My client blocks `Input.*` at the send layer and every call I made was a side-effect-free `Runtime.evaluate`. So the tab was being driven by something outside this session — the human at the keyboard, or another session (there is a sibling `worktree-prototype-one-wave` in this repo). **Which one matters:** if an agent was playing the dev's real account while this ticket was told the run was parked, that is a coordination bug worth fixing before the next run.

Ground truth for the ending, from `Page.captureScreenshot`: the title menu reads **"New Game / Load Game / Run History / Settings"**. There is no "Continue". The session is gone and is not recoverable.

Later in the session the tab moved to `ui.mode 10` / `SelectStarterPhase` (**STARTER_SELECT**) — someone starting a fresh run. So the tab remained in use throughout; treat the passive-listener windows below as "what the game did while someone else was using it", not as a controlled idle.

**The upside, stated plainly:** the ticket asked what a wipe leaves behind, and said the title screen could not be reached without destroying the run. The run was destroyed by someone else, so I got the measurement for free and did not have to spend it. Everything in §3, §4 and §5 is a real before/after across a real wipe.

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

## 3. `runHistoryData_<user>` — the signal

This is the ticket's answer. Before the wipe the key held the **empty string**; after, 5 996 bytes of ciphertext decrypting to 4 473 bytes of JSON:

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

**[inferred] Why this separates the two cases.** A wipe ends through `GameOverPhase`, which is presumably what archives the run; the per-wave save-failure path at `encounter-phase.ts:304` calls `globalScene.reset(true)` directly, with no game over, so there would be nothing to archive. **From the live side I can only assert the measured half** — a wipe writes an entry. Whether the save-failure path reaches `saveRunHistory` is a source question, and the companion document owns it — its answer is that `GameOverPhase` (`game-over-phase.ts:215`) is the only writer repo-wide, which makes the asymmetry real. §7 adds the live half of the argument: the write path is **local-only**, so the network condition that causes a save failure cannot also suppress the history entry.

**A caveat the server must handle.** The key existed and held the **empty string** before any run had ended. `''` is not valid ciphertext — decryption throws on the `Salted__` check. So the presence of the key proves nothing; the server must treat empty-or-unparseable as "no history" rather than as an error.

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

**[inferred] The save-failure case is the mirror image.** If `saveAll` fails, nothing clears the session — locally or server-side — so `sessionData_<user>` should survive, stale, at the last wave that *did* save. That is the cheapest possible discriminator: **after a run disappears, one `localStorage.getItem` says which kind of ending it was.** It is the half that is unexercised.

## 6. `lastSavePlayTime` — the mid-run save-health canary

Found while inventorying the scene, and it is the most useful thing in this document after §3, because it catches the fault *before* the run is lost rather than explaining it afterwards.

**[verified]** `BattleScene` carries two sibling counters, `sessionPlayTime` and `lastSavePlayTime`. Both tick at 1 Hz off the scene's `playTimeTimer`, alongside `gameStats.playTime` — measured 24 increments each over 25.0 s wall-clock.

**`lastSavePlayTime` is seconds since the last successful save.** I verified that two independent ways rather than inferring it from the name.

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

**[verified] Saves are per-wave, not periodic.** Across the following **330 s sitting inside wave 1** — through `CheckSwitchPhase`, `SwitchPhase`, a long idle at `CommandPhase`, the battle itself, and a long idle at `SelectModifierPhase` — `lastSavePlayTime` climbed `0 → 329` monotonically with **no reset and no second `updateall`**. So the counter's natural sawtooth is one full wave *cycle* long, reward screen included, and its baseline is "however long a wave takes", not a fixed interval.

**[inferred] What it does on a *failed* save.** The reset sits in the success path, so a failed `saveAll` should leave the counter running. If so, then mid-run:

```
lastSavePlayTime climbing well past a typical wave  ⇒  saves are not landing
```

which is a **scalar integer, locale-independent, free to read, and available while the run is still playable** — the server can surface the infrastructure fault before `encounter-phase.ts:304` tears the run down. I have verified the 1 Hz tick, the reset-on-success (twice), and the one-wave sawtooth; **the no-reset-on-failure half is not exercised** and is the second thing the destructive test would confirm. The source half of this ticket should be able to settle it by reading where `lastSavePlayTime = 0` is assigned.

Two things it is not. It is **not** a per-session signal: at the title screen `sessionPlayTime - lastSavePlayTime` held constant at 917 because both counters tick together, so the *difference* is inert — read `lastSavePlayTime` on its own.

And it is **emphatically not** a wall-clock threshold. The 330 s above was mostly a human idling at a reward screen, and the counter climbed the whole time with nothing wrong. An agent that pauses to think does the same. **A fixed "`lastSavePlayTime > N` ⇒ fault" rule would fire on every slow turn.** The signal is `lastSavePlayTime` *failing to reset across a wave boundary the server itself observed* — i.e. pair it with `currentBattle.waveIndex` and alarm only when the wave has advanced and the counter has not zeroed. That makes it a settle-loop concern with one integer of carried state, not a stateless `get_state` field.

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

**No residue of the ended run survives on the scene.** `GameOverPhase` is not reachable at the title screen: `phaseManager.currentPhase` is `TitlePhase` and `standbyPhase` is `null`, so the ticket's idea of reading `GameOverPhase.isVictory` off the live phase object **fails on reachability, before TS-`private`-erasure even matters**. The seed has already been rolled over. Everything that distinguishes the two endings has left the scene by the time the title screen settles — which is exactly why the answer is in `localStorage`.

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

**Everything is the same price.** A second interleaved trial (3 rounds, same N) gave the full discriminator 0.13–0.17 ms, the bare session-presence check 0.07–0.16 ms, and the run-history ciphertext 0.18–0.21 ms. The only candidate that is reliably distinguishable is the 6 KB run-history blob, and it costs about **+0.05 ms** — so payload size starts to register somewhere around a few KB, and below that the round trip dominates, exactly as #9 found.

The lean-scene row reads 68 bytes here against #9's 338 because the party was empty at the title screen. Not a regression — a different game state.

**Decrypting is free.** AES-256-CBC + `JSON.parse` of the 5 996-byte run-history blob, in Node: **0.02 ms p50**, 0.05 ms p90 over 200 iterations. (A single cold call measured 0.59 ms; that is JIT warm-up, not the steady-state cost.) The 223 KB account save takes about 1 ms to decrypt and is not something the settle loop should touch.

**Where each signal belongs:**

- The **full discriminator** at 0.11 ms / 91 bytes is 0.1 % of a 100 ms settle poll. It is cheap enough for the settle loop, and it needs no decryption — presence of `sessionData_<user>` and the byte length of `runHistoryData_<user>` are both raw `localStorage` reads.
- **Decrypt the run history only on a transition**, i.e. when the server has just observed the run disappear and needs `isVictory` and `waveIndex` for the report. At 6 KB + 0.02 ms that is still trivial, but there is no reason to pay it 10x a second.
- **`lastSavePlayTime` belongs in the settle loop**, because its whole value is catching the fault early.

## 10. The save path over the network, and the console surface

### The save request, captured

**[verified]** Passive `Network.enable` (listener only — no `Fetch` domain, no interception, no throttling, `maxPostDataSize: 131072`) across two windows totalling 15 minutes (300 s + 600 s). Someone started a fresh run inside the second window, which caught the save I could not have provoked:

```
POST https://api.pokerogue.net/savedata/updateall   → 200, 1042 ms, response body EMPTY (0 bytes)
```

Request headers: `Authorization`, `PKR-Client-Version`, `Content-Type`, `Referer` and the usual UA hints. So auth on the save is an `Authorization` header, and the client stamps its own version — a server that wants to detect a build change has `PKR-Client-Version` on every save.

**This is `saveAll`'s endpoint**: one POST covering both the system and session saves, which matches the name and matches the observation that `data_<user>` and `sessionData_<user>` are written together (§1, the two `localStorage` writes 1 ms apart at the wipe).

**[verified] It is slow.** 1042 ms for the round trip — four orders of magnitude more than any state read in §9. That is the window in which a save can fail, and it is easily long enough for a 100 ms settle poll to observe an intermediate state.

**[verified] Cadence is per-wave, not periodic.** Exactly one `updateall` fired, at the start of wave 1. Over the following 330 s inside wave 1 — battle, reward screen and all — there was no second one (§6). The game also does **not** save on a timer while idle at the title screen.

**[not exercised] The request body was not captured.** `postLen` came back `0` with `maxPostDataSize` set to 128 KB, so the payload is not exposed as `postData` — most likely sent as a `Blob`/typed array rather than a string. Reading it would need `Fetch.getRequestPostData` or request interception, which the safety constraints rule out. **What the server sends is therefore unknown**; only the endpoint, method, headers, status and timing are established.

**[not exercised] Retry behaviour.** No save failed, so I saw no retry. Whether `saveAll` retries, how often, and whether `encounter-phase.ts:304` fires on the first failure or the last, is unestablished.

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

Pulling §3, §5, §6 and §10 into one shape. Naming the reports is the source half's job (it holds `CONTEXT.md`'s vocabulary); this is what the live side says is *detectable*, and at what cost.

**Three detection points, in decreasing order of value:**

**1. Mid-run, before anything is lost — `lastSavePlayTime`.** In the settle loop, alongside #3's predicate. Alarm when **the wave has advanced and the counter has not reset** — not on any wall-clock threshold, which would fire on every slow turn (§6). This is the only point at which the fault is *actionable* rather than merely explicable. **[inferred]** on the no-reset-on-failure half.

```js
// one read, 0.15 ms, no decryption; the server carries the previous (wave, counter) pair
{ wave: scene.currentBattle?.waveIndex, lastSavePlayTime: scene.lastSavePlayTime }
```

**2. At the transition — `Network` + console.** A server holding a passive `Network.enable` listener sees `POST /savedata/updateall` and its status directly, which is the ground truth rather than a proxy. The request takes ~1 s, so a 100 ms settle poll has room to observe it. Console is a weaker second source, and noisy (§10).

**3. After the fact, at the settled title screen — `localStorage`.** This is the one the ticket asked for, and it needs no scene handle and no watching:

```js
// 0.11 ms, 91 bytes, no decryption
{
  runOver:        scene.party.length === 0 && !scene.currentBattle,
  hasSession:     localStorage.getItem('sessionData_<user>') !== null,
  runHistoryBytes:(localStorage.getItem('runHistoryData_<user>') || '').length,
}
```

then, **only on a transition into `runOver`**, decrypt the run history (0.02 ms) and read the newest key:

| `runOver` | `hasSession` | newest run-history key | reading |
|---|---|---|---|
| false | — | — | the run is alive |
| true | **false** | **newer than the run started** | **wipe** — report the normal end, with `isVictory`, `waveIndex`, `playerFaints` off the entry |
| true | **true** | unchanged | **[inferred] save failure *or* save & quit** — see the collision below; the stale `sessionData.waveIndex` says how much was lost |
| true | false | unchanged | neither pattern — the session went away without being archived. Logout is the likely cause; degrade to a plain `run_over` rather than guessing. |

**Two things the server must get right.** `runHistoryData_<user>` held the **empty string** before any run had ended, and `''` is not decryptable — treat empty-or-unparseable as "no history", not as an error. And the newest-key comparison has to be against a value captured when the run *started*, because the key is an end-timestamp: a server that only asks "is there a history entry at all" will see the *previous* run's entry and call every save failure a wipe.

**The collision worth naming.** **Save & quit** also ends the run without a history entry, and — unlike a save failure — its save *succeeds*, so `sessionData_<user>` survives too. On the storage signals alone, **save & quit and save-failure are indistinguishable**. An unattended agent should never invoke save & quit, so this may be moot for v1, but the discriminator is not intrinsically unambiguous and the server should not pretend otherwise.

**`lastSavePlayTime` breaks that tie**, which is the second reason to carry it: a save & quit resets it to ~0 on the way out, a failed save leaves it at a full wave's age. That makes the canary load-bearing for *classification*, not just early warning — so it should be sampled on every settle, not only when something looks wrong.

## 12. The destructive experiment I did **not** run

**Forcing a `saveAll` failure and watching the loss path end to end.** The brief forbade it, and it is the right call: the mechanism is CDP's `Fetch` domain (or `Network.emulateNetworkConditions` offline) to fail the save request, and my client refuses both at the `send()` layer so it could not happen by accident.

**What it would confirm**, in priority order. The list has shrunk since I first wrote it: reading the game's own function bodies (§7) answered three of the seven items without touching anything, and withdrew a fourth. Struck-through items no longer need the test.

1. **That no `runHistoryData_<user>` entry is appended on a save failure.** This is now the whole discriminator (§3, §7). Everything else on the list is secondary to it.
2. **That `phaseName` goes `"LoginPhase"` on the failure path and `"GameOverPhase"` on a wipe**, and that both dwell long enough for a 100 ms poll. The source read establishes both; neither has been seen live, because no run has failed to save and the one wipe happened before I was watching phases.
3. ~~That `sessionData_<user>` survives a save-failure teardown.~~ **Withdrawn** — §7 shows `saveAll` writes `localStorage` before the network call, so the key is written regardless, and the source read shows it is cleared on two of the four endings. It is not a discriminator and the test need not ask about it.
4. ~~That `lastSavePlayTime` is not reset by a failed save.~~ **Answered, negatively, from the live function body** (§7): the reset is gated on `sync`, not on the outcome. One residue worth testing: whether a request that *throws* (offline) skips the reset, where a server-returned error does not.
5. ~~What the failure path logs.~~ **Answered from the live function body** (§7): `console.error(<server error string>)`, which survives the production build and is observable. What remains is the exact text for a non-`"session out of date"` failure.
6. **Whether it retries**, and what the client counts as failure — status code vs thrown vs timeout. `saveAll` itself does not retry (§7: one `await`, then the error branch), but whether `z.savedata.updateAll` retries internally is unestablished, and the request *body* is still unobserved.
7. **Whether anything appears in the UI** before the teardown runs. `saveAll` shows and hides a `savingIcon`, so there is at least an icon; whether a failure surfaces anything more is unknown.
8. **How much of a window there is** between the failed request and the title screen settling — whether a 100 ms settle poll can see the intermediate state. The measured 1042 ms save round trip (§10) says the window is at least that wide on the request side, which is encouraging.

The test is cheaper to specify than when this ticket was written, because §10 pins the target exactly — fail one `POST https://api.pokerogue.net/savedata/updateall` — and §7 says what to watch: `phaseName`, and the run-history key's length.

**How to run it safely**, when someone authorises it: on a **throwaway run**, not a parked one — start a fresh Classic run, play to wave 2 or 3 so there is something to lose, and only then fail the request. Fail exactly one save (`Fetch.failRequest` on a single matching request, then `Fetch.disable`) rather than blanket-blocking the domain, so the account is not left in a half-offline state. Snapshot the `localStorage` values and `gameStats` immediately before, and poll `phaseName` at 100 ms throughout — that is the observation the test exists to make. The run genuinely dies; that is the point, so it costs one throwaway run and should not be pointed at a run anyone cares about.

**Status: the human has ruled this test out.** The save-failure column therefore stays inferred-from-source in both documents, and is labelled as such throughout.

## 13. What I could not establish

- **The entire save-failure column of §0.** Everything about that path is inferred from the wipe measurements plus source reasoning. See §12.
- **The save request's body**, the client's failure predicate, and its retry policy (§10). The endpoint and its timing are captured; the payload is not exposed as `postData`.
- **Whether a save failure surfaces in the UI.**
- **Whether `runHistoryData_<user>` is a local cache of a server resource.** If it is, a fresh profile would show it empty until fetched, and the server's "no history entry ⇒ save failure" inference would misfire on a cold start. The `savedata/session/get` 404 shows session state *is* server-backed, so this is a real question, not a hypothetical. Not determined.
- **How many entries run history retains** before it evicts. One entry was observed. If it is capped, a long unattended session could roll an entry out before the server reads it.
- **Whether `isVictory: true` looks how I assume.** Only the `false` case was observed; nobody has won a run on this account (`sessionsWon: 0`).

## 14. Tab state left behind

I changed nothing. No input, no navigation, no storage write, no game mutation.

The passive domains I enabled (`Network`, `Runtime`, `Log`) were explicitly disabled at the end of the first listener window. The second was terminated early when I tore down the background job, so its `disable` calls did not run — but CDP domain state is per-connection, and killing the process closed the websocket, which detaches the session and drops them anyway. Verified afterwards: the game is running normally, wave 1, `SelectModifierPhase`.

The tab itself is **not** as the brief described it, and not because of me. The wave-6 run ended at `15:05:54Z` (§1), and whoever is driving the tab then started a fresh one. At the time of writing it holds:

```
ui.mode 6 (MODIFIER_SELECT), SelectModifierPhase, wave 1, turn 3, ₱1000
party: Bulbasaur L5 15/20, Charmander L5 19/19, Squirtle L5 20/20
sessionData_xauyxau2 rewritten 15:15:14.765Z at waveIndex 1
```

Two things follow. **The dev should be told the wave-6 run is gone**, and that something outside this session was playing on their account while this ticket believed the run was parked. And the new run is a **three-starter party**, which is the first party larger than one this project has seen — worth re-measuring #9's lean/fat payload costs against, since #9 explicitly flagged that its figures came from a one-pokémon party.

One incidental corroboration from the new run: `runHistoryData_<user>` stayed at exactly 5 996 bytes throughout starter select, wave 1, and the reward screen. **Run history is written at an ending, not during play** — which is what makes "did the newest key change?" a clean transition test (§11).
