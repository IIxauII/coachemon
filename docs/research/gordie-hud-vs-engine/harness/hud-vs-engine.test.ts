// #638: Gordie W180 replayed in the pinned clone with the HUD's card read at every decision. #632's gordie-sim.test.ts
// plus the HUD bridge of scripts/encounter-oracle (bundle without 99-start.js, eval'd, handed the game's tables).
// Copied into the clone's test/tests under a unique name by run.sh and removed again.
import { readFileSync, writeFileSync } from "node:fs";
import { BattleScene } from "#app/battle-scene";
import { timedEventManager } from "#app/global-event-manager";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { Button } from "#enums/buttons";
import { MoveId } from "#enums/move-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { PartyUiHandler } from "#ui/party-ui-handler";
import { beforeAll, describe, it } from "vitest";

const realRand = BattleScene.prototype.randBattleSeedInt;
const SESSION = process.env.G638_SESSION as string;
const SCRIPT = process.env.G638_SCRIPT as string;
const OUT = process.env.G638_OUT as string;
const BUNDLE = process.env.G638_BUNDLE || "";

// `hud`: take the card's own action this turn. `faint: ["hud"]`: take the card's send-in at faint prompts from here on.
type Step = { m?: string; tera?: boolean; s?: string; faint?: string[]; hud?: boolean };
// `follow`: after the steps, keep taking the card's action for up to this many more turns.
type Script = { name: string; steps: Step[]; follow?: number };

// biome-ignore lint/suspicious/noExplicitAny: the HUD is plain page-world JS with no types here.
const g = globalThis as any;
function loadHud() {
  if (!BUNDLE) return null;
  if (g.__hud) return g.__hud;
  g.window = globalThis;
  // biome-ignore lint/security/noGlobalEval: the HUD ships as one injectable script; this is how a page loads it.
  (0, eval)(readFileSync(BUNDLE, "utf8"));
  g.__hud["04-game-tables"].setGameTables({ species: speciesDataRegistry, events: timedEventManager });
  return g.__hud;
}

const plain = (x: unknown) => {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(x, (_k, v) => {
    if (typeof v === "function") return undefined;
    if (typeof v === "bigint") return String(v);
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[cycle]";
      seen.add(v);
    }
    return v;
  }) ?? "null");
};

// biome-ignore lint/suspicious/noExplicitAny: scene internals
const rngKey = (s: any) => JSON.stringify([Phaser.Math.RND.state(), s.currentBattle?.battleSeedState, s.rngOffset, s.rngSeedOverride]);

// biome-ignore lint/suspicious/noExplicitAny: scene internals
function hudRead(s: any) {
  const hud = loadHud();
  if (!hud) return null;
  const before = rngKey(s);
  const breaches = hud["01-core"].sandboxBreachCount();
  const phase = s.phaseManager.getCurrentPhase()?.phaseName ?? null;
  // biome-ignore lint/suspicious/noExplicitAny: page data
  let card: any = null, summary: any = null, error: string | null = null;
  const t0 = Date.now();
  try {
    card = hud["60-card"].readCard(s, hud["98-watch"].accountRead(s), { road: false });
    summary = hud["60-card"].cardSummary(card);
  } catch (e) {
    error = String((e as Error)?.stack ?? e).slice(0, 1200);
  }
  return {
    phase, ms: Date.now() - t0, error, summary: plain(summary), card: plain(card),
    rngKept: before === rngKey(s), breaches: hud["01-core"].sandboxBreachCount() - breaches,
  };
}

// The card's action this turn: a switch when it names one, else the slot's move.
// biome-ignore lint/suspicious/noExplicitAny: page data
const cardAction = (card: any): Step | null => {
  const f = card?.field;
  if (!f) return null;
  const sw = f.switches?.[0];
  const slot = f.slots?.[0];
  if (sw?.in?.name && sw.out) return { s: sw.in.name };
  return slot?.move ? { m: `name:${slot.move}` } : null;
};

describe("g638", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  it("hud vs engine", async () => {
    game = new GameManager(phaserGame);
    BattleScene.prototype.randBattleSeedInt = realRand;
    const scripts: Script[] = JSON.parse(readFileSync(SCRIPT, "utf8"));
    const results: unknown[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: scene internals
    const nm = (p: any) => p.getNameToRender?.() ?? p.name;

    await game.classicMode.startBattle(1 as never);
    for (const sc of scripts) {
      game.reload["sessionData"] = game.scene.gameData.parseSessionData(readFileSync(SESSION, "utf8"));
      game.scene.enemyModifiers = [];
      game.scene.modifiers = [];
      await game.reload.reloadSession();
      BattleScene.prototype.randBattleSeedInt = realRand;
      const s = game.scene;
      const raw = JSON.parse(readFileSync(SESSION, "utf8"));
      // biome-ignore lint/suspicious/noExplicitAny: scene internals
      const fix = (mons: any[], data: any[]) => mons.forEach((p, i) => {
        p.ivs = [...data[i].ivs];
        p.nature = data[i].nature;
        p.calculateStats();
        p.hp = data[i].hp;
      });
      fix(s.getPlayerParty(), raw.party);
      fix(s.getEnemyParty(), raw.enemyParty);
      // biome-ignore lint/suspicious/noExplicitAny: log
      const log: any = { name: sc.name, seed: s.currentBattle.battleSeed, version: s.game?.config?.gameVersion ?? null, turns: [] };
      let faintPref: string[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: scene internals
      const line = (p: any) => `${nm(p)}${p.isOnField() ? "*" : ""} ${p.hp}/${p.getMaxHp()}`
        + `${p.status ? " st" + p.status.effect : ""}${p.isTerastallized ? " TERA" : ""}`
        + `${p.isOnField() ? " [" + p.getStatStages().join(",") + "]" : ""}`;
      const snap = () => ({ ours: s.getPlayerParty().map(line), foes: s.getEnemyParty().map(line) });
      log.start = snap();
      const total = sc.steps.length + (sc.follow ?? 0);
      for (let i = 0; i < total; i++) {
        const turn = s.currentBattle.turn;
        const read = hudRead(s);
        game.textInterceptor.logs.length = 0;
        let st: Step = sc.steps[i] ?? { hud: true };
        if (st.faint) faintPref = st.faint;
        if (st.hud) {
          const a = cardAction(read?.card);
          if (!a) {
            log.stopped = `T${turn}: the card names no action`;
            log.turns.push({ turn, step: st, hud: read });
            break;
          }
          st = { ...a, faint: st.faint };
        }
        // biome-ignore lint/suspicious/noExplicitAny: scene internals
        const active: any = s.getPlayerField()[0];
        if (st.m?.startsWith("name:")) {
          // biome-ignore lint/suspicious/noExplicitAny: scene internals
          const pm = active.getMoveset().find((mv: any) => mv.getName() === st.m!.slice(5));
          st = { ...st, m: pm ? MoveId[pm.moveId] : st.m };
        }
        // biome-ignore lint/suspicious/noExplicitAny: scene internals
        if (st.m && !active.getMoveset().some((mv: any) => mv.moveId === (MoveId as any)[st.m!])) {
          log.stopped = `T${turn}: ${nm(active)} has no ${st.m}`;
          log.turns.push({ turn, step: st, hud: read });
          break;
        }
        // biome-ignore lint/suspicious/noExplicitAny: scene internals
        if (st.s && (st.s === nm(active) || !s.getPlayerParty().some((p: any) => nm(p) === st.s && !p.isFainted()))) {
          log.stopped = `T${turn}: cannot switch to ${st.s}`;
          log.turns.push({ turn, step: st, hud: read });
          break;
        }
        if (st.s) {
          // biome-ignore lint/suspicious/noExplicitAny: scene internals
          game.doSwitchPokemon(s.getPlayerParty().findIndex((p: any) => nm(p) === st.s));
        } else if (st.m) {
          // biome-ignore lint/suspicious/noExplicitAny: enum lookup by name
          const id = (MoveId as any)[st.m];
          if (st.tera) game.move.selectWithTera(id);
          else game.move.select(id);
        }
        try {
          await game.toEndOfTurn();
        } catch (e) {
          // biome-ignore lint/suspicious/noExplicitAny: scene internals
          if (!s.getPlayerParty().every((p: any) => p.isFainted())) {
            log.error = String(e);
            results.push(log);
            writeFileSync(OUT, JSON.stringify(results, null, 1));
            throw e;
          }
        }
        // biome-ignore lint/suspicious/noExplicitAny: log
        const t: any = { turn, step: st, hud: read, msgs: [...game.textInterceptor.logs].filter(x => x?.trim()) };
        // biome-ignore lint/suspicious/noExplicitAny: scene internals
        const lost = s.getPlayerParty().length === 0 || s.getPlayerParty().every((p: any) => p.isFainted());
        // biome-ignore lint/suspicious/noExplicitAny: scene internals
        const won = !lost && s.getEnemyParty().length > 0 && s.getEnemyParty().every((p: any) => p.isFainted());
        if (!won && !lost) {
          if (s.getPlayerField()[0]?.isFainted()) {
            game.onNextPrompt("SwitchPhase", UiMode.PARTY, () => {
              const fr = hudRead(s);
              t.faintRead = fr;
              const rec = fr?.card?.field?.slots?.[0]?.name ?? fr?.card?.field?.switches?.[0]?.in?.name ?? null;
              t.faintHudPick = rec;
              const party = s.getPlayerParty();
              const want = faintPref[0] === "hud" ? [rec] : faintPref;
              // biome-ignore lint/suspicious/noExplicitAny: scene internals
              const pick = want.map(n => party.findIndex((p: any) => nm(p) === n && !p.isFainted() && !p.isOnField()))
                // biome-ignore lint/suspicious/noExplicitAny: scene internals
                .find(x => x > 0) ?? party.findIndex((p: any) => !p.isFainted() && !p.isOnField());
              t.sentIn = nm(party[pick]);
              const h = s.ui.getHandler() as PartyUiHandler;
              h.setCursor(pick);
              h.processInput(Button.ACTION);
              h.processInput(Button.ACTION);
            });
          }
          await game.phaseInterceptor.to("CommandPhase");
        }
        Object.assign(t, snap());
        log.turns.push(t);
        writeFileSync(OUT, JSON.stringify([...results, log], null, 1));
        if (won || lost) {
          log.result = won ? "WIN" : "LOSS";
          break;
        }
      }
      log.end = snap();
      results.push(log);
      writeFileSync(OUT, JSON.stringify(results, null, 1));
    }
  }, 1_800_000);
});
