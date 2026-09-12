# Telling a wipe from a run lost to a failed save

**Question:** ticket [#11](https://github.com/IIxauII/pokerogue-mcp/issues/11), source half. The live half is [`06-losing-a-run-live.md`](./06-losing-a-run-live.md).
**Source:** `pagefaultgames/pokerogue` at tag `v1.12.0.11`, commit `e4e9b5383be7c9e171d32a9daaea2658d475c521`. Full checkout, full git history. All line refs at that commit; permalinks use that SHA.
**Status of every claim below:** read off the source. Nothing here was executed. Items flagged **[live]** depend on the production bundle or on server behaviour the client cannot see; items flagged **[confirmed live]** were independently measured by the peer sessions on tickets #6 and #8 and agree with the source.

## Verdict

Five findings. The first invalidates the premise the ticket was written on; the fifth is a trap that would have made the obvious signal wrong.

1. **The two paths do not share a teardown.** The ticket (and #10) say a wipe and a per-wave save failure both call `globalScene.reset(true)`. They do not. A *clean* game over calls `globalScene.reset()` — `clearScene = false` — and unshifts `TitlePhase` by hand ([`post-game-over-phase.ts:28-29`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L28-L29)). Only the *failure* paths pass `clearScene = true`, and `clearScene` is not a cosmetic flag: it destroys the entire UI and re-runs `launchBattle()` ([`battle-scene.ts:1236-1257`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1236-L1257)), which routes through **`LoginPhase`** before `TitlePhase`. The two endings differ structurally, loudly, and for free.
2. **The signal is a phase name, and the settle loop is already reading it.** `phaseManager.getCurrentPhase().phaseName` is a plain public string the game compares at runtime. `"GameOverPhase"` appears on a wipe and cannot be missed (it holds for ≥ 6 s). `"LoginPhase"` appears on a `reset(true)` teardown and nowhere else mid-session. Neither is localized, neither can be minified away. This is a **settle-loop concern, not a `get_state` concern** — #3's business, not #7's.
3. **A persisted fallback exists for the case where the server was not watching:** `gameData.getRunHistoryData()`. Its only writer in the entire repo is `GameOverPhase` ([`game-over-phase.ts:215`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L215)), it is keyed by `Date.now()` at game-over time, and it carries `isVictory` and the dead run's `waveIndex`. A fresh entry means a game over happened; no fresh entry plus an empty party means the run was taken. It survives every teardown.
4. **A silent loss must not be reported as `run_over`, because the run is not over.** A per-wave save failure leaves the session intact on the server — the title screen offers Continue and the run resumes at its last synced wave. An agent told `run_over` would start a new run, be walked through `UiMode.SAVE_SLOT` → "overwrite?" → confirm ([`save-slot-select-ui-handler.ts:233-244`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/save-slot-select-ui-handler.ts#L233-L244)), and **delete a live run it could have resumed**. Report shape in §7.
5. **The deletion asymmetry is real but conditional, and the condition is exactly the one that breaks it.** The live wipe is confirmed: a wipe deletes the slot's session key, the save-failure path deletes nothing. But the delete is **remote-first, local-second** — `tryClearSession` only removes the local key *after* a successful `POST /savedata/session/clear` ([`game-data.ts:1212-1219`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1212-L1219)). So **a wipe suffered while the network is down leaves the key behind and falls into `reset(true)` — indistinguishable from a save failure by localStorage alone.** The network partition that causes save failures is the same condition that makes the session-key signal lie. §2.2. `runHistoryData` is written earlier, purely locally, and does not have this problem — which is what makes it the discriminator rather than a nice-to-have.

A sixth finding, not about this ticket but about #3: one save-failure sub-path does not reach the title screen at all. It **hangs the game forever** on an unhandled promise rejection. §4.3.

---

## 1. The two paths, side by side

### 1.1 Wipe (clean)

`GameOverPhase.start()` → `handleGameOver()` → `doGameOver()` → `clear()`:

```ts
            this.getRunHistoryEntry().then(runHistoryEntry => {
              globalScene.gameData.saveRunHistory(runHistoryEntry, this.isVictory);
              globalScene.phaseManager.pushNew("PostGameOverPhase", globalScene.sessionSlotId, endCardPhase);
              this.end();
            });
```
— [`game-over-phase.ts:214-218`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L214-L218). Run history is written **before** `PostGameOverPhase`, which matters in §2.2.

Then `PostGameOverPhase.start()`:

```ts
    const saveAndReset = () => {
      globalScene.gameData.saveAll(true, true, true).then(success => {
        if (!success) {
          return globalScene.reset(true);
        }
        globalScene.gameData.tryClearSession(this.slotId).then(([success]) => {
          if (!success) {
            return globalScene.reset(true);
          }
          globalScene.reset();
          globalScene.phaseManager.unshiftNew("TitlePhase");
          this.end();
        });
      });
    };
```
— [`post-game-over-phase.ts:19-33`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L19-L33).

Net: `reset()` with `clearScene = false`, `TitlePhase` unshifted directly, **no `LoginPhase`**, UI objects preserved.

### 1.2 Per-wave save failure

```ts
          globalScene.gameData
            .saveAll(true, battle.waveIndex % 5 === 1 || (globalScene.lastSavePlayTime ?? 0) >= 300)
            .then(success => {
              globalScene.disableMenu = false;
              if (!success) {
                return globalScene.reset(true);
              }
              this.doEncounter();
              globalScene.resetSeed();
            });
```
— [`encounter-phase.ts:299-307`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/encounter-phase.ts#L299-L307). Single attempt, **no retry**, no `.catch`.

### 1.3 What `clearScene = true` actually does

```ts
    if (clearScene) {
      // Reload variant data in case sprite set has changed
      this.initVariantData();

      audioManager.fadeOutBgm(250);
      this.tweens.add({
        targets: [this.uiContainer],
        alpha: 0,
        duration: 250,
        ease: "Sine.easeInOut",
        onComplete: () => {
          this.ui.freeUIData();
          this.uiContainer.remove(this.ui, true);
          this.uiContainer.destroy();
          this.children.removeAll(true);
          // TODO: Do we even need this?
          this.game.domContainer.innerHTML = "";
          // TODO: `launchBattle` calls `reset(false, false, true)`
          this.launchBattle();
        },
      });
    }
```
— [`battle-scene.ts:1236-1257`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1236-L1257).

`freeUIData()` destroys all 48 handlers and empties the array ([`ui.ts:664-668`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L664-L668)). `launchBattle()` then builds a fresh field, a **new `UI` instance**, and ends with:

```ts
    this.phaseManager.toTitleScreen(true);
    this.phaseManager.shiftPhase();
```
— [`battle-scene.ts:648-649`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L648-L649), and `toTitleScreen(addLogin = true)` unshifts `LoginPhase` ahead of `TitlePhase` ([`phase-manager.ts:258-265`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phase-manager.ts#L258-L265)).

**Consequence for #9, unrelated to this ticket but worth banking:** across a `reset(true)` every UI handler the server may have touched is a destroyed Phaser object and `scene.ui` is a different instance. #9's "rediscover every call, stateless" rule already covers this; this is the concrete reason it is not optional.

### 1.4 The scene-level diff

| | clean wipe (`reset()`) | save failure (`reset(true)`) |
|---|---|---|
| `scene.ui` | same instance | **new instance**, old one destroyed |
| `scene.ui.handlers` | same 48 objects | 48 fresh objects |
| `LoginPhase` runs | no | **yes** |
| `initVariantData()` refetch | no | yes (`_masterlist.json`) |
| BGM | continues into title | faded out over 250 ms, restarted |
| `party`, `money`, `score`, `currentBattle` | cleared | cleared |
| `sessionPlayTime` | **kept** (dead run's value) | **kept** |
| `sessionSlotId` | **kept** | kept, then overwritten by `TitlePhase` if a session is found |

`reset()` never touches `sessionPlayTime` / `lastSavePlayTime`; they are zeroed only when a new run starts ([`select-starter-phase.ts:120-121`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/select-starter-phase.ts#L120-L121), [`title-phase.ts:323-324`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/title-phase.ts#L323-L324)). Since `gameInfo.playTime = this.sessionPlayTime ?? 0` ([`battle-scene.ts:3189`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L3189)), the title-screen payload still carries the dead run's play time — on **both** paths, so #10's byte-identical finding stands.

---

## 2. What survives, store by store

Four stores outlive a teardown. Only one of them separates the cases cleanly.

### 2.1 Session key naming — five slots, and the suffix is not what you would guess

One function builds every session key, and it is the only one:

```ts
export function getSessionDataLocalStorageKey(slotId: number): string {
  if (slotId < 0) {
    throw new Error("Cannot access a negative save slot ID from localstorage!");
  }

  // TODO: Default to `Guest` as a fallback for no logged in username
  // rather than leaving a trailing underscore
  return `sessionData${slotId || ""}_${loggedInUser?.username}`;
}
```
— [`account.ts:59-67`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/account.ts#L59-L67). `SESSION_SLOTS_COUNT = 5` ([`save-slot-select-ui-handler.ts:20`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/save-slot-select-ui-handler.ts#L20)).

| Slot | Key |
|---|---|
| 0 | `sessionData_<user>` |
| 1 | `sessionData1_<user>` |
| 2 | `sessionData2_<user>` |
| 3 | `sessionData3_<user>` |
| 4 | `sessionData4_<user>` |

**The digit is infixed, not suffixed** — `sessionData3_xauyxau2`, never `sessionData_xauyxau2_3`. Slot 0's is bare because `0 || ""` is `""`. A server that checks only `sessionData_<user>` is blind to slots 1-4; the peer's `Object.keys(localStorage).filter(k => /^sessionData\d?_/.test(k))` form is the correct one, and it is the only way to enumerate slots without knowing the username in advance.

Note the same falsy-zero idiom makes `getSession(undefined)` resolve to slot 0's key, so guard slot ids with `Number.isInteger` (§3.3).

Three things are **account-wide, not per-slot**: `data_<user>` (system save), `runHistoryData_<user>` (§2.3), and `starterPrefs_<user>`. **[confirmed live]** — the peer saw exactly one `runHistoryData_*` key.

### 2.2 Who deletes a session key, and when

Exactly three functions ever call `localStorage.removeItem` on a session key. `grep -n "removeItem" src/system/game-data.ts` returns all of them:

| Function | Scope | Local delete happens | Remote call |
|---|---|---|---|
| `tryClearSession(slotId)` [`:1199-1229`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1199-L1229) | **one slot** | **only if the remote clear succeeded** ([`:1217-1219`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1217-L1219)) | `POST /savedata/session/clear` — *"For deleting the session of a finished run"* |
| `deleteSession(slotId)` [`:1141-1167`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1141-L1167) | **one slot** | only if the remote delete succeeded ([`:1153-1159`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1153-L1159)) | `GET /savedata/session/delete` — *"To delete an unfinished run"* |
| `clearLocalData()` [`:612-620`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L612-L620) | **all five slots + `data_<user>`** | unconditionally | none — local only, called from `reinitializeSaveData` |

Mapped onto the teardowns:

| Ending | Which of the three fires | Session key afterwards |
|---|---|---|
| **Clean wipe** | `tryClearSession(sessionSlotId)` from `PostGameOverPhase` ([`post-game-over-phase.ts:24`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L24)) | **active slot deleted** — **[confirmed live]**, ticket #6 saw `[]` |
| **Per-wave save failure** (`encounter-phase.ts:302-304`) | **none** | **active slot present, freshly written** with the wave that failed |
| Save failure via `verify()` / "session out of date" | `clearLocalData()` | all five gone, plus `data_<user>` |
| Wipe with the remote clear failing | `tryClearSession` runs and **returns early** | **active slot present** — see §2.2.1 |
| Save & Quit | none | active slot present |

So the asymmetry the ticket turns on is **confirmed and precise**: the save-failure path deletes nothing, because nothing on it calls any of the three. `saveAll` only ever `setItem`s, and it does so **before** the network call:

```ts
    localStorage.setItem(
      getSessionDataLocalStorageKey(globalScene.sessionSlotId),
      encrypt(JSON.stringify(sessionData), bypassLogin),
    );

    console.debug(`Session data saved to slot ${globalScene.sessionSlotId}!`);

    if (bypassLogin || !sync) {
```
— [`game-data.ts:1366-1373`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1366-L1373). The key that survives is the **active slot's** (`globalScene.sessionSlotId`), holding the wave that failed to sync — i.e. *ahead* of what the server has.

#### 2.2.1 The order-of-operations trap

`tryClearSession` is remote-first:

```ts
  async tryClearSession(slotId: number): Promise<[success: boolean, newClear: boolean]> {
    const [success] = await updateUserInfo();
    if (!success) {
      return [false, false];
    }
    ...
    const jsonResponse = await pokerogueApi.savedata.session.clear(...);

    if (!jsonResponse.error) {
      localStorage.removeItem(getSessionDataLocalStorageKey(slotId));
      return [true, !!jsonResponse.success];
    }
```
— [`game-data.ts:1199-1219`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1199-L1219). Two ways out before the `removeItem`: `updateUserInfo()` failing (a `GET /account/info`, [`account.ts:12-19`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/account.ts#L12-L19)), or `session.clear` returning an error — including the synthetic `"Unknown error"` its `catch` manufactures for a network-level throw ([`session-savedata-api.ts:108-115`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/api/session-savedata-api.ts#L108-L115)). Either returns `[false, …]`, and `PostGameOverPhase` falls to `globalScene.reset(true)` ([`post-game-over-phase.ts:26`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L26)).

**Result: a wipe during a network partition leaves the session key present and goes through `reset(true)` — byte-identical in localStorage to a per-wave save failure.** The condition that produces save failures is precisely the condition that makes the key-deletion signal lie. The same holds one step earlier: `PostGameOverPhase` calls `saveAll(true, true, true)` *before* `tryClearSession` ([`:20`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L20)), and that call re-`setItem`s the key from cache on its way to failing.

`runHistoryData` is immune, and this is exactly why: it is written by `GameOverPhase` *before* `PostGameOverPhase` exists, with no network call in its path (§2.3).

There is a third, louder partition outcome that never reaches a title screen at all. `handleGameOver` fires `GET /savedata/session/newclear` before anything else, and `newclear` **throws** on any non-ok response or network error ([`session-savedata-api.ts:21-34`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/api/session-savedata-api.ts#L21-L34)):

```ts
        .catch(_err => {
          globalScene.phaseManager.clearPhaseQueue();
          globalScene.phaseManager.unshiftNew("MessagePhase", i18next.t("menu:serverCommunicationFailed"), 2500);
          // force the game to reload after 2 seconds.
          setTimeout(() => {
            window.location.reload();
          }, 2000);
```
— [`game-over-phase.ts:276-284`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L276-L284). The guard is `if (!bypassLogin || isLocalServerConnected)` ([`:268`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L268)), and `bypassLogin` is false on pokerogue.net ([`app-constants.ts:21`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/constants/app-constants.ts#L21)), so **every** game over on the live site issues this request first. A hard partition therefore reloads the tab, writes no run history, and clears nothing — the party is still KO'd, the session is intact, and Continue resumes into a lost battle. The server sees a navigation, not a phase.

Ordered by likelihood, the partition ladder at a wipe is: `newclear` fails ⇒ page reload; `newclear` ok but `saveAll` fails ⇒ run history written, session kept, `reset(true)`; `saveAll` ok but `clear` fails ⇒ same; all three ok ⇒ the clean wipe the peer measured.

### 2.3 `runHistoryData_<user>` — the one that works

One writer, repo-wide:

```ts
  async saveRunHistory(runEntry: SessionSaveData, isVictory: boolean): Promise<boolean> {
```
— [`game-data.ts:529`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L529), called only from [`game-over-phase.ts:215`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L215). `grep -rn saveRunHistory src` returns exactly those two lines.

Shape: `Record<number, { entry: SessionSaveData; isVictory: boolean; isFavorite: boolean }>` ([`@types/save-data.ts:140-147`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/@types/save-data.ts#L140-L147)), keyed by `runEntry.timestamp` which is `Date.now()` captured in `getRunHistoryEntry()` ([`game-over-phase.ts:353`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L353)). The entry carries `waveIndex`, `party`, `money`, `score`, `seed`, `playerFaints` ([`game-over-phase.ts:333-358`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L333-L358)). Capped at 25, oldest evicted ([`game-data.ts:534-539`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L534-L539), `RUN_HISTORY_LIMIT` at [`run-history-ui-handler.ts:18`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/run-history-ui-handler.ts#L18)).

**Which endings write it:** exactly one — a game over that reached `GameOverPhase.clear()`. That covers a wipe and a victory (`isVictory` distinguishes them), in every game mode. It does **not** cover the per-wave save failure, Save & Quit, logout, a settings reload, or any of the other `reset(true)` paths in §5, none of which touch `GameOverPhase`. It also does not cover the `newclear`-failed page reload (§2.2.1), which aborts before `doGameOver`.

**Local or remote:** local only, and the source says so twice — *"At the moment, only retrievable from locale cache"* ([`game-data.ts:504-506`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L504-L506)) and a `// TODO: save run history data to server?` above both the reader and the writer ([`:506`, `:528`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L506)).

**Account-wide, not per-slot.** The key is `runHistoryData_${loggedInUser?.username}` with no slot component anywhere ([`game-data.ts:508`, `:518`, `:547-550`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L508)), and `getDataTypeKey` returns the bare `"runHistoryData"` for `GameDataType.RUN_HISTORY` with no `slotId` branch, unlike the `SESSION` case right above it ([`:85-105`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L85-L105)). **[confirmed live]** — one key, 5996 b.

**The 0-bytes-before observation is expected, not an anomaly.** `initSystem` seeds the key to the empty string when absent ([`:478-482`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L478-L482)), and `getRunHistoryData` treats a falsy value as `{}` ([`:507-520`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L507-L520)). So "key exists, 0 bytes" means *no run has ever finished on this account in this browser* — run history is browser-local and does not follow the account across machines. The peer's before/after pair (0 b → 5996 b across one wipe) is therefore a direct measurement of the writer firing, and is the strongest confirmation in this document.

Why it is robust:

- **Written before `PostGameOverPhase`**, so it lands even when the game-over path's *own* save or clear fails and it too falls into `reset(true)` — the §2.2.1 partition trap. "A game over happened" and "the teardown was clean" are recorded independently, and only the first one has no network in its path.
- **Not touched by `reinitializeSaveData`.** `clearLocalData()` removes `data_<user>` and the five session keys only.
- **Dodges the slot problem entirely**, being account-wide. No slot enumeration, no username-suffix parsing, no blindness to slots 1-4.

Reading it: AES-encrypted with the hardcoded `saveKey` ([`utils/data.ts:47-59`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/utils/data.ts#L47-L59)), so raw localStorage needs crypto-js — but the scene is reachable, so call the game's own accessor:

```js
await scene.gameData.getRunHistoryData()   // → Record<timestampString, RunEntry>, already decrypted & parsed
```

Two caveats on that accessor. It writes `localStorage[runHistoryData_<user>] = ""` if the key is missing ([`game-data.ts:518`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L518)) — harmless, once. And it is `async`, so a settle-poll predicate that must stay synchronous should not call it; use it in the post-transition report, not in the 100 ms loop.

### 2.4 `gameData.gameStats` — nothing moves on a loss

`GameStats` has no loss counter ([`game-stats.ts:4-40`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-stats.ts#L4-L40)). Every session counter, grepped:

| Counter | Incremented at | Moves on a wipe? |
|---|---|---|
| `classicSessionsPlayed` / `endlessSessionsPlayed` | [`select-starter-phase.ts:114-116`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/select-starter-phase.ts#L114-L116) — run **start** | no |
| `dailyRunSessionsPlayed` | [`title-phase.ts:316`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/title-phase.ts#L316) — run start | no |
| `sessionsWon` | [`game-over-phase.ts:175`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L175) — classic **victory** only | no |
| `dailyRunSessionsWon` | [`game-over-phase.ts:184`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L184) — daily victory only | no |
| `battles` | [`battle-end-phase.ts:27`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/battle-end-phase.ts#L27) — per battle won | no |
| `playTime` | 1 Hz timer, [`battle-scene.ts:669`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L669) | keeps ticking on both, including at the title |

**`gameStats` cannot distinguish the two cases.** It distinguishes *victory* from everything else, which is a different question. `sessionsWon` specifically is classic-only and does not move on a loss on either path — the ticket's hypothesis is dead.

### 2.5 The scene at the title screen

Nothing run-scoped survives: `money = 0`, `score = 0`, `party = []`, `modifiers = []`, `currentBattle = null`, new seed ([`battle-scene.ts:1141-1182`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1141-L1182)) — identical on both paths, which is why #10's `party.length === 0 && wave === 0` predicate is right and why it is all `gameInfo` can say.

Two scene fields *look* like discriminators and are really just the session-presence check of §2.2 in disguise, so they inherit its collisions:

- `scene.sessionSlotId` — `TitlePhase.checkLastSaveSlot()` assigns it only when a session is found ([`title-phase.ts:69`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/title-phase.ts#L69)).
- `scene.arenaBg.texture.key` — set to the resumable run's biome in the same block ([`title-phase.ts:71-74`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/title-phase.ts#L71-L74)); left at the launch default otherwise.

### 2.6 Does the save-failure path show anything?

Sometimes, and it is not the case that matters. `reinitializeSaveData` puts up a `UiMode.ALERT_MODAL` and blocks ~5 s before returning `false` ([`game-data.ts:284-306`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L284-L306), [`:627-645`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L627-L645)) — so the out-of-date and failed-validation flavours are visible, and `UiMode.ALERT_MODAL` is a mode the settle loop will see. The plain "server said no" flavour shows **nothing**: `console.error(saveError)` and straight into `reset(true)` ([`game-data.ts:1394-1395`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1394-L1395)). There is no toast and no message phase. The ticket's word "silent" is accurate for the common case.

The saving icon is not a signal either: `savingIcon.show()` is guarded by `if (sync)` ([`game-data.ts:1345-1347`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1345-L1347)), so on the four waves in five that do not sync it never appears.

**Console is a maybe, not a signal. [live]** The build marks `console.debug` and `console.log` as pure for tree-shaking in production:

```ts
          manualPureFunctions: mode === "production" ? ["console.debug", "console.log"] : [],
```
— [`vite.config.ts:37`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/vite.config.ts#L37). That should strip the per-phase `console.log(\`%cStart Phase ${...}\`)` at [`phase-manager.ts:371`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phase-manager.ts#L371), `console.debug("Session data saved to slot …")`, and `console.log("Seed:", …)` from the live bundle. `console.error` and `console.warn` are not in the list and should survive — which leaves `console.error(saveError)` observable over CDP `Runtime.consoleAPICalled`, but with a bare server-supplied string and no structure. **Treat the console as a diagnostic nicety, not the mechanism.** Whether the phase log survives on pokerogue.net is a one-line check for the live probe; if it does, the free phase trace in §3 gets even cheaper.

---

## 3. At the settled title screen, or only by watching?

**Both, with different quality.** The watched signal is exact and free; the stateless one is a good-enough reconciliation.

### 3.1 Watched — `phaseName`, exact

`Phase.phaseName` is a public abstract string that the game itself compares at runtime:

```ts
  public is<K extends keyof PhaseMap>(phaseName: K): this is PhaseMap[K] {
    return this.phaseName === phaseName;
  }
```
— [`phase.ts:43-45`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phase.ts#L43-L45). A minifier cannot rename it without breaking every `is()` call, so it is safe in the production bundle by construction — stronger than the `constructor.name` route #3 currently proposes, which leans on `keepNames: true` ([`vite.config.ts:45`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/vite.config.ts#L45)) rather than on program semantics.

`phaseManager.getCurrentPhase()` is public ([`phase-manager.ts:270`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phase-manager.ts#L270)); the game reads state off it the same way the server would (`(globalScene.phaseManager.getCurrentPhase() as LoginPhase).goToLogin()`, [`registration-form-ui-handler.ts:122`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/registration-form-ui-handler.ts#L122)).

Two marks, orthogonal:

| Mark | Meaning | Minimum dwell |
|---|---|---|
| `"GameOverPhase"` | the run reached a game over (wipe or victory) | ≥ 1000 ms `delayedCall` ([`:169`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L169)) + 5000 ms loss / 10000 ms victory `fadeOut` ([`:189-193`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L189-L193)) ⇒ **≥ 6 s** |
| `"LoginPhase"` | a `reset(true)` teardown happened | 250 ms tween before it, then two awaited network round-trips inside it ([`login-phase.ts:37`, `:46`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/login-phase.ts#L37)) ⇒ **hundreds of ms** |

`LoginPhase` is unshifted from exactly three places: `toTitleScreen(true)` — only ever called by `launchBattle()`, i.e. boot or `reset(true)`; `UnavailablePhase` ([`unavailable-phase.ts:9`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/unavailable-phase.ts#L9)); and its own login/register back buttons ([`login-phase.ts:117`, `:138`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/login-phase.ts#L117)). The last two announce themselves with their own phase names first, so they are not confusable.

Against a 100 ms settle poll both marks are comfortably wide. The cross-product:

| Observed during the transition | Ending |
|---|---|
| `GameOverPhase` → … → `TitlePhase`, no `LoginPhase` | **wipe** (or victory), session cleared, run gone |
| `GameOverPhase` → … → `LoginPhase` → `TitlePhase` | wipe whose *own* post-game-over save or clear failed; run history written, session **not** cleared |
| `LoginPhase` → `TitlePhase`, no `GameOverPhase` | `reset(true)` family — save failure, or a menu action the server itself took (§5) |
| tab navigates away | `newclear` request failed → `window.location.reload()` after 2 s ([`game-over-phase.ts:276-284`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L276-L284)) |

**What the server must keep across a wave:** one string, the highest-water phase name seen since the last tool call. Not a snapshot diff, not a copy of the run. The settle loop already samples `phaseManager` every 100 ms per #3 — this is one extra field per sample and a single-slot latch, so the cost is a `||=` per poll.

This is why it is a settle-loop concern. The teardown is fully resolved by the time the title screen settles; `get_state` arrives too late by design.

#### 3.1.1 `ui.mode` cannot substitute — there is no game-over UiMode

**[confirmed live]** The #6 peer saw `GameOverPhase` run entirely in `UiMode.MESSAGE` (0) and hand off to `UiMode.TITLE` (1). The source agrees, and the reason is structural rather than incidental: the `UiMode` enum has **no** game-over, defeat, victory or end-card member ([`enums/ui-mode.ts`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/enums/ui-mode.ts) — `MESSAGE`, `TITLE`, `COMMAND`, `FIGHT`, … 48 members, none of them an ending). `GameOverPhase` never calls `setMode` at all on the loss path: it shows text and dialogue through the message handler, fades out, and the mode it inherits is whatever the battle left behind.

Four things could in principle put a different mode on screen during a game over, and none of them yields a usable marker:

- **Retry prompt** — `UiMode.CONFIRM` at [`game-over-phase.ts:84`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L84), reachable only when `enableRetries` is on (default off, §5). `CONFIRM` is the most common mode in the game; it marks nothing.
- **Classic victory** — an `EndCardPhase` and a rival dialogue ([`:221-258`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L221-L258)), both drawn through the message handler. Still `MESSAGE`.
- **Endless victory** — `ui.showDialogue(...)` ([`:69-79`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L69-L79)). Still `MESSAGE`.
- **Daily run** — no mode of its own; it differs only in which `gameStats` counter moves (§2.4).

The one mode that *is* diagnostic appears on the wrong side: `UiMode.ALERT_MODAL`, from `showInvalidSaveModal` (§2.6) — i.e. on two of the **save-failure** flavours, never on a wipe. Seeing `ALERT_MODAL` is evidence *against* a wipe, which is useful but partial: the common "server said no" flavour shows nothing.

So `ui.mode` and `touchControls.dataset.uiMode` (#10's cheap handle) are both blind here. The phase name is the only mode-adjacent thing that carries the information.

### 3.2 Stateless — run history, good enough

For a server that reconnects and finds a settled title screen with no memory of how it got there:

```js
const hist = await scene.gameData.getRunHistoryData();
const newest = Object.keys(hist).map(Number).sort((a, b) => b - a)[0];
// newest is Date.now() at the moment of game over
```

- newest timestamp within the last ~30 s ⇒ a game over just happened; `hist[newest].isVictory` says which kind and `hist[newest].entry.waveIndex` says how far.
- no fresh entry, but the party is empty and `wave === 0` ⇒ the run was taken, not lost.

The window is fuzzy because the wipe→title transition takes ~6-15 s (§3.1) and the server's reconnect delay is unbounded. That makes it a reconciliation heuristic, not a predicate. Tighten it by pinning the run's own identity: `hist[newest].entry.seed` should equal the `globalScene.seed` the server last read during the run — `reset()` regenerates the seed at [`battle-scene.ts:1180`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1180), so an old seed is only reachable via run history.

### 3.3 Stateless — "is the run resumable?", the fact the agent actually needs

Independent of *why* the run ended: does a session still exist in the slot?

#### What actually decides whether `Continue` is rendered

**Not `TitleUiHandler`.** The option list is built in `TitlePhase.showOptions()` and handed to the handler as a config object — `globalScene.ui.setMode(UiMode.TITLE, config)` ([`title-phase.ts:197`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/title-phase.ts#L197)). The handler renders whatever it is given; it owns no session logic. The source of truth is two gates upstream, and **both must pass**:

```ts
  private async checkLastSaveSlot(): Promise<number> {
    if (loggedInUser == null) {
      return NO_SAVE_SLOT;
    }
    try {
      const sessionData = await globalScene.gameData.getSession(loggedInUser.lastSessionSlot);
      if (!sessionData) {
        return NO_SAVE_SLOT;
      }

      globalScene.sessionSlotId = loggedInUser.lastSessionSlot;
```
— [`title-phase.ts:59-80`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/title-phase.ts#L59-L80), then `if (lastSessionSlot > NO_SAVE_SLOT)` pushes Continue ([`:85-93`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/title-phase.ts#L85-L93)).

1. **`loggedInUser.lastSessionSlot`** — a **server**-supplied field, from `GET /account/info` via `updateUserInfo()` ([`account.ts:12-19`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/account.ts#L12-L19)). Note `tryClearSession` does **not** reset it — only `deleteSession` sets it to `-1` ([`game-data.ts:1154-1156`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1154-L1156)). So after a wipe this gate still points at the cleared slot.
2. **`gameData.getSession(slot)`** — **localStorage first, server fallback**: it returns the cached copy if the key exists, and only otherwise issues `GET /savedata/session/get` ([`game-data.ts:919-940`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L919-L940)).

So the answer to "is Continue driven by local storage or by the server?" is **both, in that order** — and which one is load-bearing depends on the ending:

| Ending | Gate 1 | Gate 2 | Continue |
|---|---|---|---|
| Clean wipe | still the old slot | local key **gone** ⇒ falls through to the server, which returns nothing | **absent** — **[confirmed live]** |
| Per-wave save failure | slot, refreshed by `LoginPhase` | local key **present** ⇒ returns it without a request | present, at the failed wave |
| Wipe with the remote clear failed (§2.2.1) | slot | local key present | **present** — resumes a run that is over |

The clean-wipe row is the important one: **Continue disappears only because the server agreed**. The local delete alone would not have been enough, because gate 2 falls back to the server on a miss. That makes `Continue` a *server-backed* signal on the wipe path and a *local* one on the failure path — sharper than localStorage in the ordinary case, and no sharper at all under the partition of §2.2.1, where both gates pass on both paths.

**`sessionSlots[i].hasData` reads the same thing**, per slot: `this.hasData = !!sessionData` where `sessionData = await globalScene.gameData.getSession(this.slotId)` ([`save-slot-select-ui-handler.ts:627-657`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/save-slot-select-ui-handler.ts#L627-L657)). Same two-tier local-then-server lookup, same network-partition caveat, same localStorage-caching side effect — and it is set **asynchronously after the handler is shown**, so a read taken too early sees `undefined`, and a failed load sets `hasData = true` with `malformed = true` ([`:646-654`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/save-slot-select-ui-handler.ts#L646-L654)). It is a fine *confirmation* — the peer's "all five `false`" independently proves the wipe cleared the slot rather than orphaning it — but it is not an independent source.

> **Warning for the #8 peer driving `SAVE_SLOT`: opening that menu can issue writes.** `populateSessionSlots()` constructs all five slots and calls `load()` on each ([`:325-339`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/save-slot-select-ui-handler.ts#L325-L339)), and `setupWithData` calls `await globalScene.gameData.renameSession(this.slotId, fallbackName)` for any session without a `name` ([`:554-565`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/save-slot-select-ui-handler.ts#L554-L565)) — a `POST /savedata/session/update` that also bumps `timestamp` by 1 ([`game-data.ts:943-979`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L943-L979)). Merely *looking* at the save-slot screen writes to the dev's real save. Read `hasData` if you need it, but do not treat the screen as inert.

#### Reading it without the UI

Do not read the Continue option's **label** — `i18next.t("continue", { ns: "menu" })` ([`title-phase.ts:87`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/title-phase.ts#L87)) is localized, the exact trap #10 caught with `gameMode.getName()`. Option *count* is likewise brittle (Load Game, Run History and the mode entries come and go). Call the accessor instead:

```js
const slot = Number.isInteger(scene.sessionSlotId) ? scene.sessionSlotId : 0;
const sess = await scene.gameData.getSession(slot);   // undefined ⇒ nothing to resume
```

`getSession` guards `slotId < 0` itself ([`game-data.ts:911-915`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L911-L915)) — the throwing helper is only reached past that guard. It has one side effect: on a localStorage miss it caches the server's copy back into localStorage ([`:938`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L938)). That is the same write `TitlePhase` performs a moment earlier, so it changes nothing — but a read tool that writes is worth knowing about. Pass `Number.isInteger` explicitly: `sessionSlotId` is declared without an initialiser ([`battle-scene.ts:255`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L255)) and `getSession(undefined)` silently resolves to slot 0's key via `` `sessionData${slotId || ""}_…` ``.

To enumerate slots without a scene handle, key off the §2.1 shape rather than the bare slot-0 key:

```js
Object.keys(localStorage).filter(k => /^sessionData\d?_/.test(k))
// ["sessionData_xauyxau2"] ⇒ a run in slot 0;  [] ⇒ no run cached locally
```

**[confirmed live]** The one link this document could not verify from the client — whether `POST /savedata/session/clear` actually empties the slot server-side — is now settled by the #6 measurement: after the wipe the local key was gone **and** `Continue` was absent, which per the table above requires the server-side fallback to have returned nothing too. The client's own delete is conditional on that response ([`game-data.ts:1217-1219`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1217-L1219)), and `clear` is explicitly *not* `newclear` ([`session-savedata-api.ts:93-99`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/api/session-savedata-api.ts#L93-L99)). §3.1's phase trace does not depend on any of it.

---

## 4. Observing the failed save directly

### 4.1 The HTTP shape

All of it goes through `ApiBase.doFetch` — plain `fetch`, `Authorization: <pokerogue_sessionId cookie>`, `PKR-Client-Version: <package version>` ([`api-base.ts:83-98`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/api/api-base.ts#L83-L98)). Base URL is `import.meta.env.VITE_SERVER_URL` ([`api.ts:72`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/api/api.ts#L72)) — **[live]** resolve the deployed value from a network capture; it is baked into the bundle.

`EncounterPhase` picks one of two calls per wave:

```ts
            .saveAll(true, battle.waveIndex % 5 === 1 || (globalScene.lastSavePlayTime ?? 0) >= 300)
```
— `sync` is true on waves ≡ 1 (mod 5) or when 300 s have passed since the last sync. The in-source comment says *"Game syncs to server on waves X1 and X6 (As of 1.2.0)"* ([`encounter-phase.ts:298`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/encounter-phase.ts#L298)); the predicate is `% 5 === 1`, so it is waves 1, 6, 11, 16, … — the comment and the code agree.

| `sync` | Request | Failure predicate in the game's own code |
|---|---|---|
| true | `POST /savedata/updateall`, JSON `{system, session, sessionSlotId, clientSessionId}` | `await response.text()` is **non-empty** → `saveAll` returns `false` ([`savedata-api.ts:23-34`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/api/savedata-api.ts#L23-L34), [`game-data.ts:1379-1395`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1379-L1395)) |
| false | `GET /savedata/system/verify?clientSessionId=…` | `response.ok` **and** `json.valid === false` → `saveAll` returns `false` ([`system-savedata-api.ts:40-56`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/api/system-savedata-api.ts#L40-L56), [`game-data.ts:596-610`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L596-L610)) |

**The status code is not the failure predicate, and a CDP watcher that keys on `4xx/5xx` will get this wrong in both directions.**

- `updateall` never inspects `response.status`. A **200 with a non-empty body is a failure**; a 500 with an empty body would be counted a success. The server signals errors in the body, not the status.
- `verify` inverts it: a non-ok response is *logged and ignored*, `verify()` returns `null`, and `saveAll` returns `true` ([`system-savedata-api.ts:51-55`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/api/system-savedata-api.ts#L51-L55)). **A 500 on verify is treated as a successful save.**

To observe it correctly the server needs `Network.getResponseBody` on `POST …/savedata/updateall` and to test for a non-empty body. That is exact, and it fires *before* the teardown — the earliest possible notice. It is also more machinery than §3.1's one string, and it covers only the sync waves. **Recommendation: phase names are the mechanism; the network watch is an optional enrichment that supplies the server's error text for the report.**

### 4.2 No retry, anywhere

`EncounterPhase` makes one attempt and tears down on failure (§1.2). `saveAll` makes one attempt per call. The only backoff in the codebase belongs to `UnavailableModalUiHandler`, which retries `updateUserInfo` from 5 s to a 5 min ceiling ([`unavailable-modal-ui-handler.ts:62-80`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/unavailable-modal-ui-handler.ts#L62-L80)) — a login-recovery loop, not a save retry. **One dropped packet at a wave boundary ends the run.** The guard is deliberate and old: it dates to [`2b9b63e3`](https://github.com/pagefaultgames/pokerogue/commit/2b9b63e3f360) (2024-05-12, *"Add combined save between waves"*), which only swapped `saveSystem()` for `saveAll()` under an already-existing `if (!success) return this.scene.reset(true)`. Its intent is anti-desync: if the client cannot persist, it is not allowed to keep playing.

### 4.3 The sub-path that hangs instead — a finding for #3

`PokerogueSystemSavedataApi.verify` is the only method in the API layer **without a `try`/`catch`** — `get`, `update`, `newclear`, `session.get`, `session.update`, `session.delete`, `session.clear`, `updateAll` all have one; `verify` does not ([`system-savedata-api.ts:40-56`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/api/system-savedata-api.ts#L40-L56)). `fetch` rejects on network-level failure — offline, DNS, connection reset, CORS — and that rejection propagates unbroken:

`doGet` → `PokerogueSystemSavedataApi.verify` → `GameData.verify` ([`game-data.ts:601`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L601)) → `saveAll` ([`:1374`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L1374)) → `EncounterPhase`'s `.then(success => …)` with **no `.catch`** ([`encounter-phase.ts:301`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/encounter-phase.ts#L301)).

Outcome: `doEncounter()` never runs, no phase is queued, the UI sits in `UiMode.MESSAGE` (set at [`encounter-phase.ts:290`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/encounter-phase.ts#L290)) forever. Nothing recovers it. If the previous wave was a trainer battle, `disableMenu` is also stuck `true` ([`trainer-victory-phase.ts:18`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/trainer-victory-phase.ts#L18)) because the line that clears it is inside the `.then` that never fires — so the pause menu is dead too ([`ui-inputs.ts:183`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui-inputs.ts#L183)).

Note which waves: the non-sync ones, i.e. **four waves in five**. The sync path cannot hang — `updateAll` catches ([`savedata-api.ts:30-33`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/api/savedata-api.ts#L30-L33)).

Signature over CDP: an unhandled rejection (`Runtime.exceptionThrown`), then a settle timeout at `UiMode.MESSAGE` with `phaseName === "EncounterPhase"`. This is exactly the state #3's *"20 s no-progress / 90 s hard timeout"* will trip on, and the map's *"Timeout and error model"* item should name it: **the run is alive and recoverable by reload, but this tab will never advance.** Reloading the page re-enters through boot → `LoginPhase` → `TitlePhase` → Continue, at the last synced wave.

---

## 5. Every `reset(true)` teardown path

`grep -rn -E "(globalScene|this)\.reset\(" src` — 26 call sites, all of them below. Note the shape: **`reset(true)` is the failure/teardown form, and the only two calls that pass `clearScene = false` are the two normal ones.**

| # | Site | Trigger | Args | Agent can cause? |
|---|---|---|---|---|
| 1 | [`post-game-over-phase.ts:28`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L28) | **clean game over** | `()` | yes — by wiping |
| 2 | [`game-over-phase.ts:88`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L88) | retry-battle accepted (`enableRetries`) | `()` | only if the setting is on — default **off** ([`battle-scene.ts:200`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L200), [`settings.ts:357-363`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/settings/settings.ts#L357-L363)); read `scene.enableRetries` to know |
| 3 | [`encounter-phase.ts:304`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/encounter-phase.ts#L304) | **per-wave save failure** | `(true)` | **no — the only one it cannot** |
| 4 | [`post-game-over-phase.ts:22`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L22) | game over, its `saveAll` failed | `(true)` | no |
| 5 | [`post-game-over-phase.ts:26`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/post-game-over-phase.ts#L26) | game over, its `tryClearSession` failed | `(true)` | no |
| 6 | [`menu-ui-handler.ts:654`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/menu-ui-handler.ts#L654) | **Save & Quit** — unconditional, save result ignored | `(true)` | yes, by menu |
| 7 | [`menu-ui-handler.ts:687`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/menu-ui-handler.ts#L687) | Log Out | `(true, true)` | yes, by menu |
| 8-9 | [`menu-ui-handler.ts:613`, `:633`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/menu-ui-handler.ts#L613) | unlink Discord / Google | `(true, true)` | yes, by menu (deep in Manage Data) |
| 10 | [`base-settings-ui-handler.ts:503`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/settings/base-settings-ui-handler.ts#L503) | leaving Settings after changing a reload-required setting | `(true, false, true)` | yes, by menu — **see below** |
| 11-12 | [`login-phase.ts:74`, `:107`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/login-phase.ts#L74) | HTTP 401 during login | `(true, true)` | no — at the title, no run to lose |
| 13 | [`unavailable-modal-ui-handler.ts:70`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/unavailable-modal-ui-handler.ts#L70) | 401 while reconnecting | `(true, true)` | no |
| 14-16 | [`save-slot-select-ui-handler.ts:144`, `:185`, `:240`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/save-slot-select-ui-handler.ts#L144) | rename / delete / overwrite-slot **failed** | `(true)` | yes, in the new-run flow |
| 17 | [`egg-gacha-ui-handler.ts:528`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/egg-gacha-ui-handler.ts#L528) | gacha pull's save failed | `(true)` | reachable only from the title |
| 18-21 | [`starter-select-ui-handler.ts:2079`, `:2265`, `:2309`, `:2374`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/starter-select-ui-handler.ts#L2079) | `saveSystem()` failed after a move swap / candy spend | `(true)` | yes, during starter select |
| 22-24 | [`pokedex-page-ui-handler.ts:1956`, `:1992`, `:2047`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/pokedex-page-ui-handler.ts#L1956) | `saveSystem()` failed after a candy purchase | `(true)` | yes, in the pokédex |
| 25 | [`battle-scene.ts:427`, `:641`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L641) | internal, inside `launchBattle` | `(false, false, true)` | — |

**Correction to #10's table.** It listed 18-24 as *"starter-select / pokedex / gacha **back-outs**"*. They are not back-outs: every one is an `if (!success)` guard on a failed `saveSystem()` / `saveAll()`. They are the same failure this ticket is about, wearing different clothes. And *"language change"* understates #10: **six** settings carry `requireReload` — Language, UI_Theme, Candy_Upgrade_Display, Show_Time_Of_Day_Widget, Sprite_Set, Battle_Music ([`settings.ts:424-732`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/settings/settings.ts#L424)) — and the reset fires on `clear()`, i.e. on *leaving* the settings menu, not on the change. An agent that wanders into Settings mid-run, toggles any of those six, and backs out **kills the run**.

### 5.1 The collisions that matter

The phase-name signal says "`reset(true)` happened". It does not say which of rows 3-24 it was. Two of them collide in every stored artefact as well:

| | phase trace | `runHistoryData` | active slot's `sessionData` key | net |
|---|---|---|---|---|
| Per-wave save failure (server error) | `LoginPhase`, no `GameOverPhase` | unchanged | written, at the failed wave | **indistinguishable from the next row** |
| Save & Quit | `LoginPhase`, no `GameOverPhase` | unchanged | written | **indistinguishable from the row above** |
| Wipe during a network partition (§2.2.1) | `GameOverPhase` **then** `LoginPhase` | **new entry** | present | separated by the phase trace and by run history — but **not** by the session key |

The third row is the one that matters: it collides with the first two in localStorage and is separated only by the two signals §7 keys on. Row 1 and row 2 have no in-page separator at all. But the server does not need one: **Save & Quit only happens because the server pressed it.** Rows 6-10 and 14-24 all require a menu action the server initiated and can therefore attribute. Row 3 is the only teardown an unattended agent cannot cause — which makes the attribution rule exact:

> `LoginPhase` observed with no `GameOverPhase` **and no menu action in flight** ⇒ the per-wave save failed.

Cheap to implement: the settle loop already knows whether the tool call it is settling was a `press` inside a menu or a `press` that advanced a wave.

---

### 5.2 Slot semantics, for the session about to start a fresh run

Starting a run does not pick a slot for you. `SelectStarterPhase` goes STARTER_SELECT → **`UiMode.SAVE_SLOT` in `SaveSlotUiMode.SAVE`** → `globalScene.sessionSlotId = slotId` → `initBattle` ([`select-starter-phase.ts:22-34`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/select-starter-phase.ts#L22-L34)), which matches the peer's measured TITLE → OPTION_SELECT → STARTER_SELECT → CONFIRM → SAVE_SLOT path exactly.

**Does a new run overwrite the slot?** Only past a confirmation, and the overwrite is a real delete:

```ts
              if (this.sessionSlots[cursor].hasData) {
                ui.showText(i18next.t("saveSlotSelectUiHandler:overwriteData"), null, () => {
                  ui.setOverlayMode(
                    UiMode.CONFIRM,
                    () => {
                      globalScene.gameData.deleteSession(cursor).then(response => {
```
— [`save-slot-select-ui-handler.ts:233-244`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/save-slot-select-ui-handler.ts#L233-L244). An empty slot (`hasData === false`) is taken silently ([`:256`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/save-slot-select-ui-handler.ts#L256)). **So the `overwriteData` prompt is the last line of defence against an agent that was told `run_over` after a silent loss** — and an agent that believes the run is over will confirm it. That is the concrete harm §7 is written to prevent.

**Can a stale key make a later "is there a session?" check misread?** Yes, in one direction, and it is worth stating plainly:

- After a save failure on run A in slot 0, `sessionData_<user>` holds run A at the wave that *failed to sync* — **ahead of the server's copy**. `getSession(0)` returns the local one without asking the server ([`game-data.ts:919-927`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/system/game-data.ts#L919-L927)), so `hasData`, `Continue`, and any localStorage probe all report a run that the server does not fully have. Resuming it is the game's normal behaviour and presumably fine; a server *reporting* `last_saved_wave` from the local key would overstate by up to five waves.
- A run started in a **different slot** does not touch slot 0's key. Two slots can hold two runs; `loggedInUser.lastSessionSlot` decides which one the title screen offers. A check that reads only `sessionData_<user>` therefore answers "is there a run in slot 0", not "is there a run" (§2.1).

**`classicSessionsPlayed` is not an independent marker.** **[confirmed live]** It increments in `initBattle`, at [`select-starter-phase.ts:114`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/select-starter-phase.ts#L114) — inside the same slot-select callback that assigns `sessionSlotId` and writes the session, so it is co-located with the session key by construction, not merely by coincidence. It also never moves at a run's *end* (§2.4), so it says nothing about how a run finished.

## 6. `GameOverPhase.isVictory` and friends

**Is TS `private` readable from injected JS?** Yes, in principle. `private isVictory: boolean` ([`game-over-phase.ts:38`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L38)) is a TypeScript modifier, not a `#private` field; it is assigned as an ordinary own property in the constructor ([`:44`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L44)) and erased at emit. **[live]** Property-name mangling would still hide it; the build sets `mangle: { keepNames: true }` with no `mangleProps`-style option ([`vite.config.ts:44-55`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/vite.config.ts#L44-L55)), and rolldown/oxc do not mangle properties unless asked, so it should survive — worth one live check since it is a one-liner.

**Is the phase object reachable when the title screen settles?** **No.** `PhaseManager` keeps exactly two references — `currentPhase` and `standbyPhase` ([`phase-manager.ts:248-250`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phase-manager.ts#L248-L250)). `shiftPhase()` overwrites `currentPhase` ([`:357`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phase-manager.ts#L357)) and `clearAllPhases()` nulls `standbyPhase` ([`:330-334`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phase-manager.ts#L330-L334)). No history, no last-phase slot. By the time `TitlePhase` is current the `GameOverPhase` is garbage. So `isVictory` is readable **only while `GameOverPhase` is the current phase** — a ≥ 6 s window, which the settle loop is inside anyway.

**Do not build on it regardless.** `runHistoryData[newest].isVictory` is the same bit, persisted, written by that very phase, and readable indefinitely afterwards. Read the durable copy.

**`gameStats.sessionsWon` and every other counter:** answered in §2.4 — nothing moves on a loss on either path.

---

## 7. The report shape

The map locked: *"On wipe: the server reports `run_over`; Claude decides whether to start a new run. No auto-restart."* That decision is sound and should stand **for wipes only**. A silent loss needs its own report, for a reason stronger than tidiness: `run_over` invites a new run, and a new run here walks through `UiMode.SAVE_SLOT` → "overwrite?" → confirm and **destroys a session the agent could have resumed**.

### Naming

`CONTEXT.md` defines a **run** as *"from wave 1 until the party wipes"* and a **wipe** as what ends it. A save failure is neither — the run did not end, it was taken away from the tab, and the last saved wave is still on the server. The glossary needs one new term:

> **Interrupted run** — a run removed from the tab by a failed save rather than by a wipe. The party is gone from the scene and the game is at the title, but the run's last saved **wave** is still on the server and the run can be resumed. Distinct from a **wipe**, which ends a run permanently.

That yields `run_interrupted` for the report. It is honest about the state, it reads as an incident rather than an outcome, and it contains the word that tells the agent what to do next.

### The three reports

| Report | When | Payload | Contract |
|---|---|---|---|
| `run_over` | `GameOverPhase` seen, then `TitlePhase` without `LoginPhase` | `outcome: "wipe" \| "victory"`, `wave`, `party` at the end (from run history) | unchanged — Claude decides whether to start a new run. No auto-restart. |
| `run_interrupted` | `LoginPhase` seen, no `GameOverPhase`, no menu action in flight | `reason: "save_failed"`, `last_saved_wave` (from the session in the slot), `resumable: true`, the server's error text if the network watch caught it | **an error, not a state.** The run is not over. Claude decides whether to resume or abandon. The server must not offer a fresh run as the default, and `new_run` into the occupied slot should require an explicit acknowledgement that it discards a resumable run. |
| `run_stuck` | settle timeout with `phaseName === "EncounterPhase"` at `UiMode.MESSAGE`, unhandled rejection seen | `wave`, `last_saved_wave`, `recovery: "reload"` | the §4.3 hang. The run is alive; the tab is not. Feeds the map's open *"Timeout and error model"* and *"Recovery from stuck states"* items. |

### Why the reports key on the phase trace and not on localStorage

The tempting implementation, after the #6 measurement, is `sessionData` gone ⇒ `run_over`, `sessionData` present ⇒ `run_interrupted`. **It is wrong under load.** §2.2.1: a wipe during a network partition leaves the key present and takes `reset(true)`, so it would be reported as an interrupted run — the agent would be told to resume a run whose party is dead, and Continue would happily oblige. The two conditions are not independent: partitions are what cause save failures in the first place, so the failure mode is correlated with the case it corrupts, not rare relative to it.

The phase trace does not have this problem. `GameOverPhase` ran or it did not, and whether the network was up has no bearing on that. Run history inherits the same property (§2.3). **Use localStorage only for the `resumable` / `last_saved_wave` fields, never for the `run_over` / `run_interrupted` decision itself.**

Three smaller notes for #7:

- **A game over whose own save or clear failed** (rows 4-5 of §5, and the partition case above) is `run_over` with a caveat: run history records the wipe, but the session was never cleared, so Continue still resumes a run that is over. The phase trace identifies it exactly — `GameOverPhase` **then** `LoginPhase`. Report it as `run_over` with `session_not_cleared: true` so the agent does not resume a corpse, and so the next `get_state` does not mistake the stale slot for a live run.
- **`newclear` failure reloads the tab** after 2 s ([`game-over-phase.ts:276-284`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/phases/game-over-phase.ts#L276-L284)). The CDP session sees a navigation, not a phase, and there is **no run history entry** to reconcile against afterwards — the only ending with neither a phase trace nor a persisted record. What survives is a session whose party is KO'd; the reload lands on a title screen offering Continue into a lost battle. If the server wants to catch this one, the marker is a page load it did not cause plus a session whose party has no conscious member.
- **`new_run` needs a guard, not a warning.** The `overwriteData` confirm (§5.2) is the game's own last line of defence and an agent told `run_over` will click straight through it. The server should refuse to select an occupied slot unless the caller has acknowledged the discard — a tool-surface constraint for #7, not a prompt-engineering one.

---

## 8. Corrections to existing findings

1. **The premise of #11, and #10's table entry.** A clean wipe calls `globalScene.reset()`, not `reset(true)`. The two endings are structurally different teardowns — the wipe preserves the UI and skips `LoginPhase`; the save failure destroys the UI and runs `LoginPhase`. #10's conclusion is still correct (`gameInfo` cannot tell them apart, and the payload is byte-identical) but the reason is narrower than stated: the payload is identical because `updateGameInfo()` runs after the same run-scoped teardown in both, not because the same method was called with the same arguments.
2. **#10's teardown table, row "starter-select / pokedex / gacha back-outs".** Those seven sites are failed-`saveSystem()` guards, not back-outs. §5.
3. **#10's teardown table, row "language change".** Six settings carry `requireReload`, not one, and the reset fires on leaving the settings menu. §5.
4. **#3's settled-game signal.** `phaseManager.currentPhase.constructor.name` works but leans on `keepNames: true` staying in the build config. `phase.phaseName` is a public string the game compares at runtime and cannot be renamed without breaking `Phase.is()`. Prefer it. §3.1.
5. **"The session key" is five keys.** `sessionData${slotId || ""}_<user>` — the digit is **infixed** and slot 0 has none, so the slots are `sessionData_`, `sessionData1_` … `sessionData4_`, never `sessionData_<user>_3`. Any prose (mine included, before this revision) that speaks of "the session key" should be read as "the active slot's key". §2.1.
6. **A wipe's session delete is conditional on the network, not unconditional.** `tryClearSession` removes the local key only after a successful remote clear, so the deletion asymmetry — the cleanest-looking discriminator — collapses under exactly the network partition that causes save failures. §2.2.1. This is the one finding that would have produced a wrong implementation if taken at face value from the live wipe alone, and it is why §7 keys the reports on the phase trace and run history rather than on localStorage.
7. **Nothing here invalidates a map decision.** #3, #9 and #10 all stand; #10's `party.length === 0 && wave === 0` predicate for "not in a run" is confirmed by the `reset()` teardown at [`battle-scene.ts:1141-1182`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/battle-scene.ts#L1141-L1182).

### 8.1 Two peer findings, checked against the source

- **`ui.processInput()` returning `false` does not mean the press was rejected — confirmed, and it is worse than a one-handler quirk.** `UI.processInput` is a pure pass-through to `handler.processInput(button)` ([`ui.ts:261-273`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/ui.ts#L261-L273)), and every handler builds its return from a local `success` flag that each branch must remember to set. The STARTER_SELECT `STATS` branch is the clean example: it hides three cursors, clears the species, moves the filter cursor, enables filter mode and opens a dropdown — six mutations — and never assigns `success` ([`starter-select-ui-handler.ts:1666-1676`](https://github.com/pagefaultgames/pokerogue/blob/e4e9b5383be7c9e171d32a9daaea2658d475c521/src/ui/handlers/starter-select-ui-handler.ts#L1666-L1676)), so the call returns `false` after fully honouring the press. The return value is a *"should I play the select sound"* flag, not an acceptance signal. **Nothing in this document uses it**, and nothing should: press acceptance must be judged by re-reading state after settling. Belongs in #4's handler-families finding.
- **`classicSessionsPlayed` increments at the slot-select ACTION, not at New Game — confirmed**, and the source shows why it is structural rather than incidental: §5.2.

---

## 9. For the live probe

Four things this document still cannot settle from source. None of them change the mechanism in §3.1; all are one-liners. (Two items from the first revision — *does a cleared slot stay cleared server-side* and *what run history holds* — are answered by the #6 measurement and now appear as **[confirmed live]** in §2.2, §2.3 and §3.3.)

1. **Does `console.log("%cStart Phase …")` survive the production bundle?** `manualPureFunctions` should strip it (§2.6). If it survives, the phase trace is available passively over `Runtime.consoleAPICalled` with no polling at all — the single highest-value remaining check.
2. **Is `phaseName` intact in the bundle?** Read `phaseManager.getCurrentPhase().phaseName` at any settled moment; it must be a readable string like `"CommandPhase"`. The whole of §3.1 rests on this one.
3. **Is a `private` field readable?** During any phase with one, read it off `getCurrentPhase()`. (Do **not** force a game over to test `isVictory` — and it is not needed, since run history carries the same bit.)
4. **The deployed API base URL**, from a network capture of any `/savedata/…` request.

Two things that would be valuable but should **not** be probed on the dev's account, because both are destructive: forcing a save failure (would end a live run), and opening `SAVE_SLOT` casually (writes a rename to any unnamed session — §3.3). If a partition test is ever wanted, it needs its own account.
