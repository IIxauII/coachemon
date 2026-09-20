// Planner scenarios with explicit assertions. Usage: node test/plannertest.mjs
//
// The planner reads the live battle through one **turn** (`hud/25-turn.js`) and nothing else, so a scenario here is
// a turn built from tables: what each move does (`__stub.outcome`), what the enemy AI picks (`dist`), what the
// trainer switches to (`switches`), what a turn end costs (`heal`), what the game's own move scoring makes of a move
// of ours (`benefit`). `test/fake-turn.mjs` turns those into a turn, `60-card` composes the card from it, and the
// panel's own renderer draws it — the same path the page takes, with the scene left out.
//
// The "fallback" scenario builds an approximate turn instead (`live: false`), where the planner must still render a
// plan from nothing but the type chart.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";
import { fakeTurn } from "./fake-turn.mjs";

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
// The tables a scenario sets, as the turn asks for them. `__stub` is rebound per scenario, so every op reads it at
// call time rather than closing over it.
const stubTurn = ({ party, foes, live, double, trainer, arena, phase, fieldIndex, turnCommands, exact }) => {
  const active = () => {
    const out = foes.filter(f => f.isOnField?.());
    return (out.length ? out : foes).slice(0, double ? 2 : 1);
  };
  const cmd = double && fieldIndex === 1 ? turnCommands[0] : null;
  return fakeTurn({
    live, exact, wave: 200, turn: 3, double, trainer, party, foes,
    decision: phase === "CheckSwitchPhase" ? "check-switch" : "command",
    trickRoom: !!arena?.getTag?.("TRICK_ROOM"),
    command: cmd && !cmd.skip ? { kind: cmd.command, cursor: cmd.cursor, move: cmd.move, targets: cmd.targets?.length ? cmd.targets : cmd.move?.targets ?? [] } : null,
    outcome: (atk, def, pm, opts) => globalThis.__stub.outcome(atk, def, pm, opts),
    // A status move's own record: what the game would say about aiming it at `def`.
    statusMoves: (atk, def) => atk.moveset.filter(pm => pm.getMove().category === 2).map(pm => ({
      pm, name: pm.getName(), type: TY[pm.getMove().type], cat: "status", acc: pm.getMove().accuracy > 0 ? pm.getMove().accuracy / 100 : 1,
      e: 1, priority: pm.getMove().priority ?? 0, bypassProtect: false, bounce: false, blocked: null,
    })),
    // What a restriction took off this mon's move list, the way the scene adapter reads it off the tags.
    stopped: (atk, def) => globalThis.__stub.stopped?.(atk, def) ?? [],
    heal: (p, opts) => globalThis.__stub.heal?.(p, opts) ?? 0,
    moves: e => globalThis.__stub.dist(e),
    switchTo: f => globalThis.__stub.switches(active()).get(f)?.to ?? null,
    replay: (e, target) => globalThis.__stub.replay?.(e, target) ?? null,
    benefit: (atk, def, mv) => globalThis.__stub.benefit?.(atk, mv, def) ?? 0,
    // The trainer's send-in score, the way the scene adapter asks the game for it.
    sendIn: (f, me) => f.getMatchupScore?.(me) ?? null,
  });
};
// The planner's pieces, from expose mode. They take the turn where they used to take the scene, so a scenario hands
// them the one it built; `koCurve` takes the turn's per-mon record, so it is wrapped to look that up.
const plannerApi = turn => ({
  ...globalThis.__hud["30-planner"],
  koCurve: (target, use, opts) => globalThis.__hud["10-damage"].koCurve(turn.mon(target), use, opts),
  cardSummary: globalThis.__hud["60-card"].cardSummary,
});

// moves: [name, type, power, cat, priority = 0, { target = 3, attrs = [], id }]; an attr is a class name, or
// [name, fields] for one that carries its constructor arguments.
const attr = a => (Array.isArray(a) ? Object.assign(new ({ [a[0]]: class {} })[a[0]](), a[1]) : new ({ [a]: class {} })[a]());
// `getTypes` follows `summonData` the way the game's does (Pokemon.getTypes / getBaseTypes): written-on types replace
// the species' own, and an added type (Forest's Curse) goes on top — so a hypothesis the planner writes is visible here.
const monTypes = (sd, types) => () => {
  const base = sd.types?.length ? [...sd.types] : types.map(t => TY.indexOf(t));
  return sd.addedType != null && !base.includes(sd.addedType) ? [...base, sd.addedType] : base;
};
const mon = (name, lv, types, [hp, atk, def, spa, spd, spe], moves, field, curHp, extra = {}, summonData = { statStages: [0,0,0,0,0,0,0], types: [] }) => ({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: monTypes(summonData, types), getAbility: () => ({ name: "x" }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData, isOnField: () => field, isBoss: () => !!extra.bossSegments,
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
// The move traits the planner reads (07-move-traits' shape), faked alongside the numbers: a scenario that needs one
// sets it on the record it hands back.
const TRAITS = {
  charge: false, semiCharge: false, recharge: false, interrupt: false, needsAttack: false, once: false, lock: false,
  noRepeat: false, recoil: null, halfSac: false, crash: false, selfKo: null, drops: {}, removesType: false,
};
// Enumerates hits landed × 16 damage rolls, with boss bars clamping each hit at the bar's boundary.
const outcome = (atk, def, pm, { crit = false } = {}) => {
  const row = TABLE[`${atk.name}>${pm.getName()}>${def.name}`];
  if (!row) return null;
  const [per, acc, e] = row;
  // Stat stages on the attacking and defending stat, and burn halving a physical hit, as the game's damage call has them.
  const phys = pm.getMove().category === 0;
  const stg = (p, i) => { const x = p.summonData?.statStages?.[i - 1] ?? 0; return x >= 0 ? (2 + x) / 2 : 2 / (2 - x); };
  const mult = (crit ? 1.5 : 1) * stg(atk, phys ? 1 : 3) / stg(def, phys ? 2 : 4) * (phys && atk.status?.effect === 6 ? 0.5 : 1);
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
    expected, uncapped, max: def.hp - Math.max(play(per.length, 1), 0), pKo, traits: { ...TRAITS }, costs: [], notes: [],
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

// Builds this scenario's turn, composes the battle card from it and draws it, returning the rendered lines
// (`field`: everything above the foe rows). `fieldIndex`: whose command phase it is; `turnCommands`: commands
// already chosen this turn.
const render = ({ party, foes, live, arena, dist, switches, double = false, phase, fieldIndex = 0, turnCommands = [], stubOutcome = outcome, benefit = null, heal = null, stopped = null, exact = { ok: true } }) => {
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const onField = () => party.filter(p => p.isOnField());
  for (const f of foes) { f.getOpponents = () => onField(); f.getMatchupScore = () => 1; }
  const [gyarados, weavile] = foes;
  globalThis.__stub = {
    outcome: stubOutcome, benefit, ...(heal ? { heal } : {}), ...(stopped ? { stopped } : {}),
    dist: dist ?? (e => (e === gyarados ? [{ name: "Waterfall", type: "Water", p: 1, score: 10, targets: [0] }] : [])),
    switches: switches ?? (active => new Map(weavile && active.includes(gyarados) ? [[gyarados, { to: weavile, ratio: 1 }]] : [])),
  };
  const trainer = { getName: () => "Cyrus", config: { isBoss: true }, isDouble: () => false,
    getPartyMemberMatchupScores: () => [[1, 5]], getSortedPartyMemberMatchupScores: x => x, getNextSummonIndex: () => 1 };
  // The panel's own globals: the renderers build DOM nodes and read the view mode.
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [] } } } };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  const turn = stubTurn({ party, foes, live, double, trainer, arena, phase, fieldIndex, turnCommands, exact });
  globalThis.__planner = plannerApi(turn);
  const card = { ...globalThis.__hud["60-card"].composeBattleCard(turn, null), wave: 200 };
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
  const lines = globalThis.__hud["96-render-battle"].drawBattle(card).map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const firstRow = lines.findIndex(l => /^(foes weak to:|(\S+) \2 L\d+)/.test(l));
  // `scene` is the turn now: what the planner is handed, and what a scenario tweaks.
  return { lines, field: lines.slice(1, firstRow < 0 ? undefined : firstRow), card, scene: turn };
};
// The Cyrus mistake: Scrafty sent in "→ High Jump Kick" as if the move happened this turn.
const assertNoImmediateScrafty = field => {
  // A ⇄ switch line, not the ⤵ free entry a doomed mon's faint buys (#170 §E), which names no switch at all.
  assert.ok(!field.some(l => /⇄.*Scrafty in(?! · optional)/.test(l) && !/^now:/.test(l)) || field.some(l => /^next: ⚔ Scrafty/.test(l)), "a Scrafty switch must be split into now/next");
  assert.ok(!field.some(l => /High Jump Kick/.test(l) && !/^next:/.test(l) && !/^↺/.test(l)), `High Jump Kick shown as an immediate action:\n${field.join("\n")}`);
};

// ---- 1. Cyrus-like, live: Gyarados switches to a boss Weavile that outspeeds and KOs Scrafty with Triple Axel.
{
  const { party, foes } = cyrus(true);
  const { lines, field } = render({ party, foes, live: true });
  console.log(`== cyrus (live)\n${lines.join("\n")}`);
  assertNoImmediateScrafty(field);
  assert.ok(!field.some(l => /⇄.*Scrafty in/.test(l) && !/optional/.test(l)), "Scrafty isn't the switch-in: Weavile KOs it before it acts");
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
  assert.ok(!field.some(l => /⇄.*Scrafty in/.test(l) && !/optional/.test(l)), "no switch into a KO");
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
  assert.equal(actionOrder({ ...s, facts: { ...s.facts, trickRoom: true } }, weavile, plain, scrafty, plain), 0, "Trick Room reverses speed");

  // The BYPASS_SPEED tag is read before any ability bracket, so Quick Claw puts its holder first whatever the bracket
  // would have said; Mycelium Might stops the tag going on at all, but only for a status move (#178.6).
  // MovePriorityInBracket: LAST 0, NORMAL 1, FIRST 2. MoveCategory.STATUS is 2.
  const clawItem = () => new (class BypassSpeedChanceModifier { getStackCount() { return 1; } })();
  const stall = { priority: 0, getPriorityModifier: () => 0 };
  const clawLast = { ...scrafty, getHeldItems: () => [clawItem()] };
  assert.ok(Math.abs(actionOrder(s, clawLast, stall, weavile, plain) - 0.1) < 1e-9, "Quick Claw beats its own LAST bracket");
  const mycelium = { ...scrafty, getAbility: () => ({ name: "Mycelium Might" }), getHeldItems: () => [clawItem()] };
  assert.equal(actionOrder(s, mycelium, { priority: 0, category: 2 }, weavile, plain), 0, "Mycelium Might blocks the bypass on a status move");
  assert.ok(Math.abs(actionOrder(s, mycelium, plain, weavile, plain) - 0.1) < 1e-9, "\u2026but not on an attack");

  // A speed tie on the turn the game is waiting on is settled by that turn's own shuffle, not a coin flip (#178.5).
  // Reading the shuffle is the turn's (`turn.speedTie`, tested against a fake scene in damagetest); what the planner
  // owns is when to ask for it — only for this turn, and only while the turn has an answer.
  {
    const ours = { ...morpeko, isPlayer: () => true };
    const theirs = { ...morpeko, id: "twin", isPlayer: () => false };
    const tied = tie => ({ ...s, speedTie: () => tie });
    assert.equal(actionOrder(tied(1), ours, plain, theirs, plain, { thisTurn: true }), 1, "the shuffle put ours first");
    assert.equal(actionOrder(tied(0), ours, plain, theirs, plain, { thisTurn: true }), 0, "…and here theirs");
    assert.equal(actionOrder(tied(null), ours, plain, theirs, plain, { thisTurn: true }), 0.5, "nothing settles it: coin flip");
    assert.equal(actionOrder(tied(0), ours, plain, theirs, plain), 0.5, "a later turn keeps the coin flip");
  }

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
  // Turn-end heals come every turn the target survives, and never past max HP (Pokemon.heal). Meteor Mash lands for
  // 64.3 on average, 57.9 a use with its 10 % misses, into a Gyarados healing 30: 250 HP falls 27.9 a turn on the mean,
  // but a miss at full HP heals nothing, so the 8th use finishes it only 49.96 % of the time and the likely turn is the
  // 9th (8.0 expected). Waterfall (55.1) into a Metagross healing 10: 240 / 45.1 → 6 turns. Healing once would say 5 and 5.
  globalThis.__stub.heal = p => ({ Gyarados: 30, Metagross: 10 })[p.name] ?? 0;
  const [, , metagross] = party;
  const healing = exchange(s, { ...metagross, id: "healing Metagross" }, metagross.moveset[0], { ...gyarados, id: "healing Gyarados" });
  delete globalThis.__stub.heal;
  assert.deepEqual([healing.turnsWe, healing.turnsThey], [9, 6], "heals land every turn on both sides");
  assert.ok(Math.abs(healing.eTurnsWe - 8) < 0.05, `expected turns (${healing.eTurnsWe})`);
  // Meteor Mash and 61 chip a turn into 250 HP: two turns do it only 47.8 % of the time (the rolls and a 10 % miss
  // decide), three 98 %. The mean (64.3 + 61 a turn) would call it a sure two.
  globalThis.__stub.heal = p => (p.name === "Gyarados" ? -61 : 0);
  assert.equal(exchange(s, { ...metagross, id: "Metagross vs chip" }, metagross.moveset[0], { ...gyarados, id: "poisoned Gyarados" }).turnsWe, 3, "chip shortens the exchange");
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
  // Reviver Seed: Aura Wheel's KO brings Gyarados back at 125, so it takes a second turn. The outcome says so this turn
  // (`revive`, no pKo); the KO pacing core reads the held seed for the turns after.
  const seededOutcome = globalThis.__stub.outcome;
  const seed = new (class PokemonInstantReviveModifier { getStackCount() { return 1; } })();
  const seeded = (x, id) => ({ ...x, id, getHeldItems: () => [seed] });
  globalThis.__stub.outcome = (a, d, pm, o) => {
    const x = seededOutcome(a, d, pm, o);
    return x && d.getHeldItems().includes(seed) ? { ...x, pKo: 0, revive: Math.floor(d.getMaxHp() / 2) } : x;
  };
  assert.equal(exchange(s, morpeko, morpeko.moveset[0], seeded(gyarados, "seeded Gyarados")).turnsWe, 2, "Reviver Seed adds half its HP to get through");
  // …and our own: Waterfall can't finish a seeded Morpeko at 60 HP this turn.
  const bare = exchange(s, { ...morpeko, id: "Morpeko at 60" }, morpeko.moveset[0], { ...gyarados, id: "Gyarados vs 60" }, { hp: 60 });
  const saved = exchange(s, seeded(morpeko, "seeded Morpeko at 60"), morpeko.moveset[0], { ...gyarados, id: "Gyarados vs seed" }, { hp: 60 });
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
  // …and an Atk-heavy one hits harder once a bar breaks: Meteor Mash takes 3 turns a bar of a 400 HP Ursaring, whose
  // Body Slam (36.8 a turn) needs 7 turns for Metagross's 250 HP; +~1 Atk after the first bar makes it 6.
  Object.assign(TABLE, { "Metagross>Meteor Mash>Ursaring": [[80], 1, 1], "Ursaring>Body Slam>Metagross": [[40], 1, 1] });
  const ursaring = (id, trainer) => mon("Ursaring", 80, ["Normal"], [400, 1000, 10, 10, 10, 10], [["Body Slam", "Normal", 85, "P"]], true, undefined,
    { id, bossSegments: 2, bossSegmentIndex: 1, hasTrainer: () => trainer });
  const slam = x => exchange(s, { ...metagross, id: `Metagross vs ${x.id}` }, metagross.moveset[0], x);
  assert.deepEqual([slam(ursaring("trainer Ursaring", true)).turnsWe, slam(ursaring("trainer Ursaring", true)).turnsThey], [6, 7]);
  assert.equal(slam(ursaring("wild Ursaring", false)).turnsThey, 6, "bar-break boosts to its attack speed up its KO");
  // The boost only comes once the bar breaks (our 3rd hit): at 80 HP, Metagross falls to the 3rd unboosted Body Slam.
  assert.equal(exchange(s, { ...metagross, id: "Metagross at 80 vs wild" }, metagross.moveset[0], ursaring("wild Ursaring vs 80", false), { hp: 80 }).turnsThey, 3,
    "no boost before the bar breaks");
  // Sleep tokens (2.5 % a stack a landed hit): asleep 1–2 attempts (⅓ / ⅔). Metagross moves first, so a Body Slam's
  // sleep costs from the next turn: acting 1, .9, .84, .86, .87, .89… Meteor Mash needs six landed uses for the two
  // 200 HP bars, and all of the first six get through 50.4 % of the time — just more likely than not, so 6 turns; by
  // the 7th, 83.7 %. Taken on the mean it read 7.
  const { tokenActs, koCurve } = globalThis.__planner;
  const mashRolls = Array.from({ length: 16 }, (_, r) => ({ d: Math.floor(80 * (85 + r) / 100), p: 1 / 16 }));
  const tokenCurve = id => {
    const a = tokenActs(s, ursaring(`${id} Ursaring`, true), { ...metagross, id: `Metagross vs ${id}` }, 1, 0);
    return koCurve(ursaring(`${id} Ursaring, two 200 HP bars`, true), mashRolls, { act: i => a.act(i + 1) }).by.map(x => Math.round(x * 1000) / 1000);
  };
  const sleepToken = new (class EnemyAttackStatusEffectChanceModifier { effect = 4; chance = 0.025; getStackCount() { return 4; } })();
  s.facts.enemyModifiers = [sleepToken];
  assert.deepEqual(tokenCurve("sleep").slice(4, 7), [0, 0.504, 0.837], "each attempt is one KO-or-not branch, not a share of a hit");
  assert.equal(slam(ursaring("trainer Ursaring vs sleep", true)).turnsWe, 6, "sleep tokens cost our turns");
  // Freeze at 10 stacks (25 % a hit): ¾ then 9/16 of the next two attempts lost, acting 1, .81, .72, .79, .84, .88,
  // .91: six of the first seven land 71.9 % of the time, so 7 turns (the mean said 8).
  s.facts.enemyModifiers = [new (class EnemyAttackStatusEffectChanceModifier { effect = 5; chance = 0.025; getStackCount() { return 10; } })()];
  assert.deepEqual(tokenCurve("freeze").slice(5, 7), [0.342, 0.719]);
  assert.equal(slam(ursaring("trainer Ursaring vs freeze", true)).turnsWe, 7, "freeze tokens cost our turns");
  // Paralysis halves Speed: a Speed-100 Ursaring then outspeeds Metagross (120). Both KO on turn 6 more likely than
  // not; paralysed by turn 5 with 1 − .75⁵ = .763, Metagross gets the last hit in only .237 of the time — and its 6th
  // use itself only lands in time 70.3 % of the time (a paralysed turn is lost 1 in 8), so .703 × .237 = .167.
  s.facts.enemyModifiers = [new (class EnemyAttackStatusEffectChanceModifier { effect = 3; chance = 0.025; getStackCount() { return 10; } })()];
  const quick = id => ({ ...ursaring(id, true), getStat: i => [400, 1000, 10, 10, 10, 100][i] });
  const tie = exchange(s, { ...metagross, id: "Metagross at 200 vs para" }, metagross.moveset[0], quick("quick Ursaring vs para"), { hp: 200 });
  assert.deepEqual([tie.turnsWe, tie.turnsThey], [6, 6]);
  assert.equal(tokenCurve("para")[5], 0.703);
  assert.ok(Math.abs(tie.pWeKoFirst - 0.167) < 0.005, `paralysis flips the order of the last turn (${tie.pWeKoFirst})`);
  s.facts.enemyModifiers = [];
  // Wave poison tokens: each landed enemy attack poisons 5 % a stack. Waterfall (73.9 a turn) needs 3 turns for 150 HP;
  // at 10 stacks Morpeko is poisoned half the time by turn 1's end, and the expected 1/8 chip finishes it in 2.
  const token = new (class EnemyAttackStatusEffectChanceModifier { effect = 1; chance = 0.05; getStackCount() { return 10; } })();
  globalThis.__stub.heal = p => (p.status?.effect === 1 ? -22 : 0);
  const gyaradosVs = id => exchange(s, { ...morpeko, id }, morpeko.moveset[0], { ...gyarados, id: `Gyarados vs ${id}` }, { hp: 150 }).turnsThey;
  assert.equal(gyaradosVs("Morpeko without tokens"), 3);
  s.facts.enemyModifiers = [token];
  assert.equal(gyaradosVs("Morpeko vs tokens"), 2, "poison tokens chip over the fight");
  assert.equal(exchange(s, { ...morpeko, id: "burned Morpeko", status: { effect: 6 } }, morpeko.moveset[0], { ...gyarados, id: "Gyarados vs burned" }, { hp: 150 }).turnsThey, 3,
    "a statused mon can't be poisoned");
  s.facts.enemyModifiers = [];
  // Item thieves take one stack a steal. Leftovers healing Metagross 10 a turn makes Waterfall (55.1) take 6 turns; a
  // Mini Black Hole takes them at the end of turn 1, a 5-stack Grip Claw half the time each hit: 5 either way.
  const heldItem = (name, n = 1) => new ({ [name]: class { isTransferable = true; getStackCount() { return n; } } })[name]();
  const leftovers = () => [heldItem("TurnHealModifier")];
  globalThis.__stub.heal = p => (p.getHeldItems().some(m => m.constructor.name === "TurnHealModifier") ? { Metagross: 10, Gyarados: 30 }[p.name] ?? 0 : 0);
  const waterfall = (id, items) => exchange(s, { ...metagross, id, getHeldItems: leftovers }, metagross.moveset[0], { ...gyarados, id: `Gyarados vs ${id}`, getHeldItems: () => items }).turnsThey;
  assert.equal(waterfall("Metagross, no thief", []), 6);
  assert.equal(waterfall("Metagross vs black hole", [heldItem("TurnHeldItemTransferModifier")]), 5, "Mini Black Hole takes the Leftovers");
  assert.equal(waterfall("Metagross vs grip claw", [heldItem("ContactHeldItemTransferChanceModifier", 5)]), 5, "Grip Claw takes the Leftovers");
  assert.equal(exchange(s, { ...metagross, id: "sticky Metagross", getHeldItems: leftovers, hasAbilityWithAttr: a => a === "BlockItemTheftAbAttr" }, metagross.moveset[0],
    { ...gyarados, id: "Gyarados vs sticky", getHeldItems: () => [heldItem("TurnHeldItemTransferModifier")] }).turnsThey, 6, "Sticky Hold keeps them");
  // A steal picks an item, then a stack: Leftovers (+50) beside a 4-stack item loses half its heal to the first steal,
  // not a fifth. Heal 50, 25, 12.5, 6.25… against Waterfall's 55.1: down on turn 7 (8 if stacks were picked evenly).
  globalThis.__stub.heal = p => (p.getHeldItems().some(m => m.constructor.name === "TurnHealModifier") ? 50 : 0);
  assert.equal(exchange(s, { ...metagross, id: "Metagross, Leftovers and a 4-stack", getHeldItems: () => [heldItem("TurnHealModifier"), heldItem("BaseStatModifier", 4)] },
    metagross.moveset[0], { ...gyarados, id: "Gyarados vs 4-stack", getHeldItems: () => [heldItem("TurnHeldItemTransferModifier")] }).turnsThey, 7, "a steal picks an item, then a stack");
  globalThis.__stub.heal = p => (p.getHeldItems().some(m => m.constructor.name === "TurnHealModifier") ? { Metagross: 10, Gyarados: 30 }[p.name] ?? 0 : 0);
  // …and ours from it: Meteor Mash (57.9 a use, misses counted) into a Gyarados healing 30 takes 9 turns (as above), 5
  // once our black hole has its Leftovers.
  const mash = (id, items) => exchange(s, { ...metagross, id, getHeldItems: () => items }, metagross.moveset[0], { ...gyarados, id: `Gyarados vs ${id}`, getHeldItems: leftovers }).turnsWe;
  assert.equal(mash("Metagross, no black hole", []), 9);
  assert.equal(mash("Metagross with black hole", [heldItem("TurnHeldItemTransferModifier")]), 5, "our Mini Black Hole takes its Leftovers");
  delete globalThis.__stub.heal;
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
  // A ⇄ line: the ⤵ free entry a doomed Charizard buys is not a switch, and costs nothing.
  assert.ok(!field.some(l => /⇄.*Blastoise in(?! · optional)/.test(l)), `Blastoise is KO'd before it acts, so it isn't the switch-in:\n${field.join("\n")}`);
  assert.ok(field.some(l => /^⚔ Charizard/.test(l)), "staying wins");
  assert.ok(field.some(l => /no safe switch/.test(l)), "says there is no safe switch-in");
}

// ---- 5b. A foe's item thief is named on the slot that holds something to lose.
{
  const item = (name, props = {}) => Object.assign(new ({ [name]: class { isTransferable = true; getStackCount() { return 1; } } })[name](), props);
  const lycanroc = held => [mon("Lycanroc", 70, ["Rock"], [200, 190, 100, 80, 90, 140], [["Stone Edge", "Rock", 100, "P"]], true, undefined, { getHeldItems: () => held })];
  const charizard = held => [mon("Charizard", 66, ["Fire", "Flying"], [190, 125, 118, 160, 128, 120], [["Flamethrower", "Fire", 90, "S"]], true, 120, { getHeldItems: () => held })];
  const dist = () => [{ name: "Stone Edge", type: "Rock", p: 1, score: 10, targets: [0] }];
  const slot = (party, foes) => render({ party, foes, live: true, dist }).field.find(l => /^⚔ Charizard/.test(l)) ?? "";
  const claw = slot(charizard([item("TurnHealModifier")]), lycanroc([item("ContactHeldItemTransferChanceModifier", { chance: 0.1 })]));
  assert.match(claw, /Lycanroc's Grip Claw: 10% item steal a hit/, `Grip Claw named:\n${claw}`);
  const hole = slot(charizard([item("TurnHealModifier")]), lycanroc([item("TurnHeldItemTransferModifier")]));
  assert.match(hole, /Lycanroc's Mini Black Hole: steals 1 item a turn/, `Mini Black Hole named:\n${hole}`);
  assert.doesNotMatch(slot(charizard([]), lycanroc([item("TurnHeldItemTransferModifier")])), /Mini Black Hole/, "nothing to steal, no note");
  console.log("== item thief note ok");
}

// ---- 5c. Depth 2: Fake Out first. Ambipom is faster; Slowbro's Psychic (136–160) 2HKOs its 250 HP. Return
// (136–160) needs three hits for 320 HP, so trading Returns loses on turn 2. Fake Out (51–60, priority, a sure flinch
// on the first turn out) takes turn 1 for free, and two Returns on top of it are enough: Ambipom's last hit lands
// on turn 3 before Slowbro's second Psychic.
Object.assign(TABLE, { "Ambipom>Fake Out>Slowbro": [[60], 1, 1], "Ambipom>Return>Slowbro": [[160], 1, 1], "Slowbro>Psychic>Ambipom": [[160], 1, 1] });
{
  const party = [mon("Ambipom", 70, ["Normal"], [250, 180, 120, 60, 120, 200], [["Fake Out", "Normal", 40, "P", 3], ["Return", "Normal", 102, "P"]], true)];
  const foes = [mon("Slowbro", 70, ["Water", "Psychic"], [320, 120, 200, 180, 150, 60], [["Psychic", "Psychic", 90, "S"]], true)];
  const fakeOut = (a, d, pm, o) => { const x = outcome(a, d, pm, o); return x && pm.getName() === "Fake Out" ? { ...x, traits: { ...x.traits, once: true }, flinch: 1 } : x; };
  const dist = () => [{ name: "Psychic", type: "Psychic", p: 1, score: 10, targets: [0] }];
  const at = stub => render({ party, foes, live: true, dist, switches: () => new Map(), stubOutcome: stub }).field.find(l => /^⚔ Ambipom/.test(l)) ?? "";
  const withFakeOut = at(fakeOut);
  console.log(`== depth 2: Fake Out then Return (live)\n${withFakeOut}`);
  assert.match(withFakeOut, /Fake Out → Slowbro .*then Return/, `Fake Out first, Return after:\n${withFakeOut}`);
  // Without the first-turn flinch, Fake Out is just a weak hit: repeat Return.
  assert.match(at(outcome), /Return → Slowbro/, "no flinch, no Fake Out");
}

// ---- 5d. Consistency: two equal moves, and the one Garchomp used last turn keeps the edge rather than the first listed.
Object.assign(TABLE, { "Garchomp>Dragon Claw>Snorlax": [[70], 1, 1], "Garchomp>Stone Edge>Snorlax": [[70], 1, 1], "Snorlax>Body Slam>Garchomp": [[40], 1, 1] });
{
  const foes = [mon("Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]], true)];
  const chomp = extra => [mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130],
    [["Stone Edge", "Rock", 100, "P", 0, { id: 444 }], ["Dragon Claw", "Dragon", 80, "P", 0, { id: 337 }]], true, undefined, extra)];
  const dist = () => [{ name: "Body Slam", type: "Normal", p: 1, score: 10, targets: [0] }];
  const pick = extra => render({ party: chomp(extra), foes, live: true, dist, switches: () => new Map() }).field.find(l => /^⚔ Garchomp/.test(l)) ?? "";
  assert.match(pick({}), /Stone Edge → Snorlax/, "the first listed, all else equal");
  const kept = pick({ tempSummonData: { turnCount: 3 }, getLastXMoves: () => [{ move: 337, targets: [2], result: 1 }] });
  console.log(`== consistency: last turn's move (live)\n${kept}`);
  assert.match(kept, /Dragon Claw → Snorlax/, `keeps last turn's near-equal move:\n${kept}`);
}

// ---- 5e–5k. Status moves as this turn's action (#74), each against its own one-on-one.
const oneOnOne = ({ party, foes, dist, stub = outcome, stopped = null, switches = () => new Map() }) => render({ party, foes, live: true, dist, switches, stubOutcome: stub, stopped });
const lineOf = (field, name) => field.find(l => new RegExp(`^⚔ ${name}`).test(l)) ?? "";
const only = move => () => [{ name: move, type: "Normal", p: 1, score: 10, targets: [0] }];
const SWORDS_DANCE = ["Swords Dance", "Normal", 0, "X", 0, { target: 0, id: 14, attrs: [["StatStageChangeAttr", { stats: [1], stages: 2, selfTarget: true }]] }];

// 5e. Swords Dance: Leaf Blade (77–90) needs six hits on Snorlax's 450 HP; at +2 (153–180) three, so a turn of setup
// and three hits beat six, against a Body Slam that barely scratches Gallade.
Object.assign(TABLE, { "Gallade>Leaf Blade>Snorlax": [[90], 1, 1], "Snorlax>Body Slam>Gallade": [[40], 1, 1] });
{
  const gallade = hit => [mon("Gallade", 80, ["Psychic", "Fighting"], [300, 200, 110, 90, 150, 100], [["Leaf Blade", "Grass", 90, "P"], SWORDS_DANCE], true)];
  const snorlax = hp => [mon("Snorlax", 80, ["Normal"], [hp, 150, 110, 80, 150, 30], [["Body Slam", "Normal", 85, "P"]], true)];
  const setupLine = lineOf(oneOnOne({ party: gallade(), foes: snorlax(450), dist: only("Body Slam") }).field, "Gallade");
  console.log(`== setup: Swords Dance then Leaf Blade (live)\n${setupLine}`);
  assert.match(setupLine, /Swords Dance .*\+2 Atk .*then Leaf Blade/, `set up, then attack:\n${setupLine}`);
  assert.ok(!/→/.test(setupLine), "a move on the user aims at nobody");
  // A Leaf Blade that already 2HKOs (213–250 into 400) gains nothing from a turn of setup.
  TABLE["Gallade>Leaf Blade>Snorlax"] = [[250], 1, 1];
  assert.match(lineOf(oneOnOne({ party: gallade(), foes: snorlax(400), dist: only("Body Slam") }).field, "Gallade"), /Leaf Blade → Snorlax/, "no setup when the hit already 2HKOs");
}

// 5f. Spore: Breloom is faster and 2HKOs Machamp, whose Close Combat 1HKOs it — trading hits loses on turn 1. Spore
// lands before Machamp moves and cancels that attempt; the next is lost 2 times in 3 (sleep lasts 2 or 3 turns), so
// two Seed Bombs usually land first.
Object.assign(TABLE, { "Breloom>Seed Bomb>Machamp": [[200], 1, 1], "Machamp>Close Combat>Breloom": [[400], 1, 1] });
{
  const party = [mon("Breloom", 80, ["Grass", "Fighting"], [250, 200, 110, 60, 90, 100],
    [["Seed Bomb", "Grass", 80, "P"], ["Spore", "Grass", 0, "X", 0, { id: 147, attrs: [["StatusEffectAttr", { effect: 4 }]] }]], true)];
  const foes = [mon("Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 50], [["Close Combat", "Fighting", 120, "P"]], true)];
  const line = lineOf(oneOnOne({ party, foes, dist: only("Close Combat") }).field, "Breloom");
  console.log(`== status: Spore first (live)\n${line}`);
  assert.match(line, /Spore → Machamp .*sleep .*then Seed Bomb/, `Spore, then attack:\n${line}`);
  // Already asleep: nothing to add.
  const asleep = [mon("Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 50], [["Close Combat", "Fighting", 120, "P"]], true, undefined, { status: { effect: 4, sleepTurnsRemaining: 2 } })];
  assert.match(lineOf(oneOnOne({ party, foes: asleep, dist: only("Close Combat") }).field, "Breloom"), /Seed Bomb → Machamp/, "no Spore into a sleeping foe");
}

// 5g. Recovery: Slowbro at half HP (200/400) needs three Scalds; the faster Gengar's Shadow Ball (68–80) takes it down
// in three. Slack Off first puts Gengar's count at five, and the three Scalds land in time.
Object.assign(TABLE, { "Slowbro>Scald>Gengar": [[100], 1, 1], "Gengar>Shadow Ball>Slowbro": [[80], 1, 1] });
{
  const party = [mon("Slowbro", 80, ["Water", "Psychic"], [400, 90, 180, 120, 110, 30],
    [["Scald", "Water", 80, "S"], ["Slack Off", "Normal", 0, "X", 0, { target: 0, id: 303, attrs: [["HealAttr", { healRatio: 0.5, selfTarget: true }]] }]], true, 200)];
  const foes = [mon("Gengar", 80, ["Ghost", "Poison"], [250, 60, 90, 180, 100, 130], [["Shadow Ball", "Ghost", 80, "S"]], true)];
  const line = lineOf(oneOnOne({ party, foes, dist: only("Shadow Ball") }).field, "Slowbro");
  console.log(`== heal: Slack Off first (live)\n${line}`);
  assert.match(line, /Slack Off .*heal 50% .*then Scald/, `heal, then attack:\n${line}`);
}

// 5h. Stealth Rock: Skarmory can't dent Chansey either way, and the trainer still has four mons weak to Rock to come.
Object.assign(TABLE, { "Skarmory>Drill Peck>Chansey": [[60], 1, 1], "Chansey>Seismic Toss>Skarmory": [[30], 1, 1] });
{
  const rock = ["Stealth Rock", "Rock", 0, "X", 0, { target: 16, id: 446, attrs: [["AddArenaTrapTagAttr", { tagType: "STEALTH_ROCK" }]] }];
  const party = [mon("Skarmory", 80, ["Steel", "Flying"], [330, 110, 200, 60, 100, 70], [["Drill Peck", "Flying", 80, "P"], rock], true)];
  const bench = ["Charizard", "Talonflame", "Moltres", "Volcarona"].map(n => mon(n, 80, n === "Volcarona" ? ["Bug", "Fire"] : ["Fire", "Flying"], [300, 100, 100, 100, 100, 100], [], false));
  const chansey = mon("Chansey", 80, ["Normal"], [600, 20, 20, 50, 200, 50], [["Seismic Toss", "Fighting", 0, "P"]], true);
  const line = lineOf(oneOnOne({ party, foes: [chansey, ...bench], dist: e => (e === chansey ? only("Seismic Toss")() : []) }).field, "Skarmory");
  console.log(`== hazard: Stealth Rock (live)\n${line}`);
  assert.match(line, /Stealth Rock .*4 to come .*then Drill Peck/, `hazard first:\n${line}`);
  // With nobody left to come it's worth nothing.
  assert.match(lineOf(oneOnOne({ party, foes: [chansey], dist: only("Seismic Toss") }).field, "Skarmory"), /Drill Peck → Chansey/, "no hazard with no bench");
}

// 5i. A foe likely to Protect blocks this turn's hit: Garchomp's sure 1HKO on Snorlax is a coin flip into a 50 % Protect.
Object.assign(TABLE, { "Garchomp>Earthquake>Snorlax": [[800], 1, 1] });
{
  const party = [mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130], [["Earthquake", "Ground", 100, "P"]], true)];
  const snorlax = () => [mon("Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40],
    [["Body Slam", "Normal", 85, "P"], ["Protect", "Normal", 0, "X", 4, { target: 0, attrs: ["ProtectAttr"], id: 182 }]], true)];
  const pOf = protect => {
    const foes = snorlax();
    const dist = () => [{ name: "Body Slam", type: "Normal", p: 1 - protect, score: 10, targets: [0] }, ...(protect ? [{ name: "Protect", type: "Normal", p: protect, score: 10, targets: [2] }] : [])];
    const { scene: s } = oneOnOne({ party, foes, dist });
    return globalThis.__planner.exchange(s, party[0], party[0].moveset[0], foes[0]).turn1.we;
  };
  const open = pOf(0), guarded = pOf(0.5);
  console.log(`== foe Protect: KO this turn ${open.toFixed(3)} → ${guarded.toFixed(3)}`);
  assert.ok(open > 0.99 && Math.abs(guarded - open / 2) < 1e-6, `Protect halves this turn's KO: ${open} → ${guarded}`);
}

// 5j. A foe setting up: Snorlax picks Swords Dance half the time (+1 Atk a turn expected), so its later Body Slams hit
// harder and Gallade falls sooner than to a foe that wastes the same turns on Splash.
{
  TABLE["Snorlax>Body Slam>Gallade"] = [[90], 1, 1];
  const party = [mon("Gallade", 80, ["Psychic", "Fighting"], [300, 200, 110, 90, 150, 100], [["Leaf Blade", "Grass", 90, "P"]], true)];
  const turns = second => {
    const foes = [mon("Snorlax", 80, ["Normal"], [450, 150, 110, 80, 150, 30], [["Body Slam", "Normal", 85, "P"], second], true)];
    const dist = () => [{ name: "Body Slam", type: "Normal", p: 0.5, score: 10, targets: [0] }, { name: second[0], type: "Normal", p: 0.5, score: 10, targets: [2] }];
    const { scene: s } = oneOnOne({ party, foes, dist });
    const { threatFrom, exchange } = globalThis.__planner;
    return { t: threatFrom(s, foes[0], party[0]), x: exchange(s, party[0], party[0].moveset[0], foes[0]) };
  };
  const dancing = turns(SWORDS_DANCE), splashing = turns(["Splash", "Normal", 0, "X", 0, { target: 0, id: 150 }]);
  console.log(`== foe setup: expected turns to KO Gallade ${splashing.x.eTurnsThey.toFixed(2)} → ${dancing.x.eTurnsThey.toFixed(2)}`);
  assert.deepEqual(dancing.t.boost, { 1: 1 }, "half the time +2 Atk");
  assert.equal(splashing.t.boost, null);
  assert.ok(dancing.x.eTurnsThey < splashing.x.eTurnsThey - 0.5, "setup speeds up its KO");
}

// 5l. A typing written onto the foe (#171, the Guzma w165 Golisopod): Soak makes Bug/Steel Golisopod pure Water.
// Energy Ball goes from 0.25× (25 a hit into 400 HP: sixteen turns) to 2× (200: two), and Golisopod's Iron Head
// loses its STAB (150 → 100 into Primarina's 400). Damage here follows the *live* typing, so the written-on types are
// what move the numbers — the same path the game's own damage call takes.
{
  const EFF = { Grass: { Bug: 0.5, Steel: 0.5, Water: 2, Fairy: 1 }, Steel: { Water: 0.5, Fairy: 2, Bug: 1, Steel: 0.5 } };
  const typed = (atk, def, pm, opts) => {
    const row = outcome(atk, def, pm, opts);
    if (!row) return null;
    const ty = TY[pm.getMove().type];
    const e = def.getTypes().reduce((m, t) => m * (EFF[ty]?.[TY[t]] ?? 1), 1);
    const scale = e * (atk.getTypes().includes(TY.indexOf(ty)) ? 1.5 : 1);
    return { ...row, e, expected: row.expected * scale, uncapped: row.uncapped * scale, max: Math.min(def.hp, row.max * scale),
      perHit: row.perHit.map(h => ({ max: h.max * scale, min: h.min * scale })), pKo: row.max * scale >= def.hp ? 1 : 0 };
  };
  Object.assign(TABLE, { "Primarina>Energy Ball>Golisopod": [[100], 1, 1], "Golisopod>Iron Head>Primarina": [[100], 1, 1] });
  const SOAK = ["Soak", "Water", 0, "X", 0, { id: 487, attrs: [["ChangeTypeAttr", { type: TY.indexOf("Water") }]] }];
  const primarina = () => [mon("Primarina", 80, ["Water", "Fairy"], [400, 90, 110, 180, 150, 120], [["Energy Ball", "Grass", 90, "S"], SOAK], true)];
  const golisopod = extra => [mon("Golisopod", 80, ["Bug", "Steel"], [400, 180, 160, 70, 100, 70], [["Iron Head", "Steel", 80, "P"]], true, undefined, extra)];
  const ironHead = () => [{ name: "Iron Head", type: "Steel", p: 1, score: 10, targets: [0] }];
  const line = lineOf(oneOnOne({ party: primarina(), foes: golisopod(), dist: ironHead, stub: typed }).field, "Primarina");
  console.log(`== types: Soak first (live)\n${line}`);
  assert.match(line, /Soak → Golisopod .*pure Water .*then Energy Ball/, `Soak, then attack:\n${line}`);
  // Nothing to rewrite: a Terastallized foe keeps its Tera type, so the game's own condition rules the move out.
  const tera = lineOf(oneOnOne({ party: primarina(), foes: golisopod({ isTerastallized: true }), dist: ironHead, stub: typed }).field, "Primarina");
  console.log(`== types: no Soak into a Terastallized foe\n${tera}`);
  assert.match(tera, /Energy Ball → Golisopod/, `no Soak into a Tera foe:\n${tera}`);
  // Already pure Water: the move would change nothing.
  const water = lineOf(oneOnOne({ party: primarina(), foes: [mon("Golisopod", 80, ["Water"], [400, 180, 160, 70, 100, 70], [["Iron Head", "Steel", 80, "P"]], true)], dist: ironHead, stub: typed }).field, "Primarina");
  assert.match(water, /Energy Ball → Golisopod/, `no Soak into a pure-Water foe:\n${water}`);
}

// 5m. A slot with nothing that damages (#263): Cacnea's Needle Arm is priced at nothing into Machamp — the shape an
// immunity, a Wonder Guard or a type wall leaves — so the pool the turn line usually picks from is empty. That used
// to end the line, because a status play was scored from the attack it set up and there was no attack to set up.
// Spore is now scored on the turns it buys instead, and the line recommends it. With no play and no bench either,
// the turn is genuinely lost and the line says so; where a restriction is what emptied the pool, it names it.
// A zero row, not a missing one: a move the table doesn't price falls back to the type chart, where an immunity is a
// priced move worth nothing.
Object.assign(TABLE, { "Machamp>Close Combat>Cacnea": [[400], 1, 1], "Cacnea>Needle Arm>Machamp": [[0], 1, 0] });
{
  const cacnea = moves => [mon("Cacnea", 80, ["Grass"], [250, 180, 100, 90, 100, 60], moves, true)];
  const NEEDLE_ARM = ["Needle Arm", "Grass", 60, "P"];
  const spore = ["Spore", "Grass", 0, "X", 0, { id: 147, attrs: [["StatusEffectAttr", { effect: 4 }]] }];
  const foes = [mon("Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 50], [["Close Combat", "Fighting", 120, "P"]], true)];
  const at = (moves, stopped) => lineOf(oneOnOne({ party: cacnea(moves), foes, dist: only("Close Combat"), stopped }).field, "Cacnea");
  const play = at([NEEDLE_ARM, spore]);
  console.log(`== dead end: the status play instead (live)\n${play}`);
  assert.match(play, /Spore → Machamp .*sleep/, `a slot with no damage falls through to the status play:\n${play}`);
  assert.ok(!/nothing it can/.test(play), `the fall-through is a recommendation, not a dead end:\n${play}`);
  // Nothing to attack with and nothing to play: the turn is lost, and the line says that rather than calling the
  // member empty.
  const lost = at([NEEDLE_ARM]);
  console.log(`== dead end: nothing it can do (live)\n${lost}`);
  assert.match(lost, /nothing it can do/, `the genuine dead end reads plainly:\n${lost}`);
  assert.ok(!/no damaging move/.test(lost), "the old wording is gone");
  // The same turn, with Encore the reason there is nothing left to pick.
  const stopped = at([NEEDLE_ARM], () => ["Encore"]);
  console.log(`== dead end: nothing it can use — Encore (live)\n${stopped}`);
  assert.match(stopped, /nothing it can use — Encore/, `a restriction that emptied the pool is named:\n${stopped}`);
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

// 8b. A status play in a double (#262). Machamp outspeeds and 1HKOs Breloom, and neither of ours dents it this turn;
// Munchlax falls to one Dragon Claw. Spore is priced on the whole field at once — the sleep is written before
// Salamence's slot is scored — so Breloom spends its turn on it and Salamence takes the foe it can actually finish.
Object.assign(TABLE, {
  "Breloom>Seed Bomb>Machamp": [[60], 1, 1], "Breloom>Seed Bomb>Munchlax": [[60], 1, 1],
  "Salamence>Dragon Claw>Machamp": [[60], 1, 1], "Salamence>Dragon Claw>Munchlax": [[400], 1, 1],
  "Machamp>Close Combat>Breloom": [[400], 1, 1], "Machamp>Close Combat>Salamence": [[300], 1, 1],
  "Munchlax>Body Slam>Breloom": [[30], 1, 1], "Munchlax>Body Slam>Salamence": [[30], 1, 1],
});
const SPORE = ["Spore", "Grass", 0, "X", 0, { id: 147, attrs: [["StatusEffectAttr", { effect: 4 }]] }];
const sporeParty = () => [
  mon("Breloom", 80, ["Grass", "Fighting"], [250, 200, 110, 60, 90, 100], [["Seed Bomb", "Grass", 80, "P"], SPORE], true, undefined, { getBattlerIndex: () => 0 }),
  mon("Salamence", 80, ["Dragon", "Flying"], [270, 200, 150, 120, 130, 130], [["Dragon Claw", "Dragon", 80, "P"]], true, undefined, { getBattlerIndex: () => 1 }),
];
const sporeFoes = (sleeping = false) => [
  foeAt(2, "Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 140], [["Close Combat", "Fighting", 120, "P"]],
    ...(sleeping ? [undefined, { status: { effect: 4, sleepTurnsRemaining: 2 } }] : [])),
  foeAt(3, "Munchlax", 80, ["Normal"], [300, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]]),
];
{
  const { lines, field } = render({ party: sporeParty(), foes: sporeFoes(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles: a status play (live)\n${lines.join("\n")}`);
  assert.match(lineOf(field, "Breloom"), /Spore → Machamp .*sleep/, `Spore is the double's turn line:\n${field.join("\n")}`);
  // Bounded to this turn: a double's status play names no follow-up, because there is no depth 2 to name one.
  assert.ok(!/then /.test(lineOf(field, "Breloom")), `no depth 2 in a double:\n${field.join("\n")}`);
  // Only that the partner still aims where it can finish something — that it is *scored* on the state Spore makes
  // is 8d's claim, which this field cannot show (Munchlax is Salamence's target either way here).
  assert.match(lineOf(field, "Salamence"), /→ Munchlax/, `the partner keeps the foe it can finish:\n${field.join("\n")}`);
}

// 8c. The same field with Machamp already asleep: there is nothing for Spore to add, so Breloom attacks.
{
  const { field } = render({ party: sporeParty(), foes: sporeFoes(true), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles: nothing for a status play to add (live)\n${field.join("\n")}`);
  assert.match(lineOf(field, "Breloom"), /Seed Bomb →/, `no Spore into a sleeping foe:\n${field.join("\n")}`);
}

// 8d. The partner slot is scored on the state the play makes, not the live one — #262's headline, and the one thing
// 8b cannot show. Machamp outspeeds Salamence and 1HKOs it; Munchlax cannot hurt anyone. Dragon Claw is the better
// move into Machamp (200, two hits) than into Munchlax (110, three), so Machamp is where Salamence wants to be — and
// with no Spore on the field it goes to Munchlax anyway, because Machamp kills it before it acts. Give Breloom Spore
// — it moves before Machamp, so the sleep cancels that attempt — and Salamence takes Machamp. Nothing about
// Salamence, its moves or its damage changed between the two arms; only the state its slot was scored on.
Object.assign(TABLE, {
  "Breloom>Seed Bomb>Machamp": [[60], 1, 1], "Breloom>Seed Bomb>Munchlax": [[60], 1, 1],
  "Salamence>Dragon Claw>Machamp": [[200], 1, 1], "Salamence>Dragon Claw>Munchlax": [[110], 1, 1],
  "Machamp>Close Combat>Breloom": [[400], 1, 1], "Machamp>Close Combat>Salamence": [[400], 1, 1],
  "Munchlax>Body Slam>Breloom": [[30], 1, 1], "Munchlax>Body Slam>Salamence": [[30], 1, 1],
});
{
  const party = spore => [
    mon("Breloom", 80, ["Grass", "Fighting"], [250, 200, 110, 60, 90, 150],
      spore ? [["Seed Bomb", "Grass", 80, "P"], SPORE] : [["Seed Bomb", "Grass", 80, "P"]], true, undefined, { getBattlerIndex: () => 0 }),
    mon("Salamence", 80, ["Dragon", "Flying"], [270, 200, 150, 120, 130, 130], [["Dragon Claw", "Dragon", 80, "P"]], true, undefined, { getBattlerIndex: () => 1 }),
  ];
  const foes = () => [
    foeAt(2, "Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 140], [["Close Combat", "Fighting", 120, "P"]]),
    foeAt(3, "Munchlax", 80, ["Normal"], [300, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]]),
  ];
  const aim = spore => lineOf(render({ party: party(spore), foes: foes(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() }).field, "Salamence");
  const without = aim(false), with_ = aim(true);
  console.log(`== doubles: the partner is scored on the hypothesis (live)\nno Spore on the field: ${without}\nSpore on the field: ${with_}`);
  assert.match(without, /→ Munchlax/, `with nothing to change it, the partner takes the harmless foe:\n${without}`);
  assert.match(with_, /→ Machamp/, `the partner is scored on the state Spore makes, so it takes the silenced foe:\n${with_}`);
}

// 8e. The spare hit (#236). Garchomp is faster and alone fells a weakened Hydreigon, so Lucario's hit resolves into
// a foe that is already gone — the game redirects it onto Snorlax (`FaintPhase` -> `redirectPokemonMoves`) carrying
// **the move Lucario chose for Hydreigon**. So the pair is priced on where the hit really lands, and the two
// directions fall out of one rule: spread when the slot has a better move for the other foe than the redirect would
// carry, focus when it doesn't, because focusing also insures the KO for free.
Object.assign(TABLE, {
  "Lucario>Close Combat>Hydreigon": [[60], 1, 1], "Lucario>Close Combat>Snorlax": [[300], 1, 2],
});
const CLOSE_COMBAT = ["Close Combat", "Fighting", 120, "P"];
const dyingHydreigon = () => [
  mon("Hydreigon", 80, ["Dark", "Dragon"], [300, 120, 110, 160, 110, 90], [["Dark Pulse", "Dark", 80, "S"]], true, 60, { getBattlerIndex: () => 2 }),
  foeAt(3, "Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]]),
];
// Spread: Aura Sphere is Lucario's answer to Hydreigon but barely dents Snorlax, and Close Combat halves it. The
// redirect would carry the wrong move, so Lucario is better off aiming at Snorlax itself and picking the right one.
{
  const party = [
    doublesParty()[0],
    mon("Lucario", 80, ["Fighting", "Steel"], [240, 150, 110, 180, 110, 120], [["Aura Sphere", "Fighting", 80, "S"], CLOSE_COMBAT], true, undefined, { getBattlerIndex: () => 1 }),
  ];
  const { lines, field } = render({ party, foes: dyingHydreigon(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles spare hit: spread, the redirect would carry the wrong move (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.match(slots.find(l => /Garchomp/.test(l)) ?? "", /→ Hydreigon/, `Garchomp fells Hydreigon:\n${field.join("\n")}`);
  assert.match(slots.find(l => /Lucario/.test(l)) ?? "", /Close Combat → Snorlax/, `Lucario takes Snorlax with the move that suits it:\n${field.join("\n")}`);
}
// Focus: with only Aura Sphere to give, Lucario puts the same hit on Snorlax whether it aims there or is redirected
// there — so it aims at Hydreigon, where the hit is also insurance if Garchomp's KO doesn't land. The row says where
// the hit will actually go rather than calling it wasted.
{
  const { lines, field } = render({ party: doublesParty(), foes: dyingHydreigon(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles spare hit: focus, the redirect carries the same move (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.equal(slots.length, 2);
  assert.ok(slots.every(l => /→ Hydreigon/.test(l)), `both slots aim at Hydreigon:\n${field.join("\n")}`);
  assert.ok(field.some(l => /spare hit — goes to Snorlax if Hydreigon falls first/.test(l)), `the spare hit says where it lands:\n${field.join("\n")}`);
}

// 8g. The certainty axis (#283). The same field and the same movepool as 8e — Lucario still holds Close Combat, the
// move that suits Snorlax — but Garchomp's Dragon Claw is no longer sure to land, so Hydreigon is no longer sure to
// fall. The redirect only forces the carried move for the turn it lands in; from the next one the slot picks freely,
// so carrying the wrong move costs a turn rather than the fight. Priced that way, the odds the partner's KO misses
// can carry the pick: Lucario aims at Hydreigon, where its hit is the insurance that fells it if Dragon Claw misses.
{
  // This is the one block that rewrites a row an earlier one set rather than adding its own, so it puts 8e's value
  // back at the end. Every later use assigns the row first, so nothing reads the restored value today — it keeps the
  // seven rewrites below from leaking if a block that doesn't is ever added after this one.
  const sure = TABLE["Garchomp>Dragon Claw>Hydreigon"];
  const party = () => [
    doublesParty()[0],
    mon("Lucario", 80, ["Fighting", "Steel"], [240, 150, 110, 180, 110, 120], [["Aura Sphere", "Fighting", 80, "S"], CLOSE_COMBAT], true, undefined, { getBattlerIndex: () => 1 }),
  ];
  // Only the middle element of the row — the accuracy — moves; the damage and the effectiveness are 8e's.
  const at = acc => {
    Object.assign(TABLE, { "Garchomp>Dragon Claw>Hydreigon": [[180], acc, 2] });
    return render({ party: party(), foes: dyingHydreigon(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  };
  // A threshold, not a knife edge: the pick holds its direction either side of the ~0.65 where it turns over.
  for (const acc of [0.9, 0.8, 0.7]) {
    assert.match(slotLines(at(acc).field).find(l => /Lucario/.test(l)) ?? "", /Close Combat → Snorlax/, `a near-sure KO still spreads at ${acc}`);
  }
  for (const acc of [0.6, 0.35, 0.2]) {
    assert.match(slotLines(at(acc).field).find(l => /Lucario/.test(l)) ?? "", /→ Hydreigon/, `a doubtful KO focuses at ${acc}`);
  }
  const { lines, field } = at(0.5);
  console.log(`== doubles spare hit: focus, the partner's KO is not certain (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.match(slots.find(l => /Garchomp/.test(l)) ?? "", /→ Hydreigon/, `Garchomp still goes for the KO:\n${field.join("\n")}`);
  assert.match(slots.find(l => /Lucario/.test(l)) ?? "", /→ Hydreigon/, `Lucario insures the KO rather than spreading:\n${field.join("\n")}`);
  Object.assign(TABLE, { "Garchomp>Dragon Claw>Hydreigon": sure });
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
  // A ⇄ line again: Ninetales is going down this turn, so the ⤵ names the free entry its faint buys (#170 §E).
  assert.ok(!field.some(l => /⇄.*Swampert in(?! · optional)/.test(l)), `Swampert would be KO'd coming in:\n${field.join("\n")}`);
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
  // Double-Edge's recoil is what the game's own move scoring marks down, so the drawback rule sees it there.
  const benefit = (e, mv) => (mv.name === "Double-Edge" ? -20 : 10);
  const { lines, field } = render({ party, foes, live: true, double: true, dist: aimAtBoth, switches: () => new Map(), benefit });
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

// 16b. Slot 0 is locked into a spread move the foe standing in front of it can't be touched by (no Boomburst row for
// Hydreigon). The locked path resolves a spread move per foe like any other, so the line still says what the game
// will do to Snorlax instead of falling to the bare "locked in" that aims nowhere (#261).
{
  // No `Garchomp>Boomburst>Hydreigon` row, so Boomburst is filtered out of that pool; Dragon Claw keeps the pool
  // non-empty, which is what stops `fake-turn` falling back to approximated outcomes and handing Boomburst back.
  Object.assign(TABLE, { "Garchomp>Boomburst>Snorlax": [[400], 1, 1] });
  const party = [
    mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130], [["Boomburst", "Normal", 140, "S", 0, { target: 6 }], ["Dragon Claw", "Dragon", 80, "P"]], true, undefined, { getBattlerIndex: () => 0 }),
    mon("Lucario", 80, ["Fighting", "Steel"], [240, 150, 110, 180, 110, 120], [["Aura Sphere", "Fighting", 80, "S"]], true, undefined, { getBattlerIndex: () => 1 }),
  ];
  const turnCommands = [{ command: 0, cursor: 0, move: { move: 1, targets: [] }, targets: [] }];
  const { lines, field } = render({ party, foes: hydreigonSnorlax(), live: true, double: true, dist: aimAtBoth, switches: () => new Map(), fieldIndex: 1, turnCommands });
  console.log(`== doubles slot 0 locked into a spread move one foe answers (live)\n${lines.join("\n")}`);
  const g = slotLines(field).find(l => /^⚔ Garchomp/.test(l)) ?? "";
  assert.match(g, /Boomburst/, `the locked spread move is named:\n${field.join("\n")}`);
  assert.match(g, /both/, `it still aims at both, not nowhere:\n${field.join("\n")}`);
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

// ---- 20. Drain (#90 §C, the Guzma w165 Golisopod): a drain move wins back half of what it deals every turn.
// Meteor Mash (85–100) into a 300 HP Golisopod is a 4HKO. Its Leech Life lands ~55 on Metagross and heals ~28 of it
// a turn, so the fourth Mash falls short: 5. A full-HP foe can't heal past its max.
Object.assign(TABLE, {
  "Metagross>Meteor Mash>Golisopod": [[100], 1, 1], "Golisopod>Leech Life>Metagross": [[60], 1, 1],
  "Venusaur>Giga Drain>Snorlax": [[50], 1, 1], "Snorlax>Body Slam>Venusaur": [[80], 1, 1],
});
{
  const drainOf = { "Leech Life": 0.5, "Giga Drain": 0.5 };
  const draining = ratio => (a, d, pm, o) => { const x = outcome(a, d, pm, o); return x && drainOf[pm.getName()] ? { ...x, drain: ratio ?? drainOf[pm.getName()] } : x; };
  const metagross = id => mon("Metagross", 80, ["Steel", "Psychic"], [400, 180, 170, 120, 120, 120], [["Meteor Mash", "Steel", 90, "P"]], true, undefined, { id });
  const golisopod = id => mon("Golisopod", 80, ["Bug", "Water"], [300, 180, 170, 60, 120, 40], [["Leech Life", "Bug", 80, "P"]], true, undefined, { id });
  const leech = () => [{ name: "Leech Life", type: "Bug", p: 1, score: 10, targets: [0] }];
  const { scene: s } = render({ party: [metagross("M")], foes: [golisopod("G")], live: true, dist: leech, switches: () => new Map() });
  const { exchange, threatFrom } = globalThis.__planner;
  globalThis.__stub.outcome = draining(0);
  assert.equal(exchange(s, metagross("Metagross, no drain"), metagross("x").moveset[0], golisopod("Golisopod, no drain")).turnsWe, 4, "4HKO without the drain");
  globalThis.__stub.outcome = draining();
  const t = threatFrom(s, golisopod("Golisopod drains"), metagross("Metagross vs drain"));
  assert.ok(Math.abs(t.drain - t.expected / 2) < 1e-9, `the threat carries the HP it drains a turn (${t.drain} of ${t.expected})`);
  const leeched = exchange(s, metagross("Metagross vs Leech Life"), metagross("x").moveset[0], golisopod("Golisopod with Leech Life"));
  console.log(`== drain\nMeteor Mash into a draining Golisopod: ${leeched.turnsWe} hits`);
  assert.equal(leeched.turnsWe, 5, "Leech Life's healing costs a hit");

  // Ours: Body Slam (68–80) 4HKOs a 280 HP Venusaur; Giga Drain (~46 a turn) wins back ~23 of it, and it takes 6. Into
  // Liquid Ooze the same drain hurts instead: 3.
  const venusaur = id => mon("Venusaur", 80, ["Grass", "Poison"], [280, 100, 120, 180, 120, 100], [["Giga Drain", "Grass", 75, "S"]], true, undefined, { id });
  const snorlax = id => mon("Snorlax", 80, ["Normal"], [900, 150, 110, 80, 150, 30], [["Body Slam", "Normal", 85, "P"]], true, undefined, { id });
  const slams = (id, ratio) => {
    globalThis.__stub.outcome = draining(ratio);
    return exchange(s, venusaur(`Venusaur ${id}`), venusaur("x").moveset[0], snorlax(`Snorlax ${id}`)).turnsThey;
  };
  const bodySlam = () => [{ name: "Body Slam", type: "Normal", p: 1, score: 10, targets: [0] }];
  globalThis.__stub.dist = bodySlam;
  assert.deepEqual([slams("plain", 0), slams("drains", 0.5), slams("into ooze", -0.5)], [4, 6, 3], "our drain buys turns; Liquid Ooze costs them");
  globalThis.__stub.outcome = outcome;
}

// ---- 21. On-KO boosts (#90 §D, Guzma's Buzzwole): a foe with Beast Boost gets stronger for every KO we feed it.
// Read off the ability: Beast Boost's changes are a function of the holder (its highest stat), Soul-Heart counts
// every faint.
{
  const { koBoost } = globalThis.__planner;
  const ability = (name, attr, x) => ({
    hasAbilityWithAttr: a => a === attr,
    getAbility: () => ({ name, getAttrs: a => (a === attr ? [x] : []) }),
  });
  const beastBoost = ability("Beast Boost", "PostVictoryStatStageChangeAbAttr", { changes: p => [{ stat: p.getStat(1) >= p.getStat(3) ? 1 : 3, stages: 1 }] });
  const soulHeart = ability("Soul-Heart", "PostKnockOutStatStageChangeAbAttr", { stat: 3, stages: 1 });
  const buzzwole = extra => mon("Buzzwole", 80, ["Bug", "Fighting"], [300, 250, 250, 100, 100, 150], [["Lunge", "Bug", 80, "P"]], true, undefined, { ...beastBoost, ...extra });
  assert.deepEqual(koBoost(buzzwole()), { up: { 1: 1 }, ability: "Beast Boost", any: false });
  assert.deepEqual(koBoost(mon("Magearna", 80, ["Steel", "Fairy"], [300, 100, 100, 250, 100, 100], [], true, undefined, soulHeart)), { up: { 3: 1 }, ability: "Soul-Heart", any: true });
  assert.equal(koBoost(buzzwole({ hasAbilityWithAttr: () => false })), null, "a suppressed ability gives nothing");

  // Mamoswine (140 HP) is faster but Lunge (68–80) takes it in two; its Earthquake needs three on Buzzwole. Staying
  // feeds Buzzwole a KO, and the slot says so while there's someone left to face it.
  Object.assign(TABLE, { "Mamoswine>Earthquake>Buzzwole": [[110], 1, 1], "Buzzwole>Lunge>Mamoswine": [[80], 1, 1], "Buzzwole>Lunge>Snorlax": [[500], 1, 1] });
  const mamoswine = mon("Mamoswine", 80, ["Ice", "Ground"], [300, 200, 100, 70, 80, 200], [["Earthquake", "Ground", 100, "P"]], true, 140);
  const bench = mon("Snorlax", 80, ["Normal"], [300, 150, 110, 80, 150, 30], [["Body Slam", "Normal", 85, "P"]], false);
  const lunge = () => [{ name: "Lunge", type: "Bug", p: 1, score: 10, targets: [0] }];
  const at = extra => lineOf(render({ party: [mamoswine, bench], foes: [buzzwole(extra)], live: true, dist: lunge, switches: () => new Map() }).field, "Mamoswine");
  const fed = at({});
  console.log(`== on-KO boost\n${fed}`);
  assert.match(fed, /KO feeds Buzzwole's Beast Boost \(\+1 Atk\)/, `the slot names the boost it feeds:\n${fed}`);
  assert.doesNotMatch(at({ hasAbilityWithAttr: () => false }), /feeds/, "no boost, no note");

  // A close call it tips: Mamoswine (150 HP, a speed tie) needs three Earthquakes (136–160) to Buzzwole's two Lunges,
  // while Crobat resists Lunge (~6 % coming in) but chips slowly with Wing Attack. Without the boost staying edges it
  // and the switch is only optional; the KO staying would feed Buzzwole tips it to Crobat — the Guzma turn 20 pivot —
  // and the switch line says why it's cheap.
  Object.assign(TABLE, { "Buzzwole>Lunge>Crobat": [[20], 1, 0.25], "Crobat>Wing Attack>Buzzwole": [[45], 1, 4], "Mamoswine>Earthquake>Buzzwole": [[160], 1, 1] });
  const tied = mon("Mamoswine", 80, ["Ice", "Ground"], [300, 200, 100, 70, 80, 150], [["Earthquake", "Ground", 100, "P"]], true, 150);
  const crobat = mon("Crobat", 80, ["Poison", "Flying"], [300, 150, 110, 80, 150, 250], [["Wing Attack", "Flying", 60, "P"]], false);
  const pivot = extra => render({ party: [tied, crobat], foes: [buzzwole(extra)], live: true, dist: lunge, switches: () => new Map() }).field;
  const boosted = pivot({}), plain = pivot({ hasAbilityWithAttr: () => false });
  console.log(`${boosted.join("\n")}\n-- without Beast Boost\n${plain.join("\n")}`);
  assert.match(boosted.find(l => /^now: ⇄/.test(l)) ?? "", /Mamoswine out › Crobat in · takes ~6% · resists Lunge/, `switch to Crobat:\n${boosted.join("\n")}`);
  assert.ok(plain.some(l => /^⚔ Mamoswine/.test(l)) && plain.some(l => /Crobat in · optional/.test(l)), `stay without the boost:\n${plain.join("\n")}`);
}

// ---- 22. The summary the watcher and the battle read get (#90 §H, §I): a likely KO after our mon acts is a second
// danger level, naming the foe the fight plan saves that mon for, and the fight plan's verdict comes along — Guzma's
// turn 1, where Mamoswine acts once and then falls to Iron Head.
{
  const { cardSummary } = globalThis.__planner;
  const threat = (level, after) => ({ level, after, from: "Mega Golisopod", move: "Iron Head" });
  const m = {
    kind: "battle", wave: 165, trainer: true, rows: [],
    field: { slots: [{ name: "Mamoswine", move: "Precipice Blades", target: { name: "Mega Golisopod" }, ko: 0, threat: threat("risk", true) }], switches: [] },
    teamPlan: {
      result: "loss", win: { name: "Buzzwole", kills: 3, of: 6 }, steps: [], sacrifice: [],
      reserve: [{ name: "Mamoswine", for: { name: "Xurkitree" } }],
      warnings: ["likely lost: nobody KOs Buzzwole 1-on-1 — maximise damage before it comes in, chip it with Crobat", "Mamoswine goes down before Buzzwole comes in"],
    },
  };
  const sum = cardSummary(m);
  console.log(`== summary\n${JSON.stringify({ danger: sum.danger, plan: sum.plan })}`);
  assert.deepEqual(sum.danger, [{ mon: "Mamoswine", from: "Mega Golisopod", move: "Iron Head", level: "after", saveFor: "Xurkitree" }]);
  assert.equal(sum.plan, "likely lost · ☠ Buzzwole KOs 3/6 · nobody KOs Buzzwole 1-on-1 — maximise damage before it comes in, chip it with Crobat · Mamoswine goes down before Buzzwole comes in");
  // A plain ⚠ (a real KO chance, not a likely KO) stays off the list.
  assert.deepEqual(cardSummary({ ...m, field: { ...m.field, slots: [{ ...m.field.slots[0], threat: threat("risk", false) }] } }).danger, []);
  // `saveFor` also reads the foes only this mon beats (#170 §A), which the win condition's reserve never covered.
  const only = { ...m, teamPlan: { ...m.teamPlan, reserve: [], only: [{ name: "Mamoswine", for: [{ name: "Xurkitree" }, { name: "Buzzwole" }] }] } };
  assert.equal(cardSummary(only).danger[0].saveFor, "Xurkitree, Buzzwole");
}

// ---- 23–25. Guzma w165 (#170, the worked example in #90), on the real rosters from that ticket's state dump, cut
// down to the three of ours and the three foes the decisions turn on and given one move each. Mamoswine is the only
// answer to Xurkitree (faster, immune to Discharge, Ground hits it ×2) and the only one that beats Buzzwole; both are
// still on the bench, so the fight plan holds Mamoswine back and the ⚔ line has to price spending it.
Object.assign(TABLE, {
  "Mamoswine>Precipice Blades>Mega Golisopod": [[180], 1, 1], "Mamoswine>Precipice Blades>Xurkitree": [[500], 1, 2],
  "Mamoswine>Precipice Blades>Buzzwole": [[200], 1, 1],
  "Golduck>Surf>Mega Golisopod": [[150], 1, 1], "Golduck>Surf>Xurkitree": [[100], 1, 1], "Golduck>Surf>Buzzwole": [[130], 1, 1],
  "Metagross>Meteor Mash>Mega Golisopod": [[110], 1, 0.5], "Metagross>Meteor Mash>Xurkitree": [[120], 1, 1],
  "Metagross>Meteor Mash>Buzzwole": [[100], 1, 1],
  // Iron Head is ×2 into Mamoswine's Ice half and takes it in one, which is why turn 1 cost the run.
  "Mega Golisopod>Iron Head>Mamoswine": [[600], 1, 2], "Mega Golisopod>Iron Head>Golduck": [[190], 1, 1],
  "Mega Golisopod>Iron Head>Metagross": [[120], 1, 0.5],
  // Discharge has no entry into Mamoswine: Ground is immune, so nothing else on the team answers Xurkitree.
  "Xurkitree>Discharge>Golduck": [[180], 1, 1], "Xurkitree>Discharge>Metagross": [[150], 1, 1],
  "Buzzwole>Lunge>Mamoswine": [[170], 1, 1], "Buzzwole>Lunge>Golduck": [[150], 1, 1], "Buzzwole>Lunge>Metagross": [[140], 1, 1],
});
{
  const guzma = ({ golduckHp, field }) => ({
    party: [
      mon("Mamoswine", 162, ["Ice", "Ground"], [546, 414, 290, 260, 220, 328], [["Precipice Blades", "Ground", 120, "P"]], field === "Mamoswine"),
      mon("Golduck", 162, ["Water"], [431, 324, 301, 322, 277, 316], [["Surf", "Water", 90, "S"]], field === "Golduck", golduckHp),
      mon("Metagross", 162, ["Steel", "Psychic"], [474, 456, 504, 346, 352, 256], [["Meteor Mash", "Steel", 90, "P"]], false),
    ],
    foes: [
      mon("Mega Golisopod", 153, ["Bug", "Steel"], [439, 581, 568, 289, 456, 176], [["Iron Head", "Steel", 80, "P"]], true, undefined, { bossSegments: 2, bossSegmentIndex: 1 }),
      mon("Xurkitree", 153, ["Electric"], [484, 318, 274, 578, 286, 254], [["Discharge", "Electric", 80, "S"]], false),
      mon("Buzzwole", 159, ["Bug", "Fighting"], [579, 478, 478, 201, 245, 334], [["Lunge", "Bug", 80, "P"]], false, undefined, { bossSegments: 2, bossSegmentIndex: 1 }),
    ],
  });
  const ironHead = () => [{ name: "Iron Head", type: "Steel", p: 1, score: 10, targets: [0] }];
  const at = opts => render({ ...guzma(opts), live: true, dist: ironHead, switches: () => new Map() });

  // 23. §A — turn 1: Mamoswine is on the field against Mega Golisopod. Its Precipice Blades is neutral and needs
  // three hits through two boss bars; Iron Head is ×2 and takes it in one, right after it acts. Spending it here is
  // spending the only Xurkitree answer, so the ⚔ line puts Golduck in and the plan says what is kept for what.
  {
    const { lines, field } = at({ field: "Mamoswine" });
    console.log(`== guzma w165 turn 1 (live)\n${lines.join("\n")}`);
    assert.ok(!field.some(l => /^⚔ Mamoswine/.test(l)), `turn 1 must not spend Mamoswine on Golisopod:\n${field.join("\n")}`);
    // Metagross, not Golduck: Iron Head is ×0.5 into it, so it is the cheapest mon to put in front of Golisopod —
    // the same pivot the coaching session made two turns later.
    assert.match(field.find(l => /^now: ⇄/.test(l)) ?? "", /Mamoswine .*out › Metagross in · takes ~\d+% · resists Iron Head/, `something else comes in:\n${field.join("\n")}`);
    assert.ok(lines.some(l => /^🔒 Mamoswine only answer to Xurkitree/.test(l)), `the plan names what Mamoswine is for:\n${lines.join("\n")}`);
  }

  // 24. The same turn with the later foes gone: nothing is being saved, so the ⚔ line stays with Mamoswine. The
  // switch in 23 is the fight plan's doing and nothing else's.
  {
    const { party, foes } = guzma({ field: "Mamoswine" });
    const { field } = render({ party, foes: [foes[0]], live: true, dist: ironHead, switches: () => new Map() });
    console.log(`== guzma w165 turn 1, no later foes (live)\n${field.join("\n")}`);
    assert.match(lineOf(field, "Mamoswine"), /Precipice Blades → Mega Golisopod/, `with nothing to save it for, Mamoswine attacks:\n${field.join("\n")}`);
  }

  // 25. §E — turn 3: Golduck is on 23 HP and poisoned in front of Golisopod, which takes it this turn anyway. A
  // switch would pay an entry hit to save a mon that is going down regardless and throw away its last attack, while
  // a faint brings the next mon in for nothing — so the ⚔ line stays and attacks and names the free entry.
  {
    const poison = p => (p.name === "Golduck" ? -27 : 0);
    const { party, foes } = guzma({ field: "Golduck", golduckHp: 23 });
    const { lines, field } = render({ party, foes, live: true, dist: ironHead, switches: () => new Map(), heal: poison });
    console.log(`== guzma w165 turn 3 (live)\n${lines.join("\n")}`);
    assert.match(lineOf(field, "Golduck"), /Surf → Mega Golisopod/, `stay and attack:\n${field.join("\n")}`);
    assert.ok(!field.some(l => /^now: ⇄/.test(l)), `no paid switch while a free entry is one faint away:\n${field.join("\n")}`);
    assert.match(field.find(l => /^⤵/.test(l)) ?? "", /Golduck falls this turn › Metagross in free/, `names the free entry:\n${field.join("\n")}`);
  }
}

// ---- The enemy's exact move on the ↯ row, and the one case that rides on our own draw (#183)
// Depth 1 is played on the game's own answer, so the row names the move as fact: no `% likely` on it. In a double a
// `RANDOM_NEAR_ENEMY` command of ours draws its target before `EnemyCommandPhase`, so the prediction is the one for
// **that** command, and the row says so with `~` — `replay` confidence, the preview's existing mark.
{
  const build = ourTarget => {
    const party = [
      mon("Morpeko", 80, ["Electric", "Dark"], [220, 150, 90, 120, 100, 170], [["Aura Wheel", "Electric", 110, "P", 0, { target: ourTarget }]], true, 180),
      mon("Scrafty", 80, ["Dark", "Fighting"], [254, 152, 172, 63, 165, 80], [["High Jump Kick", "Fighting", 130, "P"]], true, 133),
    ];
    const foes = [
      mon("Gyarados", 82, ["Water", "Flying"], [250, 170, 110, 80, 130, 150], [["Waterfall", "Water", 80, "P"]], true),
      mon("Weavile", 84, ["Dark", "Ice"], [300, 250, 100, 60, 110, 299], [["Triple Axel", "Ice", 20, "P"]], true),
    ];
    // Both sides see the other side's field, the way the game's own `getOpponents` does — which is what tells the
    // planner there are two near enemies for a random target to be drawn between.
    for (const p of party) p.getOpponents = () => foes;
    const exactRow = (name, type) => [{ name, type, p: 1, score: null, exact: true, targets: [0], targetDist: [{ battlerIndex: 0, p: 1 }] }];
    return render({ party, foes, live: true, double: true, switches: () => new Map(),
      dist: e => (e.name === "Gyarados" ? exactRow("Waterfall", "Water") : exactRow("Triple Axel", "Ice")) });
  };

  // A plain command of ours draws nothing, so the foe's move is exact.
  const plain = build(3);
  const gyaradosRow = plain.card.rows.find(r => r.name === "Gyarados");
  assert.equal(gyaradosRow.likely.confidence, "exact", "a command that draws nothing leaves the answer exact");
  assert.equal(gyaradosRow.likely.p, null, "an exact move is named as fact — no `% likely` to show");
  const plainLine = plain.lines.find(l => l.startsWith("↯")) ?? plain.lines.find(l => l.includes("Waterfall")) ?? "";
  assert.ok(!plainLine.includes("~"), `nothing to mark on an exact row:\n${plain.lines.join("\n")}`);

  // The same turn with Aura Wheel aimed at a random near enemy: our own draw comes first, so the row is `~`.
  const drawn = build(7);
  const drawnRow = drawn.card.rows.find(r => r.name === "Gyarados");
  assert.equal(drawnRow.likely.confidence, "replay", "our random-target command draws before the enemy decides");
  assert.equal(drawnRow.likely.p, null, "still not a `% likely`: it is the answer for this command");
  assert.ok(drawn.lines.some(l => l.includes("Waterfall") && l.includes("~")), `the row carries the mark:\n${drawn.lines.join("\n")}`);
}

// ---- The one gate (#183)
// The exact call is load-bearing: with no answer to be had, the battle card, the fight plan and the catch advice
// stop together and the card says why, rather than one of them quietly advising from the distribution.
{
  const party = [mon("Morpeko", 80, ["Electric", "Dark"], [220, 150, 90, 120, 100, 170], [["Aura Wheel", "Electric", 110, "P"]], true, 180)];
  const foes = [mon("Gyarados", 82, ["Water", "Flying"], [250, 170, 110, 80, 130, 150], [["Waterfall", "Water", 80, "P"]], true)];
  const out = render({ party, foes, live: true, switches: () => new Map(), exact: { ok: false, reason: "the enemy AI call threw" } });
  assert.equal(out.card.verdict, "unavailable");
  assert.equal(out.card.field, null, "no ⚔ line");
  assert.deepEqual(out.card.rows, [], "and no foe rows");
  assert.equal(out.card.teamPlan, null);
  assert.equal(out.card.catch, null);
  assert.deepEqual(out.lines.filter(l => l.startsWith("⚠")), ["⚠ no advice — the enemy AI call threw"], out.lines.join("\n"));
  assert.equal(globalThis.__planner.cardSummary(out.card).field, "no advice — the enemy AI call threw");
}

console.log("ok");
