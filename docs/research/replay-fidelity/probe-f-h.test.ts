// Replay-fidelity probes for #636, part 2: wild waves, doubles, Mystery Encounters. Copied in and removed again.
import { readFileSync, writeFileSync } from "node:fs";
import { BattleScene } from "#app/battle-scene";
import { AbilityId } from "#enums/ability-id";
import { MysteryEncounterType } from "#enums/mystery-encounter-type";
import { UiMode } from "#enums/ui-mode";
import { GameManager } from "#test/framework/game-manager";
import { beforeAll, describe, it } from "vitest";

const realRand = BattleScene.prototype.randBattleSeedInt;
const SESSION = process.env.RF_SESSION as string;
const OUT = process.env.RF_OUT as string;
const out: Record<string, unknown> = {};
const save = () => writeFileSync(OUT, JSON.stringify(out, null, 1));
const raw = () => JSON.parse(readFileSync(SESSION, "utf8"));
const nm = (p: any) => p.getNameToRender?.() ?? p.name;

async function boot(phaserGame: Phaser.Game) {
  const game = new GameManager(phaserGame);
  BattleScene.prototype.randBattleSeedInt = realRand;
  game.override.normalizeIVs = false;
  game.override.normalizeNatures = false;
  game.override.disableShinies = false;
  await game.classicMode.startBattle(1 as any);
  return game;
}

async function load(game: GameManager, data: any) {
  game.reload["sessionData"] = game.scene.gameData.parseSessionData(JSON.stringify(data));
  game.scene.enemyModifiers = [];
  game.scene.modifiers = [];
  await game.reload.reloadSession();
  BattleScene.prototype.randBattleSeedInt = realRand;
}

const field = (s: any) => ({
  double: s.currentBattle.double,
  ours: s.getPlayerField().map((p: any) => `${nm(p)} [${p.getStatStages().join(",")}]`),
  foes: s.getEnemyField().map((p: any) => `${nm(p)} ${p.hp}/${p.getMaxHp()} [${p.getStatStages().join(",")}]`),
});

function wild(r: any, wave: number, foes: number) {
  r.battleType = 0;
  r.trainer = null;
  r.waveIndex = wave;
  r.enemyParty = r.enemyParty.slice(0, foes);
  const ids = new Set(r.enemyParty.map((p: any) => p.id));
  r.enemyModifiers = r.enemyModifiers.filter((m: any) => ids.has(m.args?.[0]));
  return r;
}

describe("replay fidelity 636 part 2", () => {
  let phaserGame: Phaser.Game;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  it("F: wild single, our Intimidate lead, foe saved at -1", async () => {
    const game = await boot(phaserGame);
    const res: any = {};
    for (const wave of [182, 181]) {
      const r = wild(raw(), wave, 1);
      r.party[0].customPokemonData.ability = AbilityId.INTIMIDATE;
      r.enemyParty[0].summonData.statStages = [-1, 0, 0, 0, 0, 0, 0];
      await load(game, r);
      res[`wave${wave}`] = { ...field(game.scene), log: game.textInterceptor.logs.slice(-6) };
    }
    out.F = res;
    save();
  }, 300_000);

  it("G: wild double", async () => {
    const game = await boot(phaserGame);
    await load(game, wild(raw(), 182, 2));
    out.G = field(game.scene);
    save();
  }, 300_000);

  it("H: Mystery Encounter battle", async () => {
    const game = await boot(phaserGame);
    const s: any = game.scene;
    const r = wild(raw(), 182, 1);
    r.battleType = 3;
    r.mysteryEncounterType = MysteryEncounterType.FIGHT_OR_FLIGHT;
    try {
      await load(game, r);
      out.H = { reached: "CommandPhase", ...field(s) };
    } catch (e) {
      out.H = {
        error: String(e).slice(0, 200),
        phase: s.phaseManager.getCurrentPhase()?.phaseName,
        uiMode: UiMode[s.ui.getMode()],
        me: s.currentBattle.mysteryEncounter?.encounterType,
        enemyParty: s.getEnemyParty().map(nm),
        log: game.textInterceptor.logs.slice(-6),
      };
    }
    save();
  }, 300_000);
});
