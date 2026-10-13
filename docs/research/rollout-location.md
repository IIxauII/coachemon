# Where can a seed-exact rollout run for a player?

Ticket: [#635](https://github.com/IIxauII/coachemon/issues/635), on the map
[Map: seed-exact fight knowledge for the player](https://github.com/IIxauII/coachemon/issues/633). Background:
[Battle oracle: replay and solve a trainer fight in the pinned clone](https://github.com/IIxauII/coachemon/issues/632).

**The question.** A **turn line** like Gordie's comes from playing turns forward in the real engine. Could that run
in the player's live tab, in a local clone of the game that the coach plugin drives, or somewhere else? For each
path: is it feasible, what does it cost, and what would a player run into?

All sources were read and all measurements were run on **2026-10-13**. Every claim carries one of three tags:

- **[verified]**: read in source, or run here.
- **[inference]**: follows from the sources, but was not run.
- **[unverified]**: plausible, but never tried.

| Source | Ref |
|---|---|
| This repo | `origin/master` @ `aca70ca` (v1.24.0) |
| Game pin (`src/escape-ladder/reviewed.json:2-6`) | `v1.12.0.11` = `e4e9b538`. The clone at `.cache/pokerogue/v1.12.0.11` has submodules `assets` @ `909b4361` and `locales` @ `e46279a0` |
| Served build, pokerogue.net | `FadeOut-uwSF2QOP.js` carries `1.12.0.11` (fetched 2026-10-13) |
| Gordie kit | `research/gordie-w180`: `docs/research/gordie-w180/kit/sim/` (`gordie-sim.test.ts`, `session-w180.json`, `s-br.json` = the winning line) |
| Machine | Apple M4, 10 cores, 16 GB. Node 26.9.0 unless stated otherwise |

Game paths below (`src/…`, `test/…`) are in the pinned clone. Repo paths are named in full.

---

## 1. Answer

| Path | Feasible? | Cost to a player | What a player would hit |
|---|---|---|---|
| **Live tab** (second scene, in-memory reload, deeper snapshot) | **No.** Each variant either breaks the live game or writes to the player's save and account. | — | The fight restarts at turn 1. The save is written. Losing a line clears the run on the server. Stats and achievements are earned that the player never earned. The fork plays on screen in real time. |
| Live tab, **separate JS realm** (a hidden same-origin frame that imports the served chunks) | Possible in principle. Unbuilt. | No install. But it means porting about 5,200 lines of upstream's harness to minified, renamed exports, once per build. | Breaks on every build. It shares the origin's `localStorage` and cookies, so one missed stub writes to the real account. |
| **Local clone via the coach plugin** | **Yes, measured.** The Gordie winning line replays the same HP for HP on a fresh, git-free install. | Node (the plugin's own ≥23.6 is enough). No global pnpm, no git. **About 0.6 GB of disk**: 32 MB of source plus 560 MB of `node_modules`. The 815 MB `assets` submodule is not needed: **one 4 KB file** replaces it. First provisioning took **about 10 s** here. Each run then costs **about 8 s to boot**, plus **0.3 s per reload** and **about 0.23 s per turn**, and peaks at 0.3–0.43 GB of RAM. | The live version moves past the clone. Upstream's harness changes under our test. On Node ≥25 every run exits 1. The store extension cannot hand over the session export yet. A 60 s MCP call cannot hold a whole search. Shared-clone filename collisions. Mid-fight exports lack the turn number. |
| **Hosted runner** | Technically yes. | A backend, and a rewrite of `PRIVACY.md` ("Nothing is sent to any server. Coachemon has no backend."). An AGPL §13 source offer. | Network and outage failures. The player's run state leaves their machine. |
| **The extension itself** | Only as a carrier. | One new read command, which means a store release. | The store flavour is one content script with no permissions, so it cannot start a process. It can only do in-page work (the live tab rows above) or pass the export to the plugin. |

**Recommendation.** A player-facing rollout should run in a **local clone that the coach plugin provisions per live
game version**. It should live in a player directory such as `~/.coachemon/game/v<version>`, never in the dev
`.cache` clone. Provision it from GitHub tarballs and a single `tackle.json`, with no git and no `assets` submodule.
The extension needs one new read command that hands the plugin `gameData.getSessionSaveData()`. Before a run, the
plugin checks that the export's own `gameVersion` matches the clone. When anything is off (version, provisioning,
harness), the coach answers "no answer" the way the encounter oracle does, not with a guess. Players who have only
the extension get no rollouts: what they see stays the HUD's replica.

---

## 2. What a rollout needs

The Gordie method ([the battle oracle issue](https://github.com/IIxauII/coachemon/issues/632) §Method) has four parts:

1. **The session.** `gameData.getSessionSaveData()` from the live tab (`src/system/game-data.ts:882-909`): run seed,
   both parties with `summonData`, modifiers, arena, money, wave, trainer, `gameVersion`. **[verified]**
2. **The engine at the same version.** The battle RNG is re-sown each turn from `shiftCharCodes(battleSeed, turn << 6)`
   (`src/battle.ts:491-509`). `battleSeed` is drawn when the `Battle` is constructed (`:81`). **[verified]**
3. **Something that plays phases headless and fast.** Upstream's harness is `GameManager`, `PhaseInterceptor` and the
   mocks: instant tweens, no sound, no renderer, a `MockClock` that forces every timer to 1 ms
   (`test/framework/game-wrapper.ts`, `test/mocks/mock-clock.ts`). Framework, helpers and mocks come to about 5,200
   lines. **[verified]**
4. **A script of inputs**, and a log of HP, stat stages and text after each turn (`gordie-sim.test.ts`).

---

## 3. In the live tab

### 3.1 What the HUD's sandbox can contain

`sandbox` (`skills/coachemon/scripts/hud/01-core.js:131-160`) mutes the phase queue and restores the RNG states,
`abilitiesApplied` and part of `turnData`. Its own comment is the limit: "`fn` must finish synchronously: the restore
runs the moment it returns" (`:130`). **[verified]**

Phases are not synchronous. **[verified]**

- They end on tween callbacks (`src/data/battle-anims.ts:932`, `:1113-1122`, `:1218`, `:1300-1309`).
- They end on scene-clock timers, such as `time.delayedCall(750, …)` and `delayedCall(1500, …)` in
  `src/phases/switch-summon-phase.ts:77`, `:120`, `:214`.
- The harness itself only gets through them by forcing every timer to 1 ms. It ticks the clock on a
  `setInterval(…, 1)` (`test/mocks/mock-clock.ts`) and polls with `vi.waitUntil`
  (`test/framework/phase-interceptor.ts:132`).

So a rollout yields to the event loop, and the live game's frames run in between. Any in-page fork shares the page's
`Phaser.Math.RND` and its `globalScene`, so it cannot be restored in one synchronous step the way the sandbox restores
a read. **[inference]**

### 3.2 A second scene

`new BattleScene()` calls `initGlobalScene(this)` in its constructor (`src/battle-scene.ts:364`), and `globalScene` is
a module-level `let` that every module reads (`src/global-scene.ts`). **[verified]** A second scene in the same page
therefore takes over the live game for as long as it exists. It also needs the harness's renderer, texture, loader,
sound and tween mocks, and putting those on the page would hit the live scene as well. **[inference]**

### 3.3 An in-memory session reload

The harness's `reloadSession` does three things (`test/helpers/reload-helper.ts`):

- It clears the phase queue and ends the current phase.
- It runs `TitlePhase.loadSaveSlot(0)`, the game's own **Continue** path.
- It spies `gameData.saveAll` so nothing is written. **[verified]**

In the live tab there is no spy. The Continue path reaches `EncounterPhase`, which saves the run
(`saveAll`; `skills/coachemon/references/game-code.md` §26, `src/phases/encounter-phase.ts:290-309`). **[verified]**

The session also has no battle turn. `Battle.turn` starts at 0 (`src/battle.ts:70`), and nothing in `game-data.ts`
restores it. **[verified]** So a reload mid-fight starts the fight again at turn 1, and every turn after that rolls on
a different seed. Reloading the original back does not undo this, because that reload starts at turn 1 too.
**[inference]**

### 3.4 A deeper snapshot and restore

Playing turns forward writes more than the sandbox restores. HP, status, `summonData` tags, the arena, and eaten
berries are the obvious ones. Account-level data is written too. **[verified]**

- **Achievements.** `validateAchv` runs in `src/phases/tera-phase.ts:48-50` and is reached through
  `validateAchvs(DamageAchv, …)` in `src/phases/move-effect-phase.ts:701`. It unlocks the achievement and shows its bar.
- **Stats.** `gameStats.highestDamage` changes in `move-effect-phase.ts:703-704`, `pokemonDefeated` in
  `victory-phase.ts:30`, and `battles` and `trainersDefeated` in `battle-end-phase.ts:27-39`.
- **A lost line.** It reaches `GameOverPhase`, which calls `pokerogueApi.savedata.session.newclear(...)`
  (`src/phases/game-over-phase.ts:269`). That clears the run on the server.

A snapshot would have to cover all of these, plus every UI handler the phases open. It would also have to survive
§3.1: the fork runs across many frames, and the canvas draws it.

### 3.5 The one in-browser variant that does not break the live game

The extension could build a separate JS realm: a hidden iframe on `pokerogue.net`, or `about:blank`, which inherits
the origin. That realm would import the served `/assets/*.js` chunks again. It would get its own `globalScene`, its own
Phaser and its own `RND`, and its version would always match the live build. `04-game-tables.js` already re-imports
these chunks in the page's own realm (`game-code.md` §22). **[inference]**

The cost is a port of the harness to the minified build:

- Exports are renamed per build, and enums are inlined numbers (`game-code.md` §22).
- The harness imports dozens of internals by module path, none of which exist in the served build.
- The realm shares the origin's `localStorage` and cookies, so `localStorage` and `pokerogueApi` must be stubbed in it
  before anything loads. One miss writes to the real account.

**[inference]** This is unbuilt and unmeasured. It is listed because it is the only path with no local install and no
version lock.

**Verdict on the live tab:** not feasible as a fork of the real engine. The HUD's synchronous replica (planner, turn
read) stays the in-tab answer.

---

## 4. In a local clone that the coach plugin drives

### 4.1 Disk: the harness needs one 4 KB asset, not the 815 MB submodule

The harness mocks `cachedFetch` to read `assets/<path>` from disk. It also **rewrites every `./battle-anims/*` fetch to
`assets/battle-anims/tackle.json`** "to save time" (`test/setup/vitest.setup.ts`, the `#utils/fetch-utils` mock).
Locales are loaded from `locales/en/**` by an `import.meta.glob` (same file). **[verified]**

I logged every non-`node_modules` `fs.readFileSync` during a battle start and three replays of the Gordie line.
**[verified]** The only `assets/` files read were:

- `battle-anims/tackle.json`: 56 reads for a battle start, 99 over three lines;
- `biome-bgm-loop-points.json`, `starter-colors.json`, `images/pokemon/variant/_masterlist.json`: one read each;
- one per-species variant JSON, read only when the masterlist is present.

Two runs settle what is needed. Each used an APFS copy-on-write copy of the clone with no `.git`.

| `assets/` contents | Result |
|---|---|
| Empty | Battle start crashes in `populateMoveAnim` → `new AnimConfig` (`src/data/battle-anims.ts:36`, reading `frames` of undefined), then times out after about 20 s. This is the failure `scripts/encounter-oracle/run.ts:40-46` guards against. **[verified]** |
| Only `battle-anims/tackle.json` (4,194 B) | All three replays of the winning line WIN. Every turn's messages and both parties' HP, status, Tera and stat stages are **identical** to the run with the full 815 MB `assets`. The other reads return 404, and the game carries on (BGM loop points, shiny colours, starter colours). **[verified]** |

`tackle.json` can be fetched on its own. At the submodule's pinned commit it is identical byte for byte
(`raw.githubusercontent.com/pagefaultgames/pokerogue-assets/909b4361…/battle-anims/tackle.json`). **[verified]**

Only `locales/en` (980 KB of the 16 MB submodule) is globbed by the harness. Trimming the rest was not tried.
**[unverified]**

### 4.2 Provisioning without git

The dev path today is three steps: `drift:check` makes a shallow `git clone` (`scripts/drift.ts:45-51`), then
`git submodule update --init` for `assets` and `locales`, then `pnpm install` (`scripts/encounter-oracle/run.ts:32-46`).
The resulting clone is **1.9 GB** **[verified]**:

- `assets`: 815 MB, plus 491 MB of its git objects;
- `node_modules`: 560 MB;
- `locales`: 16 MB, plus 4.7 MB of git objects;
- the game's own git objects: 3.3 MB; `src`: 11 MB.

I could not time those git steps here. This agent's sandbox refuses git outside its worktree.

A player path needs none of that. Measured from scratch on this machine's connection **[verified]**:

| Step | Size | Time |
|---|---|---|
| Game tarball `codeload…/pokerogue/tar.gz/refs/tags/v1.12.0.11` | 3.0 MB | 0.9 s |
| Locales tarball at the submodule commit `e46279a0` (read via `gh api …/contents/locales?ref=v1.12.0.11`) | 3.3 MB | 0.7 s |
| Extract | 32 MB on disk | 0.4 s |
| `tackle.json` | 4 KB | — |
| Cold `pnpm install --frozen-lockfile --ignore-scripts` (empty store, 343 packages downloaded) | `node_modules` 560 MB, store 557 MB | **7.5 s** (pnpm), 8.2 s wall |

The extracted tree's `src/`, `test/` and `pnpm-lock.yaml` are identical to the pinned clone's. **[verified]**

`--ignore-scripts` is needed, and harmless. The game's `postinstall` runs `lefthook install; git config --local …`
(`package.json`), which fails outside a git checkout. Nothing the harness uses needs a build script. **[verified]**

On APFS, pnpm's default import clones files out of the store, so the store and `node_modules` mostly share blocks.
**[inference]** Total: **about 0.6 GB** for one version. A later version adds only its own new packages to the store.
**[inference]**

On this connection, first-time provisioning took about 10 s. On slower broadband it scales with roughly 6 MB of
tarballs plus the compressed size of 343 packages, which I did not measure. **[unverified]**

### 4.3 Node and pnpm

- **pnpm:** none installed globally. `npx --yes pnpm@10.33.2` (the clone's `packageManager`) fetches it; that cache
  entry is 21 MB. Calling `node node_modules/vitest/vitest.mjs` directly skips pnpm and about 1.7 s of startup.
  **[verified]**
- **Node:** the clone declares `engines.node >=24.9.0`, and pnpm only warns about it. The plugin already needs Node
  ≥23.6 (`package.json` here). I ran the Gordie line under three versions **[verified]**:

  | Node | Exit code | Result |
  |---|---|---|
  | 23.6.0 | 0 | same as below |
  | 24.9.0 | 0 | same as below |
  | 26.9.0 | **1** | WIN, identical turns |

  The exit code of 1 on Node 26 comes from the "clone's own i18n rejection" that #296 and
  `scripts/encounter-oracle/run.ts:88-92` work around: `Cannot read properties of undefined (reading 'getItem')` at
  `src/i18n.ts:207`. **It is a Node ≥25 artefact, not the clone's.** Node 26 defines its own `localStorage` property
  on `globalThis`, and without `--localstorage-file` it is `undefined` with an ExperimentalWarning. That property
  shadows jsdom's. Node 24.9 has no such global. **[verified]** that the global exists on 26.9 and not on 24.9, and
  that the rejection is absent on 23.6 and 24.9. **[inference]** that the shadowing is the mechanism.

  A player runner must read vitest's results, never its exit code. The encounter oracle already does.

### 4.4 Time per line

Shared clone with full assets, three replays of the 19-turn winning line in one vitest process (marks are from the
test file's own clock) **[verified]**:

| Step | Time |
|---|---|
| vitest boot to the test body (`npx pnpm exec vitest`; transform about 4.3 s, setup about 5.8 s, overlapping) | ~0.66 s after the test file loads; **8.2 s wall** for a no-op test |
| `GameManager` + `classicMode.startBattle` | 0.23 s |
| `reloadSession` of the T1 export | 0.27–0.33 s |
| A 19-turn line | 4.27–4.33 s, so **about 0.23 s per turn** |
| Whole run, 3 lines | 22.3 s wall |

- One line in one process (fresh tarball install, `/usr/bin/time -l`): 14.3 s wall, **peak RSS 431 MB**. **[verified]**
- Four processes at once in one install, one line each: all four done in 23.6 s. Each process peaked at 302–412 MB.
  Under contention, transform and setup doubled to about 9 s and 12 s. All four gave identical WINs. **[verified]**
- The three replays in one process were identical turn for turn, so for this fight nothing leaked between reloads.
  That holds with the kit's `enemyModifiers = []` and `modifiers = []` reset. **[verified]**

Boot dominates. A Gordie-style greedy search (7 batches, about 25 lines) costs about 7 × 8 s of boot plus about
25 × 4 s of turns, roughly 2–3 minutes. A long-lived process that reads scripts from a pipe and reloads per line would
pay the boot once. **[inference]**

### 4.5 Matching the live build to the clone

- **"Build id" is the wrong name for this.** In `CONTEXT.md`, **build id** is "which build of the *extension* a tab is
  running". The game's version is a separate value:
  - `status` reports `game_version`, `pinned_version` and `version_match` (`src/driver.ts:131-133`), read from
    `game.config.gameVersion` (`src/page/probe.ts:112`). **[verified]**
  - The session export carries its own `gameVersion` (`src/system/game-data.ts:902`), so a runner can check the
    export itself against the clone's `package.json` version. **[verified]**
- **A newer session is not refused.** `initSystem` refuses system data from a newer version
  (`src/system/game-data.ts:484`). `parseSessionData` only migrates older sessions up (`:1231-1236`,
  `src/system/version-migration/version-converter.ts`). An older clone would therefore play a newer session silently,
  under the wrong rules. The version check has to be the runner's own. **[verified]**
- **The drift check does not cover rollouts.** `drift:check` guards the HUD's re-reads of game code
  (`scripts/drift.ts:1-5`), and stamping a new pin is a human sign-off. A rollout trusts the engine itself, so the
  player clone could follow whatever tag the live tab reports without waiting for a HUD re-stamp. **[inference]**

  What does pin a rollout is **our harness test**. It is written against upstream's test framework and its traps (the
  battle oracle issue §Harness traps). Fourteen upstream commits in 2026 touched `test/framework/`, the last in the
  last release (`game-manager.ts`, #7579, 2026-08-23). **[verified]** Every live version bump therefore needs the
  battle test re-run against a known fight, such as the Gordie line, before players get rollouts on that version.
  **[inference]**
- **Release cadence.** Upstream tagged 35 releases between 1 January and 23 August 2026, 12 of them (1.12.0.0–.11)
  between 24 June and 23 August. The live site still serves 1.12.0.11: the same `FadeOut-uwSF2QOP.js` that
  `research/game-code-reuse` recorded on 2026-09-16. **[verified]** Whether every deploy is tagged before it is
  served was not checked. **[unverified]**

### 4.6 Running alongside the encounter oracle

- The encounter oracle writes **fixed** names into the clone: `test/tests/coach-oracle.test.ts`,
  `.coach-oracle.bundle.js`, `.coach-oracle.report.json` and `test/reporters/.coach-default-reporter.ts`
  (`scripts/encounter-oracle/run.ts:53-58`). **[verified]**
- A rollout that uses a **unique** test filename and passes it as vitest's filter does not collide with it. Four
  rollouts ran at once with no interference (§4.4). While this ticket ran, the #636 and #638 agents had their own
  `zz-*` files in the shared clone. **[verified]**
- Keep the player install separate from the dev clone. The encounter oracle refuses on an empty `assets`
  (`run.ts:42-46`), but a player install with only `battle-anims/` would pass that check while maybe lacking what
  Mystery Encounter cases load. **[inference]**

### 4.7 Getting the session to the clone

The store flavour's command set is closed: `probe`, `menu`, `snapshot`, `starters`, `card` and the acts
(`src/protocol/commands.ts`). `snapshot` with `detail: "full"` is a curated projection (`src/page/snapshot.ts`), not a
`SessionSaveData`. It has no run seed, no modifier stacks and no arena tags. **[verified]**

The Gordie run read the export over raw CDP (`kit/cdp.mjs`), which only the dev setup has. A player path needs a new
read command, a release of the extension (with a new **build id**), and a store review. The W180 export is 26 KB,
well under the frame cap (`extension/src/dev/commands.ts`: chunks of 512 KB under a 1 MB frame). **[verified]** for the
size, **[inference]** for the rest.

### 4.8 The MCP call budget

The plugin sets `"timeout": 60000` on its MCP server (`.claude-plugin/plugin.json:13`). According to
`research/mcp-client-timeout`, a per-server `timeout` is Claude Code's **hard wall-clock limit per tool call**, and
progress notifications do not extend it. **[inference]**, read on Claude Code 2.1.269.

So:

- one batch of lines (8 s of boot plus a few lines) fits in a call;
- first provisioning on a slow line, or a whole search, does not.

Provisioning should be its own step, and a search should be a background job that is polled.

### 4.9 Failure modes a player would hit, in order of likelihood

1. **The live version moves ahead.** The coach has to provision the new tag, and our harness test may no longer run
   on it. Until a developer re-checks it against a known fight, the honest answer is "no answer". **[inference]**
2. **No session export.** The installed extension predates the new read command, so the plugin finds no command to
   call. **[inference]**
3. **Exit code 1 on Node ≥25** even when every line ran (§4.3). **[verified]**
4. **No network or a slow network** at first provisioning. About 6 MB of tarballs plus the packages. **[verified]**
5. **Disk.** About 0.6 GB per version. **[verified]**
6. **A mid-fight export replays the wrong turn seed.** The session has no turn (§3.3), so a rollout from turn 7 rolls
   as if it were turn 1 unless the harness sets `currentBattle.turn`. Gordie's export was taken at T1, so this never
   bit there. **[verified]** that the turn is missing; **[inference]** that it changes the rolls.
7. **The harness traps** from the battle oracle issue: the max-roll `randBattleSeedInt`, 31 IVs, stacked enemy
   modifiers, mid-turn reloads. These bite every version until the battle test handles them. **[verified]** in that
   issue.
8. **Windows.** Nothing here was run on Windows. **[unverified]**

---

## 5. Third paths

- **A hosted runner.** The engine runs anywhere Node does, so this is technically easy. It contradicts the published
  privacy policy: "Nothing is sent to any server. Coachemon has no backend" (`PRIVACY.md`). It would need that policy
  and the store disclosures rewritten, plus servers to run and pay for. It also needs an AGPL-3.0 §13 source offer for
  the network-served game code. **[verified]** for the policy text, **[inference]** for the rest.
- **The extension itself.** Per `PRIVACY.md`, its whole permission set is one content script on
  `https://pokerogue.net/*`. It talks to the local hub over `127.0.0.1`. Native messaging needs a permission it does
  not ask for, so it cannot start a process. Its options are the in-page ones in §3, of which only the separate realm
  (§3.5) is not destructive, or handing the export to the plugin. **[verified]** for the permission set,
  **[inference]** for the rest.

---

## 6. What this changes elsewhere on the map

- **[Replay fidelity](https://github.com/IIxauII/coachemon/issues/636).**
  - The session export has **no battle turn**. A rollout from a mid-fight export must set `currentBattle.turn` (and
    leave `battleSeedState` null), or it rolls turn 1's seed.
  - The full `assets` are not needed for fidelity. Only `tackle.json` gave the same result, HP for HP.
- **The encounter oracle and #296.** The "clone's own i18n rejection" is a **Node ≥25** artefact. Under Node 23.6 and
  24.9, vitest exits 0. The oracle's tally of known errors (`CLONE_I18N_REJECTION`) depends on the Node version.
- **[ADR draft](https://github.com/IIxauII/coachemon/issues/641).**
  - "Build id" in `CONTEXT.md` is the extension's build, so the ADR needs another term for "the game version a rollout
    runs on".
  - Shipping rollouts means the **oracle** ships, a session-export read joins the closed command set, and the dev
    clone and the player clone become two different things.
  - The version lock is our harness test, not the clone. The clone can follow the live tag automatically.
- **[Boss-fight plan prototype](https://github.com/IIxauII/coachemon/issues/639).** The budget is about 8 s per
  process plus about 0.23 s per turn per line, and a 60 s hard limit per MCP call. A search must run in the background
  or in a long-lived process.

---

## Appendix: how the numbers were taken

- **Test files.** Every test was copied into `test/tests/` under a unique name (`zz-635-9654a8-*`) and removed after
  the run. I checked that none was left behind.
  - `noop.test.ts` is a single `expect(1).toBe(1)`.
  - `start.test.ts` constructs `GameManager` and calls `classicMode.startBattle(1)`.
  - `timed.test.ts` is `gordie-sim.test.ts` from `research/gordie-w180` with two additions: `performance.now()` marks
    after `startBattle`, after each `reloadSession` and after each line, and a wrapper on `fs.readFileSync` that
    records every path outside `node_modules`.
- **Runs.** Each run was `npx --yes pnpm@10.33.2 exec vitest run test/tests/<name>` from the clone root, with
  `GORDIE_SESSION`, `GORDIE_SCRIPT` and `GORDIE_OUT` set. The scripts were the winning line from `s-br.json`, once or
  three times. The Node-version runs used `npx -p node@<v> node node_modules/vitest/vitest.mjs run …`.
- **Sparse-assets copy.** `cp -c -R` of every top-level entry except `.git`, `assets` and `.claude`, then
  `assets/battle-anims/tackle.json` alone.
- **Git-free install.** The two `codeload.github.com` tarballs, extracted with `--strip-components 1` (locales into
  `locales/`), then `pnpm install --frozen-lockfile --ignore-scripts --store-dir <empty dir>`.
- **Comparison.** Turns were compared on `msgs`, `ours` and `foes` against the full-assets run of the same script.
- **Cleanup.** The scratch copies, the store and the npx Node caches were deleted afterwards.
