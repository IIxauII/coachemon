// Gordie W180 sim: loads the live session in the pinned clone and plays a scripted line with the real battle RNG.
// Copied into the clone's test/tests by sim.sh and removed again.
import { readFileSync, writeFileSync } from "node:fs";
import { BattleScene } from "#app/battle-scene";
import { MoveId } from "#enums/move-id";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import type { PartyUiHandler } from "#ui/party-ui-handler";
import { Button } from "#enums/buttons";
import { beforeAll, describe, it } from "vitest";

const realRand = BattleScene.prototype.randBattleSeedInt;
const SESSION = process.env.GORDIE_SESSION as string;
const SCRIPT = process.env.GORDIE_SCRIPT as string;
const OUT = process.env.GORDIE_OUT as string;

type Step = { m?: string; tera?: boolean; s?: string; faint?: string[] };

describe("gordie", () => {
  let phaserGame: Phaser.Game;
  let game: GameManager;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  it("sim", async () => {
    game = new GameManager(phaserGame);
    BattleScene.prototype.randBattleSeedInt = realRand;
    const scripts: { name: string; steps: Step[] }[] = JSON.parse(readFileSync(SCRIPT, "utf8"));
    const results: unknown[] = [];
    const nm = (p: any) => p.getNameToRender?.() ?? p.name;

    await game.classicMode.startBattle(1 as any);
    for (const sc of scripts) {
      game.reload["sessionData"] = game.scene.gameData.parseSessionData(readFileSync(SESSION, "utf8"));
      game.scene.enemyModifiers = [];
      game.scene.modifiers = [];
      await game.reload.reloadSession();
      BattleScene.prototype.randBattleSeedInt = realRand;
      const s = game.scene;
      const raw = JSON.parse(readFileSync(SESSION, "utf8"));
      const fix = (mons: any[], data: any[]) => mons.forEach((p, i) => {
        p.ivs = [...data[i].ivs];
        p.nature = data[i].nature;
        p.calculateStats();
        p.hp = data[i].hp;
      });
      fix(s.getPlayerParty(), raw.party);
      fix(s.getEnemyParty(), raw.enemyParty);
      const log: any = { name: sc.name, seed: s.currentBattle.battleSeed, turns: [] };
      let faintPref: string[] = [];
      const snap = () => ({
        ours: s.getPlayerParty().map((p: any) => `${nm(p)}${p.isOnField() ? "*" : ""} ${p.hp}/${p.getMaxHp()}`
          + `${p.status ? " st" + p.status.effect : ""}${p.isTerastallized ? " TERA" : ""}`
          + `${p.isOnField() ? " [" + p.getStatStages().join(",") + "]" : ""}`),
        foes: s.getEnemyParty().map((p: any) => `${nm(p)}${p.isOnField() ? "*" : ""} ${p.hp}/${p.getMaxHp()}`
          + `${p.status ? " st" + p.status.effect : ""}${p.isTerastallized ? " TERA" : ""}`
          + `${p.isOnField() ? " [" + p.getStatStages().join(",") + "]" : ""}`),
      });
      log.start = snap();
      log.stats = [...s.getPlayerParty(), ...s.getEnemyParty()].map((p: any) => [nm(p), p.level, p.stats.join(','), p.ivs.join(','), p.nature, p.getModifiers?.()?.length]);
      log.mods = s.modifiers.map((m: any) => m.type?.name + ':' + m.stackCount);
      for (const [i, st] of sc.steps.entries()) {
        const turn = s.currentBattle.turn;
        game.textInterceptor.logs.length = 0;
        if (st.faint) faintPref = st.faint;
        const active: any = s.getPlayerField()[0];
        if (st.m && !active.getMoveset().some((mv: any) => mv.moveId === (MoveId as any)[st.m])) {
          log.stopped = `T${turn}: ${nm(active)} has no ${st.m}`;
          break;
        }
        if (st.s && (st.s === nm(active) || !s.getPlayerParty().some((p: any) => nm(p) === st.s && !p.isFainted()))) {
          log.stopped = `T${turn}: cannot switch to ${st.s}`;
          break;
        }
        if (st.s) {
          const idx = s.getPlayerParty().findIndex((p: any) => nm(p) === st.s);
          game.doSwitchPokemon(idx);
        } else if (st.m) {
          const id = (MoveId as any)[st.m];
          if (st.tera) game.move.selectWithTera(id);
          else game.move.select(id);
        }
        try {
          await game.toEndOfTurn();
        } catch (e) {
          if (!s.getPlayerParty().every((p: any) => p.isFainted())) {
            log.error = String(e);
            results.push(log);
            writeFileSync(OUT, JSON.stringify(results, null, 1));
            throw e;
          }
        }
        const t: any = { turn, step: st, msgs: [...game.textInterceptor.logs].filter(x => x && x.trim()) };
        const lost = s.getPlayerParty().length === 0 || s.getPlayerParty().every((p: any) => p.isFainted());
        const won = !lost && s.getEnemyParty().length > 0 && s.getEnemyParty().every((p: any) => p.isFainted());
        if (!won && !lost) {
          if (s.getPlayerField()[0]?.isFainted()) {
            game.onNextPrompt("SwitchPhase", UiMode.PARTY, () => {
              const party = s.getPlayerParty();
              const pick = faintPref.map(n => party.findIndex((p: any) => nm(p) === n && !p.isFainted() && !p.isOnField()))
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
  }, 900_000);
});
