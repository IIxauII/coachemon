// Replay-fidelity probes for #636: copied into the pinned clone's test/tests under a unique name and removed again.
import { readFileSync, writeFileSync } from "node:fs";
import { BattleScene } from "#app/battle-scene";
import { PokemonSummonData } from "#data/pokemon-data";
import { AbilityId } from "#enums/ability-id";
import { MoveId } from "#enums/move-id";
import { GameManager } from "#test/framework/game-manager";
import { beforeAll, describe, it } from "vitest";

const realRand = BattleScene.prototype.randBattleSeedInt;
const SESSION = process.env.RF_SESSION as string;
const OUT = process.env.RF_OUT as string;
const out: Record<string, unknown> = {};
const save = () => writeFileSync(OUT, JSON.stringify(out, null, 1));
const raw = () => JSON.parse(readFileSync(SESSION, "utf8"));
const nm = (p: any) => p.getNameToRender?.() ?? p.name;

async function boot(phaserGame: Phaser.Game, clean: boolean) {
  const game = new GameManager(phaserGame);
  BattleScene.prototype.randBattleSeedInt = realRand;
  if (clean) {
    game.override.normalizeIVs = false;
    game.override.normalizeNatures = false;
    game.override.disableShinies = false;
  }
  await game.classicMode.startBattle(1 as any);
  return game;
}

async function load(game: GameManager, data: any, clearEnemyMods = true) {
  game.reload["sessionData"] = game.scene.gameData.parseSessionData(JSON.stringify(data));
  if (clearEnemyMods) game.scene.enemyModifiers = [];
  game.scene.modifiers = [];
  await game.reload.reloadSession();
  BattleScene.prototype.randBattleSeedInt = realRand;
}

const mon = (p: any) => ({
  name: nm(p),
  id: p.id,
  hp: `${p.hp}/${p.getMaxHp()}`,
  ivs: p.ivs.join(","),
  nature: p.nature,
  stats: p.stats.join(","),
  stages: p.getStatStages?.().join(","),
  onField: p.isOnField(),
  ability: p.getAbility().id,
  passive: p.hasPassive() ? p.getPassiveAbility().id : null,
  types: p.getTypes().join(","),
  fusion: p.isFusion() ? p.fusionSpecies?.speciesId : null,
  boss: p.bossSegments ?? null,
  bossIdx: p.bossSegmentIndex ?? null,
  teamIdx: p.initialTeamIndex ?? null,
  status: p.status ? `${p.status.effect}/${p.status.toxicTurnCount}` : null,
  tera: `${p.getTeraType()}${p.isTerastallized ? "*" : ""}`,
  tags: (p.summonData?.tags ?? []).map((t: any) => t.tagType).join(","),
});

function diff(a: any, b: any, path = "", acc: string[] = []) {
  if (acc.length > 400) return acc;
  if (a === b) return acc;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    acc.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    return acc;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diff(a[k], b[k], `${path}.${k}`, acc);
  return acc;
}

function snap(s: any) {
  const f = (p: any) =>
    `${nm(p)}${p.isOnField() ? "*" : ""} ${p.hp}/${p.getMaxHp()}${p.status ? " st" + p.status.effect : ""}${p.isTerastallized ? " TERA" : ""}${p.isOnField() ? " [" + p.getStatStages().join(",") + "]" : ""}`;
  return { ours: s.getPlayerParty().map(f), foes: s.getEnemyParty().map(f) };
}

type Step = { m?: string; s?: string };
async function play(game: GameManager, steps: Step[], turns: any[] = []) {
  const s = game.scene;
  for (const st of steps) {
    const turn = s.currentBattle.turn;
    game.textInterceptor.logs.length = 0;
    if (st.s) game.doSwitchPokemon(s.getPlayerParty().findIndex((p: any) => nm(p) === st.s));
    else game.move.select((MoveId as any)[st.m!]);
    await game.toEndOfTurn();
    await game.phaseInterceptor.to("CommandPhase");
    turns.push({ turn, step: st.m ?? `>${st.s}`, msgs: game.textInterceptor.logs.filter(x => x?.trim()), ...snap(s) });
    save();
  }
  return turns;
}

function capture(game: GameManager) {
  const s: any = game.scene;
  const b: any = s.currentBattle;
  const all = [...s.getPlayerParty(), ...s.getEnemyParty()];
  return {
    json: JSON.parse(JSON.stringify(s.gameData.getSessionSaveData())),
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
  };
}

function patch(game: GameManager, cap: ReturnType<typeof capture>) {
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
  }
  for (const p of s.getEnemyParty()) {
    p.initialTeamIndex = cap.teamIdx[p.id];
    if (p.bossSegments) p.bossSegmentIndex = cap.bossIdx[p.id];
    if (p.isOnField()) p.summonData = new PokemonSummonData(cap.enemySummon[p.id]);
  }
}

describe("replay fidelity 636", () => {
  let phaserGame: Phaser.Game;
  beforeAll(() => {
    phaserGame = new Phaser.Game({ type: Phaser.HEADLESS });
  });

  it("A: default harness overrides", async () => {
    const game = await boot(phaserGame, false);
    await load(game, raw());
    const s = game.scene;
    out.A_afterFirstReload = [...s.getPlayerParty(), ...s.getEnemyParty()].map(mon);
    out.A_enemyModsAfter1 = s.enemyModifiers.length;
    await load(game, raw(), false);
    out.A_enemyModsAfter2NoClear = s.enemyModifiers.length;
    out.A_leadEnemyAfter2NoClear = mon(s.getEnemyParty()[0]);
    save();
  }, 300_000);

  it("B: clean overrides, round trip", async () => {
    const game = await boot(phaserGame, true);
    const r = raw();
    await load(game, r);
    const s: any = game.scene;
    out.B_mons = [...s.getPlayerParty(), ...s.getEnemyParty()].map(mon);
    out.B_mods = { player: s.modifiers.length, enemy: s.enemyModifiers.length, rawPlayer: r.modifiers.length, rawEnemy: r.enemyModifiers.length };
    const rt = JSON.parse(JSON.stringify(s.gameData.getSessionSaveData()));
    delete rt.timestamp;
    delete rt.playTime;
    delete r.timestamp;
    delete r.playTime;
    out.B_roundTripDiff = diff(r, rt);
    const b = s.currentBattle;
    out.B_battle = {
      turn: b.turn,
      battleSeed: b.battleSeed,
      double: b.double,
      waveSeed: s.waveSeed,
      partyTemplateIndex: b.trainer?.partyTemplateIndex,
      enemySwitchCounter: b.enemySwitchCounter,
      playerTerasUsed: s.arena.playerTerasUsed,
      weather: s.arena.weather && { t: s.arena.weather.weatherType, left: s.arena.weather.turnsLeft },
      gameMode: s.gameMode.modeId,
    };
    save();
  }, 300_000);

  it("C: entry effects on reload", async () => {
    const game = await boot(phaserGame, true);
    const s: any = game.scene;
    const res: any = {};
    for (const [label, ourStage] of [["ourStage0", 0], ["ourStageMinus1", -1]] as const) {
      const r = raw();
      r.enemyParty[0].customPokemonData.ability = AbilityId.INTIMIDATE;
      r.party[0].summonData.statStages = [ourStage, 0, 0, 0, 0, 0, 0];
      r.enemyParty[0].summonData.statStages = [2, 0, 0, 0, 0, 0, 0];
      await load(game, r);
      res[label] = { ours: mon(s.getPlayerParty()[0]), foe: mon(s.getEnemyParty()[0]), log: game.textInterceptor.logs.slice(-12) };
    }
    out.C = res;
    save();
  }, 300_000);

  it("D: field probes", async () => {
    const game = await boot(phaserGame, true);
    const s: any = game.scene;
    const r = raw();
    Object.assign(r.party[1], { fusionSpecies: 6, fusionFormIndex: 0, fusionAbilityIndex: 0, fusionShiny: false, fusionVariant: 0, fusionGender: 0, fusionLuck: 0, fusionTeraType: 9 });
    r.party[2].passive = true;
    r.party[3].customPokemonData.types = [13];
    r.party[3].customPokemonData.ability = AbilityId.LEVITATE;
    r.party[3].customPokemonData.passive = AbilityId.INTIMIDATE;
    r.enemyParty[1].boss = true;
    r.enemyParty[1].bossSegments = 3;
    r.enemyParty[0].status = { effect: 2, toxicTurnCount: 3, sleepTurnsRemaining: 0 };
    r.party[0].summonData.tags = [{ tagType: "CONFUSED", turnCount: 3, sourceMove: 0, sourceId: 0, lapseTypes: [], isBatonPassable: true }];
    r.arena.terrain = { terrainType: 2, turnsLeft: 3, maxDuration: 5 };
    r.arena.tags = [
      { tagType: "REFLECT", side: 1, turnCount: 4, maxDuration: 5, sourceMove: 115, sourceId: r.party[0].id },
      { tagType: "SAFEGUARD", side: 1, turnCount: 4, maxDuration: 5, sourceMove: 219, sourceId: r.party[0].id },
      { tagType: "STEALTH_ROCK", side: 2, turnCount: 0, maxDuration: 0, sourceMove: 446, sourceId: r.party[0].id, layers: 1, maxLayers: 1 },
    ];
    r.arena.playerTerasUsed = 1;
    const parsed = game.scene.gameData.parseSessionData(JSON.stringify(r));
    out.D_parsedArenaTags = parsed.arena.tags.map((t: any) => t.tagType);
    await load(game, r);
    out.D_mons = [...s.getPlayerParty(), ...s.getEnemyParty()].map(mon);
    out.D_arena = {
      terrain: s.arena.terrain && { t: s.arena.terrain.terrainType, left: s.arena.terrain.turnsLeft },
      tags: s.arena.tags.map((t: any) => `${t.tagType}/${t.side}/${t.turnCount}`),
      playerTerasUsed: s.arena.playerTerasUsed,
    };
    save();
  }, 300_000);

  const REST: Step[] = [{ m: "BUG_BITE" }, { m: "LEAF_STORM" }, { m: "BUG_BITE" }, { m: "LEAF_STORM" }];
  async function toMid(game: GameManager) {
    await load(game, raw());
    const prefix = await play(game, [{ m: "DRAGON_PULSE" }, { s: "Probopass" }, { s: "Leavanny" }, { m: "POLLEN_PUFF" }]);
    const cap = capture(game);
    return { prefix, cap };
  }
  async function replayMid(game: GameManager, key: string, doPatch: ((g: GameManager, c: any) => void) | null) {
    const s: any = game.scene;
    const { cap } = await toMid(game);
    await load(game, cap.json);
    if (doPatch) doPatch(game, cap);
    out[`${key}AfterLoad`] = { turn: s.currentBattle.turn, foes: s.getEnemyParty().map(mon), ours: s.getPlayerParty().slice(0, 1).map(mon), log: game.textInterceptor.logs.slice(-10) };
    save();
    const turns: any[] = [];
    out[key] = turns;
    try {
      await play(game, REST, turns);
    } catch (e) {
      out[`${key}Error`] = String(e);
      out[`${key}Phase`] = s.phaseManager.getCurrentPhase()?.phaseName;
      out[`${key}Tail`] = game.textInterceptor.logs.slice(-15);
    }
    save();
  }

  it("E0: mid-fight reference", async () => {
    const game = await boot(phaserGame, true);
    const { prefix, cap } = await toMid(game);
    out.E_prefix = prefix;
    out.E_capture = { turn: cap.turn, switchCounter: cap.switchCounter, teamIdx: cap.teamIdx, bss: cap.bss, rnd: cap.rnd, enemyOrder: cap.json.enemyParty.map((p: any) => p.species) };
    out.E_reference = [];
    await play(game, REST, out.E_reference as any[]);
    save();
  }, 300_000);

  it("E1: mid-fight naive reload", async () => {
    await replayMid(await boot(phaserGame, true), "E_naive", null);
  }, 300_000);

  it("E2: mid-fight patched reload", async () => {
    await replayMid(await boot(phaserGame, true), "E_patched", patch);
  }, 300_000);

  it("E3: patched but turn left at 1", async () => {
    await replayMid(await boot(phaserGame, true), "E_noTurn", (g, c) => {
      patch(g, c);
      (g.scene.currentBattle as any).turn = 1;
    });
  }, 300_000);

  it("E4: patched but team index not restored", async () => {
    await replayMid(await boot(phaserGame, true), "E_noTeamIdx", (g, c) => {
      const keep = Object.fromEntries(g.scene.getEnemyParty().map((p: any) => [p.id, p.initialTeamIndex]));
      patch(g, c);
      for (const p of g.scene.getEnemyParty() as any[]) p.initialTeamIndex = keep[p.id];
    });
  }, 300_000);
  it("E5: patched but switch counter left at 0", async () => {
    await replayMid(await boot(phaserGame, true), "E_noSwitchCounter", (g, c) => {
      patch(g, c);
      (g.scene.currentBattle as any).enemySwitchCounter = 0;
    });
  }, 300_000);

  it("E6: patched but global RNG left as reloaded", async () => {
    await replayMid(await boot(phaserGame, true), "E_noRnd", (g, c) => {
      const rnd = Phaser.Math.RND.state();
      patch(g, c);
      Phaser.Math.RND.state(rnd);
    });
  }, 300_000);
});
