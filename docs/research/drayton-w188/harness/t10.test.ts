// Drayton W188, the T10 checkpoint miss: plays the oracle line from the wave-start save, then follows the game past the
// win to the rewards screen, logging every message and Reshiram's HP at each phase, to see where the replay's 38 HP
// (read at the end of the turn) and the live 114 (read on the rewards screen) part. Copied into the pinned clone's
// test/tests by t10.sh and removed again.
import { readFileSync, writeFileSync } from "node:fs";
import { BattleScene } from "#app/battle-scene";
import { MoveId } from "#enums/move-id";
import { GameManager } from "#test/framework/game-manager";
import { beforeAll, describe, it } from "vitest";

const realRand = BattleScene.prototype.randBattleSeedInt;
const SESSION = process.env.T10_SESSION as string;
const OUT = process.env.T10_OUT as string;

type Step = { m?: string; tera?: boolean; s?: string };
const LINE: Step[] = [
  { s: "Probopass" }, { m: "EARTH_POWER" }, { s: "Reshiram" }, { m: "BLUE_FLARE" }, { m: "FICKLE_BEAM" },
  { m: "FICKLE_BEAM", tera: true }, { m: "DRAGON_PULSE" }, { m: "HYPER_VOICE" }, { m: "HYPER_VOICE" },
  { m: "HYPER_VOICE" },
];

describe("drayton-t10", () => {
  let phaserGame: Phaser.Game;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  it("t10", async () => {
    const game = new GameManager(phaserGame);
    BattleScene.prototype.randBattleSeedInt = realRand;
    game.override.normalizeIVs = false;
    game.override.normalizeNatures = false;
    game.override.disableShinies = false;
    await game.classicMode.startBattle(1 as any);
    game.reload["sessionData"] = game.scene.gameData.parseSessionData(readFileSync(SESSION, "utf8"));
    game.scene.enemyModifiers = [];
    game.scene.modifiers = [];
    await game.reload.reloadSession();
    BattleScene.prototype.randBattleSeedInt = realRand;

    const s: any = game.scene;
    const nm = (p: any) => p.getNameToRender?.() ?? p.name;
    const resh = () => s.getPlayerParty().find((p: any) => nm(p) === "Reshiram");
    const out: any = { turns: [], trace: [] };
    for (const st of LINE.slice(0, -1)) {
      game.textInterceptor.logs.length = 0;
      if (st.s) game.doSwitchPokemon(s.getPlayerParty().findIndex((p: any) => nm(p) === st.s));
      else if (st.tera) game.move.selectWithTera((MoveId as any)[st.m!]);
      else game.move.select((MoveId as any)[st.m!]);
      await game.toEndOfTurn();
      await game.phaseInterceptor.to("CommandPhase");
      out.turns.push({ step: st, reshiram: resh()?.hp, msgs: [...game.textInterceptor.logs] });
    }

    // The last turn, phase by phase, through the win to the rewards screen.
    game.textInterceptor.logs.length = 0;
    game.move.select(MoveId.HYPER_VOICE);
    const pm = s.phaseManager;
    const orig = pm.shiftPhase.bind(pm);
    let lastHp = resh().hp;
    pm.shiftPhase = (...a: any[]) => {
      const r = orig(...a);
      const ph = pm.getCurrentPhase()?.phaseName;
      const hp = resh()?.hp;
      if (hp !== lastHp || out.trace.length === 0 || /Victory|BattleEnd|Modifier|Exp|LevelUp|TrainerVictory/.test(ph)) {
        out.trace.push({ phase: ph, reshiram: hp, maxHp: resh()?.getMaxHp(), level: resh()?.level, msgs: game.textInterceptor.logs.length });
        lastHp = hp;
      }
      return r;
    };
    await game.phaseInterceptor.to("SelectModifierPhase", false);
    pm.shiftPhase = orig;
    out.end = { reshiram: resh().hp, maxHp: resh().getMaxHp(), level: resh().level, msgs: [...game.textInterceptor.logs] };
    out.party = s.getPlayerParty().map((p: any) => `${nm(p)} L${p.level} ${p.hp}/${p.getMaxHp()}`);
    out.foes = s.getEnemyParty().map((p: any) => `${nm(p)} ${p.hp}/${p.getMaxHp()}`);
    writeFileSync(OUT, JSON.stringify(out, null, 1));
  }, 300_000);
});
