// #558: what a team-value model could read from the HUD, and what each read costs, on real game objects.
// Copied into the pinned clone's test/tests by run558.sh, removed after.
import { readFileSync, writeFileSync } from "node:fs";
import { timedEventManager } from "#app/global-event-manager";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { allMoves } from "#data/data-lists";
import { BiomeId } from "#enums/biome-id";
import { SpeciesId } from "#enums/species-id";
import { TrainerSlot } from "#enums/trainer-slot";
import { GameManager } from "#test/framework/game-manager";
import Phaser from "phaser";
import { beforeAll, describe, expect, it } from "vitest";

const g = globalThis as any;
const loadHud = () => {
  if (g.__hud) return g.__hud;
  g.window = globalThis;
  (0, eval)(readFileSync(process.env.COACH_BUNDLE as string, "utf8"));
  g.__hud["04-game-tables"].setGameTables({ species: speciesDataRegistry, events: timedEventManager });
  return g.__hud;
};

const now = () => performance.now();
const out: Record<string, unknown> = {};
const time = (name: string, fn: () => unknown, n = 200) => {
  for (let i = 0; i < Math.min(20, n); i++) fn();
  const ms: number[] = [];
  let last: unknown;
  for (let i = 0; i < n; i++) { const t = now(); last = fn(); ms.push(now() - t); }
  ms.sort((a, b) => a - b);
  out[name] = { n, p50: +ms[Math.floor(n / 2)].toFixed(4), p95: +ms[Math.floor(n * 0.95)].toFixed(4), max: +ms[n - 1].toFixed(4) };
  return last;
};
const once = (name: string, fn: () => unknown) => {
  const t = now(); const v = fn(); const ms = now() - t;
  ((out[name] ??= { cold: [] }) as any).cold.push(+ms.toFixed(3));
  return v;
};

const PARTY = [SpeciesId.BLASTOISE, SpeciesId.CHARIZARD, SpeciesId.VENUSAUR, SpeciesId.PIKACHU, SpeciesId.GENGAR, SpeciesId.SNORLAX];
const THREATS = [SpeciesId.GYARADOS, SpeciesId.MACHAMP, SpeciesId.ALAKAZAM, SpeciesId.GOLEM, SpeciesId.ARCANINE, SpeciesId.DRAGONITE];

describe("#558 bench", () => {
  let phaserGame: Phaser.Game;
  beforeAll(() => { phaserGame = new Phaser.Game({ type: Phaser.HEADLESS }); });

  it("times the signals", async () => {
    const game = new GameManager(phaserGame);
    game.override.startingWave(27).startingBiome(BiomeId.PLAINS).startingLevel(30).disableTrainerWaves().battleStyle("single");
    await game.classicMode.startBattle(...PARTY);
    const hud = loadHud();
    const s = game.scene;
    const core = hud["01-core"], party = hud["08-party"], dmg = hud["10-damage"];
    const members = s.getPlayerParty();
    for (const p of members) p.generateAndPopulateMoveset();
    const wild = s.getEnemyParty()[0];
    out.setup = { wave: s.currentBattle.waveIndex, wild: wild.name, wildLevel: wild.level, party: members.map((p: any) => `${p.name} L${p.level} ${p.moveset.map((m: any) => m.getName()).join("/")}`) };

    // --- Today's shared judge: partyProfile + partyReasons per candidate.
    const cand = { species: wild.species, fusion: wild.fusionSpecies, level: wild.level, types: core.typesOf(wild),
      abilities: core.abilitiesOf(wild), moveTypes: party.damagingTypes(wild) };
    time("today.partyProfile", () => party.partyProfile(members));
    const prof = party.partyProfile(members);
    time("today.partyReasons(per candidate, weakest)", () => party.partyReasons(prof, cand));
    time("today.profile+reasons, 6 swaps", () => { const p = party.partyProfile(members); return members.map((m: any) => party.partyReasons(p, cand, { replacing: m })); });
    time("finalBstOf(live mon)", () => party.finalBstOf(members[0]));

    // --- Threats: real EnemyPokemon from species + level (how preview and safari stub a species-only mon).
    const threats: any = once("build 6 EnemyPokemon from species+level", () =>
      THREATS.map(id => s.addEnemyPokemon(speciesDataRegistry.getSpecies(id), 32, TrainerSlot.NONE)));
    time("build 1 EnemyPokemon from species+level (+destroy)", () => { const p = s.addEnemyPokemon(speciesDataRegistry.getSpecies(SpeciesId.RAICHU), 30, TrainerSlot.NONE); p.destroy(); }, 50);
    const rows = threats.map((t: any) => ({ types: core.typesOf(t), ability: t.getAbility()?.name, passive: null }));

    // --- Type-chart coverage: 7 parties (now + 6 swaps) × 6 members × T threats, best STAB×eff over damaging types.
    const typeScore = (team: any[], foes: any[]) => {
      const atk = team.map(p => { const own = core.typesOf(p); return party.damagingTypes(p).map((t: string) => ({ t, stab: own.includes(t) ? 1.5 : 1 })); });
      return foes.reduce((sum, f) => { const d = core.defenderOf(f); let best = 0;
        for (const a of atk) for (const x of a) best = Math.max(best, x.stab * core.effectiveness(x.t, d)); return sum + best; }, 0);
    };
    const swaps = () => [members, ...members.map((_: any, i: number) => members.map((m: any, j: number) => (i === j ? wild : m)))];
    time("typechart coverage, 7 teams × 6 threats", () => swaps().map(team => typeScore(team, rows)));

    // --- approxOutcomes both directions, every pair, uncached.
    const env = { isEnemy: (p: any) => !p.isPlayer(), party: () => null };
    const best = (a: any, d: any) => { let b = 0; for (const o of dmg.approxOutcomes(env, a, d)) b = Math.max(b, o.dmg ?? 0); return b / Math.max(1, d.getMaxHp()); };
    time("approxOutcomes 1 pair, 1 direction", () => dmg.approxOutcomes(env, members[0], threats[0]), 500);
    time("approx duel matrix uncached, 7 teams × 6 × 6 × 2 dirs", () => swaps().map(team =>
      threats.reduce((t: number, f: any) => t + Math.max(...team.map((m: any) => best(m, f) - best(f, m))), 0)), 20);
    time("approx duel matrix memoised (7 rows × 6 threats × 2 dirs)", () => {
      const pool = [...members, wild];
      const tab = pool.map((m: any) => threats.map((f: any) => best(m, f) - best(f, m)));
      return swaps().map((_, k) => threats.reduce((t: number, _f: any, fi: number) =>
        t + Math.max(...tab.filter((_r: any, mi: number) => (k === 0 ? mi < 6 : mi !== k - 1)).map((r: any) => r[fi])), 0));
    }, 50);
    const sample = dmg.approxOutcomes(env, members[0], threats[0])[0];
    out.approxSample = sample && { name: sample.name, dmg: sample.dmg, pKo: sample.pKo, live: sample.live, keys: Object.keys(sample) };

    // --- KO pacing per pair on top of approx.
    try {
      const o = dmg.approxOutcomes(env, members[0], threats[0])[0];
      const rec = { facts: dmg.targetFacts(env, threats[0]) };
      time("koCurve+koTurns 1 pair", () => dmg.koTurns(dmg.koCurve(rec, dmg.useOf(o), { hp: threats[0].hp }).by ?? dmg.koCurve(rec, dmg.useOf(o), { hp: threats[0].hp })), 500);
    } catch (e) { out["koCurve+koTurns 1 pair"] = { error: String(e) }; }

    // --- Held items a release would delete: price via 51-items HELD.
    const items = hud["51-items"];
    time("held-item price, whole party", () => {
      const ctx = items.rewardContext(s, members);
      return members.map((p: any) => ctx.held(p).reduce((t: number, m: any) => t + ((items.HELD[m.type?.id]?.(p, ctx) ?? [0])[0] ?? 0), 0));
    });

    // --- Moveset prior lookup: species name → randbats move names → game move objects.
    const RB = hud["05-randbats"].RANDBATS;
    const byName = new Map(allMoves.map((m: any) => [String(m.name).toLowerCase().replace(/[^a-z0-9]/g, ""), m]));
    out.randbatsShape = { keys: Object.keys(RB), singles: Object.keys(RB.s ?? {}).length };
    time("randbats sets → move objects, 1 species", () => {
      const sets = RB.s?.[String(wild.species.name).toLowerCase().replace(/[^a-z0-9]/g, "")] ?? [];
      return sets.map((set: number[]) => set.slice(1).map(i => byName.get(String(RB.m[i]).toLowerCase().replace(/[^a-z0-9]/g, ""))));
    });

    // --- Calendar, preview, ahead, audit: cold first reads under fresh run keys (seed varied → new rosters too).
    const cal = hud["03-calendar"], run = hud["26-run"], prev = hud["48-preview"], ahead = hud["49-ahead"], audit = hud["50-audit"];
    time("bigFightsAhead(30 waves)", () => cal.bigFightsAhead(s, 28), 200);
    const seed0 = s.seed;
    const rosters: unknown[] = [];
    for (let i = 0; i < 6; i++) {
      s.seed = `bench558-${i}`;
      run.readRun(s, (r: any) => {
        const a: any = once("aheadModel cold (incl. preview of next big fight)", () => ahead.aheadModel(r));
        once("teamAudit cold", () => audit.teamAudit(r, a));
        once("previewFor next wave cold", () => prev.previewFor(r, 28));
        once("previewFor +5 waves cold", () => prev.previewFor(r, 32));
        once("aheadModel warm (memo)", () => ahead.aheadModel(r));
        rosters.push({ next: a?.next?.wave, kind: a?.next?.kind, foes: (a?.next?.foes ?? []).map((f: any) => `${f.name} L${f.level}`), conf: a?.next?.exact });
      });
    }
    s.seed = seed0;
    out.rosters = rosters;
    run.readRun(s, (r: any) => { const p = prev.previewFor(r, 30); out.previewRow = p?.foes?.[0] ?? p; });

    // --- Threats from preview rows as duck-typed stubs: no game object needed.
    try {
      const byMoveName = new Map(allMoves.map((m: any) => [m.name, m]));
      const stubOf = (row: any) => ({
        name: row.name, level: row.level, hp: row.hp, id: -1, summonData: { statStages: [0, 0, 0, 0, 0, 0, 0] },
        getTypes: () => row.types.map((t: string) => core.TYPES.indexOf(t)), getAbility: () => ({ name: row.ability, attrs: [] }),
        hasPassive: () => false, getPassiveAbility: () => null, getMaxHp: () => row.hp, getStat: (i: number) => (i === 0 ? row.hp : row.stats[i - 1]),
        isPlayer: () => false, isBoss: () => (row.segments ?? 0) > 1, getHeldItems: () => [], bossSegments: row.segments ?? 0, bossSegmentIndex: 0,
        moveset: row.moves.map((n: string) => byMoveName.get(n)).filter(Boolean).map((mv: any) => ({ getMove: () => mv, getMovePp: () => 10, ppUsed: 0, getName: () => mv.name, moveId: mv.id })),
      });
      let foes: any[] = [];
      run.readRun(s, (r: any) => { foes = (prev.previewFor(r, 30)?.foes ?? []); });
      const stubs = foes.map(stubOf);
      out.stubSample = dmg.approxOutcomes(env, members[0], stubs[0]).map((o: any) => [o.name, o.dmg]).concat(dmg.approxOutcomes(env, stubs[0], members[0]).map((o: any) => [o.name, o.dmg]));
      time("stub from preview row", () => foes.map(stubOf), 200);
      time("approx duel, 7 rows × preview roster (stubs) × 2 dirs, memoised", () => {
        const pool = [...members, wild];
        return pool.map((m: any) => stubs.map((f: any) => best(m, f) - best(f, m)));
      }, 50);
    } catch (e) { out.stubError = String((e as any)?.stack ?? e); }

    writeFileSync(process.env.BENCH_OUT as string, JSON.stringify(out, null, 2));
    expect(true).toBe(true);
  }, 600_000);
});
