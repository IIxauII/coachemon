// Planner scenarios with explicit assertions. Usage: node test/plannertest.mjs
//
// The planner's numbers come from 10-damage (`moveOutcome(s)`, `endOfTurnHp`) and 20-enemy-ai
// (`enemyMoveDistribution`, `predictSwitches`, `enemyAction`), which call real game code. A plain mock can't feed
// those, and top-level consts in the one-IIFE bundle can't be redefined afterwards. So the "live" scenarios rewrite
// the bundle text: those definitions are renamed to `__real_*` and small stand-ins reading `globalThis.__stub` are
// inserted before 30-planner, with the mocked scene in the CommandPhase. The "fallback" scenario runs the untouched
// bundle outside the CommandPhase, where the planner must still render from the approximation.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const STUBBED = ["moveOutcome", "moveOutcomes", "endOfTurnHp", "enemyMoveDistribution", "predictSwitches", "enemyAction"];
const STUBS = `
const moveOutcome = (s, atk, def, pm, opts = {}) => globalThis.__stub.outcome(atk, def, pm, opts);
const moveOutcomes = (s, atk, def) => atk.moveset.map(pm => moveOutcome(s, atk, def, pm)).filter(Boolean);
const endOfTurnHp = (p, opts) => globalThis.__stub.heal?.(p, opts) ?? 0;
const enemyMoveDistribution = (s, e) => globalThis.__stub.dist(e);
const predictSwitches = (s, b, active) => globalThis.__stub.switches(active);
const enemyAction = (s, e) => ({ kind: "move", dist: enemyMoveDistribution(s, e), tera: false });
`;
const liveBundle = () => {
  let src = bundle("hud");
  for (const n of STUBBED) {
    src = src.replace(new RegExp(`^(const|let|function)\\s+${n}\\b`, "m"), `$1 __real_${n}`);
    src = src.replace(/^const \{([^}]*)\}\s*=/gm, (all, names) => all.replace(names, names.replace(new RegExp(`(^|[,\\s])${n}(?=\\s*[,}]|\\s*$)`), `$1${n}: __real_${n}`)));
  }
  const at = src.indexOf("// ---- 30-planner.js");
  assert.ok(at > 0, "bundle has 30-planner.js");
  src = src.slice(0, at) + STUBS + src.slice(at);
  const end = src.lastIndexOf("})();");
  return src.slice(0, end) + "globalThis.__planner = { actionOrder, threatFrom, exchange, turnsToKo };\n" + src.slice(end);
};

// moves: [name, type, power, cat, priority = 0, { target = 3, attrs = [], id }]
const attr = n => new ({ [n]: class {} })[n]();
const mon = (name, lv, types, [hp, atk, def, spa, spd, spe], moves, field, curHp, extra = {}) => ({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field, isBoss: () => !!extra.bossSegments,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null, getBattlerIndex: () => (field ? 0 : -1), getHeldItems: () => [],
  moveset: moves.map(([n, t, p, c, priority = 0, { target = 3, attrs = [], id } = {}]) => ({ getName: () => n, moveId: id, getMove: () => ({ id, name: n, type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, priority, accuracy: 100, attrs: attrs.map(attr) }), getMovePp: () => 10, ppUsed: 0 })),
  ...extra,
});

// Per-hit max damage, accuracy and effectiveness for the pairs the scenario uses: "attacker>move>defender".
// Triple Axel is 3 hits, each checking accuracy (Wide Lens folded in).
const TABLE = {
  "Morpeko>Aura Wheel>Gyarados": [[300], 1, 4], "Morpeko>Aura Wheel>Weavile": [[90], 1, 1],
  "Scrafty>High Jump Kick>Gyarados": [[60], 0.9, 0.5], "Scrafty>High Jump Kick>Weavile": [[400], 0.9, 4],
  "Metagross>Meteor Mash>Gyarados": [[70], 0.9, 1], "Metagross>Meteor Mash>Weavile": [[250], 0.9, 2],
  "Gyarados>Waterfall>Morpeko": [[80], 1, 1], "Gyarados>Waterfall>Scrafty": [[70], 1, 1], "Gyarados>Waterfall>Metagross": [[60], 1, 1],
  "Weavile>Triple Axel>Morpeko": [[35, 70, 105], 0.95, 1], "Weavile>Triple Axel>Scrafty": [[30, 60, 90], 0.95, 1], "Weavile>Triple Axel>Metagross": [[8, 16, 24], 0.95, 0.5],
  "Charizard>Flamethrower>Lycanroc": [[60], 1, 0.5], "Blastoise>Wave Crash>Lycanroc": [[220], 1, 2],
  "Lycanroc>Stone Edge>Charizard": [[500], 0.8, 4], "Lycanroc>Stone Edge>Blastoise": [[150], 0.8, 1],
  "Weavile>Knock Off>Morpeko": [[60], 1, 0.5], "Weavile>Knock Off>Scrafty": [[40], 1, 0.25], "Weavile>Knock Off>Metagross": [[140], 1, 2],
};
// Enumerates hits landed × 16 damage rolls, with boss bars clamping each hit at the bar's boundary.
const outcome = (atk, def, pm, { crit = false } = {}) => {
  const row = TABLE[`${atk.name}>${pm.getName()}>${def.name}`];
  if (!row) return null;
  const [per, acc, e] = row;
  const mult = crit ? 1.5 : 1;
  const seg = def.getMaxHp() / (def.bossSegments || 1);
  const land = per.map((_, k) => (k < per.length - 1 ? acc ** (k + 1) * (1 - acc) : acc ** per.length));
  const play = (hits, roll) => {
    let hp = def.hp, idx = def.bossSegments ? def.bossSegmentIndex : 0;
    for (let k = 0; k < hits && hp > 0; k++) {
      let d = Math.floor(per[k] * mult * roll);
      if (idx > 0 && hp - d < seg * idx) { d = hp - seg * idx; idx--; }
      hp -= d;
    }
    return hp;
  };
  let expected = 0, pKo = 0, uncapped = 0;
  per.forEach((x, k) => {
    for (let r = 0; r < 16; r++) uncapped += acc ** (k + 1) / 16 * Math.floor(x * mult * (85 + r) / 100);
  });
  land.forEach((p, i) => {
    for (let r = 0; r < 16; r++) {
      const hp = play(i + 1, (85 + r) / 100);
      expected += p / 16 * (def.hp - Math.max(hp, 0));
      if (hp <= 0) pKo += p / 16;
    }
  });
  const mv = pm.getMove();
  return {
    name: pm.getName(), type: TY[mv.type], cat: mv.category ? "special" : "physical", e, priority: mv.priority, spread: [2, 4, 6, 8].includes(mv.moveTarget),
    acc, dist: [{ n: per.length, p: 1 }], perHit: per.map(x => ({ max: Math.floor(x * mult), min: Math.floor(x * mult * 0.85) })),
    expected, uncapped, max: def.hp - Math.max(play(per.length, 1), 0), pKo, notes: [],
  };
};

const cyrus = withMetagross => {
  const party = [
    mon("Morpeko", 80, ["Electric", "Dark"], [220, 150, 90, 120, 100, 170], [["Aura Wheel", "Electric", 110, "P"]], true, 180),
    mon("Scrafty", 80, ["Dark", "Fighting"], [254, 152, 172, 63, 165, 80], [["High Jump Kick", "Fighting", 130, "P"]], false, 133),
    ...(withMetagross ? [mon("Metagross", 80, ["Steel", "Psychic"], [250, 180, 170, 120, 120, 120], [["Meteor Mash", "Steel", 90, "P"]], false)] : []),
  ];
  const foes = [
    mon("Gyarados", 82, ["Water", "Flying"], [250, 170, 110, 80, 130, 150], [["Waterfall", "Water", 80, "P"]], true),
    mon("Weavile", 84, ["Dark", "Ice"], [300, 250, 100, 60, 110, 299], [["Triple Axel", "Ice", 20, "P"], ["Knock Off", "Dark", 65, "P"]], false, undefined,
      { bossSegments: 2, bossSegmentIndex: 1, aiType: 2 }),
  ];
  return { party, foes };
};

// Mounts the HUD on a mocked scene and returns the rendered lines (`field`: everything above the foe rows).
// `fieldIndex`: whose command phase it is; `turnCommands`: commands already chosen this turn.
const render = ({ party, foes, live, arena, dist, switches, double = false, phase, fieldIndex = 0, turnCommands = [] }) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const pm = { getCurrentPhase: () => (phase ? { phaseName: phase } : live ? { phaseName: "CommandPhase", fieldIndex } : null), queueMessage() {} };
  const onField = () => party.filter(p => p.isOnField());
  for (const f of foes) { f.getOpponents = () => onField(); f.getMatchupScore = () => 1; }
  const [gyarados, weavile] = foes;
  globalThis.__stub = {
    outcome,
    dist: dist ?? (e => (e === gyarados ? [{ name: "Waterfall", type: "Water", p: 1, score: 10, targets: [0] }] : [])),
    switches: switches ?? (active => new Map(weavile && active.includes(gyarados) ? [[gyarados, { to: weavile, ratio: 1 }]] : [])),
  };
  const trainer = { getName: () => "Cyrus", config: { isBoss: true }, isDouble: () => false,
    getPartyMemberMatchupScores: () => [[1, 5]], getSortedPartyMemberMatchupScores: x => x, getNextSummonIndex: () => 1 };
  const scene = { phaseManager: pm, arena, getField: () => [...onField(), ...foes.filter(f => f.isOnField())],
    currentBattle: { waveIndex: 200, turn: 3, double, turnCommands, enemySwitchCounter: 0, getBattlerCount: () => (double ? 2 : 1), trainer },
    ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } } };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(live ? liveBundle() : bundle("hud"));
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
  assert.ok(!el.textContent, `panel error: ${el.textContent}`);
  const lines = (el.kids ?? []).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const firstRow = lines.findIndex(l => /^(foes weak to:|(\S+) \2 L\d+)/.test(l));
  return { lines, field: lines.slice(1, firstRow < 0 ? undefined : firstRow), scene };
};
// The Cyrus mistake: Scrafty sent in "→ High Jump Kick" as if the move happened this turn.
const assertNoImmediateScrafty = field => {
  assert.ok(!field.some(l => /Scrafty in(?! · optional)/.test(l) && !/^now:/.test(l)) || field.some(l => /^next: ⚔ Scrafty/.test(l)), "a Scrafty switch must be split into now/next");
  assert.ok(!field.some(l => /High Jump Kick/.test(l) && !/^next:/.test(l) && !/^↺/.test(l)), `High Jump Kick shown as an immediate action:\n${field.join("\n")}`);
};

// ---- 1. Cyrus-like, live: Gyarados switches to a boss Weavile that outspeeds and KOs Scrafty with Triple Axel.
{
  const { party, foes } = cyrus(true);
  const { lines, field } = render({ party, foes, live: true });
  console.log(`== cyrus (live)\n${lines.join("\n")}`);
  assertNoImmediateScrafty(field);
  assert.ok(!field.some(l => /Scrafty in/.test(l) && !/optional/.test(l)), "Scrafty isn't the switch-in: Weavile KOs it before it acts");
  const now = field.find(l => /^now: ⇄/.test(l));
  assert.match(now ?? "", /Morpeko .*out › .*Metagross .*in/, "the switch is the `now` step");
  const next = field.find(l => /^next: ⚔/.test(l));
  assert.match(next ?? "", /Metagross .*Meteor Mash → .*Weavile/, "the switch-in's move is the `next` step");
  assert.match(next, /⚠ .*\{next turn: Weavile's Knock Off/, "next-turn threat from the foe it will actually face");
  assert.match(next, /boss: 2 bars — no 1HKO/, "boss bars explain why it isn't a 1HKO");
  const weavileRow = lines.find(l => /^Weavile Weavile/.test(l));
  assert.match(weavileRow, /↯ Dark Knock Off → Metagross (~\d+% HP|\d+% likely) · moves first/, "foe row shows its likely move into our mon, its odds and order");
  assert.ok(lines.some(l => /^↺ if it stays: Morpeko/.test(l)), "plan for Gyarados staying is kept, dim");
}

// ---- 2. Same, without a safe answer on the bench: stay, flagged 💀 for next turn.
{
  const { party, foes } = cyrus(false);
  const { lines, field } = render({ party, foes, live: true });
  console.log(`== cyrus, no Metagross (live)\n${lines.join("\n")}`);
  assertNoImmediateScrafty(field);
  assert.ok(!field.some(l => /Scrafty in/.test(l) && !/optional/.test(l)), "no switch into a KO");
  const stay = field.find(l => /^⚔ Morpeko/.test(l));
  assert.match(stay ?? "", /💀 Ice .*3-hit .*\{next turn: Weavile's Triple Axel/, "next-turn 💀 on the staying mon, multi-hit shown");
  assert.ok(field.some(l => /no safe switch/.test(l)), "says there is no safe switch-in");
}

// ---- 3. The planner's building blocks, on scenario 1's scene.
{
  const { party, foes } = cyrus(true);
  const { scene: s } = render({ party, foes, live: true });
  const { actionOrder, threatFrom, exchange, turnsToKo } = globalThis.__planner;
  const [morpeko, scrafty] = party;
  const [gyarados, weavile] = foes;
  const plain = { priority: 0 };
  assert.equal(actionOrder(s, weavile, plain, scrafty, plain), 1, "faster acts first");
  assert.equal(actionOrder(s, scrafty, null, weavile, plain), 1, "a switch resolves before any move");
  assert.equal(actionOrder(s, scrafty, { priority: 1 }, weavile, plain), 1, "priority beats speed");
  assert.equal(actionOrder(s, morpeko, plain, { ...morpeko, id: "twin" }, plain), 0.5, "speed tie is a coin flip");
  const claw = { ...scrafty, getHeldItems: () => [new (class BypassSpeedChanceModifier { getStackCount() { return 1; } })()] };
  assert.ok(Math.abs(actionOrder(s, claw, plain, weavile, plain) - 0.1) < 1e-9, "Quick Claw: 10 % to go first");
  assert.equal(actionOrder({ ...s, arena: { getTag: t => t === "TRICK_ROOM" } }, weavile, plain, scrafty, plain), 0, "Trick Room reverses speed");

  const t = threatFrom(s, weavile, scrafty, null, { next: true });
  assert.equal(t.move.name, "Triple Axel", "Weavile's likely move into Scrafty");
  assert.ok(t.pKo > 0.6 && t.first === 1, `Triple Axel likely KOs Scrafty first (pKo ${t.pKo})`);
  assert.equal(t.worstMove.hits, "3");
  assert.doesNotThrow(() => JSON.stringify(t), "threat is JSON-safe");
  // The outcome's pKo already folds crit rolls in: Waterfall's 59–70 rolls KO 62 HP on 12 of 16, and no crit on top.
  const worn = { ...scrafty, id: "worn Scrafty", hp: 62 };
  assert.ok(Math.abs(threatFrom(s, gyarados, worn).pKo - 0.75) < 1e-9, `KO odds count crits once (${threatFrom(s, gyarados, worn).pKo})`);

  const x = exchange(s, scrafty, scrafty.moveset[0], weavile, { next: true });
  assert.equal(x.turnsWe, 2, "two boss bars: High Jump Kick can't 1HKO");
  assert.ok(x.pTheyKoFirst > 0.9, `Weavile wins the exchange (${x.pTheyKoFirst})`);
  const m = exchange(s, morpeko, morpeko.moveset[0], gyarados);
  assert.ok(m.pWeKoFirst === 1 && m.turnsWe === 1, "Aura Wheel KOs Gyarados before it moves");
  // One HP above the bar boundary: Aura Wheel (77–90) breaks the bar for 1 HP, then needs two more for the last 150.
  const edge = { ...weavile, id: "Weavile at the boundary", hp: 151 };
  assert.equal(exchange(s, morpeko, morpeko.moveset[0], edge).turnsWe, 3, "a clamped first hit doesn't set the pace for later bars");
  // Turn-end heals come every turn the target survives. Meteor Mash lands for 64.3 on average into a Gyarados healing
  // 30: 250 HP falls 34.3 a turn after the first, so the 7th hit KOs (6.4). Waterfall (55.1) into a Metagross
  // healing 10: 240 / 45.1 → 6 turns. Healing once would say 5 and 5.
  globalThis.__stub.heal = p => ({ Gyarados: 30, Metagross: 10 })[p.name] ?? 0;
  const [, , metagross] = party;
  const healing = exchange(s, { ...metagross, id: "healing Metagross" }, metagross.moveset[0], { ...gyarados, id: "healing Gyarados" });
  delete globalThis.__stub.heal;
  assert.deepEqual([healing.turnsWe, healing.turnsThey], [7, 6], "heals land every turn on both sides");
  // Chip lands every turn, the last one included: 250 HP under 64.3 a hit and 61 chip goes in 2, not 3.
  assert.equal(turnsToKo(250, 64.3, -61), 2, "chip counts on the KO turn");
  assert.equal(turnsToKo(40, 30, -10), 1, "chip finishes it the turn it's hit");
  assert.equal(turnsToKo(100, 0, -30), 4, "chip alone");
  globalThis.__stub.heal = p => (p.name === "Gyarados" ? -61 : 0);
  assert.equal(exchange(s, { ...metagross, id: "Metagross vs chip" }, metagross.moveset[0], { ...gyarados, id: "poisoned Gyarados" }).turnsWe, 2, "chip shortens the exchange");
  // Hit plus chip finishing it this turn isn't held to two turns: Meteor Mash (64.3) and 40 chip into 100 HP.
  globalThis.__stub.heal = p => ({ Gyarados: -40, Morpeko: -20 })[p.name] ?? 0;
  assert.equal(exchange(s, { ...metagross, id: "Metagross vs low chip" }, metagross.moveset[0], { ...gyarados, id: "Gyarados at 100", hp: 100 }).turnsWe, 1, "our hit and its chip");
  // …on our side too: Waterfall can't KO Morpeko at 90 alone, but with 20 poison chip it goes down this turn.
  assert.equal(exchange(s, { ...morpeko, id: "poisoned Morpeko" }, morpeko.moveset[0], { ...gyarados, id: "Gyarados vs poison" }, { hp: 90 }).turnsThey, 1, "its hit and our chip");
  // Shell Bell: our heal is asked with the damage we deal.
  const asked = [];
  globalThis.__stub.heal = (p, o) => { asked.push([p.name, Math.round(o?.dealt ?? 0)]); return 0; };
  exchange(s, { ...metagross, id: "Metagross with a bell" }, metagross.moveset[0], { ...gyarados, id: "Gyarados vs bell" });
  delete globalThis.__stub.heal;
  assert.ok(asked.some(([n, d]) => n === "Metagross" && d > 50), `our turn-end HP is asked with the damage dealt (${JSON.stringify(asked)})`);
  // Reviver Seed: Aura Wheel's KO brings Gyarados back at 125, so it takes a second turn.
  const seededOutcome = globalThis.__stub.outcome;
  globalThis.__stub.outcome = (a, d, pm, o) => { const x = seededOutcome(a, d, pm, o); return x && d.revive ? { ...x, pKo: 0, revive: d.revive } : x; };
  assert.equal(exchange(s, morpeko, morpeko.moveset[0], { ...gyarados, id: "seeded Gyarados", revive: 125 }).turnsWe, 2, "Reviver Seed adds half its HP to get through");
  // …and our own: Waterfall can't finish a seeded Morpeko at 60 HP this turn.
  const bare = exchange(s, { ...morpeko, id: "Morpeko at 60" }, morpeko.moveset[0], { ...gyarados, id: "Gyarados vs 60" }, { hp: 60 });
  const saved = exchange(s, { ...morpeko, id: "seeded Morpeko at 60", revive: 110 }, morpeko.moveset[0], { ...gyarados, id: "Gyarados vs seed" }, { hp: 60 });
  globalThis.__stub.outcome = seededOutcome;
  assert.ok(bare.turnsThey === 1 && saved.turnsThey > 2, `seed buys turns (${bare.turnsThey} → ${saved.turnsThey})`);
  // King's Rock: a faster foe flinches us 10 % a stack. High Jump Kick (55.1 a use) into Gyarados: 5 turns, 7 at 30 %.
  const rock = new (class FlinchChanceModifier { getStackCount() { return 3; } })();
  const hjk = x => exchange(s, scrafty, scrafty.moveset[0], x).turnsWe;
  assert.equal(hjk({ ...gyarados, id: "Gyarados no rock" }), 5);
  assert.equal(hjk({ ...gyarados, id: "Gyarados with rock", getHeldItems: () => [rock] }), 7, "flinches cost turns");
  // A wild boss gains a stat stage per bar broken, weighted by its stats: a Def-heavy Weavile's second bar takes
  // Aura Wheel (83 a use) 3 turns instead of 2. A trainer's boss doesn't.
  const bulky = { getStat: i => [300, 10, 1000, 10, 10, 10][i] };
  assert.equal(exchange(s, morpeko, morpeko.moveset[0], { ...weavile, ...bulky, id: "trainer Weavile", hasTrainer: () => true }).turnsWe, 4);
  assert.equal(exchange(s, morpeko, morpeko.moveset[0], { ...weavile, ...bulky, id: "wild Weavile", hasTrainer: () => false }).turnsWe, 5, "bar-break boosts slow later bars");
  console.log("== building blocks ok");
}

// ---- 4. Fallback: the real modules outside the CommandPhase still render a plan, without the turn-split bug.
{
  const { party, foes } = cyrus(true);
  const { lines, field } = render({ party, foes, live: false });
  console.log(`== cyrus (fallback)\n${lines.join("\n")}`);
  assertNoImmediateScrafty(field);
  assert.ok(field.some(l => /⚔ Morpeko/.test(l)), "a plan renders");
}

// ---- 5. A switch-in must get to act: Blastoise survives Stone Edge coming in, but the faster Lycanroc KOs it next
// turn before Wave Crash. Scored on trades alone the switch looks better than staying; it must be rejected.
{
  const party = [
    mon("Charizard", 66, ["Fire", "Flying"], [190, 125, 118, 160, 128, 120], [["Flamethrower", "Fire", 90, "S"]], true, 120),
    mon("Blastoise", 64, ["Water"], [187, 122, 144, 125, 151, 116], [["Wave Crash", "Water", 120, "P"]], false),
  ];
  const foes = [mon("Lycanroc", 70, ["Rock"], [200, 190, 100, 80, 90, 140], [["Stone Edge", "Rock", 100, "P"]], true)];
  const { lines, field } = render({ party, foes, live: true, dist: () => [{ name: "Stone Edge", type: "Rock", p: 1, score: 10, targets: [0] }] });
  console.log(`== switch-in never acts (live)\n${lines.join("\n")}`);
  assert.ok(!field.some(l => /Blastoise in(?! · optional)/.test(l)), `Blastoise is KO'd before it acts, so it isn't the switch-in:\n${field.join("\n")}`);
  assert.ok(field.some(l => /^⚔ Charizard/.test(l)), "staying wins");
  assert.ok(field.some(l => /no safe switch/.test(l)), "says there is no safe switch-in");
}

// ---- 6–8. Doubles: where both slots aim is one decision.
// Our Garchomp and Lucario are both faster than the foes. Each hits Hydreigon for 60 %: alone neither KOs it, together
// they do, before it fires a Dark Pulse for 70 % into either of us. Snorlax is bulky and hits softly.
Object.assign(TABLE, {
  "Garchomp>Dragon Claw>Hydreigon": [[180], 1, 2], "Lucario>Aura Sphere>Hydreigon": [[180], 1, 2],
  "Garchomp>Dragon Claw>Snorlax": [[70], 1, 1], "Lucario>Aura Sphere>Snorlax": [[70], 1, 2],
  "Garchomp>Dragon Claw>Ferrothorn": [[60], 1, 0.5], "Lucario>Aura Sphere>Ferrothorn": [[60], 1, 1],
  "Hydreigon>Dark Pulse>Garchomp": [[190], 1, 1], "Hydreigon>Dark Pulse>Lucario": [[150], 1, 0.5],
  "Snorlax>Body Slam>Garchomp": [[40], 1, 1], "Snorlax>Body Slam>Lucario": [[30], 1, 0.5],
  "Ferrothorn>Gyro Ball>Garchomp": [[50], 1, 1], "Ferrothorn>Gyro Ball>Lucario": [[25], 1, 0.5],
  // Scenario 7: Weezing and Toxapex each fall to one of ours, and only to that one.
  "Garchomp>Dragon Claw>Weezing": [[400], 1, 1], "Lucario>Aura Sphere>Weezing": [[150], 1, 1],
  "Garchomp>Dragon Claw>Toxapex": [[150], 1, 1], "Lucario>Aura Sphere>Toxapex": [[400], 1, 1],
  "Weezing>Sludge Bomb>Garchomp": [[120], 1, 1], "Weezing>Sludge Bomb>Lucario": [[60], 1, 0.5],
  "Toxapex>Scald>Garchomp": [[120], 1, 1], "Toxapex>Scald>Lucario": [[120], 1, 1],
});
const doublesParty = () => [
  mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130], [["Dragon Claw", "Dragon", 80, "P"]], true, undefined, { getBattlerIndex: () => 0 }),
  mon("Lucario", 80, ["Fighting", "Steel"], [240, 150, 110, 180, 110, 120], [["Aura Sphere", "Fighting", 80, "S"]], true, undefined, { getBattlerIndex: () => 1 }),
];
const foeAt = (idx, ...args) => mon(...args, true, undefined, { getBattlerIndex: () => idx });
const aimAtBoth = e => [{ name: e.moveset[0].getName(), type: TY[e.moveset[0].getMove().type], p: 1, score: 10, targets: [0, 1] }];
const slotLines = field => field.filter(l => /^⚔/.test(l));

// 6. Focus: two 60 % hits on the dangerous Hydreigon KO it before it moves.
{
  const foes = [
    foeAt(2, "Hydreigon", 80, ["Dark", "Dragon"], [300, 120, 110, 160, 110, 90], [["Dark Pulse", "Dark", 80, "S"]]),
    foeAt(3, "Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]]),
  ];
  const { lines, field } = render({ party: doublesParty(), foes, live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles focus (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.equal(slots.length, 2);
  assert.ok(slots.every(l => /→ Hydreigon/.test(l)), `both slots aim at Hydreigon:\n${field.join("\n")}`);
  assert.ok(field.some(l => /^◎ focus Hydreigon : KO before it moves/.test(l)), "focus is explained");
}

// 7. Split: each foe falls to one of our slots, so aiming at both KOs both.
{
  const foes = [
    foeAt(2, "Weezing", 80, ["Poison"], [300, 100, 150, 120, 110, 60], [["Sludge Bomb", "Poison", 90, "S"]]),
    foeAt(3, "Toxapex", 80, ["Poison", "Water"], [300, 90, 180, 80, 180, 50], [["Scald", "Water", 80, "S"]]),
  ];
  const { lines, field } = render({ party: doublesParty(), foes, live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles split (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.ok(slots.some(l => /^⚔ Garchomp .*→ Weezing/.test(l)) && slots.some(l => /^⚔ Lucario .*→ Toxapex/.test(l)), `split targets:\n${field.join("\n")}`);
  assert.ok(!field.some(l => /^⋔/.test(l)), "a split needs no line: the ⚔ targets show it");
  assert.ok(!field.some(l => /^◎/.test(l)), "no focus");
}

// 8. Scenario 6, but Hydreigon is predicted to switch out to Ferrothorn: focusing the leaving mon is pointless.
{
  const foes = [
    foeAt(2, "Hydreigon", 80, ["Dark", "Dragon"], [300, 120, 110, 160, 110, 90], [["Dark Pulse", "Dark", 80, "S"]]),
    foeAt(3, "Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]]),
    mon("Ferrothorn", 80, ["Grass", "Steel"], [280, 140, 200, 70, 160, 30], [["Gyro Ball", "Steel", 80, "P"]], false),
  ];
  const [hydreigon, , ferrothorn] = foes;
  const { lines, field } = render({ party: doublesParty(), foes, live: true, double: true, dist: aimAtBoth,
    switches: active => new Map(active.includes(hydreigon) ? [[hydreigon, { to: ferrothorn, ratio: 1 }]] : []) });
  console.log(`== doubles focus on a leaving foe (live)\n${lines.join("\n")}`);
  assert.ok(field.some(l => /Hydreigon → Ferrothorn switches/.test(l)), "switch predicted");
  assert.ok(!slotLines(field).some(l => /→ Hydreigon/.test(l)), `no slot aims at the leaving Hydreigon:\n${field.join("\n")}`);
  assert.ok(!field.some(l => /^◎ focus Hydreigon/.test(l)), "no focus on the leaving Hydreigon");
}

// ---- 9–11. Free switch: the game asks "Will you switch Pokémon?" before the first turn (CheckSwitchPhase).
// Ninetales is on the field and loses to the faster Rhyperior. Swampert beats it — but as a normal switch it would
// eat a Stone Edge coming in (≥ 25 % KO), so in the command phase it's rejected. Offered free, it's the answer.
Object.assign(TABLE, {
  "Ninetales>Flamethrower>Rhyperior": [[60], 1, 0.25], "Swampert>Surf>Rhyperior": [[220], 1, 4],
  "Rhyperior>Stone Edge>Ninetales": [[500], 0.8, 2], "Rhyperior>Stone Edge>Swampert": [[200], 0.8, 0.5],
});
const freeSwitchCase = swampertOut => ({
  party: [
    mon("Ninetales", 70, ["Fire"], [190, 90, 100, 130, 140, 120], [["Flamethrower", "Fire", 90, "S"]], !swampertOut, swampertOut ? undefined : 120),
    mon("Swampert", 70, ["Water", "Ground"], [187, 140, 120, 100, 120, 60], [["Surf", "Water", 90, "S"]], swampertOut),
  ],
  foes: [
    mon("Rhyperior", 72, ["Ground", "Rock"], [200, 180, 160, 60, 70, 140], [["Stone Edge", "Rock", 100, "P"]], true),
    mon("Tyranitar", 72, ["Rock", "Dark"], [260, 180, 140, 90, 120, 80], [["Crunch", "Dark", 80, "P"]], false),
  ],
});
const stoneEdge = () => [{ name: "Stone Edge", type: "Rock", p: 1, score: 10, targets: [0] }];
// The stub predicts Rhyperior switching to Tyranitar; during a free switch the enemy hasn't decided anything yet.
const rhyperiorSwitches = foes => active => new Map(active.includes(foes[0]) ? [[foes[0], { to: foes[1], ratio: 1 }]] : []);

// 9. Command phase: the switch-in would be KO'd coming in, so it isn't recommended.
{
  const { party, foes } = freeSwitchCase(false);
  const { lines, field } = render({ party, foes, live: true, dist: stoneEdge, switches: () => new Map() });
  console.log(`== free switch — same field in the command phase (live)\n${lines.join("\n")}`);
  assert.ok(!field.some(l => /Swampert in(?! · optional)/.test(l)), `Swampert would be KO'd coming in:\n${field.join("\n")}`);
}

// 10. CheckSwitchPhase: Swampert comes in without a hit and no turn lost.
{
  const { party, foes } = freeSwitchCase(false);
  const { lines, field } = render({ party, foes, live: true, phase: "CheckSwitchPhase", dist: stoneEdge, switches: rhyperiorSwitches(foes) });
  console.log(`== free switch — switch (live)\n${lines.join("\n")}`);
  assert.match(field[0] ?? "", /^⇄ free switch\? Ninetales → Swampert \(no hit taken\)/, `free switch line first:\n${field.join("\n")}`);
  assert.ok(field.some(l => /^⚔ Swampert .*Surf → Rhyperior/.test(l)), "the coming turn's plan follows");
  assert.ok(!field.some(l => /^(now|next):/.test(l)), "no now/next split for a free switch");
  assert.ok(!field.some(l => /switches — moves aimed at it/.test(l)), "no enemy switch predicted before the enemy has seen our field");
}

// 11. CheckSwitchPhase with the best mon already out: stay.
{
  const { party, foes } = freeSwitchCase(true);
  const { lines, field } = render({ party, foes, live: true, phase: "CheckSwitchPhase", dist: stoneEdge, switches: () => new Map() });
  console.log(`== free switch — stay (live)\n${lines.join("\n")}`);
  assert.match(field[0] ?? "", /^⇄ free switch\? stay — Swampert is best here/, `stay line first:\n${field.join("\n")}`);
  assert.ok(field.some(l => /^⚔ Swampert .*Surf → Rhyperior/.test(l)));
  assert.ok(!field.some(l => /Ninetales/.test(l)), "no switch suggested");
}

// ---- 12–14. Spread moves that hit every other pokémon land on our partner too (Earthquake: MoveTarget 4).
// Both foes are weak to Ground: Earthquake takes both, Dragon Claw only one. Earthquake into Lucario either KOs it
// (12, 14) or only scratches it (13).
const EQ = { target: 4 };
Object.assign(TABLE, {
  "Garchomp>Earthquake>Heatran": [[400], 1, 4], "Garchomp>Earthquake>Magnezone": [[400], 1, 4],
  "Garchomp>Dragon Claw>Heatran": [[150], 1, 0.5], "Garchomp>Dragon Claw>Magnezone": [[150], 1, 0.5],
  "Lucario>Aura Sphere>Heatran": [[120], 1, 1], "Lucario>Aura Sphere>Magnezone": [[120], 1, 1],
  "Heatran>Flash Cannon>Garchomp": [[60], 1, 1], "Heatran>Flash Cannon>Lucario": [[30], 1, 0.5],
  "Magnezone>Flash Cannon>Garchomp": [[60], 1, 1], "Magnezone>Flash Cannon>Lucario": [[30], 1, 0.5],
});
const quakeParty = lucarioTakes => {
  TABLE["Garchomp>Earthquake>Lucario"] = [[lucarioTakes], 1, 2];
  return [
    mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130], [["Earthquake", "Ground", 100, "P", 0, EQ], ["Dragon Claw", "Dragon", 80, "P"]], true, undefined, { getBattlerIndex: () => 0 }),
    mon("Lucario", 80, ["Fighting", "Steel"], [240, 150, 110, 180, 110, 120], [["Aura Sphere", "Fighting", 80, "S"]], true, undefined, { getBattlerIndex: () => 1 }),
  ];
};
const quakeFoes = () => [
  foeAt(2, "Heatran", 80, ["Fire", "Steel"], [300, 90, 110, 130, 110, 70], [["Flash Cannon", "Steel", 80, "S"]]),
  foeAt(3, "Magnezone", 80, ["Electric", "Steel"], [300, 70, 130, 130, 90, 60], [["Flash Cannon", "Steel", 80, "S"]]),
];

// 12. Earthquake would KO our Lucario: not worth two foes.
{
  const { lines, field } = render({ party: quakeParty(300), foes: quakeFoes(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles spread move KOs our partner (live)\n${lines.join("\n")}`);
  const chomp = slotLines(field).find(l => /^⚔ Garchomp/.test(l));
  assert.ok(chomp && !/Earthquake/.test(chomp), `no Earthquake into our own Lucario:\n${field.join("\n")}`);
}

// 13. Earthquake only scratches Lucario: still the play, and the slot says what it costs.
{
  const { lines, field } = render({ party: quakeParty(60), foes: quakeFoes(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles spread move scratches our partner (live)\n${lines.join("\n")}`);
  assert.match(slotLines(field).find(l => /^⚔ Garchomp/.test(l)) ?? "", /Earthquake → both .*hits Lucario \d+%/, `Earthquake, with its cost to Lucario:\n${field.join("\n")}`);
}

// 14. One foe left, both our slots still up: Earthquake still hits Lucario.
{
  const [heatran] = quakeFoes();
  const { lines, field } = render({ party: quakeParty(300), foes: [heatran], live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles spread move, one foe left (live)\n${lines.join("\n")}`);
  const chomp = slotLines(field).find(l => /^⚔ Garchomp/.test(l));
  assert.match(chomp ?? "", /Dragon Claw → Heatran/, `Dragon Claw rather than Earthquake through Lucario:\n${field.join("\n")}`);
}

// ---- 15. Overkill: Heat Wave already KOs both foes, so Venusaur's hit is spare — no recoil move for nothing.
Object.assign(TABLE, {
  "Charizard>Heat Wave>Rattata": [[200], 1, 1], "Charizard>Heat Wave>Pidgey": [[200], 1, 1],
  "Venusaur>Double-Edge>Rattata": [[250], 1, 1], "Venusaur>Double-Edge>Pidgey": [[250], 1, 1],
  "Venusaur>Giga Drain>Rattata": [[90], 1, 1], "Venusaur>Giga Drain>Pidgey": [[45], 1, 0.5],
  "Rattata>Hyper Fang>Charizard": [[40], 1, 1], "Rattata>Hyper Fang>Venusaur": [[40], 1, 1],
  "Pidgey>Wing Attack>Charizard": [[30], 1, 1], "Pidgey>Wing Attack>Venusaur": [[60], 1, 2],
});
{
  const party = [
    mon("Charizard", 60, ["Fire", "Flying"], [190, 125, 118, 160, 128, 148], [["Heat Wave", "Fire", 95, "S", 0, { target: 6 }]], true, undefined, { getBattlerIndex: () => 0 }),
    mon("Venusaur", 60, ["Grass", "Poison"], [200, 135, 122, 144, 144, 118], [["Double-Edge", "Normal", 120, "P", 0, { attrs: ["RecoilAttr"] }], ["Giga Drain", "Grass", 75, "S"]], true, undefined, { getBattlerIndex: () => 1 }),
  ];
  const foes = [
    foeAt(2, "Rattata", 30, ["Normal"], [80, 60, 40, 30, 40, 70], [["Hyper Fang", "Normal", 80, "P"]]),
    foeAt(3, "Pidgey", 30, ["Normal", "Flying"], [80, 50, 45, 40, 40, 60], [["Wing Attack", "Flying", 60, "P"]]),
  ];
  const { lines, field } = render({ party, foes, live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles overkill (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.match(slots.find(l => /^⚔ Charizard/.test(l)) ?? "", /Heat Wave → both/);
  const venu = slots.find(l => /^⚔ Venusaur/.test(l)) ?? "";
  assert.ok(!/Double-Edge/.test(venu), `no recoil move for a spare hit:\n${field.join("\n")}`);
  assert.match(venu, /spare hit/, "the slot says its hit isn't needed");
}

// ---- 16–17. Slot 1's command phase: slot 0's command is locked in `turnCommands[0]`.
const hydreigonSnorlax = () => [
  foeAt(2, "Hydreigon", 80, ["Dark", "Dragon"], [300, 120, 110, 160, 110, 90], [["Dark Pulse", "Dark", 80, "S"]]),
  foeAt(3, "Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]]),
];
// 16. Scenario 6's field, but Garchomp already chose Dragon Claw into Snorlax: keep it, plan Lucario around it.
{
  // A target picked in SelectTargetPhase sits on the command itself, not on `move.targets`.
  const turnCommands = [{ command: 0, cursor: 0, move: { move: 337, targets: [], useMode: 0 }, targets: [3] }];
  const { lines, field } = render({ party: doublesParty(), foes: hydreigonSnorlax(), live: true, double: true, dist: aimAtBoth, switches: () => new Map(), fieldIndex: 1, turnCommands });
  console.log(`== doubles slot 0 locked (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.match(slots.find(l => /^⚔ Garchomp/.test(l)) ?? "", /Dragon Claw → Snorlax .*locked in/, `slot 0 keeps its command:\n${field.join("\n")}`);
  assert.match(slots.find(l => /^⚔ Lucario/.test(l)) ?? "", /Aura Sphere → Hydreigon/, "slot 1 is planned around it");
}

// 17. Garchomp is switching out to Metagross: the plan takes that as given.
{
  Object.assign(TABLE, { "Metagross>Meteor Mash>Hydreigon": [[200], 1, 2], "Metagross>Meteor Mash>Snorlax": [[90], 1, 1],
    "Hydreigon>Dark Pulse>Metagross": [[60], 1, 1], "Snorlax>Body Slam>Metagross": [[30], 1, 0.5] });
  const party = [...doublesParty(), mon("Metagross", 80, ["Steel", "Psychic"], [250, 180, 170, 120, 120, 70], [["Meteor Mash", "Steel", 90, "P"]], false)];
  const { lines, field } = render({ party, foes: hydreigonSnorlax(), live: true, double: true, dist: aimAtBoth, switches: () => new Map(), fieldIndex: 1, turnCommands: [{ command: 2, cursor: 2, args: [false] }] });
  console.log(`== doubles slot 0 switching (live)\n${lines.join("\n")}`);
  assert.ok(field.some(l => /^now: ⇄ Garchomp .*out › Metagross in/.test(l)), `the locked switch is the plan:\n${field.join("\n")}`);
  assert.ok(!field.some(l => /⚔ Garchomp/.test(l)), "Garchomp isn't planned to act");
}

// ---- 18–19. Support moves.
// 18. Protect: Hydreigon outspeeds and KOs Lucario, whose hit barely matters, but the faster Garchomp KOs Hydreigon first.
{
  Object.assign(TABLE, { "Garchomp>Dragon Claw>Hydreigon": [[400], 1, 2], "Hydreigon>Dark Pulse>Lucario": [[300], 1, 1], "Lucario>Aura Sphere>Snorlax": [[30], 1, 2] });
  const party = [
    mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130], [["Dragon Claw", "Dragon", 80, "P"]], true, undefined, { getBattlerIndex: () => 0 }),
    mon("Lucario", 80, ["Fighting", "Steel"], [240, 150, 110, 180, 110, 60], [["Aura Sphere", "Fighting", 80, "S"], ["Protect", "Normal", 0, "X", 4, { target: 0, attrs: ["ProtectAttr"], id: 182 }]], true, undefined, { getBattlerIndex: () => 1 }),
  ];
  const foes = hydreigonSnorlax();
  const dist = e => (e === foes[0] ? [{ name: "Dark Pulse", type: "Dark", p: 1, score: 10, targets: [1] }] : aimAtBoth(e));
  const { lines, field } = render({ party, foes, live: true, double: true, dist, switches: () => new Map() });
  console.log(`== doubles protect (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.match(slots.find(l => /^⚔ Lucario/.test(l)) ?? "", /Protect .*Garchomp KOs Hydreigon first/, `Lucario protects:\n${field.join("\n")}`);
  assert.match(slots.find(l => /^⚔ Garchomp/.test(l)) ?? "", /Dragon Claw → Hydreigon/);
}

// 19. Helping Hand: Dragon Claw alone leaves Hydreigon standing, ×1.5 KOs it; Clefable's own hit adds nothing.
{
  Object.assign(TABLE, {
    "Garchomp>Dragon Claw>Hydreigon": [[250], 1, 2],
    "Clefable>Moonblast>Hydreigon": [[30], 1, 4], "Clefable>Moonblast>Snorlax": [[20], 1, 1],
    "Hydreigon>Dark Pulse>Clefable": [[40], 1, 0.5], "Snorlax>Body Slam>Clefable": [[40], 1, 1],
  });
  const party = [
    mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130], [["Dragon Claw", "Dragon", 80, "P"]], true, undefined, { getBattlerIndex: () => 0 }),
    mon("Clefable", 80, ["Fairy"], [300, 80, 120, 100, 140, 60], [["Moonblast", "Fairy", 95, "S"], ["Helping Hand", "Normal", 0, "X", 5, { target: 10, id: 270 }]], true, undefined, { getBattlerIndex: () => 1 }),
  ];
  const { lines, field } = render({ party, foes: hydreigonSnorlax(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles helping hand (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.match(slots.find(l => /^⚔ Clefable/.test(l)) ?? "", /Helping Hand .*Garchomp KOs Hydreigon/, `Clefable boosts Garchomp:\n${field.join("\n")}`);
  assert.match(slots.find(l => /^⚔ Garchomp/.test(l)) ?? "", /Dragon Claw → Hydreigon 1 hit .*with Helping Hand/);
}
