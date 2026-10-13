// Stand-in trainer fights for the solve search: the game generates the waves after Gordie W180 for the same team and
// run seed. Copied into the pinned clone's test/tests under a unique name by construct.sh and removed again.
//
// Route: load the W180 save, faint Gordie's party, and let the game's own flow run on: victory, the shop (skipped),
// the biome pick, the wave-181 party heal, wave 181 (wild), and the Elite Four waves that follow. At every wave in
// SC_WAVES it records the wave-start save the game wrote in EncounterPhase (what Continue loads) and what the wave
// holds. Then it reloads each saved wave and checks the game derives the same battle from it.
//
// env: SC_SESSION (the W180 save), SC_OUT (result JSON), SC_WAVES (comma list, default 182,184,186), SC_BIOME (index
// of the biome option when the Map offers a choice, default 0)
import { readFileSync, writeFileSync } from "node:fs";
import { BattleScene } from "#app/battle-scene";
import { BattleType } from "#enums/battle-type";
import { BiomeId } from "#enums/biome-id";
import { Button } from "#enums/buttons";
import { MoveId } from "#enums/move-id";
import { TrainerType } from "#enums/trainer-type";
import { UiMode } from "#enums/ui-mode";
import { WeatherType } from "#enums/weather-type";
import { GameManager } from "#test/framework/game-manager";
import { beforeAll, describe, it } from "vitest";

const realRand = BattleScene.prototype.randBattleSeedInt;
const SESSION = process.env.SC_SESSION as string;
const OUT = process.env.SC_OUT as string;
const WAVES = (process.env.SC_WAVES ?? "182,184,186").split(",").map(Number);
const BIOME_PICK = Number(process.env.SC_BIOME ?? 0);
const nm = (p: any) => p.getNameToRender?.() ?? p.name;

let phaserGame: Phaser.Game;
let game: GameManager;
const log: any[] = [];

function describeWave() {
  const s: any = game.scene;
  const b: any = s.currentBattle;
  const mods = s.enemyModifiers ?? [];
  return {
    waveIndex: b.waveIndex,
    battleType: BattleType[b.battleType],
    double: b.double,
    mysteryEncounter: b.mysteryEncounter?.encounterType ?? null,
    trainer: b.trainer ? { type: TrainerType[b.trainer.config.trainerType], name: b.trainer.getName?.(), variant: b.trainer.variant,
      isBoss: !!b.trainer.config.isBoss } : null,
    battleSeed: b.battleSeed,
    waveSeed: s.waveSeed,
    seed: s.seed,
    biome: BiomeId[s.arena.biomeId],
    weather: s.arena.weather ? WeatherType[s.arena.weather.weatherType] : null,
    terrain: s.arena.terrain?.terrainType ?? null,
    foes: s.getEnemyParty().map((p: any) => ({
      id: p.id, species: nm(p), level: p.level, hp: `${p.hp}/${p.getMaxHp()}`, boss: p.bossSegments ?? 0,
      ability: p.getAbility().name, passive: p.hasPassive() ? p.getPassiveAbility().name : null,
      tera: p.getTeraType?.(), moves: p.getMoveset().map((m: any) => MoveId[m.moveId]),
      items: mods.filter((m: any) => m.pokemonId === p.id).map((m: any) => `${m.type.id}x${m.stackCount}`),
      onField: p.isOnField(),
    })),
    trainerItems: mods.filter((m: any) => m.pokemonId === undefined).map((m: any) => `${m.type.id}x${m.stackCount}`),
    ours: s.getPlayerParty().map((p: any) => `${nm(p)} L${p.level} ${p.hp}/${p.getMaxHp()}${p.status ? " st" + p.status.effect : ""}`),
  };
}

// The wave-start save: what EncounterPhase hands saveAll before the summon, which Continue loads. The test framework's
// ReloadHelper stubs saveAll; this stub also keeps a frozen copy of each save, with the wave it was taken at.
const saves: any[] = [];
function hookSaves() {
  const gd: any = game.scene.gameData;
  gd.saveAll = async () => {
    const d = gd.getSessionSaveData();
    (game.reload as any).sessionData = d;
    saves.push({ phase: (game.scene as any).phaseManager.getCurrentPhase()?.phaseName, data: JSON.parse(JSON.stringify(d)) });
    return true;
  };
}
function waveStartSave(w: number): any {
  const hit = saves.filter(x => x.data.waveIndex === w);
  log.push({ savesForWave: w, phases: hit.map(x => x.phase) });
  // NextEncounterPhase and NewBiomeEncounterPhase are EncounterPhase subclasses: the same save.
  return hit.find(x => /EncounterPhase$/.test(x.phase))?.data ?? null;
}

// Faint every foe still standing and play one turn: the trainer has nothing left to send, so the battle is won.
async function winWave() {
  const s: any = game.scene;
  // Prompts the last wave queued but the game never asked for (the shop's confirm, a biome choice not offered).
  log.push({ stalePrompts: (game.promptHandler as any).prompts.length });
  (game.promptHandler as any).prompts.length = 0;
  for (const p of s.getEnemyParty()) if (!p.isOnField()) p.hp = 0;
  const lead: any = s.getPlayerField()[0];
  const mv = lead.getMoveset().find((m: any) => m.isUsable(lead, false, true)[0]);
  game.move.select(mv.moveId);
  await game.doKillOpponents();
  // The Map offers a biome choice after wave 180 when more than one link survives: take option SC_BIOME.
  // Only after an X0 wave: a prompt left queued blocks every prompt behind it (the next shop's skip).
  if (s.currentBattle.waveIndex % 10 === 0) game.onNextPrompt("SelectBiomePhase", UiMode.OPTION_SELECT, () => {
    const h: any = s.ui.getHandler();
    const opts = h.config?.options ?? [];
    log.push({ biomeChoice: opts.map((o: any) => o.label), picked: BIOME_PICK });
    opts[BIOME_PICK].handler();
  }, () => game.isCurrentPhase("CommandPhase"));
  try {
    await game.toNextWave();
  } catch (e) {
    const pm: any = s.phaseManager;
    log.push({ stuck: String(e).slice(0, 200), phase: pm.getCurrentPhase()?.phaseName, mode: UiMode[s.ui.getMode()],
      wave: s.currentBattle.waveIndex, msgs: game.textInterceptor.logs.slice(-12),
      prompts: (game.promptHandler as any).prompts.map((x: any) => `${x.phaseTarget}:${UiMode[x.mode]}`),
      awaiting: (s.ui.getHandler() as any).awaitingActionInput });
    if (pm.getCurrentPhase()?.phaseName !== "SelectModifierPhase") throw e;
    // The shop did not take the queued cancel: press it by hand, confirm the skip, and run on to the next command.
    (game.promptHandler as any).prompts.length = 0;
    game.onNextPrompt("SelectModifierPhase", UiMode.CONFIRM, () => {
      (s.ui.getHandler() as any).processInput(Button.ACTION);
    }, () => game.isCurrentPhase("CommandPhase"));
    (s.ui.getHandler() as any).processInput(Button.CANCEL);
    await game.phaseInterceptor.to("CommandPhase");
    log.push({ recovered: s.currentBattle.waveIndex });
  }
}

describe("standin", () => {
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  it("construct", async () => {
    const origLog = console.log;
    console.log = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.warn = () => {};
    game = new GameManager(phaserGame);
    BattleScene.prototype.randBattleSeedInt = realRand;
    game.override.normalizeIVs = false;
    game.override.normalizeNatures = false;
    game.override.disableShinies = false;
    await game.classicMode.startBattle(1 as any);
    // No experience between waves: our team reaches the stand-in wave as the W180 save has it (levels, moves, form).
    game.override.xpMultiplier(0);
    game.reload["sessionData"] = game.scene.gameData.parseSessionData(readFileSync(SESSION, "utf8"));
    game.scene.enemyModifiers = [];
    game.scene.modifiers = [];
    await game.reload.reloadSession();
    BattleScene.prototype.randBattleSeedInt = realRand;
    log.push({ at: "loaded", ...describeWave() });
    hookSaves();
    const out: any = { log, waves: {} };
    const last = Math.max(...WAVES);
    while (game.scene.currentBattle.waveIndex < last) {
      try {
        await winWave();
      } catch (e) {
        writeFileSync(OUT, JSON.stringify(out));
        throw e;
      }
      const w = game.scene.currentBattle.waveIndex;
      const d = describeWave();
      log.push({ at: "reached", ...d, turn: game.scene.currentBattle.turn });
      if (WAVES.includes(w)) out.waves[w] = { wave: d, save: waveStartSave(w), live: JSON.parse(JSON.stringify(game.scene.gameData.getSessionSaveData())) };
      writeFileSync(OUT, JSON.stringify(out));
    }
    // Reload each wave-start save in this process: the game must derive the same battle from it.
    for (const w of WAVES) {
      const rec = out.waves[w];
      if (!rec?.save) continue;
      game.reload["sessionData"] = game.scene.gameData.parseSessionData(JSON.stringify(rec.save));
      game.scene.enemyModifiers = [];
      game.scene.modifiers = [];
      await game.reload.reloadSession();
      BattleScene.prototype.randBattleSeedInt = realRand;
      rec.reloaded = describeWave();
      writeFileSync(OUT, JSON.stringify(out));
    }
    console.log = origLog;
  }, 900_000);
});
