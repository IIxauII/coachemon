// Planner scenarios with explicit assertions. Usage: node test/plannertest.mjs
//
// The planner's numbers come from 10-damage (`moveOutcome(s)`, `endOfTurnHeal`) and 20-enemy-ai
// (`enemyMoveDistribution`, `predictSwitches`, `enemyAction`), which call real game code. A plain mock can't feed
// those, and top-level consts in the one-IIFE bundle can't be redefined afterwards. So the "live" scenarios rewrite
// the bundle text: those definitions are renamed to `__real_*` and small stand-ins reading `globalThis.__stub` are
// inserted before 30-planner, with the mocked scene in the CommandPhase. The "fallback" scenario runs the untouched
// bundle outside the CommandPhase, where the planner must still render from the approximation.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const STUBBED = ["moveOutcome", "moveOutcomes", "endOfTurnHeal", "enemyMoveDistribution", "predictSwitches", "enemyAction"];
const STUBS = `
const moveOutcome = (s, atk, def, pm, opts = {}) => globalThis.__stub.outcome(atk, def, pm, opts);
const moveOutcomes = (s, atk, def) => atk.moveset.map(pm => moveOutcome(s, atk, def, pm)).filter(Boolean);
const endOfTurnHeal = () => 0;
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
  return src.slice(0, end) + "globalThis.__planner = { actionOrder, threatFrom, exchange };\n" + src.slice(end);
};

// moves: [name, type, power, cat, priority = 0]
const mon = (name, lv, types, [hp, atk, def, spa, spd, spe], moves, field, curHp, extra = {}) => ({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0,0,0,0,0,0,0] }, isOnField: () => field, isBoss: () => !!extra.bossSegments,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null, getBattlerIndex: () => (field ? 0 : -1), getHeldItems: () => [],
  moveset: moves.map(([n, t, p, c, priority = 0]) => ({ getName: () => n, getMove: () => ({ name: n, type: TY.indexOf(t), power: p, category: cat[c], moveTarget: 3, priority, accuracy: 100, attrs: [] }), getMovePp: () => 10, ppUsed: 0 })),
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
  let expected = 0, pKo = 0;
  land.forEach((p, i) => {
    for (let r = 0; r < 16; r++) {
      const hp = play(i + 1, (85 + r) / 100);
      expected += p / 16 * (def.hp - Math.max(hp, 0));
      if (hp <= 0) pKo += p / 16;
    }
  });
  const mv = pm.getMove();
  return {
    name: pm.getName(), type: TY[mv.type], cat: mv.category ? "special" : "physical", e, priority: mv.priority, spread: false,
    acc, dist: [{ n: per.length, p: 1 }], perHit: per.map(x => ({ max: Math.floor(x * mult), min: Math.floor(x * mult * 0.85) })),
    expected, max: def.hp - Math.max(play(per.length, 1), 0), pKo, critChance: 1 / 24, notes: [],
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
const render = ({ party, foes, live, arena, dist, switches, double = false, phase }) => {
  let el;
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const pm = { getCurrentPhase: () => (phase ? { phaseName: phase } : live ? { phaseName: "CommandPhase" } : null), queueMessage() {} };
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
    currentBattle: { waveIndex: 200, turn: 3, double, enemySwitchCounter: 0, getBattlerCount: () => (double ? 2 : 1), trainer },
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
  const firstRow = lines.findIndex(l => /^(team weak to:|(\S+) \2 L\d+)/.test(l));
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
  const { actionOrder, threatFrom, exchange } = globalThis.__planner;
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

  const x = exchange(s, scrafty, scrafty.moveset[0], weavile, { next: true });
  assert.equal(x.turnsWe, 2, "two boss bars: High Jump Kick can't 1HKO");
  assert.ok(x.pTheyKoFirst > 0.9, `Weavile wins the exchange (${x.pTheyKoFirst})`);
  const m = exchange(s, morpeko, morpeko.moveset[0], gyarados);
  assert.ok(m.pWeKoFirst === 1 && m.turnsWe === 1, "Aura Wheel KOs Gyarados before it moves");
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
