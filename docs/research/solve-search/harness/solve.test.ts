// Solve-search worker for the "how should a solve search a fight" ticket. Copied into the pinned clone's test/tests
// under a unique name by run.sh and removed again. One process boots the game once, then serves jobs:
//
//   SS_MODE=probe   — one-shot probes (the loss trap, fork fidelity), result to SS_OUT
//   SS_MODE=worker  — long-lived: claims job files from SS_DIR/jobs, writes SS_DIR/results, exits on SS_DIR/stop
//
// A job expands one node: restore the node's state (a snapshot taken at a command prompt, or a replay of its path from
// the T1 save), play one action, and report the child. A child that makes one of ours faint is expanded once per legal
// replacement, so a faint prompt is never a separate node.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { getHeapStatistics, setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { BattleScene } from "#app/battle-scene";
import { PokemonSummonData } from "#data/pokemon-data";
import { BattlerTagType } from "#enums/battler-tag-type";
import { Button } from "#enums/buttons";
import { Command } from "#enums/command";
import { MoveId } from "#enums/move-id";
import { isIgnorePP, isVirtual, MoveUseMode } from "#enums/move-use-mode";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import { PromptHandler } from "#test/helpers/prompt-handler";
import type { CommandPhase } from "#phases/command-phase";
import type { PartyUiHandler } from "#ui/party-ui-handler";
import { canTerastallize } from "#utils/pokemon-utils";
import { beforeAll, describe, it, vi } from "vitest";

const realRand = BattleScene.prototype.randBattleSeedInt;
const SESSION = process.env.SS_SESSION as string;
const MODE = process.env.SS_MODE ?? "worker";
const DIR = process.env.SS_DIR as string;
const OUT = process.env.SS_OUT as string;
const QUIET = process.env.SS_QUIET !== "0";
// SS_GC_EVERY=N forces a full GC after every Nth job and reports the heap left (the live set): growth there is a leak,
// not garbage waiting for a collection the uncapped heap has no reason to run yet.
const GC_EVERY = Number(process.env.SS_GC_EVERY ?? 0);
let forceGc: (() => void) | null = null;
if (GC_EVERY > 0) {
  setFlagsFromString("--expose-gc");
  forceGc = runInNewContext("gc");
}
let jobsDone = 0;
const nm = (p: any) => p.getNameToRender?.() ?? p.name;
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const now = () => performance.now();

type Step = { m?: string; tera?: boolean; s?: string; r?: string; w?: boolean };

// Prompts a step queued but the game never asked for. Left in place, the next decision consumes them and every later
// step is played one turn late (found here: a line through Bounce came back with each command shifted by a turn).
function clearPrompts() {
  const p: any[] = (game.promptHandler as any).prompts;
  const stale = p.length;
  p.length = 0;
  return stale;
}
type Cap = ReturnType<typeof capture>;

let phaserGame: Phaser.Game;
let game: GameManager;
let dirty = false; // a line was lost in this GameManager; a plain reload then throws (getStartingBiome)
const stats = { boots: 0, reloads: 0, rebootsAfterLoss: 0, reloadThrows: 0, lastReloadError: "", stalePrompts: 0 };

async function boot() {
  // A second GameManager in one test needs what vitest does between tests: restore the spies (PromptHandler wraps
  // the shared UI's setModeInternal, and wrapping it twice recurses) and clear the prompt interval.
  if (stats.boots > 0) vi.restoreAllMocks();
  clearInterval(PromptHandler.runInterval);
  PromptHandler.runInterval = undefined;
  game = new GameManager(phaserGame);
  BattleScene.prototype.randBattleSeedInt = realRand;
  game.override.normalizeIVs = false;
  game.override.normalizeNatures = false;
  game.override.disableShinies = false;
  await game.classicMode.startBattle(1 as any);
  stats.boots++;
  dirty = false;
}

async function loadData(json: string) {
  game.reload["sessionData"] = game.scene.gameData.parseSessionData(json);
  game.scene.enemyModifiers = [];
  game.scene.modifiers = [];
  await game.reload.reloadSession();
  BattleScene.prototype.randBattleSeedInt = realRand;
  stats.reloads++;
}

// The augmented export of replay-fidelity's experiment E: the save plus the live fields a save lacks.
function capture() {
  const s: any = game.scene;
  const b: any = s.currentBattle;
  const all = [...s.getPlayerParty(), ...s.getEnemyParty()];
  return {
    json: JSON.stringify(s.gameData.getSessionSaveData()),
    turn: b.turn,
    rnd: Phaser.Math.RND.state(),
    bss: b.battleSeedState,
    switchCounter: b.enemySwitchCounter,
    lastMove: b.lastMove,
    enemyFaints: b.enemyFaints,
    teamIdx: Object.fromEntries(s.getEnemyParty().map((p: any) => [p.id, p.initialTeamIndex])),
    bossIdx: Object.fromEntries(s.getEnemyParty().map((p: any) => [p.id, p.bossSegmentIndex])),
    temp: Object.fromEntries(all.map((p: any) => [p.id, { ...p.tempSummonData }])),
    wave: Object.fromEntries(
      all.map((p: any) => [p.id, { ...p.waveData, abilitiesApplied: [...p.waveData.abilitiesApplied] }]),
    ),
    enemySummon: Object.fromEntries(s.getEnemyParty().map((p: any) => [p.id, JSON.parse(JSON.stringify(p.summonData))])),
    // Not in replay-fidelity's list: the reload's re-summon resets an on-field mon's toxic counter (found here, T15).
    status: Object.fromEntries(
      all.filter((p: any) => p.status).map((p: any) => [p.id, { toxic: p.status.toxicTurnCount, sleep: p.status.sleepTurnsRemaining }]),
    ),
  };
}

function patch(snapshot: Cap) {
  // Patch from a private copy: PokemonSummonData keeps the arrays it is given, so patching from the snapshot itself
  // lets the next turn's stat changes write back into it, and a node restored twice comes back changed (found here:
  // a Gyarados switch-in's Intimidate stayed on the foe for every later sibling).
  const cap: Cap = JSON.parse(JSON.stringify(snapshot));
  const s: any = game.scene;
  const b: any = s.currentBattle;
  b.turn = cap.turn;
  b.battleSeedState = cap.bss;
  b.enemySwitchCounter = cap.switchCounter;
  b.lastMove = cap.lastMove;
  b.enemyFaints = cap.enemyFaints;
  Phaser.Math.RND.state(cap.rnd);
  for (const p of [...s.getPlayerParty(), ...s.getEnemyParty()]) {
    Object.assign(p.tempSummonData, cap.temp[p.id]);
    const w = cap.wave[p.id];
    p.waveData.endured = w.endured;
    p.waveData.abilityRevealed = w.abilityRevealed;
    p.waveData.abilitiesApplied = new Set(w.abilitiesApplied);
    const st = cap.status?.[p.id];
    if (st && p.status) {
      p.status.toxicTurnCount = st.toxic;
      p.status.sleepTurnsRemaining = st.sleep;
    }
  }
  for (const p of s.getEnemyParty()) {
    p.initialTeamIndex = cap.teamIdx[p.id];
    if (p.bossSegments) p.bossSegmentIndex = cap.bossIdx[p.id];
    // SS_NO_ENEMY_SUMMON=1 leaves the reload's own summonData in place: what the plain save keeps without this field.
    if (p.isOnField() && process.env.SS_NO_ENEMY_SUMMON !== "1") p.summonData = new PokemonSummonData(cap.enemySummon[p.id]);
  }
}

async function safeLoad(json: string) {
  if (dirty) {
    try {
      await loadData(json);
      dirty = false;
      return;
    } catch (e) {
      stats.reloadThrows++;
      stats.lastReloadError = String(e).slice(0, 160);
      stats.rebootsAfterLoss++;
      await boot();
    }
  }
  await loadData(json);
}

// A job's setup edits the T1 save once it is loaded, with the test framework's own override: a moveset (changeMoveset)
// and PP left, per party member. It builds a case (Struggle, a recharge, a rampage, a charge move) on the W180 save
// rather than hunting for one in the fight. A snapshot taken afterwards carries the edit in its save.
type Setup = { mon: string; foe?: boolean; moves?: string[]; ppLeft?: Record<string, number> }[];
let SETUP: Setup | null = null;
function applySetup() {
  for (const st of SETUP ?? []) {
    const party: any[] = st.foe ? (game.scene as any).getEnemyParty() : game.scene.getPlayerParty();
    const p: any = party.find((x: any) => nm(x) === st.mon || x.name === st.mon);
    if (!p) throw new Error(`setup: no ${st.mon} in the ${st.foe ? "foe's" : "player's"} party`);
    if (st.moves) game.move.changeMoveset(p, st.moves.map(m => (MoveId as any)[m]));
    for (const pm of p.getMoveset()) {
      const left = st.ppLeft?.[MoveId[pm.moveId]] ?? st.ppLeft?.["*"];
      if (left !== undefined) pm.ppUsed = Math.max(0, pm.getMovePp() - left);
    }
  }
}

async function restore(root: Cap | null, cap: Cap | null, path: Step[]) {
  const base = cap ?? root;
  await safeLoad(base ? base.json : readFileSync(SESSION, "utf8"));
  if (base) patch(base);
  else applySetup();
  if (!cap) for (const st of path) await play(st);
}

const mon = (p: any) =>
  `${nm(p)}${p.isOnField() ? "*" : ""} ${p.hp}/${p.getMaxHp()}${p.status ? " st" + p.status.effect : ""}${p.isTerastallized ? " TERA" : ""}${p.isOnField() ? " [" + p.getStatStages().join(",") + "]" : ""}`;
function view() {
  const s: any = game.scene;
  return { turn: s.currentBattle?.turn ?? -1, ours: s.getPlayerParty().map(mon), foes: s.getEnemyParty().map(mon) };
}

// State signature: two paths to the same signature are the same node for the search.
function sig() {
  const s: any = game.scene;
  const m = (p: any) =>
    [p.species.speciesId, p.hp, p.isOnField() ? 1 : 0, p.status?.effect ?? 0, p.status?.toxicTurnCount ?? 0,
      p.isTerastallized ? 1 : 0, p.isOnField() ? p.getStatStages().join(".") : "",
      p.getMoveset().map((x: any) => x.ppUsed).join("."), p.getHeldItems().map((x: any) => `${x.type.id}${x.stackCount}`).join(".")].join(":");
  // The on-field move queues: two nodes alike but for a pending recharge, rampage turn or charge turn are not the same.
  const q = (p: any) => (p.isOnField() ? p.getMoveQueue().map((x: any) => x.move).join(".") : "");
  return [s.currentBattle.turn, s.arena.playerTerasUsed, s.currentBattle.enemySwitchCounter,
    ...[...s.getPlayerParty(), ...s.getEnemyParty()].map(q).filter(Boolean),
    ...s.getPlayerParty().map(m), "|", ...s.getEnemyParty().map(m)].join(",");
}

function hpState() {
  const s: any = game.scene;
  const f = (p: any) => (p.isFainted() ? 0 : p.hp / p.getMaxHp());
  return {
    ours: s.getPlayerParty().map(f),
    foes: s.getEnemyParty().map(f),
    oursAlive: s.getPlayerParty().filter((p: any) => !p.isFainted()).length,
    foesAlive: s.getEnemyParty().filter((p: any) => !p.isFainted()).length,
  };
}

// Whether CommandPhase will run a queued move instead of asking (the second turn of Bounce, a rampage, a recharge).
// Mirrors CommandPhase.tryExecuteQueuedMove: it first drops queued moves the mon can no longer use (clearUnusableMoves),
// and it asks after all when a non-virtual queued move is not in the moveset.
function queuedRuns(a: any): boolean {
  const q: any[] = a.getMoveQueue();
  const ms: any[] = a.getMoveset();
  let i = 0;
  for (; i < q.length; i++) {
    const t = q[i];
    const pm = ms.find(m => m.moveId === t.move);
    if (t.move === MoveId.NONE || isVirtual(t.useMode) || (pm?.isUsable(a, isIgnorePP(t.useMode), true)?.[0] ?? false)) break;
  }
  if (i >= q.length) return false;
  const t = q[i];
  return t.move === MoveId.NONE || isVirtual(t.useMode) || ms.some(m => m.moveId === t.move);
}

function legal(): Step[] {
  const s: any = game.scene;
  const a: any = s.getPlayerField()[0];
  // A queued move that will run means the game won't ask for a command: the only action is to let the turn run.
  // Selecting a move anyway leaves its prompts queued for the next decision.
  if (queuedRuns(a)) return [{ w: true }];
  const out: Step[] = [];
  const tera = canTerastallize(a);
  let usable = 0;
  for (const pm of a.getMoveset()) {
    if (!pm.isUsable(a, false, true)[0]) continue;
    usable++;
    const m = MoveId[pm.moveId];
    out.push({ m });
    if (tera) out.push({ m, tera: true });
  }
  // No move usable (out of PP, or every move restricted): CommandPhase turns any fight command into Struggle
  // (handleFightCommand's useStruggle). Struggle is then the only move, with Tera still on offer.
  if (usable === 0 && a.getMoveset().length > 0) {
    out.push({ m: "STRUGGLE" });
    if (tera) out.push({ m: "STRUGGLE", tera: true });
  }
  if (!a.isTrapped?.()) {
    for (const p of s.getPlayerParty()) if (!p.isFainted() && !p.isOnField()) out.push({ s: nm(p) });
  }
  return out;
}

type Played = {
  won: boolean;
  lost: boolean;
  faint: string[] | null;
  sentIn?: string;
  msgs: string[];
  error?: string;
  stalePrompts?: number;
};
async function play(st: Step): Promise<Played> {
  const s: any = game.scene;
  game.textInterceptor.logs.length = 0;
  const res: Played = { won: false, lost: false, faint: null, msgs: [] };
  clearPrompts();
  // Refuse a step the game wouldn't offer here, rather than let the harness play something else or wait 20 s.
  const key = (x: Step) => (x.w ? "w" : x.s ? `>${x.s}` : `${x.tera ? "T:" : ""}${x.m}`);
  if (!legal().some(x => key(x) === key(st))) {
    res.error = `illegal step ${key(st)} at T${s.currentBattle?.turn}; legal: ${legal().map(key).join(" ")}`;
    return res;
  }
  if (st.w) {
    // nothing to choose: the queued move runs
  } else if (st.s) game.doSwitchPokemon(s.getPlayerParty().findIndex((p: any) => nm(p) === st.s));
  else if (st.m === "STRUGGLE") {
    // The move helper refuses a move with no PP left. Send the fight command the menu would: any slot, which
    // handleFightCommand turns into Struggle because no move is usable.
    game.onNextPrompt("CommandPhase", UiMode.COMMAND, () => {
      s.ui.setMode(UiMode.FIGHT, (s.phaseManager.getCurrentPhase() as CommandPhase).getFieldIndex());
    });
    game.onNextPrompt("CommandPhase", UiMode.FIGHT, () => {
      (s.phaseManager.getCurrentPhase() as CommandPhase).handleCommand(
        st.tera ? Command.TERA : Command.FIGHT, 0, MoveUseMode.NORMAL);
    });
  } else if (st.tera) game.move.selectWithTera((MoveId as any)[st.m!]);
  else game.move.select((MoveId as any)[st.m!]);
  // A lost line never reaches TurnEndPhase, so toEndOfTurn would spin to the harness's 20 s timeout. Retarget the
  // interceptor at the game over instead: its wait loop reads the target afresh on every pass.
  const pi: any = game.phaseInterceptor;
  const watch = setInterval(() => {
    if (s.phaseManager.getCurrentPhase()?.phaseName === "GameOverPhase") pi.target = "GameOverPhase";
  }, 1);
  try {
    await game.toEndOfTurn();
  } catch (e) {
    if (!s.getPlayerParty().every((p: any) => p.isFainted())) {
      res.error = String(e);
      dirty = true;
      clearInterval(watch);
      return res;
    }
  }
  clearInterval(watch);
  const lost = s.getPlayerParty().every((p: any) => p.isFainted());
  const won = !lost && s.getEnemyParty().every((p: any) => p.isFainted());
  res.won = won;
  res.lost = lost;
  if (lost) dirty = true;
  if (!won && !lost) {
    if (s.getPlayerField()[0]?.isFainted()) {
      const party = s.getPlayerParty();
      res.faint = party.filter((p: any) => !p.isFainted() && !p.isOnField()).map(nm);
      game.onNextPrompt("SwitchPhase", UiMode.PARTY, () => {
        let pick = st.r ? party.findIndex((p: any) => nm(p) === st.r && !p.isFainted()) : -1;
        if (pick < 0) pick = party.findIndex((p: any) => !p.isFainted() && !p.isOnField());
        res.sentIn = nm(party[pick]);
        const h = s.ui.getHandler() as PartyUiHandler;
        h.setCursor(pick);
        h.processInput(Button.ACTION);
        h.processInput(Button.ACTION);
      });
    }
    await game.phaseInterceptor.to("CommandPhase");
  }
  res.stalePrompts = clearPrompts();
  stats.stalePrompts += res.stalePrompts;
  res.msgs = game.textInterceptor.logs.filter(x => x?.trim()).map(x => x.replace(/\n/g, " "));
  return res;
}

// Expand one node: every legal action, and every legal replacement where an action makes one of ours faint.
async function expand(job: any) {
  const t0 = now();
  if (job.capFromPath) {
    await restore(null, null, job.capFromPath);
    job.cap = capture();
  }
  const root: Cap | null = job.root ?? null;
  const cap: Cap | null = job.cap ?? null;
  const path: Step[] = job.path ?? [];
  await restore(root, cap, path);
  const actions: Step[] = job.actions ?? legal();
  const children: any[] = [];
  let first = true;
  const queue: Step[] = [...actions];
  while (queue.length) {
    const st = queue.shift()!;
    if (!first) await restore(root, cap, path);
    first = false;
    const t1 = now();
    const r = await play(st);
    const child: any = { step: { ...st, ...(r.sentIn ? { r: r.sentIn } : {}) }, won: r.won, lost: r.lost, error: r.error, ms: now() - t1 };
    if (r.faint && !st.r) for (const alt of r.faint) if (alt !== r.sentIn) queue.push({ ...st, r: alt });
    if (!r.won && !r.lost && !r.error) {
      child.view = view();
      child.hp = hpState();
      child.sig = sig();
      child.legal = legal();
      if (job.wantCaps !== false) child.cap = capture();
    } else child.view = view();
    if (job.msgs) child.msgs = r.msgs;
    children.push(child);
  }
  return { id: job.id, children, ms: now() - t0, rss: process.memoryUsage().rss, stats };
}

// Play whole lines (lists of steps) from the T1 save or a snapshot: the "one line per load" unit.
async function lines(job: any) {
  const out: any[] = [];
  for (const ln of job.lines) {
    const t0 = now();
    await restore(job.root ?? null, null, []);
    const t1 = now();
    const turns: any[] = [];
    let result = "OPEN";
    for (const st of ln.steps) {
      const r = await play(st);
      turns.push({ step: { ...st, ...(r.sentIn ? { r: r.sentIn } : {}) }, ...view(), msgs: job.msgs ? r.msgs : undefined });
      if (r.error) {
        result = "ERROR " + r.error.slice(0, 120);
        break;
      }
      if (r.won || r.lost) {
        result = r.won ? "WIN" : "LOSS";
        break;
      }
    }
    out.push({ name: ln.name, result, loadMs: t1 - t0, playMs: now() - t1, turns });
  }
  return { id: job.id, lines: out, rss: process.memoryUsage().rss, stats };
}

// Fork fidelity: play a line from T1 taking a snapshot at every command prompt, then restore each snapshot in the same
// process and play the rest of the line. Every continuation must match the reference view for view.
async function forkcheck(job: any) {
  await restore(null, null, []);
  const steps: Step[] = job.steps;
  const ref: any[] = [];
  const caps: Cap[] = [];
  for (const st of steps) {
    caps.push(capture());
    const r = await play(st);
    ref.push({ ...view(), won: r.won, lost: r.lost });
    if (r.won || r.lost) break;
  }
  const checks: any[] = [];
  for (let k = 1; k < caps.length; k++) {
    const t0 = now();
    await restore(null, caps[k], []);
    const tl = now() - t0;
    const atRestore = { ...view(), won: false, lost: false };
    let firstDiff: any =
      JSON.stringify(atRestore) !== JSON.stringify({ ...ref[k - 1], won: false, lost: false })
        ? { at: "restore", got: atRestore, want: ref[k - 1] }
        : null;
    for (let i = k; i < ref.length; i++) {
      const r = await play(steps[i]);
      const v = { ...view(), won: r.won, lost: r.lost };
      if (!firstDiff && JSON.stringify(v) !== JSON.stringify(ref[i])) firstDiff = { at: i, got: v, want: ref[i] };
      if (r.won || r.lost) break;
    }
    checks.push({ fromStep: k, turn: ref[k - 1].turn, restoreMs: tl, match: !firstDiff, firstDiff });
  }
  return { id: job.id, refEnd: ref[ref.length - 1], checks, stats };
}

// Chain fidelity: what a search does — restore the parent's snapshot, play one step, snapshot the child, repeat —
// against a straight replay of the same steps.
async function chaincheck(job: any) {
  const steps: Step[] = job.steps;
  // Chained first, as the search ran it; then the straight replay, which may break where the two part.
  const chained: any[] = [];
  let cap: Cap | null = null;
  await restore(null, null, []);
  for (let i = 0; i < steps.length; i++) {
    if (cap) await restore(null, cap, []);
    const r = await play(steps[i]);
    chained.push({ ...view(), won: r.won, lost: r.lost, sentIn: r.sentIn ?? null, msgs: r.msgs });
    if (r.won || r.lost || r.error) break;
    cap = capture();
  }
  const diffs: any[] = [];
  await restore(null, null, []);
  for (let i = 0; i < chained.length; i++) {
    let v: any;
    try {
      const r = await play(steps[i]);
      v = { ...view(), won: r.won, lost: r.lost, sentIn: r.sentIn ?? null, msgs: r.msgs };
    } catch (e) {
      diffs.push({ step: i, straightThrew: String(e).slice(0, 200), chained: chained[i], chainedBefore: chained[i - 1] });
      break;
    }
    const strip = (x: any) => JSON.stringify({ ...x, msgs: undefined });
    if (strip(v) !== strip(chained[i])) diffs.push({ step: i, straight: v, chained: chained[i] });
    if (v.won || v.lost) break;
  }
  return { id: job.id, steps: chained.length, diffs: diffs.slice(0, 2), ndiffs: diffs.length, stats };
}

// The on-field forced-move state a save could drop: each active mon's move queue and battler tags with their turns.
function fx() {
  const s: any = game.scene;
  const f = (p: any) =>
    p
      ? {
          q: p.getMoveQueue().map((x: any) => `${MoveId[x.move]}:${x.useMode}`),
          tags: p.summonData.tags.map((t: any) => `${BattlerTagType[t.tagType]}:${t.turnCount}`),
        }
      : null;
  return { ours: f(s.getPlayerField()[0]), foe: f(s.getEnemyField()[0]) };
}

// Forced moves (Struggle, a recharge, a rampage, a charge move) on a case built by the job's setup.
// Pass 1 plays the script as a search would, chained: at every decision it takes legal(), plays "wait" when that is
// all legal() offers and otherwise the next scripted step legal() offers, then snapshots, restores the snapshot and
// records what the restore changed. Pass 2 replays the steps pass 1 played straight from the save. A step whose
// prompts were left unconsumed (stalePrompts) or that timed out is a choice legal() offered that the game ignored,
// or a turn legal() called forced that the game asked about.
async function forced(job: any) {
  const script: Step[] = job.script;
  const steps: Step[] = [];
  const chained: any[] = [];
  let k = 0;
  await restore(null, null, []);
  for (let i = 0; i < (job.n ?? 12); i++) {
    const L = legal();
    const key = (x: Step) => (x.w ? "w" : x.s ? `>${x.s}` : `${x.tera ? "T:" : ""}${x.m}`);
    let st: Step | undefined;
    if (L.length === 1 && L[0].w) st = { w: true };
    else {
      while (k < script.length && !L.some(x => key(x) === key(script[k]))) k++;
      st = script[k++];
    }
    if (!st) break;
    const before = fx();
    const r = await play(st);
    steps.push({ ...st, ...(r.sentIn ? { r: r.sentIn } : {}) });
    const rec: any = {
      legal: L.map(key), step: key(st), before, ...view(), fx: fx(), won: r.won, lost: r.lost,
      error: r.error, stalePrompts: r.stalePrompts, msgs: r.msgs,
    };
    chained.push(rec);
    if (r.won || r.lost || r.error) break;
    rec.pp = (game.scene as any).getPlayerField()[0].getMoveset().map((m: any) => `${MoveId[m.moveId]}:${m.getMovePp() - m.ppUsed}`);
    const cap = capture();
    const live = JSON.stringify({ ...view(), fx: fx() });
    await restore(null, cap, []);
    const back = JSON.stringify({ ...view(), fx: fx() });
    if (back !== live) rec.restoreChanged = { live: JSON.parse(live), back: JSON.parse(back) };
    const saved = JSON.parse(cap.json).party.find((p: any) => p.id === (game.scene as any).getPlayerField()[0]?.id);
    rec.saved = saved ? { moveQueue: saved.summonData?.moveQueue, tags: saved.summonData?.tags } : null;
  }
  const diffs: any[] = [];
  await restore(null, null, []);
  for (let i = 0; i < steps.length; i++) {
    const r = await play(steps[i]);
    const v = { ...view(), fx: fx(), won: r.won, lost: r.lost, error: r.error, stalePrompts: r.stalePrompts };
    const c = chained[i];
    const want = { turn: c.turn, ours: c.ours, foes: c.foes, fx: c.fx, won: c.won, lost: c.lost, error: c.error, stalePrompts: c.stalePrompts };
    if (JSON.stringify(v) !== JSON.stringify(want)) diffs.push({ step: i, straight: v, chained: want });
    if (r.won || r.lost || r.error) break;
  }
  const fork = job.fork ? await forkcheck({ id: `${job.id}-fork`, steps }) : undefined;
  return { id: job.id, steps, chained, diffs, fork, stats };
}

describe("solve-search", () => {
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  it("serve", async () => {
    const origLog = console.log;
    if (QUIET) {
      console.log = () => {};
      console.info = () => {};
      console.debug = () => {};
      console.warn = () => {};
    }
    const tBoot = now();
    await boot();
    const bootMs = now() - tBoot;
    if (MODE === "probe") {
      const job = JSON.parse(readFileSync(process.env.SS_JOB as string, "utf8"));
      const res: any = { bootMs, results: [] };
      for (const j of job.jobs) {
        SETUP = j.setup ?? null;
        try {
          res.results.push(
            j.kind === "lines"
              ? await lines(j)
              : j.kind === "forkcheck"
                ? await forkcheck(j)
                : j.kind === "chaincheck"
                  ? await chaincheck(j)
                  : j.kind === "forced"
                    ? await forced(j)
                    : await expand(j),
          );
        } catch (e) {
          res.results.push({ id: j.id, fatal: String(e), stack: (e as Error).stack?.split("\n").slice(0, 8) });
          writeFileSync(OUT, JSON.stringify(res));
          await boot();
        }
        writeFileSync(OUT, JSON.stringify(res));
      }
      res.stats = stats;
      writeFileSync(OUT, JSON.stringify(res));
      return;
    }
    // worker
    const me = `${process.pid}`;
    // The heap limit this process actually runs under: proof that run.sh's SS_HEAP_MB reached the forked worker.
    const h = getHeapStatistics();
    writeFileSync(
      `${DIR}/ready.${me}`,
      JSON.stringify({
        bootMs,
        pid: process.pid,
        ppid: process.ppid,
        heapLimitMb: Math.round(h.heap_size_limit / 2 ** 20),
        nodeOptions: process.env.NODE_OPTIONS ?? null,
        execArgv: process.execArgv,
      }),
    );
    let idleSince = now();
    for (;;) {
      if (existsSync(`${DIR}/stop`) || !existsSync(`${DIR}/jobs`) || now() - idleSince > 300_000) break;
      let claimed: string | null = null;
      for (const f of readdirSync(`${DIR}/jobs`).sort()) {
        try {
          renameSync(`${DIR}/jobs/${f}`, `${DIR}/claimed/${f}.${me}`);
          claimed = f;
          break;
        } catch {}
      }
      if (!claimed) {
        sleep(10);
        continue;
      }
      idleSince = now();
      const job = JSON.parse(readFileSync(`${DIR}/claimed/${claimed}.${me}`, "utf8"));
      let res: any;
      SETUP = job.setup ?? null;
      try {
        res = job.kind === "lines" ? await lines(job) : await expand(job);
      } catch (e) {
        res = { id: job.id, fatal: String(e), stack: (e as Error).stack?.split("\n").slice(0, 8) };
        try {
          await boot();
        } catch {}
      }
      res.worker = me;
      res.heapUsed = getHeapStatistics().used_heap_size;
      if (forceGc && ++jobsDone % GC_EVERY === 0) {
        forceGc();
        res.liveHeap = getHeapStatistics().used_heap_size;
      }
      writeFileSync(`${DIR}/results/.${claimed}.tmp`, JSON.stringify(res));
      renameSync(`${DIR}/results/.${claimed}.tmp`, `${DIR}/results/${claimed}`);
    }
    console.log = origLog;
  }, 24 * 3600_000);
});
