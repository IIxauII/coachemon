// What mapping the battle's game objects to plain data costs, beside the card build it would feed (#916). It runs on
// the test suite's fakes, whose methods are cheaper than the game's: the numbers are a floor for the real game, not
// its cost. Run from the repo root: `node docs/research/916-anti-corruption-layer/map-bench.mjs`.
import os from "node:os";
import { mountHud } from "../../../skills/coachemon/scripts/test/fake-page.mjs";
import { mon as fakeMon, TY } from "../../../skills/coachemon/scripts/test/fake-mon.mjs";
import { onGame } from "../../../skills/coachemon/scripts/test/game-proto.mjs";

const MAP_WARM = 5000, MAP_RUNS = 20000;
const BUILD_WARM = Number(process.env.BUILD_WARM ?? 20), BUILD_RUNS = Number(process.env.BUILD_RUNS ?? 200);
const DETECT_RUNS = 200000;

// ---- The fixture: a doubles trainer wave, six a side, every field the mapping reads set to a value.

class LeftoversModifier {}
class TechnicianAbAttr {}
const STAGES = () => [0, 0, 0, 0, 0, 0, 0];
const species = (id, name, types) => ({
  speciesId: id, name, type1: TY.indexOf(types[0]), type2: types[1] == null ? null : TY.indexOf(types[1]),
  baseStats: [80, 100, 80, 90, 80, 95], baseTotal: 525, legendary: false, subLegendary: false, mythical: false,
  catchRate: 45, getName: () => name,
});
const MOVESETS = {
  ours: [
    ["Heat Wave", "Fire", 95, "S", 0, { target: 6, id: 257 }], ["Earthquake", "Ground", 100, "P", 0, { target: 7, id: 89 }],
    ["Protect", "Normal", 0, "X", 4, { target: 0, id: 182 }], ["Iron Head", "Steel", 80, "P", 0, { id: 442, attrs: ["FlinchAttr"] }],
  ],
  foes: [
    ["Rock Slide", "Rock", 75, "P", 0, { target: 6, id: 157, attrs: ["FlinchAttr"] }], ["Surf", "Water", 90, "S", 0, { target: 7, id: 57 }],
    ["Crunch", "Dark", 80, "P", 0, { id: 242 }], ["Thunder Wave", "Electric", 0, "X", 0, { id: 86 }],
  ],
};
const ROSTER = {
  ours: [["Charizard", ["Fire", "Flying"]], ["Garchomp", ["Dragon", "Ground"]], ["Lapras", ["Water", "Ice"]],
    ["Lucario", ["Fighting", "Steel"]], ["Snorlax", ["Normal"]], ["Gyarados", ["Water", "Flying"]]],
  foes: [["Tyranitar", ["Rock", "Dark"]], ["Starmie", ["Water", "Psychic"]], ["Jolteon", ["Electric"]],
    ["Scizor", ["Bug", "Steel"]], ["Gengar", ["Ghost", "Poison"]], ["Dragonite", ["Dragon", "Flying"]]],
};
// `stubbed`: the game's own damage calls answer a constant, so the build runs the live path a turn read takes rather
// than throwing into the type-chart fallback on every hit.
const STUBS = {
  getMoveType: mv => mv.type, getMoveCategory: (_def, mv) => mv.category, getMoveEffectiveness: () => 1,
  getAttackDamage: () => ({ damage: 60, result: 1, cancelled: false }), getCritStage: () => 0, getAccuracyMultiplier: () => 1,
};
const fixture = ({ stubbed = false } = {}) => {
  const side = which => ROSTER[which].map(([name, types], i) => {
    const stats = [200 + i * 7, 150, 120, 140, 120, 100 + i * 5];
    const onField = i < 2, battler = onField ? (which === "ours" ? 0 : 2) + i : -1;
    const id = (which === "ours" ? 1 : 101) + i;
    const items = [Object.assign(new LeftoversModifier(), { type: { id: "LEFTOVERS" }, stackCount: 1, pokemonId: id })];
    const ability = { id: 100 + i, name: `${name} ability`, attrs: [new TechnicianAbAttr()] };
    const summonData = { statStages: STAGES(), types: [], addedType: null, tags: [] };
    const p = onGame(fakeMon(name, 80, types, stats, MOVESETS[which], onField, stats[0] - 10 * i, {
      id, species: species(id, name, types), formIndex: 0, fusionSpecies: i === 5 ? species(999, "Fused", ["Grass"]) : null,
      fusionFormIndex: 0, abilityIndex: 0, ivs: [31, 31, 31, 31, 31, 31], nature: 3, getNature: () => 3, gender: 0,
      friendship: 70, luck: 0, getLuck: () => 0, shiny: false, isShiny: () => false, variant: 0, pokerus: false,
      status: i === 3 ? { effect: 1, sleepTurnsRemaining: 0, toxicTurnCount: 0 } : null,
      isTerastallized: false, teraType: TY.indexOf(types[0]), getTeraType: () => TY.indexOf(types[0]),
      getAbility: () => ability, hasPassive: () => i === 0, getPassiveAbility: () => ({ id: 200, name: "passive", attrs: [] }),
      getHeldItems: () => items, isPlayer: () => which === "ours", hasTrainer: () => which === "foes",
      getBattlerIndex: () => battler, getEffectiveStat: s => stats[s], getHpRatio: () => 1, isGrounded: () => true,
      isMax: () => false, isMega: () => false, bossSegments: 0, bossSegmentIndex: 0, trainerSlot: which === "foes" ? 1 : 0,
      turnData: { hitCount: 0, hitsLeft: 0, moveEffectiveness: null }, waveData: {},
      ...(stubbed ? STUBS : {}),
    }, summonData));
    p.moveset.forEach(pm => { pm.ppUp = 0; });
    return p;
  });
  return { party: side("ours"), foes: side("foes") };
};

// `battletest.mjs`'s scene, widened to a doubles trainer and an arena.
const sceneOf = ({ party, foes }) => {
  const onField = () => party.filter(p => p.isOnField());
  for (const f of foes) { f.getOpponents = () => onField(); f.getMatchupScore = () => 1; }
  const trainer = { getName: () => "Bench", config: { isBoss: false }, isDouble: () => true,
    getPartyMemberMatchupScores: () => [2, 3, 4, 5].map(i => [i, 5]),
    getSortedPartyMemberMatchupScores: sc => sc.slice().sort((a, b) => b[1] - a[1]),
    getNextSummonIndex: () => 2, shouldTera: () => false };
  const arena = { biomeId: 1, weather: null, terrain: null, tags: [], playerTerasUsed: 0, positionalTagManager: { tags: [] },
    getTag: () => null, getTagOnSide: () => null, isMoveWeatherCancelled: () => false, isMoveTerrainCancelled: () => false };
  return {
    phaseManager: { queueMessage() {}, getCurrentPhase: () => ({ phaseName: "CommandPhase", fieldIndex: 0 }) },
    getField: () => [...onField(), ...foes.filter(f => f.isOnField())],
    currentBattle: { waveIndex: 89, turn: 1, double: true, enemySwitchCounter: 0, getBattlerCount: () => 2, trainer,
      turnCommands: [], preTurnCommands: [] },
    ui: { mode: 0, getHandler: () => ({}) }, arena, modifiers: [], enemyModifiers: [], money: 5000,
    getPlayerParty: () => party, getEnemyParty: () => foes,
  };
};

// ---- The prototype mapping: every value the HUD reads off a mon, a moveset entry, a move and the field.

const call = (fn, fallback = null) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const STATS = [0, 1, 2, 3, 4, 5];
const attrNames = xs => (xs ?? []).map(a => a?.constructor?.name ?? null);
const plainSpecies = sp => sp && ({
  speciesId: sp.speciesId, name: call(() => sp.getName?.(), sp.name ?? null), type1: sp.type1, type2: sp.type2,
  baseStats: sp.baseStats ? [...sp.baseStats] : null, baseTotal: sp.baseTotal ?? null, legendary: !!sp.legendary,
  subLegendary: !!sp.subLegendary, mythical: !!sp.mythical, catchRate: sp.catchRate ?? null,
});
const plainAbility = a => a && ({ id: a.id ?? null, name: a.name ?? null, attrs: attrNames(a.attrs) });
const plainMove = mv => mv && ({
  id: mv.id ?? null, name: mv.name ?? null, type: mv.type, power: mv.power, accuracy: mv.accuracy, pp: mv.pp ?? null,
  priority: mv.priority ?? 0, category: mv.category, moveTarget: mv.moveTarget, flags: mv.flags ?? 0, chance: mv.chance ?? null,
  attrs: attrNames(mv.attrs),
});
const plainEntry = pm => pm && ({
  moveId: pm.moveId ?? null, name: call(() => pm.getName?.()), ppUsed: pm.ppUsed ?? 0, ppUp: pm.ppUp ?? 0,
  maxPp: call(() => pm.getMovePp?.()), move: plainMove(call(() => pm.getMove?.())),
});
const plainItem = m => ({ kind: m?.constructor?.name ?? null, type: m?.type?.id ?? null, stackCount: m?.stackCount ?? 1,
  pokemonId: m?.pokemonId ?? null, transferable: !!m?.isTransferable });
export const plainMon = p => {
  const sd = p.summonData ?? {};
  return {
    id: p.id, name: p.name, player: !!call(() => p.isPlayer?.(), false), level: p.level, hp: p.hp,
    maxHp: call(() => p.getMaxHp?.()), hpRatio: call(() => p.getHpRatio?.()),
    species: plainSpecies(p.species), formIndex: p.formIndex ?? 0,
    fusion: p.fusionSpecies ? { species: plainSpecies(p.fusionSpecies), formIndex: p.fusionFormIndex ?? 0 } : null,
    types: [...call(() => p.getTypes?.(), [])], teraType: call(() => p.getTeraType?.()), terastallized: !!p.isTerastallized,
    stats: STATS.map(i => call(() => p.getStat?.(i))), effective: STATS.map(i => call(() => p.getEffectiveStat?.(i))),
    stages: [...(sd.statStages ?? [])], summonTypes: [...(sd.types ?? [])], addedType: sd.addedType ?? null,
    tags: (sd.tags ?? []).map(t => ({ tagType: t.tagType, turnCount: t.turnCount ?? null, sourceId: t.sourceId ?? null })),
    turnCount: sd.turnCount ?? 0, waveTurnCount: sd.waveTurnCount ?? 0,
    endured: !!p.waveData?.endured, abilityRevealed: !!p.waveData?.abilityRevealed,
    ability: plainAbility(call(() => p.getAbility?.())), abilityIndex: p.abilityIndex ?? 0,
    abilityApplies: call(() => p.canApplyAbility?.(false), true),
    passive: call(() => p.hasPassive?.(), false) ? plainAbility(call(() => p.getPassiveAbility?.())) : null,
    passiveApplies: call(() => p.canApplyAbility?.(true), true),
    status: p.status ? { effect: p.status.effect, sleepTurnsRemaining: p.status.sleepTurnsRemaining ?? 0, toxicTurnCount: p.status.toxicTurnCount ?? 0 } : null,
    items: call(() => p.getHeldItems?.(), []).map(plainItem),
    moveset: (p.moveset ?? []).map(plainEntry),
    moveQueue: call(() => p.getMoveQueue?.(), []).map(q => ({ move: q.move, targets: [...(q.targets ?? [])] })),
    onField: !!call(() => p.isOnField?.(), false), battlerIndex: call(() => p.getBattlerIndex?.()),
    boss: !!call(() => p.isBoss?.(), false), bossSegments: p.bossSegments ?? 0, bossSegmentIndex: p.bossSegmentIndex ?? 0,
    ivs: p.ivs ? [...p.ivs] : null, nature: call(() => p.getNature?.(), p.nature ?? null), gender: p.gender ?? null,
    friendship: p.friendship ?? null, luck: call(() => p.getLuck?.(), p.luck ?? 0), shiny: !!call(() => p.isShiny?.(), false),
    pokerus: !!p.pokerus, trainerSlot: p.trainerSlot ?? 0, aiType: p.aiType ?? null, trainer: !!call(() => p.hasTrainer?.(), false),
    active: !!call(() => p.isActive?.(), false), fieldIndex: call(() => p.getFieldIndex?.()),
    icon: { atlas: call(() => p.getIconAtlasKey?.()), id: call(() => p.getIconId?.()) }, grounded: call(() => p.isGrounded?.()),
    trapped: call(() => p.isTrapped?.()), mega: !!call(() => p.isMega?.(), false), max: !!call(() => p.isMax?.(), false),
  };
};
const plainModifiers = ms => (ms ?? []).map(plainItem);
export const plainField = s => {
  const b = s.currentBattle ?? {}, a = s.arena ?? {};
  return {
    wave: b.waveIndex, turn: b.turn, double: !!b.double, enemySwitchCounter: b.enemySwitchCounter ?? 0,
    trainer: b.trainer ? { name: call(() => b.trainer.getName?.()), boss: !!b.trainer.config?.isBoss, double: !!call(() => b.trainer.isDouble?.(), false) } : null,
    biomeId: a.biomeId ?? null, weather: a.weather?.weatherType ?? 0, terrain: a.terrain?.terrainType ?? 0,
    arenaTags: (a.tags ?? []).map(t => ({ tagType: t.tagType, side: t.side, turnCount: t.turnCount ?? null, layers: t.layers ?? null })),
    terasUsed: a.playerTerasUsed ?? 0, money: s.money ?? 0,
    modifiers: plainModifiers(s.modifiers), enemyModifiers: plainModifiers(s.enemyModifiers),
  };
};
export const plainBattle = s => ({ field: plainField(s), ours: s.getPlayerParty().map(plainMon), foes: s.getEnemyParty().map(plainMon) });

// ---- Timing.

const ms = ns => Number(ns) / 1e6;
const summary = xs => {
  const s = [...xs].sort((a, b) => a - b), at = q => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
  return { n: s.length, median: at(0.5), p95: at(0.95), p99: at(0.99), mean: s.reduce((x, y) => x + y, 0) / s.length };
};
// `batch` calls per sample, so a call far shorter than the timer's own cost is still resolved.
const time = (warm, runs, fn, batch = 1) => {
  for (let i = 0; i < warm; i++) fn();
  const out = new Array(runs);
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    for (let j = 0; j < batch; j++) fn();
    out[i] = ms(process.hrtime.bigint() - t0) / batch;
  }
  return summary(out);
};
const us = x => (x < 0.001 ? `${(x * 1e6).toFixed(0)} ns` : `${(x * 1000).toFixed(1)} µs`);
const line = (label, s) => console.log(`${label.padEnd(44)} median ${us(s.median).padStart(11)}  p95 ${us(s.p95).padStart(11)}  p99 ${us(s.p99).padStart(11)}  (n=${s.n})`);

// ---- What one card build reads off the game's objects, counted through a proxy on the scene and every mon.

const counts = new Map();
let counting = false;
const tally = (tag, key) => {
  if (!counting || typeof key === "symbol") return;
  const k = `${tag}.${key}`;
  counts.set(k, (counts.get(k) ?? 0) + 1);
};
const wrapped = new WeakMap(), proxies = new WeakSet();
// A built-in with internal slots (a Map, an iterator) refuses a proxy as its receiver, and a native function's result
// is the HUD's own data, not the game's.
const PROXIED = new Set(["[object Object]", "[object Array]", "[object Function]"]);
const native = v => typeof v === "function" && /\{\s*\[native code\]\s*\}$/.test(Function.prototype.toString.call(v));
const fold = tag => CHILD[tag] ?? tag;
const counted = (v, tag) => {
  if (v === null || (typeof v !== "object" && typeof v !== "function") || proxies.has(v) || native(v)) return v;
  if (!PROXIED.has(Object.prototype.toString.call(v))) return v;
  if (!wrapped.has(v)) {
    const get = (t, k, r) => {
      const d = Reflect.getOwnPropertyDescriptor(t, k);
      if (d && !d.configurable && !d.writable && "value" in d) return d.value;
      const index = Array.isArray(t);
      if (!index) tally(tag, k);
      if (typeof k === "symbol") return Reflect.get(t, k, r);
      return counted(Reflect.get(t, k, r), fold(index ? `${tag}[]` : `${tag}.${k}`));
    };
    const p = new Proxy(v, { get, apply: (t, self, args) => counted(Reflect.apply(t, self, args), fold(`${tag}()`)) });
    wrapped.set(v, p);
    proxies.add(p);
  }
  return wrapped.get(v);
};
// Tags fold to the game class a path ends on, so a name read through a method's result counts where it lives.
const CHILD = {
  "mon.moveset": "moveset", "mon.getMoveset()": "moveset", "moveset[]": "entry", "entry.getMove()": "move",
  "move.attrs": "attrs", "attrs[]": "attr", "mon.getOpponents()": "mons", "mon.getAlly()": "mon", "mons[]": "mon",
  "mon.species": "species", "mon.fusionSpecies": "species", "mon.summonData": "summonData", "mon.getAbility()": "ability",
  "mon.getPassiveAbility()": "ability", "ability.attrs": "attrs", "mon.getHeldItems()": "items", "items[]": "item",
  "mon.status": "status", "mon.turnData": "turnData", "mon.waveData": "waveData", "summonData.tags": "tags", "tags[]": "tag",
  "mon.getMoveQueue()": "queue", "queue[]": "queued",
  "scene.currentBattle": "battle", "scene.arena": "arena", "battle.trainer": "trainer", "scene.getPlayerParty()": "mons",
  "scene.getEnemyParty()": "mons", "scene.getField()": "mons", "scene.modifiers": "items", "scene.enemyModifiers": "items",
};
const countedScene = opts => {
  const { party, foes } = fixture(opts);
  return counted(sceneOf({ party: party.map(p => counted(p, "mon")), foes: foes.map(p => counted(p, "mon")) }), "scene");
};

// ---- Run.

const hud = () => globalThis.__hud;
const mount = scene => {
  mountHud({ scene });
  const built = hud()["98-watch"].watchShown();
  if (!built?.card || built.failure) throw new Error(`the fixture built no card: ${built?.failure ?? "none"}`);
  return built.card;
};
const pct = (a, b) => `${(100 * a / b).toFixed(3)}%`;

console.log(`node ${process.version} · ${os.arch()} · ${os.cpus()[0]?.model ?? "?"} · ${os.cpus().length} cores`);

const scene = sceneOf(fixture());
mount(scene);
const plainState = plainBattle(scene);
const monCount = plainState.ours.length + plainState.foes.length;
console.log(`fixture: doubles trainer at its command, ${plainState.ours.length} ours + ${plainState.foes.length} foes, 4 moves each`);
console.log(`plain battle state: ${JSON.stringify(plainState).length} bytes of JSON\n`);

const mapAll = time(MAP_WARM, MAP_RUNS, () => plainBattle(scene));
const mons = [...scene.getPlayerParty(), ...scene.getEnemyParty()];
let at = 0;
const mapOne = time(MAP_WARM, MAP_RUNS, () => plainMon(mons[at++ % mons.length]));
const fieldOnly = time(MAP_WARM, MAP_RUNS / 10, () => plainField(scene), 100);
const detectOnly = time(5000, DETECT_RUNS / 100, () => hud()["02-decision"].detect(scene), 100);
line("map: full battle state (12 mons + field)", mapAll);
line("map: one mon", mapOne);
line("map: field alone (100 per sample)", fieldOnly);
line("per frame: detect(s) (100 per sample)", detectOnly);
console.log(`per mon from the full map: ${us(mapAll.median / monCount)}`);

for (const [label, stubbed] of [["the suite's fakes", false], ["damage calls stubbed", true]]) {
  const s = sceneOf(fixture({ stubbed }));
  mount(s);
  const sum = globalThis.__coachHud.summary();
  const { rebuild, accountRead } = hud()["98-watch"], { readCard } = hud()["60-card"], dmg = hud()["10-damage"];
  dmg.sceneOutcome.lastError = undefined;
  const watch = time(BUILD_WARM, BUILD_RUNS, () => rebuild());
  const read = time(BUILD_WARM, BUILD_RUNS, () => readCard(s, accountRead(s), { road: false }));
  const estimate = time(BUILD_WARM, BUILD_RUNS, () => readCard(s, accountRead(s), { road: false, estimate: true }));
  const err = dmg.sceneOutcome.lastError;
  const ticks = globalThis.__coachHud.stats().ticks.filter(t => t.why === "watch");
  console.log(`\n${label}: verdict ${sum.verdict} · ${sum.field}`);
  console.log(`damage calls into the fixture: ${err ? `threw (${err.message.split("\n")[0]}), so each fell back to the type chart` : "answered"}`);
  line("card build: watch rebuild (read+road+draw)", watch);
  line("card build: readCard, no road", read);
  line("card build: readCard, no road, estimate", estimate);
  console.log(`meter, last rebuild: ${JSON.stringify(ticks[ticks.length - 1]?.stages ?? {})}`);
  console.log(`map ÷ build, medians: ${pct(mapAll.median, watch.median)} of a watch rebuild, ${pct(mapAll.median, read.median)} of `
    + `readCard alone, ${pct(mapAll.median, estimate.median)} of an estimate read`);
}

// ---- Reads counted on a fresh page with damage calls stubbed: one build, then one mapping.

const cscene = countedScene({ stubbed: true });
mount(cscene);
const readsOf = fn => { counts.clear(); counting = true; try { fn(); } finally { counting = false; } return new Map(counts); };
const buildReads = readsOf(() => hud()["98-watch"].rebuild());
const mapReads = readsOf(() => plainBattle(cscene));
const byTag = m => {
  const out = new Map();
  for (const [k, n] of m) {
    const i = k.indexOf("."), tag = k.slice(0, i), name = k.slice(i + 1);
    if (!out.has(tag)) out.set(tag, new Map());
    out.get(tag).set(name, (out.get(tag).get(name) ?? 0) + n);
  }
  return out;
};
const total = m => [...m.values()].reduce((a, b) => a + b, 0);
console.log(`\nproperty reads off game-shaped objects: one watch rebuild ${total(buildReads)}, one full mapping ${total(mapReads)}`);
const bt = byTag(buildReads), mt = byTag(mapReads);
for (const [tag, names0] of [...bt].sort((a, b) => total(b[1]) - total(a[1]))) {
  const names = [...names0].sort((a, b) => b[1] - a[1]);
  const unmapped = names.filter(([n]) => !mt.get(tag)?.has(n)).map(([n]) => n);
  console.log(`\n${tag}: ${names.length} names, ${total(names0)} reads by the build; ${mt.get(tag)?.size ?? 0} names, ${total(mt.get(tag) ?? new Map())} reads by the mapping`);
  console.log(`  ${names.map(([n, c]) => `${n}×${c}`).join(" ")}`);
  if (unmapped.length) console.log(`  read by the build, not by the mapping: ${unmapped.join(" ")}`);
}

