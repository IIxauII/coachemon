import assert from "node:assert/strict";
import { mountHud } from "./fake-page.mjs";
import { mon, outcomeFrom, TY } from "./fake-mon.mjs";
import { fakeTurn } from "./fake-turn.mjs";
import { benchMatchupScore } from "./game-proto.mjs";

// The tables a scenario sets: `outcome` what each move does, `dist` the enemy AI's pick, `switches` the trainer's
// switch-in, `heal` a turn end's cost, `benefit` the game's own score for a move of ours. `__stub` is rebound per
// scenario, so every op reads it at call time rather than closing over it.
const stubTurn = ({ party, foes, live, double, trainer, arena, phase, fieldIndex, turnCommands, exact, ourTera = () => null }) => {
  const active = () => {
    const out = foes.filter(f => f.isOnField?.());
    return (out.length ? out : foes).slice(0, double ? 2 : 1);
  };
  const cmd = double && fieldIndex === 1 ? turnCommands[0] : null;
  return fakeTurn({
    live, exact, wave: 200, turn: 3, double, trainer, party, foes, ourTera,
    decision: phase === "CheckSwitchPhase" ? "check-switch" : "command",
    trickRoom: !!arena?.getTag?.("TRICK_ROOM"),
    command: cmd && !cmd.skip ? { kind: cmd.command, cursor: cmd.cursor, move: cmd.move, targets: cmd.targets?.length ? cmd.targets : cmd.move?.targets ?? [] } : null,
    outcome: (atk, def, pm, opts) => globalThis.__stub.outcome(atk, def, pm, opts),
    statusMoves: (atk, def) => atk.moveset.filter(pm => pm.getMove().category === 2).map(pm => ({
      pm, name: pm.getName(), type: TY[pm.getMove().type], cat: "status", acc: pm.getMove().accuracy > 0 ? pm.getMove().accuracy / 100 : 1,
      e: 1, priority: pm.getMove().priority ?? 0, bypassProtect: false, bounce: false, blocked: null,
    })),
    // What a restriction took off this mon's move list.
    stopped: (atk, def) => globalThis.__stub.stopped?.(atk, def) ?? [],
    heal: (p, opts) => globalThis.__stub.heal?.(p, opts) ?? 0,
    moves: e => globalThis.__stub.dist(e),
    switchTo: f => globalThis.__stub.switches(active()).get(f)?.to ?? null,
    replay: (e, target, opts) => globalThis.__stub.replay?.(e, target, opts) ?? null,
    benefit: (atk, def, mv) => globalThis.__stub.benefit?.(atk, mv, def) ?? 0,
    // The trainer's send-in score.
    sendIn: (f, me) => (f.getMatchupScore ? globalThis.__hud["20-enemy-ai"].sceneSendInScore(null, f, me) : null),
  });
};
// `koCurve` takes the turn's per-mon record, so it is wrapped to look that up.
const plannerApi = turn => ({
  ...globalThis.__hud["30-planner"],
  koCurve: (target, use, opts) => globalThis.__hud["10-damage"].koCurve(turn.mon(target), use, opts),
  cardSummary: globalThis.__hud["60-card"].cardSummary,
});

// "attacker>move>defender": [per-hit max damage, accuracy, effectiveness]. Triple Axel's 0.95 has Wide Lens folded in.
const TABLE = {
  "Morpeko>Aura Wheel>Gyarados": [[300], 1, 4], "Morpeko>Aura Wheel>Weavile": [[90], 1, 1],
  "Scrafty>High Jump Kick>Gyarados": [[60], 0.9, 0.5], "Scrafty>High Jump Kick>Weavile": [[400], 0.9, 4],
  "Metagross>Meteor Mash>Gyarados": [[70], 0.9, 1], "Metagross>Meteor Mash>Weavile": [[250], 0.9, 2],
  "Gyarados>Waterfall>Morpeko": [[80], 1, 1], "Gyarados>Waterfall>Scrafty": [[70], 1, 1], "Gyarados>Waterfall>Metagross": [[60], 1, 1],
  "Weavile>Triple Axel>Morpeko": [[35, 70, 105], 0.95, 1], "Weavile>Triple Axel>Scrafty": [[30, 60, 90], 0.95, 1], "Weavile>Triple Axel>Metagross": [[8, 16, 24], 0.95, 0.5],
  "Charizard>Flamethrower>Lycanroc": [[60], 1, 0.5], "Blastoise>Wave Crash>Lycanroc": [[220], 1, 2],
  "Lycanroc>Stone Edge>Charizard": [[500], 0.8, 4], "Lycanroc>Stone Edge>Blastoise": [[150], 0.8, 1],
  "Weavile>Knock Off>Morpeko": [[60], 1, 0.5], "Weavile>Knock Off>Scrafty": [[40], 1, 0.25], "Weavile>Knock Off>Metagross": [[140], 1, 2],
  "Weavile>Fire Fang>Metagross": [[12], 1, 2], "Weavile>Fire Punch>Metagross": [[2], 0.5, 2],
};
const outcome = outcomeFrom(TABLE);

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

// `fieldIndex`: whose command phase it is; `turnCommands`: the commands already chosen this turn.
const render = ({ party, foes, live, arena, dist, switches, double = false, phase, fieldIndex = 0, turnCommands = [], stubOutcome = outcome, benefit = null, heal = null, stopped = null, replay = null, exact = { ok: true }, tables = null, ourTera }) => {
  const onField = () => party.filter(p => p.isOnField());
  for (const f of foes) { f.getOpponents = () => onField(); f.getMatchupScore = () => 1; }
  const [gyarados, weavile] = foes;
  globalThis.__stub = {
    outcome: stubOutcome, benefit, ...(heal ? { heal } : {}), ...(stopped ? { stopped } : {}), ...(replay ? { replay } : {}),
    dist: dist ?? (e => (e === gyarados ? [{ name: "Waterfall", type: "Water", p: 1, score: 10, targets: [0] }] : [])),
    switches: switches ?? (active => new Map(weavile && active.includes(gyarados) ? [[gyarados, { to: weavile, ratio: 1 }]] : [])),
  };
  const trainer = { getName: () => "Cyrus", config: { isBoss: true }, isDouble: () => false,
    getPartyMemberMatchupScores: () => [[1, 5]], getSortedPartyMemberMatchupScores: x => x, getNextSummonIndex: () => 1 };
  mountHud();
  if (tables) globalThis.__hud["04-game-tables"].setGameTables(tables);
  const turn = stubTurn({ party, foes, live, double, trainer, arena, phase, fieldIndex, turnCommands, exact, ourTera });
  globalThis.__planner = plannerApi(turn);
  const card = { ...globalThis.__hud["60-card"].composeBattleCard(turn, null), wave: 200 };
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") + (n.title ? ` {${n.title}}` : "") : "");
  // Rows only, and `txt` keeps a node's tooltip as `{title}`: the card's plain text drops it, and several assertions
  // read it.
  const rowsOf = g => g.rows.map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const groups = globalThis.__hud["96-render-battle"].drawBattle(card);
  const lines = groups.flatMap(rowsOf);
  // `field`: the act group's rows, the supporting lines only — not the strip's caption or its call (#356). `scene` is
  // the turn: what the planner is handed, and what a scenario tweaks.
  return { lines, field: rowsOf(groups.find(g => g.id === "act")), groups, card, scene: turn };
};
// The Cyrus mistake: Scrafty sent in "→ High Jump Kick" as if the move happened this turn.
const assertNoImmediateScrafty = field => {
  // A ⇄ switch line, not the ⤵ free entry a doomed mon's faint buys (#170), which names no switch at all.
  assert.ok(!field.some(l => /⇄.*Scrafty in(?! · optional)/.test(l) && !/^now:/.test(l)) || field.some(l => /^next: ⚔ Scrafty/.test(l)), "a Scrafty switch must be split into now/next");
  assert.ok(!field.some(l => /High Jump Kick/.test(l) && !/^next:/.test(l) && !/^↺/.test(l)), `High Jump Kick shown as an immediate action:\n${field.join("\n")}`);
};

// ---- Cyrus-like, live: Gyarados switches to a boss Weavile that outspeeds and KOs Scrafty with Triple Axel.
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

// ---- Cyrus with no safe answer on the bench: stay, flagged 💀 for next turn.
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

// ---- The planner's building blocks, on the Cyrus scene.
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

  // Quick Claw against its bracket, and Mycelium Might on a status move (game-code.md §5, #178).
  // MovePriorityInBracket: LAST 0, NORMAL 1, FIRST 2. MoveCategory.STATUS is 2.
  const clawItem = () => new (class BypassSpeedChanceModifier { getStackCount() { return 1; } })();
  const stall = { priority: 0, getPriorityModifier: () => 0 };
  const clawLast = { ...scrafty, getHeldItems: () => [clawItem()] };
  assert.ok(Math.abs(actionOrder(s, clawLast, stall, weavile, plain) - 0.1) < 1e-9, "Quick Claw beats its own LAST bracket");
  const mycelium = { ...scrafty, getAbility: () => ({ name: "Mycelium Might" }), getHeldItems: () => [clawItem()] };
  assert.equal(actionOrder(s, mycelium, { priority: 0, category: 2 }, weavile, plain), 0, "Mycelium Might blocks the bypass on a status move");
  assert.ok(Math.abs(actionOrder(s, mycelium, plain, weavile, plain) - 0.1) < 1e-9, "\u2026but not on an attack");

  // A speed tie this turn is settled by the turn's own shuffle (`turn.speedTie`, #178); the planner asks only for this
  // turn, and only while the turn has an answer.
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
  // Turn-end heals come every turn the target survives, capped at max HP. Meteor Mash (57.9 a use, misses counted)
  // into a Gyarados healing 30: a miss at full HP heals nothing, so the 8th use finishes it only 49.96 % of the time
  // and the likely turn is the 9th (8.0 expected). Waterfall (55.1) into a Metagross healing 10: 240 / 45.1 → 6.
  globalThis.__stub.heal = p => ({ Gyarados: 30, Metagross: 10 })[p.name] ?? 0;
  const [, , metagross] = party;
  const healing = exchange(s, { ...metagross, id: "healing Metagross" }, metagross.moveset[0], { ...gyarados, id: "healing Gyarados" });
  delete globalThis.__stub.heal;
  assert.deepEqual([healing.turnsWe, healing.turnsThey], [9, 6], "heals land every turn on both sides");
  assert.ok(Math.abs(healing.eTurnsWe - 8) < 0.05, `expected turns (${healing.eTurnsWe})`);
  // Meteor Mash and 61 chip a turn into 250 HP: two turns do it only 47.8 % of the time, three 98 %.
  globalThis.__stub.heal = p => (p.name === "Gyarados" ? -61 : 0);
  assert.equal(exchange(s, { ...metagross, id: "Metagross vs chip" }, metagross.moveset[0], { ...gyarados, id: "poisoned Gyarados" }).turnsWe, 3, "chip shortens the exchange");
  // Hit plus chip finishing it this turn isn't held to two turns: Meteor Mash (64.3) and 40 chip into 100 HP.
  globalThis.__stub.heal = p => ({ Gyarados: -40, Morpeko: -20 })[p.name] ?? 0;
  assert.equal(exchange(s, { ...metagross, id: "Metagross vs low chip" }, metagross.moveset[0], { ...gyarados, id: "Gyarados at 100", hp: 100 }).turnsWe, 1, "our hit and its chip");
  // …on our side too: Waterfall can't KO Morpeko at 90 alone, but with 20 poison chip it goes down this turn.
  assert.equal(exchange(s, { ...morpeko, id: "poisoned Morpeko" }, morpeko.moveset[0], { ...gyarados, id: "Gyarados vs poison" }, { hp: 90 }).turnsThey, 1, "its hit and our chip");
  const asked = [];
  globalThis.__stub.heal = (p, o) => { asked.push([p.name, Math.round(o?.dealt ?? 0)]); return 0; };
  exchange(s, { ...metagross, id: "Metagross with a bell" }, metagross.moveset[0], { ...gyarados, id: "Gyarados vs bell" });
  delete globalThis.__stub.heal;
  assert.ok(asked.some(([n, d]) => n === "Metagross" && d > 50), `our turn-end HP is asked with the damage dealt (${JSON.stringify(asked)})`);
  // Reviver Seed: the outcome says so this turn (`revive`, no pKo); the KO pacing reads the held seed for the turns
  // after.
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
  // A wild boss gains a stat stage per bar broken and a trainer's doesn't (game-code.md §3): a Def-heavy Weavile's
  // second bar takes Aura Wheel (83 a use) 3 turns instead of 2.
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
  // Sleep tokens: asleep 1–2 attempts, ⅓ / ⅔ (game-code.md §8). Metagross moves first, so a Body Slam's sleep costs
  // from the next turn: acting 1, .9, .84, .86, .87, .89… Six landed Meteor Mashes take the two 200 HP bars, and all
  // of the first six get through 50.4 % of the time, so 6 turns; by the 7th, 83.7 %.
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
  // .91: six of the first seven land 71.9 % of the time, so 7 turns.
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
  const { tokenOdds, tokenShift } = globalThis.__planner;
  const lumItem = new ({ BerryModifier: class { berryType = 1; isTransferable = true; getStackCount() { return 1; } } }).BerryModifier();
  const lumMorpeko = id => ({ ...morpeko, id, getHeldItems: () => [lumItem] });
  const lumOdds = tokenOdds(s, { ...gyarados, id: "Gyarados vs Lum" }, lumMorpeko("Lum Morpeko"));
  const unnervedOdds = tokenOdds(s, { ...gyarados, id: "Unnerve Gyarados", hasAbilityWithAttr: a => a === "PreventBerryUseAbAttr" }, lumMorpeko("Unnerved Lum Morpeko"));
  const plainOdds = tokenOdds(s, { ...gyarados, id: "Gyarados vs bare" }, { ...morpeko, id: "bare Morpeko" });
  console.log(`tokens: bare ${[1, 2].map(plainOdds.by)} · Lum ${[1, 2].map(lumOdds.by)} · Unnerved Lum ${[1, 2].map(unnervedOdds.by)}`);
  assert.deepEqual([1, 2].map(lumOdds.by), [0, 0.25], "the Lum takes the first landing");
  assert.deepEqual([1, 2].map(unnervedOdds.by), [1, 2].map(plainOdds.by), "an opposing Unnerve keeps the Lum uneaten");
  globalThis.__stub.heal = p => (p.status?.effect === 1 && !p.getHeldItems?.().length ? -22 : 0);
  assert.equal(tokenShift(lumOdds, lumMorpeko("Lum Morpeko, shift"), globalThis.__stub.heal), -22, "the poison that lasts chips a mon whose Lum is gone");
  globalThis.__stub.heal = p => (p.status?.effect === 1 ? -22 : 0);
  // At 160 HP two Waterfalls fall short by 12: the tokens' expected 11 + 16.5 make it up, the Lum's 5.5 does not.
  const at160 = (id, me) => exchange(s, me, morpeko.moveset[0], { ...gyarados, id: `Gyarados vs ${id}` }, { hp: 160 }).turnsThey;
  assert.deepEqual([at160("bare at 160", { ...morpeko, id: "bare Morpeko at 160" }), at160("Lum at 160", lumMorpeko("Lum Morpeko at 160"))], [2, 3],
    "the Lum buys back the turn the tokens' chip took");
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

// ---- Fallback: the real modules outside the CommandPhase still render a plan, without the turn-split bug.
{
  const { party, foes } = cyrus(true);
  const { lines, field } = render({ party, foes, live: false });
  console.log(`== cyrus (fallback)\n${lines.join("\n")}`);
  assertNoImmediateScrafty(field);
  assert.ok(field.some(l => /⚔ Morpeko/.test(l)), "a plan renders");
}

// ---- A switch-in must get to act: Blastoise survives Stone Edge coming in, then falls to the faster Lycanroc.
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

// ---- A foe's item thief is named on the slot that holds something to lose.
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

// ---- Depth 2: Fake Out first buys the turn that trading Returns loses.
// Ambipom is faster; Slowbro's Psychic (136–160) 2HKOs its 250 HP, and Return (136–160) needs three for 320 HP. Fake
// Out (51–60, a sure flinch) takes turn 1 free, and two Returns on top land before the second Psychic.
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
  assert.match(at(outcome), /Return → Slowbro/, "no flinch, no Fake Out");

  // The fight plan can't repeat a first-turn-only move, so a pin on Fake Out runs its follow-up (#650).
  const { scene: s } = render({ party, foes, live: true, dist, switches: () => new Map(), stubOutcome: fakeOut });
  const team = globalThis.__hud["35-team-plan"].teamPlanner(s);
  const [fo, ret] = ["Fake Out", "Return"].map(n => globalThis.__planner.planOutcomes(s, party[0], foes[0]).find(o => o.name === n));
  const pinned = team.at({ mi: 0, outcome: fo, then: ret }), plain = team.at({ mi: 0, outcome: ret });
  assert.deepEqual(pinned.steps, plain.steps, `Fake Out then Return plays as Return: ${JSON.stringify(pinned.steps[0])}`);
}

// ---- Consistency: two equal moves, and the one Garchomp used last turn keeps the edge rather than the first listed.
Object.assign(TABLE, { "Garchomp>Dragon Claw>Snorlax": [[70], 1, 1], "Garchomp>Stone Edge>Snorlax": [[70], 1, 1], "Snorlax>Body Slam>Garchomp": [[40], 1, 1] });
{
  const foes = [mon("Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]], true)];
  const chomp = extra => [mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130],
    [["Stone Edge", "Rock", 100, "P", 0, { id: 444 }], ["Dragon Claw", "Dragon", 80, "P", 0, { id: 337 }]], true, undefined, extra)];
  const dist = () => [{ name: "Body Slam", type: "Normal", p: 1, score: 10, targets: [0] }];
  const pick = extra => render({ party: chomp(extra), foes, live: true, dist, switches: () => new Map() }).field.find(l => /^⚔ Garchomp/.test(l)) ?? "";
  assert.match(pick({}), /Stone Edge → Snorlax/, "the first listed, all else equal");
  const kept = pick({ summonData: { statStages: [0, 0, 0, 0, 0, 0, 0], types: [], turnCount: 3 }, getLastXMoves: () => [{ move: 337, targets: [2], result: 1 }] });
  console.log(`== consistency: last turn's move (live)\n${kept}`);
  assert.match(kept, /Dragon Claw → Snorlax/, `keeps last turn's near-equal move:\n${kept}`);
}

// ---- A status move is recommended as this turn's action where it beats attacking (#74).
const oneOnOne = ({ party, foes, dist, stub = outcome, stopped = null, switches = () => new Map() }) => render({ party, foes, live: true, dist, switches, stubOutcome: stub, stopped });
const lineOf = (field, name) => field.find(l => new RegExp(`^⚔ ${name}`).test(l)) ?? "";
const only = move => () => [{ name: move, type: "Normal", p: 1, score: 10, targets: [0] }];
const SWORDS_DANCE = ["Swords Dance", "Normal", 0, "X", 0, { target: 0, id: 14, attrs: [["StatStageChangeAttr", { stats: [1], stages: 2, selfTarget: true }]] }];

// Swords Dance: Leaf Blade (77–90) needs six hits on Snorlax's 450 HP; at +2 (153–180) three, so a turn of setup
// and three hits beat six, against a Body Slam that barely scratches Gallade.
Object.assign(TABLE, { "Gallade>Leaf Blade>Snorlax": [[90], 1, 1], "Snorlax>Body Slam>Gallade": [[40], 1, 1] });
{
  const gallade = hit => [mon("Gallade", 80, ["Psychic", "Fighting"], [300, 200, 110, 90, 150, 100], [["Leaf Blade", "Grass", 90, "P"], SWORDS_DANCE], true)];
  const snorlax = hp => [mon("Snorlax", 80, ["Normal"], [hp, 150, 110, 80, 150, 30], [["Body Slam", "Normal", 85, "P"]], true)];
  const setupLine = lineOf(oneOnOne({ party: gallade(), foes: snorlax(450), dist: only("Body Slam") }).field, "Gallade");
  console.log(`== setup: Swords Dance then Leaf Blade (live)\n${setupLine}`);
  assert.match(setupLine, /Swords Dance .*\+2 Atk .*then Leaf Blade/, `set up, then attack:\n${setupLine}`);
  assert.ok(!/→/.test(setupLine), "a move on the user aims at nobody");
  // The fight plan runs the follow-up from turn 1, so it is pinned at the strength it has before the setup (#650).
  {
    const party = gallade(), foes = snorlax(450);
    const { scene: s } = oneOnOne({ party, foes, dist: only("Body Slam") });
    const pick = globalThis.__planner.fieldPlan(s, party, foes, false).picks[0];
    const base = globalThis.__planner.planOutcomes(s, party[0], foes[0]).find(o => o.name === "Leaf Blade");
    assert.equal(pick.then?.expected, base.expected, `the pin is the unboosted Leaf Blade: ${pick.then?.expected} vs ${base.expected}`);
  }
  // 213–250 into 400: already a 2HKO.
  TABLE["Gallade>Leaf Blade>Snorlax"] = [[250], 1, 1];
  assert.match(lineOf(oneOnOne({ party: gallade(), foes: snorlax(400), dist: only("Body Slam") }).field, "Gallade"), /Leaf Blade → Snorlax/, "no setup when the hit already 2HKOs");
}

// Spore: Breloom is faster and 2HKOs Machamp, whose Close Combat 1HKOs it — trading hits loses on turn 1. Spore
// lands before Machamp moves and cancels that attempt; the next is lost 2 times in 3 (game-code.md §8), so two Seed
// Bombs usually land first.
Object.assign(TABLE, { "Breloom>Seed Bomb>Machamp": [[200], 1, 1], "Machamp>Close Combat>Breloom": [[400], 1, 1] });
{
  const party = [mon("Breloom", 80, ["Grass", "Fighting"], [250, 200, 110, 60, 90, 100],
    [["Seed Bomb", "Grass", 80, "P"], ["Spore", "Grass", 0, "X", 0, { id: 147, attrs: [["StatusEffectAttr", { effect: 4 }]] }]], true)];
  const foes = [mon("Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 50], [["Close Combat", "Fighting", 120, "P"]], true)];
  const line = lineOf(oneOnOne({ party, foes, dist: only("Close Combat") }).field, "Breloom");
  console.log(`== status: Spore first (live)\n${line}`);
  assert.match(line, /Spore → Machamp .*sleep .*then Seed Bomb/, `Spore, then attack:\n${line}`);
  const asleep = [mon("Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 50], [["Close Combat", "Fighting", 120, "P"]], true, undefined, { status: { effect: 4, sleepTurnsRemaining: 2 } })];
  assert.match(lineOf(oneOnOne({ party, foes: asleep, dist: only("Close Combat") }).field, "Breloom"), /Seed Bomb → Machamp/, "no Spore into a sleeping foe");
}

// Recovery: Slowbro at half HP (200/400) needs three Scalds; the faster Gengar's Shadow Ball (68–80) takes it down
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

// Stealth Rock: Skarmory can't dent Chansey either way, and the trainer still has four mons weak to Rock to come.
Object.assign(TABLE, { "Skarmory>Drill Peck>Chansey": [[60], 1, 1], "Chansey>Seismic Toss>Skarmory": [[30], 1, 1] });
{
  const rock = ["Stealth Rock", "Rock", 0, "X", 0, { target: 16, id: 446, attrs: [["AddArenaTrapTagAttr", { tagType: "STEALTH_ROCK" }]] }];
  const party = [mon("Skarmory", 80, ["Steel", "Flying"], [330, 110, 200, 60, 100, 70], [["Drill Peck", "Flying", 80, "P"], rock], true)];
  const bench = ["Charizard", "Talonflame", "Moltres", "Volcarona"].map(n => mon(n, 80, n === "Volcarona" ? ["Bug", "Fire"] : ["Fire", "Flying"], [300, 100, 100, 100, 100, 100], [], false));
  const chansey = mon("Chansey", 80, ["Normal"], [600, 20, 20, 50, 200, 50], [["Seismic Toss", "Fighting", 0, "P"]], true);
  const line = lineOf(oneOnOne({ party, foes: [chansey, ...bench], dist: e => (e === chansey ? only("Seismic Toss")() : []) }).field, "Skarmory");
  console.log(`== hazard: Stealth Rock (live)\n${line}`);
  assert.match(line, /Stealth Rock .*4 to come .*then Drill Peck/, `hazard first:\n${line}`);
  assert.match(lineOf(oneOnOne({ party, foes: [chansey], dist: only("Seismic Toss") }).field, "Skarmory"), /Drill Peck → Chansey/, "no hazard with no bench");
}

// A foe likely to Protect blocks this turn's hit: Garchomp's sure 1HKO on Snorlax is a coin flip into a 50 % Protect.
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

// A foe setting up: Snorlax picks Swords Dance half the time (+1 Atk a turn expected), so its later Body Slams hit
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

// A typing written onto the foe (#171): Soak makes Bug/Steel Golisopod pure Water. Energy Ball goes from 0.25× (25 a
// hit into 400 HP: sixteen turns) to 2× (200: two), and Iron Head loses its STAB (150 → 100 into Primarina's 400).
// `typed` prices from the *live* typing, so the written-on types are what move the numbers.
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
  // A Terastallized foe: `ChangeTypeAttr.getCondition` fails (game-code.md §14).
  const tera = lineOf(oneOnOne({ party: primarina(), foes: golisopod({ isTerastallized: true }), dist: ironHead, stub: typed }).field, "Primarina");
  console.log(`== types: no Soak into a Terastallized foe\n${tera}`);
  assert.match(tera, /Energy Ball → Golisopod/, `no Soak into a Tera foe:\n${tera}`);
  const water = lineOf(oneOnOne({ party: primarina(), foes: [mon("Golisopod", 80, ["Water"], [400, 180, 160, 70, 100, 70], [["Iron Head", "Steel", 80, "P"]], true)], dist: ironHead, stub: typed }).field, "Primarina");
  assert.match(water, /Energy Ball → Golisopod/, `no Soak into a pure-Water foe:\n${water}`);
}

// A slot with nothing that damages: a status play scored from the attack it set up had no attack to set up, and the
// line ended there (#263). A zero row, not a missing one: a move the table doesn't price falls back to the type chart.
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
  const lost = at([NEEDLE_ARM]);
  console.log(`== dead end: nothing it can do (live)\n${lost}`);
  assert.match(lost, /nothing it can do/, `the genuine dead end reads plainly:\n${lost}`);
  assert.ok(!/no damaging move/.test(lost), "the old wording is gone");
  const stopped = at([NEEDLE_ARM], () => ["Encore"]);
  console.log(`== dead end: nothing it can use — Encore (live)\n${stopped}`);
  assert.match(stopped, /nothing it can use — Encore/, `a restriction that emptied the pool is named:\n${stopped}`);
}

// ---- Doubles: where both slots aim is one decision.
// Our Garchomp and Lucario are both faster than the foes. Each hits Hydreigon for 60 %: alone neither KOs it, together
// they do, before it fires a Dark Pulse for 70 % into either of us. Snorlax is bulky and hits softly.
Object.assign(TABLE, {
  "Garchomp>Dragon Claw>Hydreigon": [[180], 1, 2], "Lucario>Aura Sphere>Hydreigon": [[180], 1, 2],
  "Garchomp>Dragon Claw>Snorlax": [[70], 1, 1], "Lucario>Aura Sphere>Snorlax": [[70], 1, 2],
  "Garchomp>Dragon Claw>Ferrothorn": [[60], 1, 0.5], "Lucario>Aura Sphere>Ferrothorn": [[60], 1, 1],
  "Hydreigon>Dark Pulse>Garchomp": [[190], 1, 1], "Hydreigon>Dark Pulse>Lucario": [[150], 1, 0.5],
  "Snorlax>Body Slam>Garchomp": [[40], 1, 1], "Snorlax>Body Slam>Lucario": [[30], 1, 0.5],
  "Ferrothorn>Gyro Ball>Garchomp": [[50], 1, 1], "Ferrothorn>Gyro Ball>Lucario": [[25], 1, 0.5],
  // The split field: Weezing and Toxapex each fall to one of ours, and only to that one.
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

// Focus: two 60 % hits on the dangerous Hydreigon KO it before it moves.
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
  assert.ok(field.some(l => /^· focus Hydreigon : KO before it moves/.test(l)), "focus is explained");
}

// Split: each foe falls to one of our slots, so aiming at both KOs both.
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
  assert.ok(!field.some(l => /^· focus/.test(l)), "no focus");
}

// The focus field, but Hydreigon is predicted to switch out to Ferrothorn: focusing the leaving mon is pointless.
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
  assert.ok(!field.some(l => /^· focus Hydreigon/.test(l)), "no focus on the leaving Hydreigon");
}

// A status play in a double (#262, #862). Neither of ours dents Machamp this turn, and Munchlax falls to one Dragon
// Claw. Faster than Machamp, Breloom's Spore takes this turn's Close Combat, so Breloom spends its turn on it and
// Salamence takes the foe it can actually finish.
Object.assign(TABLE, {
  "Breloom>Seed Bomb>Machamp": [[60], 1, 1], "Breloom>Seed Bomb>Munchlax": [[60], 1, 1],
  "Salamence>Dragon Claw>Machamp": [[60], 1, 1], "Salamence>Dragon Claw>Munchlax": [[400], 1, 1],
  "Machamp>Close Combat>Breloom": [[400], 1, 1], "Machamp>Close Combat>Salamence": [[300], 1, 1],
  "Munchlax>Body Slam>Breloom": [[30], 1, 1], "Munchlax>Body Slam>Salamence": [[30], 1, 1],
});
const SPORE = ["Spore", "Grass", 0, "X", 0, { id: 147, attrs: [["StatusEffectAttr", { effect: 4 }]] }];
const sporeParty = (spe = 100, moves = [["Seed Bomb", "Grass", 80, "P"], SPORE]) => [
  mon("Breloom", 80, ["Grass", "Fighting"], [250, 200, 110, 60, 90, spe], moves, true, undefined, { getBattlerIndex: () => 0 }),
  mon("Salamence", 80, ["Dragon", "Flying"], [270, 200, 150, 120, 130, 130], [["Dragon Claw", "Dragon", 80, "P"]], true, undefined, { getBattlerIndex: () => 1 }),
];
const sporeFoes = (sleeping = false) => [
  foeAt(2, "Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 140], [["Close Combat", "Fighting", 120, "P"]],
    ...(sleeping ? [undefined, { status: { effect: 4, sleepTurnsRemaining: 2 } }] : [])),
  foeAt(3, "Munchlax", 80, ["Normal"], [300, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]]),
];
{
  const slower = render({ party: sporeParty(), foes: sporeFoes(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles: a status play, slower than Machamp (live)\n${slower.lines.join("\n")}`);
  assert.match(lineOf(slower.field, "Salamence"), /→ Munchlax/, `the partner keeps the foe it can finish:\n${slower.field.join("\n")}`);
  const { lines, field } = render({ party: sporeParty(150), foes: sporeFoes(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles: a status play (live)\n${lines.join("\n")}`);
  assert.match(lineOf(field, "Breloom"), /Spore → Machamp .*sleep/, `Spore is the double's turn line:\n${field.join("\n")}`);
  assert.ok(!/then /.test(lineOf(field, "Breloom")), `no depth 2 in a double:\n${field.join("\n")}`);
  // Munchlax is Salamence's target with or without Spore, so this field cannot show the partner scored on the sleep.
  assert.match(lineOf(field, "Salamence"), /→ Munchlax/, `the partner keeps the foe it can finish:\n${field.join("\n")}`);
}

// The same field with Machamp already asleep: there is nothing for Spore to add, so Breloom attacks.
{
  const { field, card } = render({ party: sporeParty(), foes: sporeFoes(true), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles: nothing for a status play to add (live)\n${field.join("\n")}`);
  assert.match(lineOf(field, "Breloom"), /Seed Bomb →/, `no Spore into a sleeping foe:\n${field.join("\n")}`);
  assert.equal(card.teamPlan.prefers, null, "no ≈ prefers in a double (#845)");
}

// Machamp outspeeds Salamence and 1HKOs it; Munchlax cannot hurt anyone. Dragon Claw is the better move into
// Machamp (200, two hits) than into Munchlax (110, three), and Salamence takes Machamp — with or without Spore on
// the field. Without Spore it used to aim at Munchlax, as if "it kills me first" were a reason to aim elsewhere,
// though Machamp killed it either way (#320).
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
  assert.match(without, /→ Machamp/, `the partner takes the foe its move suits:\n${without}`);
  assert.match(with_, /→ Machamp/, `and keeps it once Spore is on the field, the arms agreeing:\n${with_}`);
}

// The spare hit (#236): Garchomp is faster and alone fells a weakened Hydreigon, so the game redirects Lucario's hit
// onto Snorlax, carrying **the move Lucario chose for Hydreigon** (game-code.md §5). Spread when the slot has a better
// move for Snorlax than the redirect would carry; focus when it doesn't, which also insures the KO.
Object.assign(TABLE, {
  "Lucario>Close Combat>Hydreigon": [[60], 1, 1], "Lucario>Close Combat>Snorlax": [[300], 1, 2],
});
const CLOSE_COMBAT = ["Close Combat", "Fighting", 120, "P"];
const dyingHydreigon = () => [
  mon("Hydreigon", 80, ["Dark", "Dragon"], [300, 120, 110, 160, 110, 90], [["Dark Pulse", "Dark", 80, "S"]], true, 60, { getBattlerIndex: () => 2 }),
  foeAt(3, "Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]]),
];
// Spread: Aura Sphere barely dents Snorlax and Close Combat halves it, so the redirect would carry the wrong move.
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
// Focus: with only Aura Sphere, the hit lands on Snorlax either way, so Lucario aims at Hydreigon as insurance.
{
  const { lines, field, card } = render({ party: doublesParty(), foes: dyingHydreigon(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles spare hit: focus, the redirect carries the same move (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.equal(slots.length, 2);
  assert.equal(card.teamPlan.prefers, null, "no ≈ prefers in a double (#845)");
  assert.ok(slots.every(l => /→ Hydreigon/.test(l)), `both slots aim at Hydreigon:\n${field.join("\n")}`);
  assert.ok(field.some(l => /spare hit — goes to Snorlax if Hydreigon falls first/.test(l)), `the spare hit says where it lands:\n${field.join("\n")}`);
}

// The certainty axis (#283): the spread field, but Dragon Claw is no longer sure to land. The redirect forces the
// carried move for its own turn only (game-code.md §5), so the wrong move costs a turn, not the fight, and a doubtful
// KO is worth insuring.
{
  // Rewrites a row the spread field set, so it restores it at the end: every later block assigns the row before
  // reading it today, but one added after this might not.
  const sure = TABLE["Garchomp>Dragon Claw>Hydreigon"];
  const party = () => [
    doublesParty()[0],
    mon("Lucario", 80, ["Fighting", "Steel"], [240, 150, 110, 180, 110, 120], [["Aura Sphere", "Fighting", 80, "S"], CLOSE_COMBAT], true, undefined, { getBattlerIndex: () => 1 }),
  ];
  const at = acc => {
    Object.assign(TABLE, { "Garchomp>Dragon Claw>Hydreigon": [[180], acc, 2] });
    return render({ party: party(), foes: dyingHydreigon(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  };
  // A threshold, not a knife edge: the pick holds its direction either side of the ~0.575 where it turns over.
  for (const acc of [0.9, 0.8, 0.7, 0.65, 0.6]) {
    assert.match(slotLines(at(acc).field).find(l => /Lucario/.test(l)) ?? "", /Close Combat → Snorlax/, `a near-sure KO still spreads at ${acc}`);
  }
  for (const acc of [0.55, 0.35, 0.2]) {
    const { field, card } = at(acc);
    assert.match(slotLines(field).find(l => /Lucario/.test(l)) ?? "", /→ Hydreigon/, `a doubtful KO focuses at ${acc}`);
    // At 0.35 and 0.2 the plan offered "Lucario Aura Sphere → Hydreigon", the ⚔ line Lucario already has (#845).
    assert.equal(card.teamPlan.prefers, null, `no ≈ prefers in a double at ${acc} (#845)`);
  }
  const { lines, field } = at(0.5);
  console.log(`== doubles spare hit: focus, the partner's KO is not certain (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.match(slots.find(l => /Garchomp/.test(l)) ?? "", /→ Hydreigon/, `Garchomp still goes for the KO:\n${field.join("\n")}`);
  assert.match(slots.find(l => /Lucario/.test(l)) ?? "", /→ Hydreigon/, `Lucario insures the KO rather than spreading:\n${field.join("\n")}`);
  Object.assign(TABLE, { "Garchomp>Dragon Claw>Hydreigon": sure });
}

// Two killable foes of sharply different danger (#316). Both outspeed both of ours, so `pBefore * danger` is ~0 for
// each; everything else is symmetric and neither falls to one hit, so the **removal price** alone picks. A target
// priced by the 1-on-1 exchange with it alone made the foe about to KO our mon a losing trade to aim at (#320).
Object.assign(TABLE, {
  "Garchomp>Dragon Claw>Porygon-Z": [[180], 1, 1], "Lucario>Aura Sphere>Porygon-Z": [[180], 1, 2],
  "Garchomp>Dragon Claw>Dunsparce": [[180], 1, 1], "Lucario>Aura Sphere>Dunsparce": [[180], 1, 2],
  "Porygon-Z>Tri Attack>Garchomp": [[190], 1, 1], "Porygon-Z>Tri Attack>Lucario": [[170], 1, 1],
  "Dunsparce>Body Slam>Garchomp": [[30], 1, 1], "Dunsparce>Body Slam>Lucario": [[25], 1, 1],
});
{
  // Only the speed and the position differ between calls; the damage rows above are the whole asymmetry.
  const pz = (idx, spe = 150) => foeAt(idx, "Porygon-Z", 80, ["Normal"], [300, 100, 110, 180, 110, spe], [["Tri Attack", "Normal", 80, "S"]]);
  const du = (idx, spe = 150) => foeAt(idx, "Dunsparce", 80, ["Normal"], [300, 100, 110, 60, 110, spe], [["Body Slam", "Normal", 85, "P"]]);
  const at = foes => render({ party: doublesParty(), foes, live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  const focusOf = field => slotLines(field).map(l => (/Porygon-Z/.test(l) ? "Porygon-Z" : /Dunsparce/.test(l) ? "Dunsparce" : "?")).join("+");

  const { lines, field } = at([pz(2), du(3)]);
  console.log(`== doubles: two killable foes, one far more dangerous (live)\n${lines.join("\n")}`);
  assert.equal(focusOf(field), "Porygon-Z+Porygon-Z", `the pair focuses the dangerous foe:\n${field.join("\n")}`);
  assert.ok(field.some(l => /^· focus Porygon-Z/.test(l)), "and says so on the · row");

  assert.equal(focusOf(at([du(2), pz(3)]).field), "Porygon-Z+Porygon-Z", "the pick follows the foe, not the field position");

  // Monotone in threat: the pick crosses where Porygon-Z's damage passes Dunsparce's 30 a turn. A lethality threshold
  // here would be the bug back (#320).
  const lethal = TABLE["Porygon-Z>Tri Attack>Garchomp"];
  const pzDmg = d => Object.assign(TABLE, { "Porygon-Z>Tri Attack>Garchomp": [[d], 1, 1], "Porygon-Z>Tri Attack>Lucario": [[Math.round(d * 0.9)], 1, 1] });
  for (const d of [10, 25, 29]) {
    pzDmg(d);
    assert.equal(focusOf(at([pz(2), du(3)]).field), "Dunsparce+Dunsparce", `below Dunsparce's own ${30} a turn, Dunsparce is the foe worth removing (at ${d})`);
  }
  for (const d of [30, 100, 136, 150, 190, 270, 400]) {
    pzDmg(d);
    assert.equal(focusOf(at([pz(2), du(3)]).field), "Porygon-Z+Porygon-Z", `above it the dangerous foe is focused, lethal or not (at ${d})`);
  }
  Object.assign(TABLE, { "Porygon-Z>Tri Attack>Garchomp": lethal, "Porygon-Z>Tri Attack>Lucario": [[170], 1, 1] });

  // The price is multiplied by the KO's odds, so a foe the pair cannot remove this turn earns nothing from it. No guard
  // does this — `pKo` being 0 does.
  Object.assign(TABLE, { "Garchomp>Dragon Claw>Porygon-Z": [[90], 1, 1], "Lucario>Aura Sphere>Porygon-Z": [[90], 1, 2] });
  const unkillable = foeAt(2, "Porygon-Z", 80, ["Normal"], [600, 100, 110, 180, 110, 150], [["Tri Attack", "Normal", 80, "S"]]);
  assert.equal(focusOf(at([unkillable, du(3)]).field), "Dunsparce+Dunsparce", "a dangerous foe that cannot be removed is not chased");
  Object.assign(TABLE, { "Garchomp>Dragon Claw>Porygon-Z": [[180], 1, 1], "Lucario>Aura Sphere>Porygon-Z": [[180], 1, 2] });

  // Single-target foes, so no two-slot damage split scales anything down: the field where a tie would come back.
  const aimAtOne = () => [{ name: "Tri Attack", type: "Normal", p: 1, score: 10, targets: [0] }];
  const solo = (idx, name, spa) => foeAt(idx, name, 80, ["Normal"], [300, 100, 110, spa, 110, 150], [[name === "Porygon-Z" ? "Tri Attack" : "Body Slam", "Normal", 80, "S"]]);
  const single = render({ party: doublesParty(), foes: [solo(2, "Porygon-Z", 180), solo(3, "Dunsparce", 60)], live: true, double: true, dist: aimAtOne, switches: () => new Map() });
  assert.equal(focusOf(single.field), "Porygon-Z+Porygon-Z", `single-target foes: the dangerous one is still focused:\n${single.field.join("\n")}`);

  // Outsped foes: `pBefore` is 1, so the · row names the KO before it moves rather than the removal.
  const slow = at([pz(2, 40), du(3, 40)]);
  console.log(`== doubles: the same two foes, now outsped (live)\n${slow.lines.join("\n")}`);
  assert.equal(focusOf(slow.field), "Porygon-Z+Porygon-Z", `outspeeding them, the dangerous foe is focused:\n${slow.field.join("\n")}`);
  assert.ok(slow.field.some(l => /^· focus Porygon-Z : KO before it moves/.test(l)), "and the · row names why it is worth more");
}

// ---- A lock-in re-draws its target on every use: this turn's aim at one slot says nothing about the next.
// Dragonite's Outrage (`RANDOM_NEAR_ENEMY`, MoveTarget 7) is aimed at Garchomp this turn. One hit fells neither of
// ours and a second always does, so from the next use on each slot is down once two of the uses aimed at it have
// landed, each landing half the time: Garchomp by turn j with 1 − ½^(j−1), so 1 + Σ½^k (k < 8) = 2.9921875 turns
// expected; Lucario by turn j with P(Bin(j − 1, ½) ≥ 2), so 1 + (1 + 1 + ¾ + ½ + 5⁄16 + 3⁄16 + 7⁄64 + 1⁄16) = 4.921875.
Object.assign(TABLE, {
  "Dragonite>Outrage>Garchomp": [[200], 1, 2], "Dragonite>Outrage>Lucario": [[150], 1, 0.5],
  "Garchomp>Dragon Claw>Dragonite": [[60], 1, 2], "Lucario>Aura Sphere>Dragonite": [[60], 1, 1],
});
{
  const party = doublesParty();
  const dragonite = foeAt(2, "Dragonite", 80, ["Dragon", "Flying"], [400, 200, 150, 100, 150, 80], [["Outrage", "Dragon", 120, "P", 0, { target: 7 }]]);
  const atGarchomp = () => [{ name: "Outrage", type: "Dragon", p: 1, score: 10, targets: [0], exact: true }];
  const { scene: s } = render({ party, foes: [dragonite], live: true, double: true, dist: atGarchomp, switches: () => new Map() });
  const { exchange } = globalThis.__planner;
  const [garchomp, lucario] = party;
  const aimed = exchange(s, garchomp, garchomp.moveset[0], dragonite);
  const spared = exchange(s, lucario, lucario.moveset[0], dragonite);
  console.log(`== doubles: a re-rolled Outrage (live)\nGarchomp ${aimed.eTurnsThey} turns · Lucario ${spared.eTurnsThey}`);
  assert.ok(aimed.turn1.hp <= 100 && spared.turn1.hp === 240, `this turn's aim stands (${aimed.turn1.hp}, ${spared.turn1.hp})`);
  assert.ok(Math.abs(aimed.eTurnsThey - 2.9921875) < 1e-6, `the slot aimed at now is hit half the time after (${aimed.eTurnsThey})`);
  assert.ok(Math.abs(spared.eTurnsThey - 4.921875) < 1e-6, `the slot spared now is hit half the time after (${spared.eTurnsThey})`);
  // The fight plan plays the pairing on one turn's damage: half of Outrage's mean roll, 185 into Garchomp and 138.5
  // into Lucario.
  const [vsGarchomp, vsLucario] = globalThis.__hud["35-team-plan"].tpTables(s, party, [dragonite], true).theirs[0];
  assert.ok(Math.abs(vsGarchomp.dmg - 92.5) < 1e-6 && Math.abs(vsLucario.dmg - 69.25) < 1e-6, `the plan's turn (${vsGarchomp.dmg}, ${vsLucario.dmg})`);
}

// ---- Free switch: the CheckSwitchPhase offer before the first turn (game-code.md §9).
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

// Command phase: the switch-in would be KO'd coming in, so it isn't recommended.
{
  const { party, foes } = freeSwitchCase(false);
  const { lines, field } = render({ party, foes, live: true, dist: stoneEdge, switches: () => new Map() });
  console.log(`== free switch — same field in the command phase (live)\n${lines.join("\n")}`);
  // A ⇄ line again: Ninetales is going down this turn, so the ⤵ names the free entry its faint buys (#170).
  assert.ok(!field.some(l => /⇄.*Swampert in(?! · optional)/.test(l)), `Swampert would be KO'd coming in:\n${field.join("\n")}`);
}

// CheckSwitchPhase: Swampert comes in without a hit and no turn lost.
{
  const { party, foes } = freeSwitchCase(false);
  const { lines, field } = render({ party, foes, live: true, phase: "CheckSwitchPhase", dist: stoneEdge, switches: rhyperiorSwitches(foes) });
  console.log(`== free switch — switch (live)\n${lines.join("\n")}`);
  assert.match(field[0] ?? "", /^⇄ free switch\? Ninetales → Swampert \(no hit taken\)/, `free switch line first:\n${field.join("\n")}`);
  assert.ok(field.some(l => /^⚔ Swampert .*Surf → Rhyperior/.test(l)), "the coming turn's plan follows");
  assert.ok(!field.some(l => /^(now|next):/.test(l)), "no now/next split for a free switch");
  assert.ok(!field.some(l => /switches — moves aimed at it/.test(l)), "no enemy switch predicted before the enemy has seen our field");
}

// CheckSwitchPhase with the best mon already out: stay.
{
  const { party, foes } = freeSwitchCase(true);
  const { lines, field } = render({ party, foes, live: true, phase: "CheckSwitchPhase", dist: stoneEdge, switches: () => new Map() });
  console.log(`== free switch — stay (live)\n${lines.join("\n")}`);
  assert.match(field[0] ?? "", /^⇄ free switch\? stay — Swampert is best here/, `stay line first:\n${field.join("\n")}`);
  assert.ok(field.some(l => /^⚔ Swampert .*Surf → Rhyperior/.test(l)));
  assert.ok(!field.some(l => /Ninetales/.test(l)), "no switch suggested");
}

// ---- Spread moves that hit every other pokémon land on our partner too (Earthquake: MoveTarget 4).
// Both foes are weak to Ground: Earthquake takes both, Dragon Claw only one.
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

// Earthquake would KO our Lucario: not worth two foes.
{
  const { lines, field } = render({ party: quakeParty(300), foes: quakeFoes(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles spread move KOs our partner (live)\n${lines.join("\n")}`);
  const chomp = slotLines(field).find(l => /^⚔ Garchomp/.test(l));
  assert.ok(chomp && !/Earthquake/.test(chomp), `no Earthquake into our own Lucario:\n${field.join("\n")}`);
}

// Earthquake only scratches Lucario: still the play, and the slot says what it costs.
{
  const { lines, field } = render({ party: quakeParty(60), foes: quakeFoes(), live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles spread move scratches our partner (live)\n${lines.join("\n")}`);
  assert.match(slotLines(field).find(l => /^⚔ Garchomp/.test(l)) ?? "", /Earthquake → both .*hits Lucario \d+%/, `Earthquake, with its cost to Lucario:\n${field.join("\n")}`);
}

// One foe left, both our slots still up: Earthquake still hits Lucario.
{
  const [heatran] = quakeFoes();
  const { lines, field } = render({ party: quakeParty(300), foes: [heatran], live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  console.log(`== doubles spread move, one foe left (live)\n${lines.join("\n")}`);
  const chomp = slotLines(field).find(l => /^⚔ Garchomp/.test(l));
  assert.match(chomp ?? "", /Dragon Claw → Heatran/, `Dragon Claw rather than Earthquake through Lucario:\n${field.join("\n")}`);
}

// ---- Overkill: Heat Wave already KOs both foes, so Venusaur's hit is spare — no recoil move for nothing.
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

// ---- Slot 1's command phase: slot 0's command is locked in `turnCommands[0]`.
const hydreigonSnorlax = () => [
  foeAt(2, "Hydreigon", 80, ["Dark", "Dragon"], [300, 120, 110, 160, 110, 90], [["Dark Pulse", "Dark", 80, "S"]]),
  foeAt(3, "Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]]),
];
// The focus field, but Garchomp already chose Dragon Claw into Snorlax: keep it, plan Lucario around it.
{
  // A target picked in SelectTargetPhase sits on the command itself, not on `move.targets`.
  const turnCommands = [{ command: 0, cursor: 0, move: { move: 337, targets: [], useMode: 0 }, targets: [3] }];
  const { lines, field } = render({ party: doublesParty(), foes: hydreigonSnorlax(), live: true, double: true, dist: aimAtBoth, switches: () => new Map(), fieldIndex: 1, turnCommands });
  console.log(`== doubles slot 0 locked (live)\n${lines.join("\n")}`);
  const slots = slotLines(field);
  assert.match(slots.find(l => /^⚔ Garchomp/.test(l)) ?? "", /Dragon Claw → Snorlax .*locked in/, `slot 0 keeps its command:\n${field.join("\n")}`);
  assert.match(slots.find(l => /^⚔ Lucario/.test(l)) ?? "", /Aura Sphere → Hydreigon/, "slot 1 is planned around it");
}

// Slot 0 is locked into a spread move the foe standing in front of it can't be touched by (no Boomburst row for
// Hydreigon). The locked path resolves a spread move per foe like any other, so the line still says what the game
// will do to Snorlax instead of falling to the bare "locked in" that aims nowhere (#261).
{
  // With no Boomburst row into Hydreigon, Dragon Claw keeps Garchomp's pool against it non-empty — or `fake-turn`
  // falls back to approximated outcomes and hands Boomburst back.
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

// Garchomp is switching out to Metagross: the plan takes that as given.
{
  Object.assign(TABLE, { "Metagross>Meteor Mash>Hydreigon": [[200], 1, 2], "Metagross>Meteor Mash>Snorlax": [[90], 1, 1],
    "Hydreigon>Dark Pulse>Metagross": [[60], 1, 1], "Snorlax>Body Slam>Metagross": [[30], 1, 0.5] });
  const party = [...doublesParty(), mon("Metagross", 80, ["Steel", "Psychic"], [250, 180, 170, 120, 120, 70], [["Meteor Mash", "Steel", 90, "P"]], false)];
  const { lines, field } = render({ party, foes: hydreigonSnorlax(), live: true, double: true, dist: aimAtBoth, switches: () => new Map(), fieldIndex: 1, turnCommands: [{ command: 2, cursor: 2, args: [false] }] });
  console.log(`== doubles slot 0 switching (live)\n${lines.join("\n")}`);
  assert.ok(field.some(l => /^now: ⇄ Garchomp .*out › Metagross in/.test(l)), `the locked switch is the plan:\n${field.join("\n")}`);
  assert.ok(!field.some(l => /⚔ Garchomp/.test(l)), "Garchomp isn't planned to act");
}

// ---- Slot 1's card is planned around slot 0's command, not handed slot 0's card for the same turn (#544)
{
  Object.assign(TABLE, { "Garchomp>Thunder Punch>Toxapex": [[400], 1, 1], "Garchomp>Thunder Punch>Weezing": [[100], 1, 1] });
  const party = [
    mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130], [["Dragon Claw", "Dragon", 80, "P"], ["Thunder Punch", "Electric", 75, "P"]], true, undefined, { getBattlerIndex: () => 0 }),
    doublesParty()[1],
  ];
  const foes = [
    foeAt(2, "Weezing", 80, ["Poison"], [300, 100, 150, 120, 110, 60], [["Sludge Bomb", "Poison", 90, "S"]]),
    foeAt(3, "Toxapex", 80, ["Poison", "Water"], [300, 90, 180, 80, 180, 50], [["Scald", "Water", 80, "S"]]),
  ];
  const { scene } = render({ party, foes, live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
  const cardAt = (fieldIndex, turnCommands = []) => globalThis.__hud["60-card"].composeBattleCard(
    stubTurn({ party, foes, live: true, double: true, trainer: scene.facts.trainer, fieldIndex, turnCommands }), null);
  const aims = card => Object.fromEntries(card.field.slots.map(sl => [sl.name, sl.target?.name ?? null]));
  const slot0 = cardAt(0);
  // Thunder Punch into Toxapex, which the faster Garchomp KOs before Lucario moves.
  const slot1 = cardAt(1, [{ command: 0, cursor: 1, move: { move: 9, targets: [], useMode: 0 }, targets: [3] }]);
  assert.deepEqual(aims(slot0), { Garchomp: "Weezing", Lucario: "Toxapex" });
  assert.notEqual(slot1, slot0, "slot 1 gets a card of its own");
  assert.deepEqual(aims(slot1), { Garchomp: "Toxapex", Lucario: "Weezing" }, "slot 1 is planned around Garchomp's Thunder Punch");
}

// Protect: Hydreigon outspeeds and KOs Lucario, whose hit barely matters, but the faster Garchomp KOs Hydreigon first.
{
  Object.assign(TABLE, { "Garchomp>Dragon Claw>Hydreigon": [[400], 1, 2], "Hydreigon>Dark Pulse>Lucario": [[300], 1, 1], "Lucario>Aura Sphere>Snorlax": [[30], 1, 2] });
  const party = [
    mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130], [["Dragon Claw", "Dragon", 80, "P"]], true, undefined, { getBattlerIndex: () => 0 }),
    mon("Lucario", 80, ["Fighting", "Steel"], [240, 150, 110, 180, 110, 60], [["Aura Sphere", "Fighting", 80, "S"], ["Protect", "Normal", 0, "X", 4, { target: 0, attrs: ["ProtectAttr"], id: 182 }]], true, undefined, { getBattlerIndex: () => 1 }),
  ];
  const foes = hydreigonSnorlax();
  const dist = e => (e === foes[0] ? [{ name: "Dark Pulse", type: "Dark", p: 1, score: 10, targets: [1] }] : aimAtBoth(e));
  const { lines, field, scene } = render({ party, foes, live: true, double: true, dist, switches: () => new Map() });
  console.log(`== doubles protect (live)\n${lines.join("\n")}`);
  const info = scene.statusMoves(party[1], foes[0]).find(x => x.name === "Protect");
  assert.equal(globalThis.__planner.statusPlay(scene, party[1], foes[0], info), null, "a double offers no Protect status play with no lock running (#876)");
  const slots = slotLines(field);
  assert.match(slots.find(l => /^⚔ Lucario/.test(l)) ?? "", /Protect .*Garchomp KOs Hydreigon first/, `Lucario protects:\n${field.join("\n")}`);
  assert.ok(!/before it can act|💀/.test(slots.find(l => /^⚔ Lucario/.test(l)) ?? ""), `Protect blocks the hit it would be tagged for (#650):\n${field.join("\n")}`);
  assert.match(slots.find(l => /^⚔ Garchomp/.test(l)) ?? "", /Dragon Claw → Hydreigon/);

  // The turn after a Detect or a Quick Guard held, neither of them in Lucario's own moves: Protect is not offered.
  const protectMove = party[1].moveset[1].getMove();
  const tables = { moves: { 197: { ...protectMove, id: 197, name: "Detect" }, 501: { ...protectMove, id: 501, name: "Quick Guard", attrs: [] } } };
  for (const [id, name] of [[197, "Detect"], [501, "Quick Guard"]]) {
    party[1].getLastXMoves = () => [{ move: id, targets: [1], result: 1 }];
    const after = render({ party, foes, live: true, double: true, dist, switches: () => new Map(), tables });
    const lucario = slotLines(after.field).find(l => /^⚔ Lucario/.test(l)) ?? "";
    assert.ok(!/Protect/.test(lucario), `no Protect straight after a ${name} that held:\n${after.field.join("\n")}`);
  }
  // Before the game's tables load, the move is looked up in the member's moves.
  party[1].getLastXMoves = () => [{ move: 182, targets: [1], result: 1 }];
  const early = render({ party, foes, live: true, double: true, dist, switches: () => new Map() });
  assert.ok(!/Protect/.test(slotLines(early.field).find(l => /^⚔ Lucario/.test(l)) ?? ""), `no Protect straight after a Protect that held:\n${early.field.join("\n")}`);
  delete party[1].getLastXMoves;
}

// Helping Hand: Dragon Claw alone leaves Hydreigon standing, ×1.5 KOs it; Clefable's own hit adds nothing.
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

// ---- Drain (#90): a drain move wins back half of what it deals every turn.
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

// ---- The HP a duel costs is priced (#850): of two attacks that win the same race, the one that drains keeps more HP.
// Venusaur (200 of 280 HP) 3HKOs a 250 HP Snorlax with either Giga Drain (94–110) or Sludge Bomb (98–115), and Snorlax's
// Body Slam (~40) can't KO it before then.
Object.assign(TABLE, {
  "Venusaur>Giga Drain>Snorlax": [[110], 1, 1], "Venusaur>Sludge Bomb>Snorlax": [[115], 1, 1], "Snorlax>Body Slam>Venusaur": [[40], 1, 1],
});
{
  const drains = (a, d, pm, o) => { const x = outcome(a, d, pm, o); return x && pm.getName() === "Giga Drain" ? { ...x, drain: 0.5 } : x; };
  const venusaur = mon("Venusaur", 80, ["Grass", "Poison"], [280, 100, 120, 180, 120, 150], [["Sludge Bomb", "Poison", 90, "S"], ["Giga Drain", "Grass", 75, "S"]], true, 200);
  const snorlax = mon("Snorlax", 80, ["Normal"], [250, 150, 110, 80, 150, 30], [["Body Slam", "Normal", 85, "P"]], true);
  const bodySlam = () => [{ name: "Body Slam", type: "Normal", p: 1, score: 10, targets: [0] }];
  const field = render({ party: [venusaur], foes: [snorlax], live: true, dist: bodySlam, switches: () => new Map(), stubOutcome: drains }).field;
  console.log(`== hp kept\n${field.join("\n")}`);
  assert.match(lineOf(field, "Venusaur"), /Giga Drain → Snorlax/, `the drain keeps more HP for the same race:\n${field.join("\n")}`);
}

// ---- Tera switch-in (#823): our drain and Shell Bell come off the entry hit on our first use, the Tera'd move's after.
// Venusaur on 200 of 280 takes Body Slam (68–80); Giga Drain (42–50) lands at one typing and does 0 at the other.
{
  const venusaur = id => mon("Venusaur", 80, ["Grass", "Poison"], [280, 100, 120, 180, 120, 100], [["Giga Drain", "Grass", 75, "S"]], true, 200, { id });
  const snorlax = (id, hp, spe = 30) => mon("Snorlax", 80, ["Normal"], [900, 150, 110, 80, 150, spe], [["Body Slam", "Normal", 85, "P"]], true, hp, { id });
  const bodySlam = () => [{ name: "Body Slam", type: "Normal", p: 1, score: 10, targets: [0] }];
  const { scene: s } = render({ party: [venusaur("V")], foes: [snorlax("S")], live: true, dist: bodySlam, switches: () => new Map() });
  const { exchange } = globalThis.__planner;
  const gigaDrain = (dmg, drain) => {
    const at = outcomeFrom({ "Venusaur>Giga Drain>Snorlax": [[dmg], 1, dmg ? 1 : 0], "Snorlax>Body Slam>Venusaur": [[80], 1, 1] });
    return (a, d, pm, o) => { const x = at(a, d, pm, o); return x && pm.getName() === "Giga Drain" ? { ...x, drain } : x; };
  };
  // `teraLater` true for `foe`, whose base typing takes `entry`; the turn itself prices the Tera'd typing.
  const teraTurn = (foe, entry) => {
    const base = s.assuming([]);
    const withEntry = fn => { const keep = globalThis.__stub.outcome; globalThis.__stub.outcome = entry; try { return fn(); } finally { globalThis.__stub.outcome = keep; } };
    const atBase = { ...base, outcomes: (a, d) => withEntry(() => base.outcomes(a, d)) };
    return { ...s, teraLater: f => f === foe, assuming: () => atBase };
  };
  let n = 0;
  // `entry` / `tera`: Giga Drain's damage at the base typing and at the Tera; `tera` alone is a foe that never Teras.
  const race = ({ entry = null, tera, drain = 0, field = false, free = true, heal = null, foeHp, fieldSpe }) => {
    const id = `#823 ${n++}`, foe = snorlax(`Snorlax ${id}`, foeHp), me = venusaur(`Venusaur ${id}`);
    const keep = { outcome: globalThis.__stub.outcome, heal: globalThis.__stub.heal };
    Object.assign(globalThis.__stub, { outcome: gigaDrain(tera, drain), heal });
    const turn = entry == null ? s : teraTurn(foe, gigaDrain(entry, drain));
    try {
      return exchange(turn, me, me.moveset[0], foe, { free, ...(field ? { field: snorlax(`field Snorlax ${id}`, undefined, fieldSpe) } : {}) });
    } finally {
      Object.assign(globalThis.__stub, keep);
    }
  };
  const e = x => Math.round(x.eTurnsThey * 100) / 100;
  for (const field of [false, true]) {
    const kind = field ? "double" : "single";
    const plain = [0, 0.5].map(drain => e(race({ tera: 50, drain, field })));
    const tera = [0, 0.5].map(drain => e(race({ entry: 50, tera: 0, drain, field })));
    console.log(`== Tera switch-in drain (${kind})\nno Tera ${plain.join(" / ")}, Tera ${tera.join(" / ")}`);
    assert.deepEqual(plain, field ? [3, 4] : [4, 5], `${kind}: the move's drain every turn without a Tera`);
    assert.equal(tera[0], plain[0], `${kind}: no drain, no change`);
    assert.ok(tera[1] > tera[0], `${kind}: the entry hit's drain buys time on turn 1 (${tera})`);
    assert.ok(tera[1] < plain[1], `${kind}: the Tera'd move drains nothing after turn 1 (${tera[1]} vs ${plain[1]})`);
    // Shell Bell is a turn-end heal on what we dealt: half of it prices exactly as a drain of 0.5 does.
    const bell = (p, o) => (p.name === "Venusaur" ? Math.floor((o?.dealt ?? 0) / 2) : 0);
    const belled = e(race({ entry: 50, tera: 0, field, heal: bell }));
    assert.equal(belled, tera[1], `${kind}: Shell Bell heals on the entry hit's damage on turn 1 and the Tera'd move's after`);
    // Reverse: the base typing is immune, the Tera'd one takes the hit.
    const rev = [0, 0.5].map(drain => e(race({ entry: 0, tera: 50, drain, field })));
    assert.equal(rev[0], plain[0], `${kind}: reverse, no drain`);
    assert.ok(rev[1] > rev[0] && rev[1] < plain[1], `${kind}: no drain on turn 1, the move's from turn 2 (${rev} vs ${plain})`);
    assert.equal(e(race({ entry: 0, tera: 50, field, heal: bell })), rev[1], `${kind}: no Shell Bell dealt on turn 1`);
  }
  // The expected HP left takes the entry hit's drain: it knocks out a Snorlax on 40 after a faster field foe hits us.
  const left = drain => race({ entry: 50, tera: 0, drain, field: true, foeHp: 40, fieldSpe: 200 }).expectedHpLeft;
  assert.equal(left(0.5) - left(0), 20, "half the 40 the entry hit deals comes back");
  // Not a free switch-in: no entry hit, the Tera'd move all the way.
  const paid = drain => e(race({ entry: 50, tera: 0, drain, free: false }));
  assert.equal(paid(0.5), paid(0), "a paid switch-in prices the Tera'd move on every use");
}

// ---- On-KO boosts (#90): a foe with Beast Boost gets stronger for every KO we feed it.
// Read off the ability (game-code.md §18).
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

  // A close call: Mamoswine (150 HP, a speed tie) needs three Earthquakes (136–160) to Buzzwole's two Lunges, while
  // Crobat resists Lunge (~6 % coming in) but chips slowly with Wing Attack. Staying is a coin flip that loses Mamoswine
  // about half the time, priced at a mon lost and the HP the duel costs (#850): it is failing with or without the boost,
  // so both switch to Crobat, and the switch line says why it's cheap.
  Object.assign(TABLE, { "Buzzwole>Lunge>Crobat": [[20], 1, 0.25], "Crobat>Wing Attack>Buzzwole": [[45], 1, 4], "Mamoswine>Earthquake>Buzzwole": [[160], 1, 1] });
  const tied = mon("Mamoswine", 80, ["Ice", "Ground"], [300, 200, 100, 70, 80, 150], [["Earthquake", "Ground", 100, "P"]], true, 150);
  const crobat = mon("Crobat", 80, ["Poison", "Flying"], [300, 150, 110, 80, 150, 250], [["Wing Attack", "Flying", 60, "P"]], false);
  const pivot = extra => render({ party: [tied, crobat], foes: [buzzwole(extra)], live: true, dist: lunge, switches: () => new Map() }).field;
  const boosted = pivot({}), plain = pivot({ hasAbilityWithAttr: () => false });
  console.log(`${boosted.join("\n")}\n-- without Beast Boost\n${plain.join("\n")}`);
  for (const [field, why] of [[boosted, "with the boost"], [plain, "without the boost"]]) {
    assert.match(field.find(l => /^now: ⇄/.test(l)) ?? "", /Mamoswine out › Crobat in · takes ~6% · resists Lunge/, `switch to Crobat ${why}:\n${field.join("\n")}`);
  }
}

// ---- The summary's second danger level: a likely KO after our mon acts, naming what it is saved for (#90).
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
  assert.equal(sum.plan, "likely lost · 💀 Buzzwole KOs 3/6 · nobody KOs Buzzwole 1-on-1 — maximise damage before it comes in, chip it with Crobat · Mamoswine goes down before Buzzwole comes in");
  assert.deepEqual(cardSummary({ ...m, field: { ...m.field, slots: [{ ...m.field.slots[0], threat: threat("risk", false) }] } }).danger, []);
  // `saveFor` also reads the foes only this mon beats (#170).
  const only = { ...m, teamPlan: { ...m.teamPlan, reserve: [], only: [{ name: "Mamoswine", for: [{ name: "Xurkitree" }, { name: "Buzzwole" }] }] } };
  assert.equal(cardSummary(only).danger[0].saveFor, "Xurkitree, Buzzwole");
}

// ---- Guzma w165 (#170): the ⚔ line prices spending the one mon the fight plan holds back.
// Mamoswine is the only answer to Xurkitree (faster, immune to Discharge, Ground hits it ×2) and the only one that
// beats Buzzwole, both still on the bench.
Object.assign(TABLE, {
  "Mamoswine>Precipice Blades>Mega Golisopod": [[180], 1, 1], "Mamoswine>Precipice Blades>Xurkitree": [[500], 1, 2],
  "Mamoswine>Precipice Blades>Buzzwole": [[200], 1, 1],
  "Golduck>Surf>Mega Golisopod": [[150], 1, 1], "Golduck>Surf>Xurkitree": [[100], 1, 1], "Golduck>Surf>Buzzwole": [[130], 1, 1],
  "Metagross>Meteor Mash>Mega Golisopod": [[110], 1, 0.5], "Metagross>Meteor Mash>Xurkitree": [[120], 1, 1],
  "Metagross>Meteor Mash>Buzzwole": [[100], 1, 1],
  // Iron Head is ×2 into Mamoswine's Ice half and takes it in one.
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

  // Turn 1: Precipice Blades needs three hits through Mega Golisopod's two boss bars, and Iron Head takes Mamoswine
  // in one right after it acts — spending the only Xurkitree answer.
  {
    const { lines, field } = at({ field: "Mamoswine" });
    console.log(`== guzma w165 turn 1 (live)\n${lines.join("\n")}`);
    assert.ok(!field.some(l => /^⚔ Mamoswine/.test(l)), `turn 1 must not spend Mamoswine on Golisopod:\n${field.join("\n")}`);
    // Metagross, not Golduck: Iron Head is ×0.5 into it.
    assert.match(field.find(l => /^now: ⇄/.test(l)) ?? "", /Mamoswine .*out › Metagross in · takes ~\d+% · resists Iron Head/, `something else comes in:\n${field.join("\n")}`);
    assert.ok(lines.some(l => /^🔒 Mamoswine only answer to Xurkitree/.test(l)), `the plan names what Mamoswine is for:\n${lines.join("\n")}`);
  }

  // Turn 1 with the later foes gone: nothing is being saved, so the switch above is the fight plan's doing alone.
  {
    const { party, foes } = guzma({ field: "Mamoswine" });
    const { field } = render({ party, foes: [foes[0]], live: true, dist: ironHead, switches: () => new Map() });
    console.log(`== guzma w165 turn 1, no later foes (live)\n${field.join("\n")}`);
    assert.match(lineOf(field, "Mamoswine"), /Precipice Blades → Mega Golisopod/, `with nothing to save it for, Mamoswine attacks:\n${field.join("\n")}`);
  }

  // Turn 3: Golduck, on 23 HP and poisoned, goes down this turn anyway, so a switch pays an entry hit for what a faint
  // brings in free.
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
// A `RANDOM_NEAR_ENEMY` command of ours draws its target first (game-code.md §6), so the prediction is for that draw:
// `replay` confidence, marked `~`.
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
    // Our side sees both foes, which is what gives a random target two near enemies to be drawn between.
    for (const p of party) p.getOpponents = () => foes;
    const exactRow = (name, type) => [{ name, type, p: 1, score: null, exact: true, targets: [0], targetDist: [{ battlerIndex: 0, p: 1 }] }];
    return render({ party, foes, live: true, double: true, switches: () => new Map(),
      dist: e => (e.name === "Gyarados" ? exactRow("Waterfall", "Water") : exactRow("Triple Axel", "Ice")) });
  };

  const plain = build(3);
  const gyaradosRow = plain.card.rows.find(r => r.name === "Gyarados");
  assert.equal(gyaradosRow.likely.confidence, "exact", "a command that draws nothing leaves the answer exact");
  assert.equal(gyaradosRow.likely.p, null, "an exact move is named as fact — no `% likely` to show");
  const plainLine = plain.lines.find(l => l.startsWith("↯")) ?? plain.lines.find(l => l.includes("Waterfall")) ?? "";
  assert.ok(!plainLine.includes("~"), `nothing to mark on an exact row:\n${plain.lines.join("\n")}`);

  const drawn = build(7);
  const drawnRow = drawn.card.rows.find(r => r.name === "Gyarados");
  assert.equal(drawnRow.likely.confidence, "replay", "our random-target command draws before the enemy decides");
  assert.equal(drawnRow.likely.p, null, "still not a `% likely`: it is the answer for this command");
  assert.ok(drawn.lines.some(l => l.includes("Waterfall") && l.includes("~")), `the row carries the mark:\n${drawn.lines.join("\n")}`);
}

// ---- At slot 1's prompt slot 0's committed random target is not drawn again (#476)
{
  const random = { target: 7 };
  const build = (fieldIndex, turnCommands = []) => {
    const party = [
      mon("Morpeko", 80, ["Electric", "Dark"], [220, 150, 90, 120, 100, 170], [["Aura Wheel", "Electric", 110, "P", 0, random]], true, 180),
      mon("Scrafty", 80, ["Dark", "Fighting"], [254, 152, 172, 63, 165, 80], [["High Jump Kick", "Fighting", 130, "P", 0, random]], true, 133, { getBattlerIndex: () => 1 }),
    ];
    const foes = [
      mon("Gyarados", 82, ["Water", "Flying"], [250, 170, 110, 80, 130, 150], [["Waterfall", "Water", 80, "P"]], true),
      mon("Weavile", 84, ["Dark", "Ice"], [300, 250, 100, 60, 110, 299], [["Triple Axel", "Ice", 20, "P"]], true),
    ];
    for (const p of party) p.getOpponents = () => foes;
    const exactRow = (name, type) => [{ name, type, p: 1, score: null, exact: true, targets: [0], targetDist: [{ battlerIndex: 0, p: 1 }] }];
    const { scene } = render({ party, foes, live: true, double: true, switches: () => new Map(), fieldIndex, turnCommands,
      dist: e => (e.name === "Gyarados" ? exactRow("Waterfall", "Water") : exactRow("Triple Axel", "Ice")) });
    const [morpeko, scrafty] = party;
    const threat = me => globalThis.__planner.threatFrom(scene, foes[0], me, me.moveset[0]).confidence;
    return { slot0: threat(morpeko), slot1: threat(scrafty) };
  };
  assert.equal(build(0).slot0, "replay", "at slot 0's prompt its random target is still to be drawn");
  // Slot 0 committed Aura Wheel (game-code.md §6).
  const committed = build(1, [{ command: 0, cursor: 0, move: { move: 1, targets: [] }, targets: [2] }]);
  assert.equal(committed.slot0, "exact", "slot 0's committed draw is spent: nothing to draw again");
  assert.equal(committed.slot1, "replay", "slot 1's own random target is still to be drawn");
}

// ---- A lock that knocks out carries its last uses onto the trainer's next mon (game-code.md §5).
// Outrage 1HKOs Gyarados moving first, so 1 or 2 uses are left, each half the time. Each confused turn of the 2.5 is
// lost a third of the time and hits Dragonite for ((2·80/5 + 2)·40/50 + 2)·0.925 = 27.01 of its 400.
Object.assign(TABLE, {
  "Dragonite>Outrage>Gyarados": [[400], 1, 2], "Dragonite>Dragon Claw>Gyarados": [[200], 1, 2],
  "Dragonite>Outrage>Altaria": [[200], 1, 2], "Altaria>Peck>Dragonite": [[10], 1, 1],
  "Dragonite>Outrage>Snorlax": [[100], 1, 1], "Dragonite>Outrage>Clefable": [[0], 1, 0],
  "Dragonite>Outrage>Skarmory": [[100], 1, 0.5], "Dragonite>Fire Punch>Skarmory": [[400], 1, 2],
  "Gyarados>Waterfall>Dragonite": [[20], 1, 0.5],
});
{
  const dragonite = moves => mon("Dragonite", 80, ["Dragon", "Flying"], [400, 200, 200, 100, 150, 200], moves, true);
  const outrage = ["Outrage", "Dragon", 120, "P", 0, { target: 7 }];
  const locks = (atk, def, pm, opts) => {
    const o = outcome(atk, def, pm, opts);
    return o && pm.getName() === "Outrage" ? { ...o, traits: { ...o.traits, lock: true } } : o;
  };
  const bench = name => mon(name, 80, ["Normal"], [500, 100, 100, 100, 100, 50], [["Tackle", "Normal", 40, "P"]], false);
  const gyarados = () => mon("Gyarados", 82, ["Water", "Flying"], [250, 170, 110, 80, 130, 150], [["Waterfall", "Water", 80, "P"]], true);
  const costWith = (benchNames, moves = [outrage]) => {
    const me = dragonite(moves);
    const foes = [gyarados(), ...benchNames.map(bench)];
    const { scene: s } = render({ party: [me], foes, live: true, switches: () => new Map(), stubOutcome: locks });
    return globalThis.__planner.exchange(s, me, me.moveset[0], foes[0]).cost;
  };
  const confused = 2.5 / 3 * (1 + 27.01 / 400);
  const alone = costWith([]), snorlax = costWith(["Snorlax"]), clefable = costWith(["Clefable"]);
  const skarmory = costWith(["Skarmory"], [outrage, ["Fire Punch", "Fire", 75, "P"]]);
  console.log(`== a knockout carries the lock: alone ${alone.toFixed(3)} · Snorlax ${snorlax.toFixed(3)} · Clefable ${clefable.toFixed(3)} · Skarmory ${skarmory.toFixed(3)}`);
  assert.ok(Math.abs(alone - 0.1) < 1e-9, `no mon left to carry onto (${alone})`);
  assert.ok(Math.abs(snorlax - (0.1 + confused)) < 1e-3, `the uses land, then confusion (${snorlax})`);
  assert.ok(Math.abs(clefable - (0.1 + 1 + confused / 2)) < 1e-3, `immune: a lost turn, and confusion when it was the last use (${clefable})`);
  assert.ok(Math.abs(skarmory - (0.1 + confused + 1.5 * 0.75)) < 1e-3, `resisted: each forced use loses ¾ of Fire Punch (${skarmory})`);

  // The lock carries onto the mon the game sends in at the HPs on the field (#464): Clefable's type scores beat
  // Snorlax's, but at 30 % HP and slower than our full-HP Dragonite its score is halved below Snorlax's.
  {
    const scored = (name, hp, typeScore) => mon(name, 80, ["Normal"], [500, 100, 100, 100, 100, 50], [["Tackle", "Normal", 40, "P"]], false, hp, { typeScore, getMatchupScore: benchMatchupScore });
    const me = dragonite([outrage]);
    const foes = [gyarados(), scored("Clefable", 150, 5), scored("Snorlax", 500, 2)];
    const { scene: s } = render({ party: [me], foes, live: true, switches: () => new Map(), stubOutcome: locks });
    const cost = globalThis.__planner.exchange(s, me, me.moveset[0], foes[0]).cost;
    assert.ok(Math.abs(cost - snorlax) < 1e-9, `the lock carries onto Snorlax, not Clefable (${cost}; Snorlax ${snorlax}, Clefable ${clefable})`);
  }

  const pick = benchNames => {
    const me = dragonite([outrage, ["Dragon Claw", "Dragon", 80, "P"]]);
    const { field } = render({ party: [me], foes: [gyarados(), ...benchNames.map(bench)], live: true, switches: () => new Map(), stubOutcome: locks });
    return field.find(l => /^⚔ Dragonite/.test(l)) ?? field.join("\n");
  };
  assert.match(pick([]), /Outrage/, "the 1HKO, with nobody to carry onto");
  assert.match(pick(["Clefable"]), /Dragon Claw/, "two hits, rather than a lock that carries into an immune Clefable");

  // A 2HKO: a 2-use lock runs down on the knockout and confuses into the next duel, a 3-use one carries one use.
  const twoHits = benchNames => {
    const me = dragonite([outrage]);
    const foes = [mon("Altaria", 80, ["Dragon", "Flying"], [250, 100, 100, 100, 100, 100], [["Peck", "Flying", 35, "P"]], true), ...benchNames.map(bench)];
    const { scene: s } = render({ party: [me], foes, live: true, switches: () => new Map(), stubOutcome: locks,
      dist: e => (e === foes[0] ? [{ name: "Peck", type: "Flying", p: 1, score: 10, targets: [0] }] : []) });
    return globalThis.__planner.exchange(s, me, me.moveset[0], foes[0]).cost;
  };
  const twoSnorlax = twoHits(["Snorlax"]), twoClefable = twoHits(["Clefable"]);
  console.log(`== a 2HKO lock: Snorlax ${twoSnorlax.toFixed(3)} · Clefable ${twoClefable.toFixed(3)}`);
  assert.ok(Math.abs(twoSnorlax - (0.1 + confused)) < 1e-3, `confused either way (${twoSnorlax})`);
  assert.ok(Math.abs(twoClefable - (0.1 + 0.5 + confused)) < 1e-3, `immune: the carried use is lost, and it was the last (${twoClefable})`);

  // A 3HKO carries the lock as it stands when the third use lands, not as any use going off then leaves it. The third
  // use here is a self-hit ⅙ of the time.
  Object.assign(TABLE, { "Dragonite>Outrage>Kingdra": [[200], 1, 2], "Kingdra>Peck>Dragonite": [[10], 1, 1] });
  const threeHits = benchNames => {
    const me = dragonite([outrage]);
    const foes = [mon("Kingdra", 80, ["Water", "Dragon"], [450, 100, 100, 100, 100, 100], [["Peck", "Flying", 35, "P"]], true), ...benchNames.map(bench)];
    const { scene: s } = render({ party: [me], foes, live: true, switches: () => new Map(), stubOutcome: locks,
      dist: e => (e === foes[0] ? [{ name: "Peck", type: "Flying", p: 1, score: 10, targets: [0] }] : []) });
    return globalThis.__planner.exchange(s, me, me.moveset[0], foes[0]).cost;
  };
  const selfHit = 1 + 27.01 / 400, third = 27.01 / 400 / 6;
  const threeSnorlax = threeHits(["Snorlax"]), threeClefable = threeHits(["Clefable"]);
  console.log(`== a 3HKO lock: Snorlax ${threeSnorlax.toFixed(4)} · Clefable ${threeClefable.toFixed(4)}`);
  assert.ok(Math.abs(threeSnorlax - (0.1 + third + 1559 / 1944 * selfHit)) < 1e-3, `the lock as the knockout left it (${threeSnorlax})`);
  assert.ok(Math.abs(threeClefable - (0.1 + third + 32 / 81 + 56 / 81 * selfHit)) < 1e-3, `immune (${threeClefable})`);

  // A lock started on a later turn is on its first use: Flygon's last two hits after a Dragon Claw land as surely from
  // Outrage as from another Dragon Claw.
  const me = dragonite([["Dragon Claw", "Dragon", 80, "P"], outrage]);
  const flygon = mon("Flygon", 80, ["Ground", "Dragon"], [250, 100, 100, 100, 100, 100], [["Peck", "Flying", 35, "P"]], true);
  Object.assign(TABLE, { "Dragonite>Dragon Claw>Flygon": [[100], 1, 1], "Dragonite>Outrage>Flygon": [[100], 1, 1], "Flygon>Peck>Dragonite": [[10], 1, 1] });
  const { scene: s } = render({ party: [me], foes: [flygon], live: true, switches: () => new Map(), stubOutcome: locks,
    dist: e => (e === flygon ? [{ name: "Peck", type: "Flying", p: 1, score: 10, targets: [0] }] : []) });
  const { turn1 } = globalThis.__planner.exchange(s, me, me.moveset[0], flygon);
  const [claw, lock] = me.moveset.map(pm => globalThis.__planner.exchange(s, me, pm, flygon, { hp: turn1.hp, after: turn1, next: true }).eTurnsWe);
  assert.ok(Math.abs(lock - claw) < 1e-9, `no confusion before the lock's third use (${lock} vs ${claw})`);
}

// ---- A foe's lock lands its uses left on our switch-in, then it is confused and picks its own move (game-code.md §5).
// Three landed hits fell either switch-in. Confused for 1–4 uses after its lock, a quarter of the time each, the foe
// loses each of them a third of the time.
// Skarmory takes Outrage's two left, then waits on one: 3 + ⅓ + ¾/9 + ½/27 + ¼/81 = 3 + 71/162 turns. Clefable stops
// the lock on turn 1 and takes the Fire Blast the foe then picks, unconfused while uses were left: 4 turns. Spending
// its last use on Clefable confuses it from the next use on, three landed then taking 617/162 more turns.
// Switched in by choice, the entry hit was a locked use already: Clefable faces the Fire Blast at once, and Skarmory's
// one use left leaves two to land, 599/162.
Object.assign(TABLE, {
  "Salamence>Outrage>Skarmory": [[100], 1, 0.5], "Salamence>Outrage>Clefable": [[0], 1, 0],
  "Salamence>Fire Blast>Skarmory": [[100], 1, 2], "Salamence>Fire Blast>Clefable": [[100], 1, 2],
  "Skarmory>Tackle>Salamence": [[1], 1, 1], "Clefable>Tackle>Salamence": [[1], 1, 1],
  "Salamence>Outrage>Bronzong": [[50], 1, 0.5], "Salamence>Fire Blast>Bronzong": [[999], 1, 2],
  "Salamence>Outrage>Steelix": [[50], 1, 0.5], "Salamence>Fire Blast>Steelix": [[999], 1, 2],
  "Bronzong>Tackle>Salamence": [[1], 1, 1], "Steelix>Tackle>Salamence": [[1], 1, 1],
});
{
  const benched = name => mon(name, 80, ["Normal"], [250, 100, 100, 100, 100, 50], [["Tackle", "Normal", 40, "P"]], false);
  const turnsFor = (name, left, entered = false) => {
    const me = benched(name);
    const salamence = mon("Salamence", 80, ["Dragon", "Flying"], [9999, 200, 100, 100, 100, 100],
      [["Outrage", "Dragon", 120, "P", 0, { target: 7, id: 200 }], ["Fire Blast", "Fire", 110, "S", 0, { id: 126 }]], true, undefined,
      { getTag: t => (t === "FRENZY" ? { turnCount: left } : null), getMoveQueue: () => [{ move: 200, targets: [0], useMode: 2 }] });
    const replay = (_e, _target, opts) => [{ name: opts?.afterLock ? "Fire Blast" : "Outrage", type: "Dragon", p: 1 }];
    const { scene: s } = render({ party: [benched("Dragonite"), me], foes: [salamence], live: true, switches: () => new Map(), replay });
    return globalThis.__planner.exchange(s, me, me.moveset[0], salamence, { next: true, entered }).eTurnsThey;
  };
  const skarmory = turnsFor("Skarmory", 2), clefable = turnsFor("Clefable", 2), lastUse = turnsFor("Clefable", 1);
  console.log(`== a foe's lock on our switch-in: Skarmory ${skarmory.toFixed(4)} · Clefable ${clefable.toFixed(4)} · its last use ${lastUse.toFixed(4)}`);
  assert.ok(Math.abs(skarmory - (3 + 71 / 162)) < 1e-9, `two locked uses, then a confused foe (${skarmory})`);
  assert.ok(Math.abs(clefable - 4) < 1e-9, `immune: the lock ends, and the foe picks again (${clefable})`);
  assert.ok(Math.abs(lastUse - (1 + 617 / 162)) < 1e-9, `its last use spent on Clefable still confuses it (${lastUse})`);
  const inSkarmory = turnsFor("Skarmory", 2, true), inClefable = turnsFor("Clefable", 2, true), inLast = turnsFor("Clefable", 1, true);
  console.log(`== switched into a foe's lock: Skarmory ${inSkarmory.toFixed(4)} · Clefable ${inClefable.toFixed(4)} · its last use ${inLast.toFixed(4)}`);
  assert.ok(Math.abs(inSkarmory - 599 / 162) < 1e-9, `the entry hit spent one of the two (${inSkarmory})`);
  assert.ok(Math.abs(inClefable - 3) < 1e-9, `the entry hit ended the lock (${inClefable})`);
  assert.ok(Math.abs(inLast - 617 / 162) < 1e-9, `the entry hit was its last use: confused at once (${inLast})`);

  // Outrage takes five or six uses to fell Bronzong; the Fire Blast the foe picks itself takes one, after two Outrages:
  // 3 + 71/162 turns. Steelix, switched into the lock's last use, meets it at once: 1 + 71/162.
  const bronzong = turnsFor("Bronzong", 2), steelix = turnsFor("Steelix", 1, true);
  console.log(`== a foe's own pick once its lock runs down: Bronzong ${bronzong.toFixed(4)} · Steelix ${steelix.toFixed(4)}`);
  assert.ok(Math.abs(bronzong - (3 + 71 / 162)) < 1e-9, `two Outrages, then the foe's Fire Blast (${bronzong})`);
  assert.ok(Math.abs(steelix - (1 + 71 / 162)) < 1e-9, `the entry hit ran it down: Fire Blast from the first use (${steelix})`);
}

// ---- Bug Bite and Pluck eat one of the target's berries, drawn uniformly over the types it holds (#646)
Object.assign(TABLE, { "Beedrill>Bug Bite>Shuckle": [[150], 1, 1], "Beedrill>Pound>Shuckle": [[150], 1, 1], "Shuckle>Brine>Beedrill": [[20], 1, 1] });
{
  const BERRY = { SITRUS: 0, LUM: 1, ENIGMA: 2, LIECHI: 3 };
  const berryItem = (berryType, n = 1) => Object.assign(new ({ BerryModifier: class { getStackCount() { return this.n; } } }).BerryModifier(), { berryType, n, isTransferable: true });
  // What the turn-end model prices for a held berry (10-damage.js's `endOfTurnSteps`): a Sitrus heals a quarter, once a
  // holder however tall its stack. No other berry here heals at all.
  const sitrusHeal = p => (p.getHeldItems().some(m => m.constructor.name === "BerryModifier" && m.berryType === BERRY.SITRUS) ? Math.floor(p.getMaxHp() / 4) : 0);
  // The outcome stub fabricates traits, so carry the move's own attr names as 07-move-traits does.
  const withAttrs = (a, d, pm, o) => {
    const x = outcome(a, d, pm, o);
    return x && { ...x, traits: { ...x.traits, attrNames: new Set(pm.getMove().attrs.map(at => at.constructor.name)) } };
  };
  const BUG_BITE = ["Bug Bite", "Bug", 60, "P", 0, { attrs: ["StealEatBerryAttr"] }];
  const beedrill = hp => mon("Beedrill", 80, ["Bug", "Poison"], [400, 180, 90, 100, 100, 200], [BUG_BITE, ["Pound", "Normal", 40, "P"]], true, hp);
  const shuckle = (items, extra, maxHp, spe = 5) => mon("Shuckle", 80, ["Bug", "Rock"], [maxHp, 10, 230, 10, 230, spe], [["Brine", "Water", 65, "S"]], true, undefined,
    { getHeldItems: () => items, ...extra });
  // `move`: 0 Bug Bite, 1 Pound. `stole`: a berry an earlier turn of a depth-2 line already ate.
  // `self`: what each use of ours costs us; `full`: the whole exchange back; `burnt`: a berry type a `lessBerry` patch
  // has already taken off the foe.
  const bite = (items, { hp = 200, move = 0, stole = 0, foeHp = 280, foeSpe = 5, thiefAttr = null, thiefTag = null, self = 0, full = false, burnt = null, ...extra } = {}) => {
    const me = beedrill(hp), foe = shuckle(items, extra, foeHp, foeSpe);
    if (thiefAttr) {
      const own = me.hasAbilityWithAttr?.bind(me);
      me.hasAbilityWithAttr = a => a === thiefAttr || !!own?.(a);
    }
    if (thiefTag) {
      const own = me.getTag?.bind(me);
      me.getTag = t => (t === thiefTag ? { tagType: t } : own?.(t) ?? null);
    }
    const stub = (a, d, pm, o) => {
      const x = withAttrs(a, d, pm, o);
      return x && self && a === me ? { ...x, self } : x;
    };
    const { scene } = render({ party: [me], foes: [foe], live: true, switches: () => new Map(), stubOutcome: stub,
      heal: sitrusHeal, dist: () => [{ name: "Brine", type: "Water", p: 1, score: 10, targets: [0] }] });
    const at = burnt == null ? scene : scene.assuming([{ mon: foe, lessBerry: burnt }]);
    const x = globalThis.__planner.exchange(at, me, me.moveset[move], foe, { stole });
    return full ? x : { turnsWe: x.turnsWe, hp: x.expectedHpLeft, stole: Math.round(x.stole * 1e4) / 1e4 };
  };
  // The heal we eat, on its own. A 160 HP Shuckle falls to the second use whether its Sitrus heals or not, so the whole
  // difference between Bug Bite and the plain Pound beside it is the berry we ate.
  const gain = (items, opts = {}) => {
    const [stolen, asPlain] = [0, 1].map(move => bite(items, { ...opts, move, foeHp: 160 }));
    assert.equal(stolen.turnsWe, asPlain.turnsWe, `the knockout turn has to match to isolate the heal (${stolen.turnsWe} vs ${asPlain.turnsWe})`);
    return stolen.hp - asPlain.hp;
  };
  const row = (label, r) => console.log(`${label.padEnd(26)} turnsWe ${r.turnsWe} · our HP ${r.hp} · P(steal) ${r.stole}`);
  console.log("== bug bite eats a berry");

  // A Sitrus-only holder, our Bug Bite user missing HP: the heal is ours now, and the foe's turn ends lose it. `plain`
  // is the same hit with no steal on it — Pound's 150 into the same Shuckle — which is how Bug Bite was priced before.
  const plain = bite([berryItem(BERRY.SITRUS)], { move: 1 });
  const sitrus = bite([berryItem(BERRY.SITRUS)]);
  row("Sitrus x1, Pound instead", plain);
  row("Sitrus x1", sitrus);
  assert.equal(sitrus.stole, 1, "a sure hit on a berry holder is a sure steal");
  assert.equal(plain.turnsWe - sitrus.turnsWe, 1, "the foe's later Sitrus heals go with the berry");
  console.log(`we eat: Sitrus ${gain([berryItem(BERRY.SITRUS)])} · at 350/400 ${gain([berryItem(BERRY.SITRUS)], { hp: 350 })}`
    + ` · beside a Lum ${gain([berryItem(BERRY.SITRUS), berryItem(BERRY.LUM)])} · a Sitrus x2 beside a Lum ${gain([berryItem(BERRY.SITRUS, 2), berryItem(BERRY.LUM)])}`
    + ` · beside a Liechi ${gain([berryItem(BERRY.SITRUS), berryItem(BERRY.LIECHI)])}`);
  const [besideLum, lumBurnt] = [{}, { burnt: BERRY.LUM }].map(o => gain([berryItem(BERRY.SITRUS), berryItem(BERRY.LUM)], o));
  console.log(`we eat beside a Lum: ${besideLum} · with that Lum burnt ${lumBurnt}`);
  assert.equal(lumBurnt, gain([berryItem(BERRY.SITRUS)]), "a Lum a cured status burnt is not there to draw (#834)");
  assert.equal(gain([berryItem(BERRY.SITRUS)]), 100, "we eat the quarter we had room for");
  // …capped by the room we have: 50 missing, not the quarter.
  assert.equal(gain([berryItem(BERRY.SITRUS)], { hp: 350 }), 50, "no heal above max HP");

  // Two berry types are one half each, whatever the stacks.
  const twoTypes = bite([berryItem(BERRY.SITRUS), berryItem(BERRY.LUM)]);
  const stacked = bite([berryItem(BERRY.SITRUS, 2), berryItem(BERRY.LUM)]);
  const diluted = bite([berryItem(BERRY.SITRUS), berryItem(BERRY.LIECHI)]);
  row("Sitrus x1 + Lum x1", twoTypes);
  row("Sitrus x2 + Lum x1", stacked);
  row("Sitrus x1 + Liechi x1", diluted);
  assert.equal(gain([berryItem(BERRY.SITRUS), berryItem(BERRY.LUM)]), 50, "one draw in two is the Sitrus: half the heal");
  assert.equal(gain([berryItem(BERRY.SITRUS, 2), berryItem(BERRY.LUM)]), 50, "a stack of two is still one entry in the draw, not two");
  assert.equal(gain([berryItem(BERRY.SITRUS), berryItem(BERRY.LIECHI)]), 50, "a berry the model prices at nothing still dilutes the draw");
  assert.deepEqual(diluted, twoTypes, "Liechi and Lum dilute the same: neither is worth anything to either side");

  // Sticky Hold, no berry and a target behind a substitute are each priced exactly as a hit of the same damage that
  // steals nothing.
  const none = bite([]);
  const sticky = bite([berryItem(BERRY.SITRUS)], { hasAbilityWithAttr: a => a === "BlockItemTheftAbAttr" });
  const behind = bite([berryItem(BERRY.SITRUS)], { getTag: t => (t === "SUBSTITUTE" ? { tagType: t } : null) });
  const exposed = bite([berryItem(BERRY.SITRUS)], { getTag: () => null });
  row("nothing held", none);
  row("Sitrus x1, Sticky Hold", sticky);
  row("Sitrus x1, behind a sub", behind);
  assert.deepEqual(none, bite([], { move: 1 }), "no berry: priced as the plain hit it is");
  assert.deepEqual(sticky, plain, "Sticky Hold keeps the berry, even on a knockout");
  assert.deepEqual(behind, plain, "the substitute is hit, so the berry is never reached");
  assert.deepEqual(exposed, sitrus, "…and no substitute steals as before");

  // Depth 2: the second Bug Bite of a line draws from what the first left, and the first steal is never counted twice.
  // A Sitrus x1 holder has nothing left to lose, so the follow-up gains nothing and its turn ends are already short of
  // the heal — the same baseline a repeated non-stealing move sees, which is what `deeper` compares against.
  const again = bite([berryItem(BERRY.SITRUS)], { stole: 1 });
  const repeat = bite([berryItem(BERRY.SITRUS)], { move: 1, stole: 1 });
  row("Sitrus x1, one already ate", again);
  row("…and Pound follows it", repeat);
  assert.equal(gain([berryItem(BERRY.SITRUS)], { stole: 1 }), 0, "the berry turn 1 ate is not eaten again");
  assert.equal(again.turnsWe, sitrus.turnsWe, "nor is its loss counted twice in the foe's turn ends");
  assert.deepEqual([repeat.turnsWe, repeat.hp], [again.turnsWe, again.hp], "`deeper`'s repeat baseline reads the same steal");
  // A Sitrus x2 holder has one left: the second steal is what eats it.
  row("Sitrus x2", bite([berryItem(BERRY.SITRUS, 2)]));
  row("Sitrus x2, one already ate", bite([berryItem(BERRY.SITRUS, 2)], { stole: 1 }));
  assert.equal(gain([berryItem(BERRY.SITRUS, 2)], { stole: 1 }), 100, "the second steal eats the second Sitrus");
  // …and the carry itself, composed as `deeper` composes it: turn 1's exchange, then the follow-up from the HP it left.
  const follow = items => {
    const me = beedrill(200), foe = shuckle(items, {}, 280);
    const { scene } = render({ party: [me], foes: [foe], live: true, switches: () => new Map(), stubOutcome: withAttrs,
      heal: sitrusHeal, dist: () => [{ name: "Brine", type: "Water", p: 1, score: 10, targets: [0] }] });
    const pm = me.moveset[0], x = globalThis.__planner.exchange(scene, me, pm, foe), t1 = x.turn1;
    const step = stole => globalThis.__planner.exchange(scene, me, pm, foe, { hp: t1.hp, after: t1, next: true, stole }).expectedHpLeft;
    return { carried: step(x.stole), forgotten: step(0) };
  };
  const chained = follow([berryItem(BERRY.SITRUS)]);
  console.log(`depth 2: the follow-up leaves us ${chained.carried} HP (${chained.forgotten} if turn 1's steal were forgotten)`);
  assert.ok(chained.carried < chained.forgotten, `forgetting turn 1's steal would pay the follow-up for the same berry twice (${chained.carried} vs ${chained.forgotten})`);

  // The steal's heal is a function of the turn, and adding it to the turn end's part ahead of the berries made a string
  // of it, so a thief whose own Enigma a super-effective hit fed lost that turn's whole turn end (#646, #652).
  const fedThief = move => {
    const se = TABLE["Shuckle>Brine>Beedrill"];
    TABLE["Shuckle>Brine>Beedrill"] = [[120], 1, 2];
    try {
      const me = Object.assign(beedrill(200), { getHeldItems: () => [berryItem(BERRY.ENIGMA)] }), foe = shuckle([berryItem(BERRY.SITRUS)], {}, 160);
      const { scene } = render({ party: [me], foes: [foe], live: true, switches: () => new Map(), stubOutcome: withAttrs,
        heal: sitrusHeal, dist: () => [{ name: "Brine", type: "Water", p: 1, score: 10, targets: [0] }] });
      return +globalThis.__planner.exchange(scene, me, me.moveset[move], foe).eTurnsThey.toFixed(3);
    } finally { TABLE["Shuckle>Brine>Beedrill"] = se; }
  };
  const [fedBite, fedPound] = [0, 1].map(fedThief);
  console.log(`our Enigma fed beside the steal: they need ${fedBite} into Bug Bite, ${fedPound} into Pound`);
  assert.ok(fedBite > fedPound, `the Sitrus we eat still buys a turn on the turn our Enigma heals (${fedBite} vs ${fedPound})`);

  // What the holder's own turn ends lose, read off the course the exchange builds for it — with the count pinned to
  // exactly k berries gone, so the single draw's expectation shows plainly. A Sitrus x2 holder keeps a turn-end Sitrus
  // after one steal and loses it on the second; two types are one half each; a Liechi dilutes like a Lum.
  const { berryGone, turnEndCourse } = globalThis.__planner;
  const { scene: courseScene } = render({ party: [beedrill(200)], foes: [shuckle([berryItem(BERRY.SITRUS)], {}, 280)], live: true,
    switches: () => new Map(), stubOutcome: withAttrs, heal: sitrusHeal, dist: () => [{ name: "Brine", type: "Water", p: 1, score: 10, targets: [0] }] });
  const atTurn = (items, k) => {
    const foe = shuckle(items, {}, 280);
    const eaten = { byCount: berryGone(foe, sitrusHeal).byCount, counts: () => Array.from({ length: k + 1 }, (_, i) => (i === k ? 1 : 0)) };
    return turnEndCourse(courseScene, foe, null, -1, 0, eaten).at(1);
  };
  const turnEnd = (label, items) => console.log(`${label.padEnd(26)} turn end: none gone ${atTurn(items, 0)} · one gone ${atTurn(items, 1)} · two gone ${atTurn(items, 2)}`);
  turnEnd("Sitrus x1", [berryItem(BERRY.SITRUS)]);
  turnEnd("Sitrus x2", [berryItem(BERRY.SITRUS, 2)]);
  turnEnd("Sitrus x1 + Lum x1", [berryItem(BERRY.SITRUS), berryItem(BERRY.LUM)]);
  turnEnd("Sitrus x2 + Lum x1", [berryItem(BERRY.SITRUS, 2), berryItem(BERRY.LUM)]);
  turnEnd("Sitrus x1 + Liechi x1", [berryItem(BERRY.SITRUS), berryItem(BERRY.LIECHI)]);
  assert.equal(atTurn([berryItem(BERRY.SITRUS)], 1), 0, "the only Sitrus gone: no turn-end heal");
  assert.equal(atTurn([berryItem(BERRY.SITRUS, 2)], 1), 70, "a Sitrus x2 holder keeps one turn-end Sitrus after one steal");
  assert.equal(atTurn([berryItem(BERRY.SITRUS, 2)], 2), 0, "…and loses it on the second");
  assert.equal(atTurn([berryItem(BERRY.SITRUS), berryItem(BERRY.LUM)], 1), 35, "two types, one half each");
  assert.equal(atTurn([berryItem(BERRY.SITRUS), berryItem(BERRY.LIECHI)], 1), 35, "a Liechi takes its share of the draw and gives nothing back");
  assert.equal(atTurn([berryItem(BERRY.SITRUS, 2), berryItem(BERRY.LUM)], 1), 70, "Sitrus x2 beside a Lum: one half each, and neither draw costs the heal");
  assert.equal(atTurn([berryItem(BERRY.SITRUS)], 0), 70, "nothing gone yet, nothing lost");

  // `berryGone` on its own, the form #647 will call for a berry it can name. The uniform draw averages over the types;
  // a named berry prices that one only, and nothing at all when the holder doesn't hold it.
  const holder = items => ({ name: "holder", hp: 280, getMaxHp: () => 280, getHeldItems: () => items });
  const gone = (items, opts) => berryGone(holder(items), sitrusHeal, { eater: holder([]), hp: 180, ...opts });
  const show = (label, g) => console.log(`${label.padEnd(26)} ${g ? `types ${g.types.join()} · supply ${g.supply} · lost ${g.lost} · eaten ${Math.round(g.eaten * 100) / 100}` : "nothing to lose"}`);
  show("draw: Sitrus x1", gone([berryItem(BERRY.SITRUS)]));
  show("draw: Sitrus x2", gone([berryItem(BERRY.SITRUS, 2)]));
  show("draw: Sitrus + Liechi", gone([berryItem(BERRY.SITRUS), berryItem(BERRY.LIECHI)]));
  show("named: Sitrus of a x2", gone([berryItem(BERRY.SITRUS, 2)], { berry: BERRY.SITRUS }));
  show("named: Liechi beside it", gone([berryItem(BERRY.SITRUS), berryItem(BERRY.LIECHI)], { berry: BERRY.LIECHI }));
  show("named: a Lum it lacks", gone([berryItem(BERRY.SITRUS)], { berry: BERRY.LUM }));
  const { eatenAt, eatenFirst, ...one } = gone([berryItem(BERRY.SITRUS)]);
  assert.deepEqual(one, { types: [BERRY.SITRUS], byCount: [70, 0, 0, 0, 0, 0, 0, 0, 0, 0], supply: 1, lost: -70, eaten: 70 });
  assert.deepEqual([eatenAt, eatenFirst].map(a => a.slice(0, 2)), [[70, 0], [70, 0]], "one Sitrus, eaten on the first draw");
  assert.equal(gone([berryItem(BERRY.SITRUS, 2)]).lost, 0, "a stack of two keeps the heal");
  assert.equal(gone([berryItem(BERRY.SITRUS, 2)]).supply, 2, "…and has two to lose in all");
  assert.deepEqual(gone([berryItem(BERRY.SITRUS), berryItem(BERRY.LIECHI)]).lost, -35, "half the draw takes the Sitrus");
  assert.equal(gone([berryItem(BERRY.SITRUS, 2)], { berry: BERRY.SITRUS }).lost, 0, "the named berry off a stack of two");
  assert.equal(gone([berryItem(BERRY.SITRUS), berryItem(BERRY.LIECHI)], { berry: BERRY.SITRUS }).eaten, 70, "a named Sitrus is the whole heal");
  assert.equal(gone([berryItem(BERRY.SITRUS), berryItem(BERRY.LIECHI)], { berry: BERRY.LIECHI }).eaten, 0, "a named Liechi is worth nothing here");
  assert.equal(gone([berryItem(BERRY.SITRUS)], { berry: BERRY.LUM }), null, "a berry it doesn't hold");
  assert.equal(gone([]), null, "no berry at all");

  // Each draw is from what the earlier ones left: Sitrus x1 + Lum x2 has one Sitrus to give over three steals.
  const draws = gone([berryItem(BERRY.SITRUS), berryItem(BERRY.LUM, 2)]).eatenAt.slice(0, 4);
  console.log(`draws: Sitrus x1 + Lum x2     ${draws.join(" · ")}`);
  assert.deepEqual(draws, [35, 17.5, 17.5, 0], "one Sitrus in all, spread over the three draws");
  assert.deepEqual(gone([berryItem(BERRY.SITRUS, 2), berryItem(BERRY.LUM)]).eatenAt.slice(0, 3).reduce((t, x) => t + x, 0), 140, "two Sitrus in all");
  // A thief at full HP has no room on turn 1, but a later steal still heals it.
  const fullHp = bite([berryItem(BERRY.SITRUS, 2)], { hp: 400 }), blockedHp = bite([berryItem(BERRY.SITRUS, 2)], { hp: 400, thiefTag: "HEAL_BLOCK" });
  console.log(`we eat from full HP, Sitrus x2: ${fullHp.hp - blockedHp.hp} over a Heal Blocked thief`);
  assert.equal(fullHp.turnsWe, blockedHp.turnsWe);
  assert.ok(fullHp.hp > blockedHp.hp, `the second Sitrus heals a thief the foe has hit since (${fullHp.hp} vs ${blockedHp.hp})`);
  assert.ok(fullHp.hp - blockedHp.hp <= 20, `moving first, it eats before each Brine: one 20 HP hit back at most (${fullHp.hp - blockedHp.hp})`);
  // At full HP on turn 1, a thief that moves first has no room yet; one the foe hits first does.
  const fromFull = foeSpe => {
    const [ate, blocked] = [null, "HEAL_BLOCK"].map(thiefTag => bite([berryItem(BERRY.SITRUS)], { hp: 400, foeSpe, thiefTag }));
    assert.equal(ate.turnsWe, blocked.turnsWe);
    return ate.hp - blocked.hp;
  };
  const [first, second] = [fromFull(5), fromFull(500)];
  console.log(`we eat from full HP, Sitrus x1: moving first ${first} · moving second ${second}`);
  assert.equal(first, 0, "eaten at full HP, before any hit");
  assert.ok(second > 0, `eaten after the foe's hit made room (${second})`);
  // The heal is capped at max HP turn by turn: two stolen Sitrus can't refill more than the foe has taken by then.
  const twice = bite([berryItem(BERRY.SITRUS, 2)], { hp: 400, foeHp: 600 });
  console.log(`two Sitrus from full HP over a long fight: ${twice.hp}/400 after ${twice.turnsWe} turns`);
  assert.ok(twice.hp < 400, `not refilled to the brim by a heal that overflowed on an earlier turn (${twice.hp})`);
  // Ripen doubles the quarter; Heal Block stops it.
  const eater = attr => ({ getMaxHp: () => 280, hasAbilityWithAttr: a => a === attr, getTag: t => (attr === t ? { tagType: t } : null) });
  const eatBy = attr => berryGone(holder([berryItem(BERRY.SITRUS)]), sitrusHeal, { eater: eater(attr), hp: 0 }).eaten;
  const pouchLum = berryGone(holder([berryItem(BERRY.LUM)]), sitrusHeal, { eater: eater("HealFromBerryUseAbAttr"), hp: 0 }).eaten;
  console.log(`eaten: plain ${eatBy(null)} · Ripen ${eatBy("DoubleBerryEffectAbAttr")} · Heal Block ${eatBy("HEAL_BLOCK")} · Cheek Pouch ${eatBy("HealFromBerryUseAbAttr")}, off a Lum ${pouchLum}`);
  assert.deepEqual([eatBy(null), eatBy("DoubleBerryEffectAbAttr"), eatBy("HEAL_BLOCK"), eatBy("HealFromBerryUseAbAttr"), pouchLum], [70, 140, 0, 163, 93],
    "Cheek Pouch adds a third of max HP for any berry");
  // Mold Breaker gets past Sticky Hold, Infiltrator past a substitute; neither helps the other way round.
  const { berryStealable } = globalThis.__planner;
  const sitrusFoe = extra => shuckle([berryItem(BERRY.SITRUS)], extra, 280);
  const stickyFoe = sitrusFoe({ hasAbilityWithAttr: a => a === "BlockItemTheftAbAttr" });
  const subFoe = sitrusFoe({ getTag: t => (t === "SUBSTITUTE" ? { tagType: t } : null) });
  const thief = attr => ({ hasAbilityWithAttr: a => a === attr });
  const reach = [[stickyFoe, null], [stickyFoe, "MoveAbilityBypassAbAttr"], [stickyFoe, "InfiltratorAbAttr"],
    [subFoe, null], [subFoe, "InfiltratorAbAttr"], [subFoe, "MoveAbilityBypassAbAttr"]].map(([f, a]) => berryStealable(f, thief(a)));
  console.log(`reach: sticky ${reach.slice(0, 3).join()} · sub ${reach.slice(3).join()}`);
  assert.deepEqual(reach, [false, true, false, false, true, false]);
  const breaker = bite([berryItem(BERRY.SITRUS)], { hasAbilityWithAttr: a => a === "BlockItemTheftAbAttr", thiefAttr: "MoveAbilityBypassAbAttr" });
  assert.deepEqual(breaker, sitrus, "a Mold Breaker Bug Bite eats a Sticky Hold foe's berry like any other");

  // The game draws per berry type, so past the walk's nine draws too (#833): Sitrus x1 + Lum x11 keeps its Sitrus through
  // nine coin flips, (1/2)^9, and the 10th draw is one more.
  const tenth = gone([berryItem(BERRY.SITRUS), berryItem(BERRY.LUM, 11)]).eatenAt[9];
  console.log(`the 10th draw off Sitrus x1 + Lum x11: ${tenth}`);
  assert.equal(tenth, 70 / 1024, "a type-uniform draw, not the mean berry left");
  // Healing Charm scales the eaten heal, through the heal phase it goes through (#833).
  const charm = new ({ HealingBoosterModifier: class { multiplier = 1.1; getStackCount() { return 2; } } }).HealingBoosterModifier();
  const charmed = attr => berryGone(holder([berryItem(BERRY.SITRUS)]), sitrusHeal, { eater: eater(attr), hp: 0, turn: { facts: { modifiers: [charm] } } }).eaten;
  console.log(`eaten under Healing Charm x2: plain ${charmed(null)} · Cheek Pouch ${charmed("HealFromBerryUseAbAttr")}`);
  assert.deepEqual([charmed(null), charmed("HealFromBerryUseAbAttr")], [84, 84 + 111], "70 and 93, each × 1.2 and floored");
  // Turn 1's room, moving first, is what our own use has already cost us (#833): a contact chip of 30 from full HP.
  const se = TABLE["Shuckle>Brine>Beedrill"];
  try {
    TABLE["Shuckle>Brine>Beedrill"] = [[140], 1, 1];
    const chipped = thiefTag => bite([berryItem(BERRY.SITRUS)], { hp: 400, foeHp: 600, self: 30, thiefTag, full: true }).turnsThey;
    const [ate, blocked] = [chipped(null), chipped("HEAL_BLOCK")];
    console.log(`from full HP, chipped 30 by our own Bug Bite: down on turn ${ate} (${blocked} Heal Blocked)`);
    // Four uses' chip off the top leaves the curve 280; 280 − 140 + 30 − 140 stands through turn 2.
    assert.deepEqual([ate, blocked], [3, 2], "the 30 our chip opened is healed back, which buys a turn");
    // A faster thief eats each later steal before the hit, so near full HP the heal fills only the room left (#833).
    TABLE["Shuckle>Brine>Beedrill"] = [[89], 1, 1];
    const late = thiefTag => bite([berryItem(BERRY.SITRUS, 2)], { hp: 400, foeHp: 2000, thiefTag, full: true }).turnsThey;
    const [twice, none] = [late(null), late("HEAL_BLOCK")];
    console.log(`a faster thief from full HP, Sitrus x2 into Brine: down on turn ${twice} (${none} Heal Blocked)`);
    // Brine's rolls average 82, so five fell a 400 HP thief. The second Sitrus, eaten before turn 2's hit, refills only
    // the 82 turn 1 took: one hit more. At the turn's end it would have refilled 100, and the curve read turn 7.
    assert.deepEqual([twice, none], [6, 5], "the second Sitrus heals the room the first hit opened, not its quarter");
    // A slower thief that Brine's every roll fells before it moves steals nothing (#833).
    TABLE["Shuckle>Brine>Beedrill"] = [[140], 1, 1];
    const felled = bite([berryItem(BERRY.SITRUS)], { hp: 100, foeHp: 120, foeSpe: 500 });
    console.log(`a slower thief one-shot before it moves: ${felled.hp} HP left`);    assert.equal(felled.hp, 0, "no stolen heal lifts a thief that never moved");
  } finally { TABLE["Shuckle>Brine>Beedrill"] = se; }
}

// ---- Gordie W180 T7: Leavanny's Bug Bite into the six-berry Carracosta, and whether the ⚔ call flips (#646)
Object.assign(TABLE, {
  "Leavanny>Leaf Storm>Carracosta": [[520], 0.9, 4], "Leavanny>Bug Bite>Carracosta": [[90], 1, 1],
  "Carracosta>Rock Slide>Leavanny": [[180], 0.9, 4], "Carracosta>Brine>Leavanny": [[60], 1, 1],
});
{
  const berryItem = berryType => Object.assign(new ({ BerryModifier: class { getStackCount() { return 1; } } }).BerryModifier(), { berryType, isTransferable: true });
  const CARRACOSTA_BERRIES = [10, 4, 2, 9, 3, 5];
  const call = steals => {
    const leavanny = mon("Leavanny", 174, ["Bug", "Grass"], [497, 373, 337, 295, 335, 413],
      [["Leaf Storm", "Grass", 130, "S"], ["Bug Bite", "Bug", 60, "P", 0, { attrs: steals ? ["StealEatBerryAttr"] : [] }]], true, 320,
      {}, { statStages: [0, 0, -2, 0, 0, 0, 0], types: [] });
    const carracosta = mon("Carracosta", 169, ["Water", "Rock"], [467, 412, 533, 302, 314, 180],
      [["Rock Slide", "Rock", 75, "P"], ["Brine", "Water", 65, "S"]], true, undefined,
      { getHeldItems: () => CARRACOSTA_BERRIES.map(berryItem), hasTrainer: () => true });
    const withAttrs = (a, d, pm, o) => {
      const x = outcome(a, d, pm, o);
      return x && { ...x, traits: { ...x.traits, attrNames: new Set(pm.getMove().attrs.map(at => at.constructor.name)) } };
    };
    // No `heal`: Carracosta holds no Sitrus, and `turnEndHp` is never asked with a super-effective hit behind it, so
    // its Enigma is worth nothing at turn end — the steal shows up only as the quarter Leavanny eats.
    const { field, scene } = render({ party: [leavanny], foes: [carracosta], live: true, switches: () => new Map(), stubOutcome: withAttrs,
      dist: () => [{ name: "Rock Slide", type: "Rock", p: 1, score: 10, targets: [0] }] });
    const line = lineOf(field, "Leavanny");
    const score = pm => {
      const x = globalThis.__planner.exchange(scene, leavanny, pm, carracosta);
      return { name: pm.getName(), turnsWe: x.turnsWe, turnsThey: x.turnsThey, eTurnsThey: +x.eTurnsThey.toFixed(3), stole: x.stole ?? 0 };
    };
    return { pick: /Bug Bite/.test(line) ? "Bug Bite" : /Leaf Storm/.test(line) ? "Leaf Storm" : line,
      rows: leavanny.moveset.map(score) };
  };
  const priced = call(true), asPlainDamage = call(false);
  const show = r => `${r.pick} (${r.rows.map(x => `${x.name}: we need ${x.turnsWe}, they need ${x.turnsThey} (${x.eTurnsThey}), P(steal) ${x.stole}`).join(" · ")})`;
  console.log(`== gordie w180 t7: Leavanny into the incoming Carracosta\nas plain damage: ${show(asPlainDamage)}\nwith the steal:  ${show(priced)}`);
  console.log(`the ⚔ call ${priced.pick === asPlainDamage.pick ? `does not flip: still ${priced.pick}` : `flips to ${priced.pick}`}`);
  assert.deepEqual(priced.rows[0], asPlainDamage.rows[0], "Leaf Storm, which steals nothing, must be priced the same either way");
  assert.equal(asPlainDamage.rows[1].stole, 0, "without the attr there is no steal to price");
  assert.equal(priced.rows[1].stole, 1, "Bug Bite lands for sure here, so its one draw is certain");
  assert.ok(priced.rows[1].eTurnsThey > asPlainDamage.rows[1].eTurnsThey, `the sixth of a quarter Leavanny eats must buy it turns: ${priced.rows[1].eTurnsThey} vs ${asPlainDamage.rows[1].eTurnsThey}`);
}

// ---- A foe's held Lum cures our status at this turn's end, so the status play is a one-turn play (#647).
// `BerryPhase` runs at turn end before the status chip, so a Toxic or a burn into a Lum holder never deals anything,
// and nothing of the status reaches a later turn. A sleep or a paralysis still costs the foe this turn's move if we
// moved first. All the play leaves behind is the berry it burnt, priced by #646's `berryGone`.
// Two scenes, both read off `fieldPlan`'s pick for the slot. In the first Vileplume's Giga Drain takes six turns on
// Machamp's 300 HP against a Close Combat that chips it for 40, and whether the status is worth its turn decides the
// call. In the second Giga Drain does nothing at all, so the status play is the slot's only option and its ⚔ line is
// there to read whatever the play is worth.
Object.assign(TABLE, { "Machamp>Close Combat>Vileplume": [[40], 1, 1], "Vileplume>Giga Drain>Machamp": [[50], 1, 1] });
{
  const BERRY = { SITRUS: 0, LUM: 1 };
  const berryItem = (berryType, n = 1) => Object.assign(new ({ BerryModifier: class { getStackCount() { return this.n; } } }).BerryModifier(), { berryType, n, isTransferable: true });
  const TOXIC = ["Toxic", "Poison", 0, "X", 0, { id: 92, attrs: [["StatusEffectAttr", { effect: 2 }]] }];
  const WAVE = ["Thunder Wave", "Electric", 0, "X", 0, { id: 86, attrs: [["StatusEffectAttr", { effect: 3 }]] }];
  const GIGA_DRAIN = ["Giga Drain", "Grass", 75, "S"];
  // The turn-end stub chips a toxic'd mon a quarter of its HP, fast enough that a lasting Toxic alone wins a fight
  // Vileplume cannot otherwise touch. A Lum cures the status before any turn end, so a cured one is worth none of it.
  const toxicChip = p => (p.status?.effect === 2 ? -Math.floor(p.getMaxHp() / 4) : 0);
  const vileplume = (moves, spe) => mon("Vileplume", 80, ["Grass", "Poison"], [250, 180, 100, 90, 100, spe], moves, true);
  const machamp = items => mon("Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 50], [["Close Combat", "Fighting", 120, "P"]], true, undefined,
    { getHeldItems: () => items });
  // `drain`: what Giga Drain deals. 0 leaves the slot with nothing that damages, so the status play is its only option.
  const scene = (moves, items, spe, { drain = 50, stubOutcome = outcome, ourAttr = null } = {}) => {
    TABLE["Vileplume>Giga Drain>Machamp"] = [[drain], 1, drain ? 1 : 0];
    const me = vileplume(moves, spe), foe = machamp(items);
    if (ourAttr) {
      const own = me.hasAbilityWithAttr?.bind(me);
      me.hasAbilityWithAttr = a => a === ourAttr || !!own?.(a);
    }
    const { scene: s, field } = render({ party: [me], foes: [foe], live: true, switches: () => new Map(), heal: toxicChip, stubOutcome,
      dist: () => [{ name: "Close Combat", type: "Fighting", p: 1, score: 10, targets: [0] }] });
    return { s, me, foe, field };
  };
  // Machamp is slower at Vileplume's default 60 Speed and faster at 40.
  const playFor = (move, items, spe = 60, ourAttr = null) => {
    const { s, me, foe } = scene([GIGA_DRAIN, move], items, spe, { ourAttr });
    return globalThis.__planner.statusPlay(s, me, foe, s.statusMoves(me, foe).find(x => x.name === move[0]));
  };
  const shape = p => (!p ? "no play" : [`note ${p.note ?? "—"}`,
    `patches ${p.patches ? p.patches.map(x => (x.status ? `${x.mon.name} status ${x.status.effect}` : `${x.mon.name} less berry ${x.lessBerry}`)).join() : "—"}`,
    `skip0 ${Math.round((p.skip0 ?? 0) * 1e4) / 1e4}`, `foeAct ${p.foeAct ? "yes" : "—"}`, `gain ${p.gain ?? 0}`].join(" · "));
  const lum = n => [berryItem(BERRY.LUM, n)];
  for (const [what, move, items] of [
    ["Toxic, bare foe", TOXIC, []], ["Toxic, Lum x1", TOXIC, lum(1)], ["Toxic, Lum x2", TOXIC, lum(2)],
    ["Toxic, Sitrus only", TOXIC, [berryItem(BERRY.SITRUS)]], ["Toxic, Sitrus + Lum", TOXIC, [berryItem(BERRY.SITRUS), berryItem(BERRY.LUM)]],
    ["Spore, bare foe", SPORE, []], ["Spore, Lum x1", SPORE, lum(1)],
    ["Thunder Wave, bare foe", WAVE, []], ["Thunder Wave, Lum x1", WAVE, lum(1)],
  ]) console.log(`play: ${what.padEnd(23)} ${shape(playFor(move, items))}`);
  // Our Unnerve stops the foe eating its Lum, so the status lasts as on a bare foe.
  const unnerved = playFor(TOXIC, lum(1), 60, "PreventBerryUseAbAttr");
  console.log(`play: ${"Toxic, Lum x1, Unnerve".padEnd(23)} ${shape(unnerved)}`);
  assert.equal(shape(unnerved), shape(playFor(TOXIC, [])), "an Unnerved Lum holder takes a lasting Toxic");

  // A lasting status writes itself into the follow-up and keeps costing the foe attempts; a Lum-cured one writes only
  // the Lum it burnt and asks nothing of any later turn.
  const bareToxic = playFor(TOXIC, []), lumToxic = playFor(TOXIC, lum(1));
  assert.ok(bareToxic.patches?.length === 1 && bareToxic.note === "toxic", `a bare foe prices Toxic exactly as before: ${shape(bareToxic)}`);
  assert.equal(shape({ patches: lumToxic.patches }).split(" · ")[1], "patches Machamp less berry 1", "a Lum holder takes no status patch, only its Lum gone (#834)");
  assert.equal(lumToxic.foeAct, null, "…and nothing of it reaches a later turn");
  assert.equal(lumToxic.skip0, 0, "Toxic costs the foe no attempt even on the turn it lands");
  assert.equal(lumToxic.note, null, "…so the play has no status note to show");
  const { lessBerry, berryTypesOf } = globalThis.__planner;
  const held = machamp(lum(2));
  assert.equal(shape(lumToxic.again), "note toxic · patches Machamp less berry 1,Machamp status 2 · skip0 0 · foeAct — · gain 0",
    "burning a lone Lum opens the foe to a lasting Toxic next turn");
  assert.equal(playFor(TOXIC, [berryItem(BERRY.SITRUS)]).patches?.length, 1, "a foe holding no Lum is priced as before");

  // Sleep keeps this turn's skipped attempt and drops the later ones.
  const lumSpore = playFor(SPORE, lum(1)), bareSpore = playFor(SPORE, []);
  assert.equal(lumSpore.skip0, 1, "a sleep that lands before the slower Lum holder moves still costs it this turn");
  assert.equal(lumSpore.foeAct, null, "…but no later turn: the Lum cures it at this turn's end");
  assert.ok(bareSpore.foeAct && bareSpore.patches, `a bare foe still sleeps on: ${shape(bareSpore)}`);
  assert.equal(playFor(WAVE, lum(1)).skip0, 1 / 8, "a paralysis a Lum cures still rolls full para on the turn it lands");

  // A Lum x2 holder is priced the same one-turn way, and one Lum is left standing for the next status.
  const twice = playFor(TOXIC, lum(2));
  assert.deepEqual([twice.patches.length, twice.foeAct, twice.again], [1, null, null], `a Lum x2 holder opens nothing for next turn: ${shape(twice)}`);
  assert.deepEqual(berryTypesOf(lessBerry(held, BERRY.LUM)), [BERRY.LUM], "burning one of two leaves the second, so two statuses are needed before one sticks");

  const { withPatches } = globalThis.__hud["25-turn"];
  const stacks = p => p.getHeldItems().map(m => `${m.berryType}x${m.getStackCount()}`).join(",");
  const lumSitrus = machamp([berryItem(BERRY.SITRUS), berryItem(BERRY.LUM, 2)]);
  const during = [BERRY.LUM, BERRY.SITRUS].map(b => withPatches([{ mon: lumSitrus, lessBerry: b }], () => stacks(lumSitrus)));
  console.log(`patch: lessBerry Lum ${during[0]} · Sitrus ${during[1]} · after ${stacks(lumSitrus)}`);
  assert.deepEqual(during, ["0x1,1x1", "1x2"], "a stack of two keeps one; the last one goes");
  assert.equal(stacks(lumSitrus), "0x1,1x2", "the patch is undone after the call");

  // Scene 1: what the slot is actually told to do, and the score it was told it on. A play worth nothing loses to
  // Giga Drain.
  const picked = (move, items, spe, drain) => {
    const { s, me, foe, field } = scene([GIGA_DRAIN, move], items, spe, { drain });
    const [p] = globalThis.__planner.fieldPlan(s, [me], [foe], false).picks;
    return { name: p.move?.name ?? null, effect: p.effect ?? "", score: Math.round(p.score * 1e4) / 1e4, line: lineOf(field, "Vileplume") };
  };
  const rows = [
    ["Toxic, bare foe", TOXIC, [], 60], ["Toxic, Lum x1", TOXIC, lum(1), 60],
    ["Spore, bare foe, slower than it", SPORE, [], 40], ["Spore, Lum x1, slower than it", SPORE, lum(1), 40],
    ["Spore, Lum x2, slower than it", SPORE, lum(2), 40], ["Spore, Sitrus only, slower", SPORE, [berryItem(BERRY.SITRUS)], 40],
  ].map(([what, move, items, spe]) => [what, picked(move, items, spe)]);
  for (const [what, p] of rows) console.log(`pick: ${what.padEnd(31)} ${p.name} · effect "${p.effect}" · score ${p.score}`);
  const by = what => rows.find(([w]) => w === what)[1];
  // A lasting Toxic's chip wins a fight Giga Drain loses; a cured one deals nothing, so attacking is the call again.
  assert.equal(by("Toxic, bare foe").name, "Toxic", "a lasting Toxic is worth the turn it spends");
  assert.equal(by("Toxic, Lum x1").name, "Giga Drain", "a Toxic a Lum cures buys no chip and no later turn, so it loses to attacking");
  // A sleep from a slower user skips nothing this turn, so a cured one is worth only its burnt Lum.
  assert.equal(by("Spore, bare foe, slower than it").name, "Spore", "a lasting sleep keeps costing the foe attempts");
  assert.equal(by("Spore, Lum x1, slower than it").name, "Spore", "burning the last Lum opens a lasting sleep a turn on");
  assert.equal(by("Spore, Lum x2, slower than it").name, "Giga Drain", "a burnt Lum with a second behind it opens nothing");
  assert.equal(by("Spore, Sitrus only, slower").score, by("Spore, bare foe, slower than it").score, "a foe with no Lum prices exactly as before");

  // Against a Giga Drain of 40 a lasting Toxic wins by enough to pay for the turn a cured one spends (#834).
  const twiceOver = [lum(1), lum(2)].map(items => picked(TOXIC, items, 60, 40));
  console.log(`burnt: Lum x1 ${twiceOver[0].name} · score ${twiceOver[0].score} · Lum x2 ${twiceOver[1].name} · score ${twiceOver[1].score}`);
  assert.equal(twiceOver[0].name, "Toxic", "burning a lone Lum opens Machamp to the Toxic that sticks");
  assert.equal(twiceOver[1].name, "Giga Drain", "a second Lum cures that one too, so the first opens nothing");

  // The follow-up after a cured play (#834): Knock Off's 40 needs a held item, else it is 26 to Sludge Bomb's 32.
  const KNOCK_OFF = ["Knock Off", "Dark", 65, "P"], SLUDGE_BOMB = ["Sludge Bomb", "Poison", 90, "S"];
  TABLE["Vileplume>Sludge Bomb>Machamp"] = [[32], 1, 1];
  const knocks = (atk, def, pm, o) => {
    if (pm.getName() === "Knock Off") TABLE["Vileplume>Knock Off>Machamp"] = [[def.getHeldItems().length ? 40 : 26], 1, 1];
    return outcome(atk, def, pm, o);
  };
  const thenOf = items => {
    const { s, me, foe } = scene([KNOCK_OFF, SLUDGE_BOMB, TOXIC], items, 60, { drain: 0, stubOutcome: knocks });
    const [p] = globalThis.__planner.fieldPlan(s, [me], [foe], false).picks;
    return `${p.move?.name} then ${p.then?.name ?? "—"}`;
  };
  const [lumOnly, lumBesideSitrus] = [thenOf(lum(1)), thenOf([berryItem(BERRY.SITRUS), berryItem(BERRY.LUM)])];
  console.log(`follow: Lum x1 ${lumOnly} · Sitrus + Lum ${lumBesideSitrus}`);
  assert.equal(lumOnly, "Toxic then Sludge Bomb", "with its only item burnt, Knock Off has no boost left to find");
  assert.equal(lumBesideSitrus, "Toxic then Knock Off", "a Sitrus still held keeps Knock Off's boost");

  // Scene 2: the slot has nothing that damages, so the status play is the call whatever it is worth, and the ⚔ line
  // is there to read. It keeps the play and drops the status note — no new line, no tail.
  const alone = (items, spe = 60) => picked(SPORE, items, spe, 0);
  const cured = alone(lum(1)), lasting = alone([]);
  console.log(`== lum: the ⚔ line for a sleep it cures (live)\n${cured.line}\n== lum: …and for one that lasts (live)\n${lasting.line}`);
  assert.match(lasting.line, /Spore → Machamp .*sleep/, `a lasting status still names itself:\n${lasting.line}`);
  assert.match(cured.line, /Spore → Machamp/, `the play is still the call:\n${cured.line}`);
  assert.ok(!/sleep/.test(cured.line), `no status note for a status the Lum cures this turn:\n${cured.line}`);
  assert.equal(cured.effect, "", "the note is empty, not a bare accuracy tail");
  assert.equal(alone(lum(2)).score, cured.score, "…and a Lum x2 holder is the same play again");

  // Doubles take the same shape: `playCandidate` reads the one-turn play off the same `statusPlay`. The field is
  // #262's — Breloom's Spore into a Machamp neither of ours can dent, with Salamence finishing Munchlax. Faster than
  // Machamp, a bare one is still slept. Slower, a Lum-holding one is not worth the turn, and with Spore its only move
  // Breloom sleeps a bare Machamp but not a Lum holder (#862).
  Object.assign(TABLE, {
    "Breloom>Seed Bomb>Machamp": [[60], 1, 1], "Breloom>Seed Bomb>Munchlax": [[60], 1, 1],
    "Salamence>Dragon Claw>Machamp": [[60], 1, 1], "Salamence>Dragon Claw>Munchlax": [[400], 1, 1],
    "Machamp>Close Combat>Breloom": [[400], 1, 1], "Machamp>Close Combat>Salamence": [[300], 1, 1],
    "Munchlax>Body Slam>Breloom": [[30], 1, 1], "Munchlax>Body Slam>Salamence": [[30], 1, 1],
  });
  const pair = (items, party = sporeParty()) => {
    const foes = [
      mon("Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 140], [["Close Combat", "Fighting", 120, "P"]], true, undefined,
        { getBattlerIndex: () => 2, getHeldItems: () => items }),
      mon("Munchlax", 80, ["Normal"], [300, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]], true, undefined, { getBattlerIndex: () => 3 }),
    ];
    const { field } = render({ party, foes, live: true, double: true, dist: aimAtBoth, switches: () => new Map() });
    return lineOf(field, "Breloom");
  };
  const [bare, lumHeld] = [pair([], sporeParty(150)), pair(lum(1))];
  console.log(`== lum: a double's status play, bare foe (live)\n${bare}\n== lum: …and into a Lum holder (live)\n${lumHeld}`);
  assert.match(bare, /Spore → Machamp .*sleep/, `a bare foe is still the double's Spore target:\n${bare}`);
  assert.ok(!/Spore/.test(lumHeld), `a sleep a Lum cures is not worth the double's turn:\n${lumHeld}`);
  const [sporeBare, sporeLum] = [pair([], sporeParty(100, [SPORE])), pair(lum(1), sporeParty(100, [SPORE]))];
  console.log(`== lum: a double's only move is Spore, bare foe (live)\n${sporeBare}\n== lum: …and a Lum holder (live)\n${sporeLum}`);
  assert.match(sporeBare, /Spore → Machamp .*sleep/, `with nothing else to do, a bare foe is slept:\n${sporeBare}`);
  assert.ok(!/→ Machamp/.test(sporeLum), `…and a Lum holder is not:\n${sporeLum}`);

  // A double's `STATUS_CANDS` cut (#834): the game AI ranks both of Breloom's plays into the Lum-holding Machamp first,
  // and Munchlax is the one hitting hard.
  Object.assign(TABLE, {
    "Breloom>Seed Bomb>Machamp": [[30], 1, 1], "Breloom>Seed Bomb>Munchlax": [[30], 1, 1],
    "Salamence>Dragon Claw>Machamp": [[200], 1, 1], "Salamence>Dragon Claw>Munchlax": [[60], 1, 1],
    "Machamp>Close Combat>Breloom": [[60], 1, 1], "Machamp>Close Combat>Salamence": [[60], 1, 1],
    "Munchlax>Body Slam>Breloom": [[150], 1, 1], "Munchlax>Body Slam>Salamence": [[150], 1, 1],
  });
  const AI = { Machamp: { Spore: 10, Toxic: 9 }, Munchlax: { Spore: 2, Toxic: 1 } };
  const cut = items => {
    const party = sporeParty();
    party[0].moveset.push(...mon("x", 1, ["Normal"], [1, 1, 1, 1, 1, 1], [TOXIC]).moveset);
    const foes = [
      mon("Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 140], [["Close Combat", "Fighting", 120, "P"]], true, undefined,
        { getBattlerIndex: () => 2, getHeldItems: () => items }),
      mon("Munchlax", 80, ["Normal"], [300, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]], true, undefined, { getBattlerIndex: () => 3 }),
    ];
    const { field } = render({ party, foes, live: true, double: true, dist: aimAtBoth, switches: () => new Map(), benefit: (atk, mv, def) => AI[def.name]?.[mv.name] ?? 0 });
    return lineOf(field, "Breloom");
  };
  const { hazardValue } = globalThis.__hud["30-planner"];
  const spikesFor = items => {
    const lead = mon("Machamp", 80, ["Fighting"], [300, 200, 110, 60, 110, 50], [["Close Combat", "Fighting", 120, "P"]], true);
    const benched = mon("Snorlax", 80, ["Normal"], [400, 150, 110, 80, 150, 30], [["Body Slam", "Normal", 85, "P"]], false, undefined, { getHeldItems: () => items });
    const t = fakeTurn({ live: true, trainer: {}, party: [vileplume([GIGA_DRAIN], 60)], foes: [lead, benched] });
    return hazardValue(t, t.facts.party[0], "TOXIC_SPIKES")?.turns ?? 0;
  };
  console.log(`spikes: Toxic Spikes into a bare bench ${spikesFor([])} · a Lum holder ${spikesFor(lum(1))}`);
  assert.deepEqual([spikesFor([]), spikesFor(lum(1))], [0.5, 0], "a Lum holder is never chipped by the poison it walks into");

  const [cutBare, cutLum] = [cut([]), cut(lum(1))];
  console.log(`== lum: three status plays in a double, bare Machamp (live)\n${cutBare}\n== lum: …and a Lum-holding one (live)\n${cutLum}`);
  assert.match(cutLum, /Spore → Munchlax .*sleep/, `the lasting sleep keeps its slot over the plays the Lum cures:\n${cutLum}`);
}


const LEAD_STATUS = {
  Spore: SPORE,
  "Thunder Wave": ["Thunder Wave", "Electric", 0, "X", 0, { id: 86, attrs: [["StatusEffectAttr", { effect: 3 }]] }],
  Protect: ["Protect", "Normal", 0, "X", 4, { target: 0, attrs: ["ProtectAttr"], id: 182 }],
};
// #850's double. With `lock`, Outrage (`left` uses, this turn's included) is queued at battler `at`; without, Salamence
// picks Fire Blast at the lead. Ally's Thunderbolt is too little to fell either foe first unless `allyTb` (its max hit on
// Salamence) and `allySpe` say otherwise. `lastMove`: the lead's last move's record; `bypass`: Salamence's moves that
// ignore Protect; `more`: the lead's moves besides Ice Beam and `move`.
const lockDouble = (move, { myHp = 250, mySpe = 80, foeHp = 300, foeSpe = 120, outrage, own, ours, lock = true, left = 1, at = 0, lastMove = null, bypass = [], allyTb = 60, allySpe = 70, more = [] }) => {
  Object.assign(TABLE, {
    "Lead>Ice Beam>Salamence": [[ours], 1, 4], "Lead>Ice Beam>Snorlax": [[50], 1, 1],
    "Ally>Thunderbolt>Salamence": [[allyTb], 1, 1], "Ally>Thunderbolt>Snorlax": [[70], 1, 1],
    "Salamence>Outrage>Lead": [[outrage], 1, 1], "Salamence>Fire Blast>Lead": [[own], 1, 1],
    "Salamence>Outrage>Ally": [[outrage], 1, 1], "Salamence>Fire Blast>Ally": [[own], 1, 1],
    "Snorlax>Body Slam>Lead": [[40], 1, 1], "Snorlax>Body Slam>Ally": [[40], 1, 1],
  });
  const party = [
    mon("Lead", 80, ["Water"], [myHp, 100, 100, 100, 100, mySpe], [["Ice Beam", "Ice", 90, "S"], LEAD_STATUS[move], ...more], true, undefined,
      { getBattlerIndex: () => 0, ...(lastMove ? { getLastXMoves: () => [lastMove] } : {}) }),
    mon("Ally", 80, ["Electric"], [300, 100, 100, 100, 100, allySpe], [["Thunderbolt", "Electric", 90, "S"]], true, undefined, { getBattlerIndex: () => 1 }),
  ];
  const salamence = mon("Salamence", 80, ["Dragon", "Flying"], [foeHp, 200, 100, 100, 100, foeSpe],
    [["Outrage", "Dragon", 120, "P", 0, { target: 7, id: 200 }], ["Fire Blast", "Fire", 110, "S", 0, { id: 126 }]], true, undefined,
    lock ? { getTag: t => (t === "FRENZY" ? { turnCount: left } : null), getMoveQueue: () => [{ move: 200, targets: [at], useMode: 2 }], getBattlerIndex: () => 2 }
      : { getBattlerIndex: () => 2 });
  const foes = [salamence, foeAt(3, "Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]])];
  const dist = e => (e === salamence ? [{ name: lock ? "Outrage" : "Fire Blast", type: lock ? "Dragon" : "Fire", p: 1, score: 10, targets: [lock ? at : 0], exact: lock }]
    : [{ name: "Body Slam", type: "Normal", p: 1, score: 10, targets: [1] }]);
  const replay = (e, _t, opts) => (e === salamence ? [{ name: !lock || opts?.afterLock ? "Fire Blast" : "Outrage", type: "Dragon", p: 1 }] : [{ name: "Body Slam", type: "Normal", p: 1 }]);
  const stubOutcome = (a, d, pm, o) => {
    const x = outcome(a, d, pm, o);
    return x && a === salamence && bypass.includes(pm.getName()) ? { ...x, bypassProtect: true } : x;
  };
  return render({ party, foes, live: true, double: true, dist, replay, stubOutcome, switches: () => new Map() });
};
const LOCK_DOUBLE_CASES = [
  ["1", "foe faster, Outrage 150 / own 60, we 3HKO", { outrage: 150, own: 60, ours: 110 }],
  ["2", "as 1, foe slower", { foeSpe: 60, outrage: 150, own: 60, ours: 110 }],
  ["3", "foe faster, Outrage KOs (300), own 60, we 3HKO", { outrage: 300, own: 60, ours: 110 }],
  ["4", "we faster and 1HKO", { mySpe: 140, foeHp: 100, outrage: 150, own: 60, ours: 110 }, true],
  ["5", "we slower, 1HKO, Outrage 150", { foeHp: 100, outrage: 150, own: 60, ours: 110 }, true],
  ["6", "Outrage resisted (40), own 60", { outrage: 40, own: 60, ours: 110 }],
  ["7", "own pick as strong (150)", { outrage: 150, own: 150, ours: 110 }],
  ["8", "foe faster, Outrage 130 / own 60, we 4HKO", { outrage: 130, own: 60, ours: 80 }],
  ["9", "we slower and 1HKO, both its hits KO", { foeHp: 100, outrage: 300, own: 300, ours: 110 }, true],
  ["10", "no lock, Fire Blast 150 a turn, we 3HKO", { outrage: 0, own: 150, ours: 110, lock: false }],
  ["11", "no lock, Fire Blast KOs (300), we 3HKO", { outrage: 0, own: 300, ours: 110, lock: false }],
  ["12", "no lock, Fire Blast 60, we 3HKO", { outrage: 0, own: 60, ours: 110, lock: false }],
];

// ---- A double offers Protect only on a foe's locked last use queued at this slot (#876).
{
  const playOf = sc => {
    const { scene: s } = lockDouble("Protect", { outrage: 300, own: 60, ours: 110, ...sc });
    const [lead] = s.facts.party, [salamence] = s.facts.foes;
    const info = s.statusMoves(lead, salamence).find(x => x.name === "Protect");
    return globalThis.__planner.statusPlay(s, lead, salamence, info);
  };
  const play = playOf({});
  assert.deepEqual([play?.kind, play?.skip0, play?.note], ["protect", 1, "blocks Outrage's last use"], `the last use, queued at the lead: ${JSON.stringify(play)}`);
  assert.equal(playOf({ left: 2 }), null, "not with a use of the lock still to come");
  assert.equal(playOf({ at: 1 }), null, "not where the lock is queued at the partner");
  assert.equal(playOf({ lock: false }), null, "not with no lock running");
  for (const [id, name] of [[182, "Protect"], [501, "Quick Guard"], [469, "Wide Guard"]]) {
    assert.equal(playOf({ lastMove: { move: id, targets: [0], result: 1 } }), null, `not straight after a ${name} that held`);
  }
  assert.equal(playOf({ bypass: ["Outrage"] }), null, "not into a move that ignores Protect");
}

// ---- A double's Protect is a priced play, picked where blocking the lock's last use wins the lead's race (#876).
{
  const HELD = { move: 182, targets: [0], result: 1 };
  const protects = new Set(["1", "3", "8", "9"]);
  const cases = [
    ...LOCK_DOUBLE_CASES.map(([id, label, sc]) => [`${id} · ${label}`, sc, protects.has(id)]),
    ["3 after a Protect that held", { outrage: 300, own: 60, ours: 110, lastMove: HELD }, false],
    ...LOCK_DOUBLE_CASES.filter(([, , sc]) => sc.lock !== false).map(([id, label, sc]) => [`${id} with a use to come · ${label}`, { ...sc, left: 2 }, false]),
  ];
  for (const [label, sc, protect] of cases) {
    const { field } = lockDouble("Protect", sc);
    const l = lineOf(field, "Lead");
    console.log(`== #850's double, Protect, case ${label}\n${slotLines(field).join("\n")}`);
    assert.match(l, protect ? /Protect (\d hits )?blocks Outrage's last use .*then Ice Beam/ : /Ice Beam → /, `case ${label}:\n${field.join("\n")}`);
    if (protect) assert.ok(!/⚠|💀/.test(l), `no threat tag for the hit Protect blocks, case ${label}:\n${l}`);
  }
  const { field } = lockDouble("Protect", { outrage: 300, own: 60, ours: 110, allyTb: 400, allySpe: 130 });
  console.log(`== #850's double, Protect, case 3 with Ally felling Salamence first\n${slotLines(field).join("\n")}`);
  assert.match(lineOf(field, "Lead"), /Protect (\d hits )?blocks Outrage's last use .*then Ice Beam/, `the priced Protect keeps its note:\n${field.join("\n")}`);
  assert.ok(!/spare hit/.test(lineOf(field, "Lead")), `a Protect lands no hit to spare:\n${field.join("\n")}`);
  assert.ok(!field.some(l => /focus/.test(l)), `a Protect is no second hit on the foe:\n${field.join("\n")}`);
  const hh = lockDouble("Protect", { outrage: 300, own: 60, ours: 110, allyTb: 240, more: [["Helping Hand", "Normal", 0, "X", 5, { target: 10, id: 270 }]] });
  console.log(`== #850's double, Protect, case 3 with Helping Hand too\n${slotLines(hh.field).join("\n")}`);
  assert.match(lineOf(hh.field, "Lead"), /Protect (\d hits )?blocks Outrage's last use/, `the priced Protect stays a Protect:\n${hh.field.join("\n")}`);
}

// ---- A double sleeps or paralyses no foe its lead fells this turn, and never paralyses in #850's double (#862).
{
  for (const move of ["Spore", "Thunder Wave"]) {
    for (const [id, label, sc, oneHit] of LOCK_DOUBLE_CASES) {
      const line = lineOf(lockDouble(move, sc).field, "Lead");
      console.log(`== #850's double, ${move}, case ${id} · ${label}\n${line}`);
      if (move === "Thunder Wave") assert.ok(!/Thunder Wave/.test(line), `no paralysis in #850's double, case ${id}:\n${line}`);
      if (oneHit) assert.ok(!line.includes(move), `no ${move} into a foe the lead 1HKOs, case ${id}:\n${line}`);
    }
  }
}

// ---- The one gate: with no exact enemy answer, the card, the fight plan and the catch advice stop together (#183)
{
  const party = [mon("Morpeko", 80, ["Electric", "Dark"], [220, 150, 90, 120, 100, 170], [["Aura Wheel", "Electric", 110, "P"]], true, 180)];
  const foes = [mon("Gyarados", 82, ["Water", "Flying"], [250, 170, 110, 80, 130, 150], [["Waterfall", "Water", 80, "P"]], true)];
  const out = render({ party, foes, live: true, switches: () => new Map(), exact: { ok: false, reason: "the enemy AI call threw" } });
  assert.equal(out.card.verdict, "unavailable");
  assert.equal(out.card.field, null, "no ⚔ line");
  assert.deepEqual(out.card.rows, [], "and no foe rows");
  assert.equal(out.card.teamPlan, null);
  assert.equal(out.card.catch, null);
  assert.deepEqual(out.groups.map(g => g.id), ["act"], "one group, and it is act");
  assert.equal(out.groups[0].summary, "no advice — the enemy AI call threw");
  assert.deepEqual(out.lines.filter(l => l.startsWith("⚠")), [], out.lines.join("\n"));
  assert.equal(globalThis.__planner.cardSummary(out.card).field, "no advice — the enemy AI call threw");
}

// ---- A move is worth only what its user lands before it falls (#650, W145 T4). Dragonite at 169 of 340 is outsped and
// one-shot by Rayquaza's Outrage. Dragon Hammer fells Rayquaza in two uses and never goes off; Extreme Speed (+2) needs
// three but takes a third of the bar off first, so it is the call and the plan's step shows the chip.
Object.assign(TABLE, {
  "Dragonite>Dragon Hammer>Rayquaza": [[220], 1, 2], "Dragonite>Extreme Speed>Rayquaza": [[140], 1, 1],
  "Rayquaza>Outrage>Dragonite": [[300], 1, 2],
  "Raichu>Thunderbolt>Rayquaza": [[150], 1, 1], "Rayquaza>Outrage>Raichu": [[400], 1, 1],
});
{
  const HAMMER = ["Dragon Hammer", "Dragon", 90, "P"], SPEED = ["Extreme Speed", "Normal", 80, "P", 2];
  const lostRace = moves => {
    const party = [
      mon("Dragonite", 80, ["Dragon", "Flying"], [340, 200, 150, 150, 150, 160], moves, true, 169),
      mon("Raichu", 80, ["Electric"], [240, 120, 100, 160, 110, 180], [["Thunderbolt", "Electric", 90, "S"]], false),
    ];
    const foes = [mon("Rayquaza", 84, ["Dragon", "Flying"], [350, 250, 120, 250, 120, 200], [["Outrage", "Dragon", 120, "P"]], true)];
    return render({ party, foes, live: true, switches: () => new Map(),
      dist: e => (e === foes[0] ? [{ name: "Outrage", type: "Dragon", p: 1, score: 10, targets: [0] }] : []) });
  };
  const both = lostRace([HAMMER, SPEED]);
  console.log(`== a lost race: only what lands counts (#650)\n${both.field.join("\n")}`);
  const call = both.field.find(l => /^⚔/.test(l));
  assert.match(call, /Extreme Speed → .*Rayquaza/, `the move that lands is the call:\n${both.field.join("\n")}`);
  assert.ok(!/Dragon Hammer/.test(call), `the KO it never reaches is not the call: ${call}`);
  const step = both.card.teamPlan.steps[0];
  assert.equal(step.send.name, "Dragonite");
  assert.ok(step.foeHp < 100, `the pinned plan's step lands the chip: ${step.why}`);

  // With only the priority move there is no choice to make: the step still lands damage, and the card's danger tag is
  // a risk after our hit, not a KO before it.
  const only = lostRace([SPEED]);
  console.log(`== the priority move alone (#650)\n${only.field.join("\n")}`);
  assert.ok(only.card.teamPlan.steps[0].foeHp < 100, `the step lands damage: ${only.card.teamPlan.steps[0].why}`);
  assert.notEqual(only.card.field.slots[0].threat?.level, "ko", "a pick that moves first is never KO'd before it acts");
  assert.ok(!only.field.some(l => /before it can act/.test(l)), only.field.join("\n"));
}

// ---- A charge move whose one use races the foe's KO on a speed tie goes off half the time (#650).
Object.assign(TABLE, { "Venusaur>Solar Beam>Arcanine": [[400], 1, 2], "Arcanine>Flare Blitz>Venusaur": [[200], 1, 2] });
{
  const me = mon("Venusaur", 80, ["Grass", "Poison"], [300, 150, 150, 200, 150, 100], [["Solar Beam", "Grass", 120, "S"]], true);
  const foes = [mon("Arcanine", 80, ["Fire"], [300, 200, 150, 150, 150, 100], [["Flare Blitz", "Fire", 120, "P"]], true)];
  const charges = (a, d, pm, o) => { const x = outcome(a, d, pm, o); return x && pm.getName() === "Solar Beam" ? { ...x, traits: { ...x.traits, charge: true } } : x; };
  const dist = () => [{ name: "Flare Blitz", type: "Fire", p: 1, score: 10, targets: [0] }];
  const { scene: s } = render({ party: [me], foes, live: true, dist, switches: () => new Map(), stubOutcome: charges });
  const x = globalThis.__planner.exchange(s, me, me.moveset[0], foes[0]);
  console.log(`== a charge move on a speed tie: acts ${1 - x.pNeverUsed} · first ${x.pFirst}`);
  assert.equal(x.pFirst, 0.5);
  assert.ok(Math.abs(x.pNeverUsed - 0.5) < 1e-9, `fires only when it moves first on turn 2: ${x.pNeverUsed}`);
}

// ---- A depth-2 line pays for the turn its first move never goes off, as the move alone does (#650).
Object.assign(TABLE, {
  "Dragonite>Dragon Hammer>Groudon": [[220], 1, 1], "Dragonite>Extreme Speed>Groudon": [[140], 1, 1],
  "Groudon>Precipice Blades>Dragonite": [[300], 1, 1],
});
{
  const me = mon("Dragonite", 80, ["Dragon", "Flying"], [340, 200, 150, 150, 150, 160],
    [["Dragon Hammer", "Dragon", 90, "P"], ["Extreme Speed", "Normal", 80, "P", 2]], true, 277);
  const foes = [mon("Groudon", 84, ["Ground"], [230, 250, 120, 250, 120, 200], [["Precipice Blades", "Ground", 120, "P"]], true)];
  const dist = () => [{ name: "Precipice Blades", type: "Ground", p: 1, score: 10, targets: [0] }];
  const line = lineOf(render({ party: [me], foes, live: true, dist, switches: () => new Map() }).field, "Dragonite");
  console.log(`== a depth-2 line pays the charge (#650)\n${line}`);
  assert.match(line, /Extreme Speed → Groudon/, `the hit that lands before the KO is the call: ${line}`);
}

// ---- A status play pays for the share of the time its user falls before landing a hit, as an attack does (#650).
Object.assign(TABLE, { "Gallade>Leaf Blade>Lucario": [[90], 1, 1], "Lucario>Close Combat>Gallade": [[300], 1, 1] });
{
  const party = [mon("Gallade", 80, ["Psychic", "Fighting"], [300, 200, 110, 90, 150, 100], [["Leaf Blade", "Grass", 90, "P"], SWORDS_DANCE], true, 277)];
  const foes = [mon("Lucario", 80, ["Fighting", "Steel"], [450, 150, 110, 80, 150, 200], [["Close Combat", "Fighting", 120, "P"]], true)];
  const line = lineOf(oneOnOne({ party, foes, dist: only("Close Combat") }).field, "Gallade");
  console.log(`== an outsped setup never lands (#650)\n${line}`);
  assert.match(line, /Leaf Blade → Lucario/, `a setup that never lands a hit is not the call: ${line}`);
}

// ---- A spread move pays for the share of the time its user falls before it goes off, as a single-target one does (#650).
Object.assign(TABLE, {
  "Garchomp>Boomburst>Hydreigon": [[120], 1, 1], "Garchomp>Boomburst>Snorlax": [[120], 1, 1], "Garchomp>Dragon Claw>Hydreigon": [[400], 1, 2],
  "Hydreigon>Dark Pulse>Garchomp": [[190], 1, 1],
});
{
  const party = [
    mon("Garchomp", 80, ["Dragon", "Ground"], [270, 200, 150, 120, 130, 130], [["Boomburst", "Normal", 140, "S", 0, { target: 6 }], ["Dragon Claw", "Dragon", 80, "P"]], true, 175, { getBattlerIndex: () => 0 }),
    doublesParty()[1],
  ];
  const foes = [
    foeAt(2, "Hydreigon", 80, ["Dark", "Dragon"], [300, 120, 110, 160, 110, 200], [["Dark Pulse", "Dark", 80, "S"]]),
    foeAt(3, "Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]]),
  ];
  const dist = e => [{ name: e.moveset[0].getName(), type: TY[e.moveset[0].getMove().type], p: 1, score: 10, targets: [e === foes[0] ? 0 : 1] }];
  const { field } = render({ party, foes, live: true, double: true, dist, switches: () => new Map() });
  const g = slotLines(field).find(l => /^⚔ Garchomp/.test(l)) ?? "";
  console.log(`== an outsped spread move (#650)\n${g}`);
  assert.match(g, /Dragon Claw → Hydreigon/, `the KO it may land beats a chip it may not: ${g}`);
}

// ---- An Enigma Berry heals its holder a quarter after a super-effective hit lands, one berry a turn (#652)
{
  const { party, foes } = cyrus(true);
  const [morpeko, , metagross] = party;
  const [, weavile] = foes;
  const { scene: s } = render({ party, foes, live: true, switches: () => new Map() });
  const { sceneTurnEndHp } = globalThis.__hud["10-damage"];
  let env = { field: [] };
  globalThis.__stub.heal = (p, o) => sceneTurnEndHp(env, p, o);
  const held = (name, fields = {}, n = 1) => Object.assign(new ({ [name]: class {} })[name](), { getStackCount: () => n }, fields);
  const enigma = (n = 1) => held("BerryModifier", { berryType: 2 }, n);
  const leftovers = held("TurnHealModifier");
  const [fireFang, firePunch] = mon("Weavile", 84, ["Dark", "Ice"], [300, 250, 100, 60, 110, 299], [["Fire Fang", "Fire", 65, "P"], ["Fire Punch", "Fire", 75, "P"]], false).moveset;
  const { exchange } = globalThis.__planner;
  // The threat a pairing faces is memoised by id, so every mon here gets its own.
  let n = 0;
  const as = (p, items, extra = {}) => ({ ...p, id: `${p.name} ${++n}`, getHeldItems: () => items, ...extra });
  const dists = new Map();
  globalThis.__stub.dist = e => dists.get(e.id) ?? [];
  const weavileWith = (moves, items = [], extra = {}) => {
    const f = as(weavile, items, { moveset: moves.map(([m]) => m), ...extra });
    dists.set(f.id, moves.map(([m, p]) => ({ name: m.getName(), type: TY[m.getMove().type], p, score: 10, targets: [0] })));
    return f;
  };
  const [AXEL, KNOCK] = weavile.moveset;
  const knockOff = (items, extra) => weavileWith([[KNOCK, 1]], items, extra);
  const run = (me, foe, opts) => exchange(s, me, me.moveset[0], foe, opts);
  const foeSide = x => x.turn1.foe.map(b => `${Math.round(b.hp)} HP bar ${b.bar} (${Math.round(b.p * 100)}%)`).join(" · ");
  const ourSide = x => x.turn1.me.map(b => `${Math.round(b.hp)} HP (${Math.round(b.p * 100)}%)`).join(" · ");
  const fed = (x, bare) => Math.round((x.turn1.hp - bare.turn1.hp) * 10) / 10;

  // Weavile's 300 HP is two bars, so Meteor Mash (×2) has its first hit clamped at 150.
  const bare = run(as(metagross, []), knockOff([]));
  const fedSE = run(as(metagross, []), knockOff([enigma()]));
  const neutral = run(as(morpeko, []), knockOff([enigma()]));
  const missed = run(as(metagross, []), knockOff([enigma()], { hp: 250 }));
  console.log(`== an Enigma Berry fed by a super-effective hit (#652)\n` +
    `Meteor Mash ×2, no berry: ${foeSide(bare)}\n` +
    `Meteor Mash ×2, Enigma:   ${foeSide(fedSE)}\n` +
    `Aura Wheel ×1, Enigma:    ${foeSide(neutral)}\n` +
    `Meteor Mash ×2 from 250:  ${foeSide(missed)}`);
  const broke = b => b.bar === 0;
  const onBar = x => [...new Set(x.turn1.foe.filter(broke).map(b => Math.round(b.hp)))];
  assert.deepEqual(onBar(bare), [150], "no berry: the clamped hit leaves it on the boundary");
  assert.deepEqual(onBar(fedSE), [225], "the berry heals a quarter past the boundary");
  assert.ok(fedSE.turn1.foe.every(b => b.bar <= 1) && fedSE.turn1.foe.some(broke), "the heal lifts it past the boundary and the broken bar stays broken");
  assert.deepEqual(neutral.turn1.foe.map(b => b.bar), neutral.turn1.foe.map(() => 1), "the neutral hit never reaches the boundary");
  assert.ok(neutral.turn1.foe.every(b => b.hp <= 300 - 76), `and feeds nothing: ${foeSide(neutral)}`);
  assert.deepEqual(missed.turn1.foe.filter(b => !broke(b)).map(b => Math.round(b.hp)), [250], `a miss feeds nothing: ${foeSide(missed)}`);
  assert.equal(fedSE.turnsWe, bare.turnsWe, `one quarter never buys the boss a turn here: ${fedSE.turnsWe} vs ${bare.turnsWe}`);

  // A quarter of Metagross's 250 is 62.
  const ours = run(as(metagross, []), knockOff([]));
  const oursFed = run(as(metagross, [enigma()]), knockOff([]));
  const resisted = run(as(metagross, [enigma()]), weavileWith([[AXEL, 1]]));
  const resistedBare = run(as(metagross, []), weavileWith([[AXEL, 1]]));
  console.log(`Knock Off ×2 into us, no berry: ${ourSide(ours)}\nKnock Off ×2 into us, Enigma:   ${ourSide(oursFed)}\n` +
    `Triple Axel ×½ into us, Enigma: ${ourSide(resisted)}`);
  assert.equal(fed(oursFed, ours), 62, "the foe's super-effective hit feeds our berry");
  assert.equal(fed(resisted, resistedBare), 0, "a resisted hit never does");

  // The berry heals ahead of Leftovers and poison (game-code.md §21).
  const lefties = run(as(metagross, [leftovers], { hp: 200 }), knockOff([]));
  const both = run(as(metagross, [enigma(), leftovers], { hp: 200 }), knockOff([]));
  assert.equal(fed(both, lefties), 62, `Leftovers after it leaves the quarter whole: ${ourSide(both)}`);
  const poisoned = { status: { effect: 1 } };
  const fang = run(as(metagross, [enigma()], poisoned), weavileWith([[fireFang, 1]]));
  console.log(`Fire Fang ×2 into a poisoned us at full, Enigma: ${ourSide(fang)}`);
  assert.deepEqual([...new Set(fang.turn1.me.map(b => Math.round(b.hp)))], [219], "the berry caps at 250 first, and the poison takes 31 after it");

  // On the field, so the enemy AI's pick is the stub's.
  for (const p of [0.4, 0.6]) {
    const mix = items => run(as(metagross, items), weavileWith([[AXEL, 1 - p], [KNOCK, p]], [], { isOnField: () => true }));
    const paid = fed(mix([enigma()]), mix([]));
    console.log(`Knock Off at ${p * 100}%, Triple Axel at ${100 - p * 100}%: the berry pays ${paid}`);
    assert.equal(paid, Math.round(62 * p * 10) / 10, "a quarter on the share Knock Off lands, whichever move is likelier");
  }

  const curve = k => run(as(metagross, k ? [enigma(k)] : []), knockOff([]));
  const [none, one, two] = [0, 1, 2].map(curve);
  console.log(`Knock Off until we fall, expected turns: no berry ${none.eTurnsThey.toFixed(3)} · one ${one.eTurnsThey.toFixed(3)} · two ${two.eTurnsThey.toFixed(3)}`);
  assert.ok(two.eTurnsThey > one.eTurnsThey, `a second berry is eaten on the second super-effective turn: ${one.eTurnsThey} → ${two.eTurnsThey}`);
  const next = (k, t1) => run(as(metagross, k ? [enigma(k)] : []), knockOff([]), { hp: t1.turn1.hp, after: t1.turn1, next: true });
  assert.equal(fed(next(1, one), next(0, one)), 0, "a line's second exchange finds the berry its first ate gone");
  assert.equal(fed(next(2, two), next(0, two)), 62, "and the second of two still there");

  const low = run(as(metagross, [enigma()], { hp: 100 }), weavileWith([[fireFang, 1]]));
  console.log(`Fire Fang ×2 into us at 100, Enigma: ${ourSide(low)}`);
  assert.ok(low.turn1.me.every(b => b.hp >= 150), "a heal bigger than the hit that fed it lifts us past where we started");
  env = { field: [], weather: 4 };
  const hail = run(as(metagross, [enigma()]), weavileWith([[fireFang, 1]]));
  env = { field: [] };
  console.log(`Fire Fang ×2 into us at full in hail, Enigma: ${ourSide(hail)}`);
  assert.deepEqual([...new Set(hail.turn1.me.map(b => Math.round(b.hp)))], [250], "hail chips 15 before the berry, which heals back to full");
  // Knock Off always lands and Fire Punch half the time, each picked half the time; on the field, so the pick is the
  // stub's.
  const punch = items => run(as(metagross, items, { hp: 150 }), weavileWith([[KNOCK, 0.5], [firePunch, 0.5]], [], { isOnField: () => true }));
  const punched = fed(punch([enigma()]), punch([]));
  console.log(`Fire Punch at 50% beside Knock Off: the berry pays ${punched}`);
  assert.equal(punched, 46.5, "62 on the three quarters of uses that land: a super-effective miss feeds nothing");
  // Exact odds that it survives a use the curve calls a sure KO (a Sturdy holder): it survives the hit, so it eats.
  const gyarados = as(foes[0], [enigma()]);
  dists.set(gyarados.id, [{ name: "Waterfall", type: "Water", p: 1, score: 10, targets: [0] }]);
  const wheel = as(morpeko, []);
  const sturdy = { ...s.outcomes(wheel, gyarados).find(o => o.name === "Aura Wheel"), pKo: 0 };
  const survived = run(wheel, gyarados, { outcome: sturdy });
  console.log(`Aura Wheel ×4 into a Gyarados that survives at 1, Enigma: ${foeSide(survived)}`);
  assert.deepEqual(survived.turn1.foe.map(b => Math.round(b.hp)), [63], "1 HP and a quarter of 250");
  // Metagross comes in with Unnerve: the mon on the field now, Morpeko, has none.
  const unnerve = run(as(metagross, [], { hasAbilityWithAttr: a => a === "PreventBerryUseAbAttr" }), knockOff([enigma()]));
  assert.deepEqual(onBar(unnerve), [150], `the attacker's Unnerve keeps the berry uneaten: ${foeSide(unnerve)}`);
  delete globalThis.__stub.heal;
}

// ---- An inaccurate pick's ⚔ line and act summary carry its accuracy; a sure-hit pick's carry none (#653).
{
  const pick = (move, per, acc) => {
    const party = [mon("Quaquaval", 80, ["Water", "Fighting"], [280, 220, 160, 150, 140, 200], [[move, move === "Mega Kick" ? "Normal" : "Fighting", 120, "P"]], true)];
    const foes = [mon("Rayquaza", 80, ["Dragon", "Flying"], [320, 250, 150, 250, 150, 180], [["Dragon Ascent", "Flying", 120, "P"]], true)];
    const table = { [`Quaquaval>${move}>Rayquaza`]: [[per], acc, 1], "Rayquaza>Dragon Ascent>Quaquaval": [[60], 1, 1] };
    const out = render({ party, foes, live: true, stubOutcome: outcomeFrom(table), dist: () => [{ name: "Dragon Ascent", type: "Flying", p: 1, score: 10, targets: [0] }] });
    return { line: out.field.find(l => /^⚔ Quaquaval/.test(l)) ?? "", summary: globalThis.__planner.cardSummary(out.card).field };
  };
  const kick = pick("Mega Kick", 200, 0.75);
  console.log(`== inaccurate pick\n${kick.line}\n${kick.summary}`);
  assert.match(kick.line, /Mega Kick → Rayquaza 2 hits · 75%$/, "the ⚔ line's tail carries the accuracy after the hits");
  assert.equal(kick.summary, "Quaquaval Mega Kick → Rayquaza · 2 hits · 75%", "the act summary carries the same");
  const sure = pick("Close Combat", 200, 1);
  assert.match(sure.line, /Close Combat → Rayquaza 2 hits$/, "a sure hit's line is unchanged");
  assert.equal(sure.summary, "Quaquaval Close Combat → Rayquaza · 2 hits", "and so is its summary");
  const slow = pick("Mega Kick", 40, 0.75);
  assert.match(slow.line, /Mega Kick → Rayquaza 75%$/, `shown with no hits count: ${slow.line}`);
  assert.equal(slow.summary, "Quaquaval Mega Kick → Rayquaza · 75%");
  assert.match(pick("Mega Kick", 200, 0.996).summary, / · 99%$/, "a pick below 100% never reads 100%");
}

// ---- Gordie W180 T16: the card calls Tera Water + Hydro Pump, and its fight plan presses the Tera on step 1 (#649)
// The table keys a Terastallized mon as `name*`: Hydro Pump gains Tera STAB (×1.5 → ×2), and Stone Edge into Water
// alone is ×1, not Water/Flying's ×2.
Object.assign(TABLE, {
  "Gyarados>Hydro Pump>Tyranitar": [[220], 1, 2], "Gyarados*>Hydro Pump>Tyranitar": [[293], 1, 2],
  "Gyarados>Hydro Pump>Carracosta": [[110], 0.8, 1], "Gyarados*>Hydro Pump>Carracosta": [[147], 0.8, 1],
  "Tyranitar>Stone Edge>Gyarados": [[330], 0.8, 2], "Tyranitar>Stone Edge>Gyarados*": [[165], 0.8, 1],
  "Carracosta>Rock Slide>Gyarados": [[240], 0.9, 2], "Carracosta>Rock Slide>Gyarados*": [[120], 0.9, 1],
});
{
  const teraKeyed = (a, d, pm, o) => {
    const as = p => (p.isTerastallized ? Object.create(p, { name: { value: `${p.name}*` } }) : p);
    const x = outcome(as(a), as(d), pm, o);
    return x && { ...x, name: pm.getName() };
  };
  const t16 = ourTera => {
    const gyarados = mon("Gyarados", 175, ["Water", "Flying"], [570, 400, 260, 200, 300, 300], [["Hydro Pump", "Water", 110, "S"]], true);
    const tyranitar = mon("Tyranitar", 179, ["Rock", "Dark"], [569, 450, 380, 300, 340, 220], [["Stone Edge", "Rock", 100, "P"]], true, 339,
      { hasTrainer: () => true });
    const carracosta = mon("Carracosta", 169, ["Water", "Rock"], [467, 412, 533, 302, 314, 180], [["Rock Slide", "Rock", 75, "P"]], false, undefined,
      { hasTrainer: () => true });
    const out = render({ party: [gyarados], foes: [tyranitar, carracosta], live: true, switches: () => new Map(), stubOutcome: teraKeyed,
      dist: e => (e === tyranitar ? [{ name: "Stone Edge", type: "Rock", p: 1, score: 10, targets: [0] }] : []),
      ourTera: p => (ourTera && p === gyarados ? { type: "Water" } : null) });
    return { ...out, gyarados };
  };
  const tera = t16(true), plain = t16(false);
  console.log(`== gordie w180 t16, Tera left\n${tera.lines.join("\n")}\n== gordie w180 t16, no Tera to take\n${plain.lines.join("\n")}`);
  const call = c => globalThis.__hud["60-card"].cardSummary(c.card).field;
  assert.equal(call(tera), "Gyarados Tera Water + Hydro Pump → Tyranitar · 2 hits", "the ⚔ call carries the Tera");
  assert.match(lineOf(tera.field, "Gyarados"), /⚔ Gyarados Tera Water \+ Water Hydro Pump → Tyranitar/);
  assert.equal(call(plain), "Gyarados Hydro Pump → Tyranitar · 2 hits", "with none to take, the call is the plain move");
  const slot = c => c.card.field.slots[0];
  assert.deepEqual([slot(plain).threat?.e, slot(plain).threat?.move], [2, "Stone Edge"], "Stone Edge is ×2 into Water/Flying");
  assert.ok(!slot(tera).threat || slot(tera).threat.e === 1, `and ×1 into Tera Water: ${JSON.stringify(slot(tera).threat)}`);
  const pick = c => c.card.rows.find(r => r.name === "Tyranitar").pick;
  assert.deepEqual([pick(plain).pct, pick(tera).pct], [36, 48], "Hydro Pump into Tyranitar: 36% of its HP, 48% with Tera STAB");
  const [step] = tera.card.teamPlan.steps;
  assert.deepEqual([step.send.name, step.tera, step.move], ["Gyarados", "Water", "Hydro Pump"], "step 1 presses the Tera");
  const at = tera.lines.findIndex(l => /^➜ 1\. Gyarados Tera Water \+/.test(l));
  assert.ok(at >= 0, "the plan step reads Tera Water + Hydro Pump");
  assert.equal(tera.lines[at + 1], "· input: ← from Fight to the Tera button", "and its input sits at its own step");
  assert.ok(!plain.lines.some(l => /Tera/.test(l)), "no Tera anywhere on a card with none to take");
  assert.ok(tera.card.teamPlan.steps.slice(1).every(x => !x.tera), "only the step that presses it carries it");
}

// ---- After our Tera the foe re-picks against the new typing: only this turn's pick is the one made before it (#649)
Object.assign(TABLE, {
  "Raichu>Thunderbolt>Garchomp": [[60], 1, 0], "Raichu*>Thunderbolt>Garchomp": [[60], 1, 0],
  "Garchomp>Earthquake>Raichu": [[400], 1, 2], "Garchomp>Earthquake>Raichu*": [[0], 1, 0],
  "Garchomp>Dragon Claw>Raichu": [[150], 1, 1], "Garchomp>Dragon Claw>Raichu*": [[150], 1, 1],
});
{
  const teraKeyed = (a, d, pm, o) => {
    const as = p => (p.isTerastallized ? Object.create(p, { name: { value: `${p.name}*` } }) : p);
    const x = outcome(as(a), as(d), pm, o);
    return x && x.max > 0 ? { ...x, name: pm.getName() } : null;
  };
  const raichu = mon("Raichu", 100, ["Electric"], [300, 200, 150, 250, 150, 300], [["Thunderbolt", "Electric", 90, "S"]], true);
  const garchomp = mon("Garchomp", 100, ["Dragon", "Ground"], [400, 300, 250, 200, 200, 250],
    [["Earthquake", "Ground", 100, "P"], ["Dragon Claw", "Dragon", 80, "P"]], true);
  // The AI's re-pick: Earthquake into the Electric typing, Dragon Claw once Raichu is Flying.
  const replay = (_e, target) => [{ name: target.isTerastallized ? "Dragon Claw" : "Earthquake", type: "Dragon", p: 1 }];
  const { scene } = render({ party: [raichu], foes: [garchomp], live: true, switches: () => new Map(), stubOutcome: teraKeyed, replay,
    dist: () => [{ name: "Earthquake", type: "Ground", p: 1, score: 10, targets: [0] }] });
  const { threatFrom, ourTeraTurn } = globalThis.__planner;
  const t = threatFrom(ourTeraTurn(scene, raichu), garchomp, raichu);
  console.log(`== our Tera Flying: this turn ${t.move.name} for ${Math.round(t.expected)}, then ${Math.round(t.later?.expected ?? t.expected)} a turn`);
  assert.equal(t.move.name, "Earthquake", "this turn's pick was made before the Tera");
  assert.equal(t.expected, 0, "and lands on Tera Flying for nothing");
  assert.ok(t.later?.expected > 0, "the uses after it are Dragon Claw, picked against the Tera");
}

// ---- A single battle's Protect is a priced status play, picked where blocking the hit wins the race (#861).
// #749's turns: Salamence locked into Outrage at Vaporeon, which can Ice Beam or Protect. `outrage`, `own`: max damage
// a hit of Outrage, and of the Fire Blast Salamence picks itself once the lock is spent; `ours`: Ice Beam's. `left`:
// Outrage's uses still to come, this turn's included; `lock` false: no lock, and Fire Blast every turn. `lastMove`: our
// last move's record; `bypass`: the names of Salamence's moves that ignore Protect; `picks`: this turn's pick, as
// `[name, p]` rows, in place of the locked or own one; `endure`: Vaporeon has Endure too.
const PROTECT = ["Protect", "Normal", 0, "X", 4, { target: 0, attrs: ["ProtectAttr"], id: 182 }];
const ENDURE = ["Endure", "Normal", 0, "X", 4, { target: 0, attrs: [["ProtectAttr", { tagType: "ENDURING" }]], id: 203 }];
const lockTurn = ({ myHp = 250, mySpe = 80, foeHp = 300, foeSpe = 120, outrage, own, ours, left = 1, lock = true, lastMove = null, bypass = [], picks = null, endure = false }) => {
  Object.assign(TABLE, {
    "Vaporeon>Ice Beam>Salamence": [[ours], 1, 4],
    "Salamence>Outrage>Vaporeon": [[outrage], 1, 1], "Salamence>Fire Blast>Vaporeon": [[own], 1, 1],
  });
  const vaporeon = mon("Vaporeon", 80, ["Water"], [myHp, 100, 100, 100, 100, mySpe], [["Ice Beam", "Ice", 90, "S"], PROTECT, ...(endure ? [ENDURE] : [])], true, undefined,
    lastMove ? { getLastXMoves: () => [lastMove] } : {});
  const salamence = mon("Salamence", 80, ["Dragon", "Flying"], [foeHp, 200, 100, 100, 100, foeSpe],
    [["Outrage", "Dragon", 120, "P", 0, { target: 7, id: 200 }], ["Fire Blast", "Fire", 110, "S", 0, { id: 126 }]], true, undefined,
    lock ? { getTag: t => (t === "FRENZY" ? { turnCount: left } : null), getMoveQueue: () => [{ move: 200, targets: [0], useMode: 2 }] } : {});
  const now = lock ? "Outrage" : "Fire Blast";
  return render({
    party: [vaporeon], foes: [salamence], live: true, switches: () => new Map(),
    stubOutcome: (a, d, pm, o) => {
      const x = outcome(a, d, pm, o);
      return x && a === salamence && bypass.includes(pm.getName()) ? { ...x, bypassProtect: true } : x;
    },
    dist: () => (picks ? picks.map(([name, p]) => ({ name, type: "Dragon", p, score: 10, targets: [0] }))
      : [{ name: now, type: lock ? "Dragon" : "Fire", p: 1, score: 10, targets: [0], exact: true }]),
    replay: (_e, _t, opts) => [{ name: !lock || opts?.afterLock || left === 0 ? "Fire Blast" : "Outrage", type: "Dragon", p: 1 }],
  });
};
{
  const line = lineOf(lockTurn({ outrage: 150, own: 60, ours: 110 }).field, "Vaporeon");
  console.log(`== protect: case 1, foe faster, Outrage 150, we 3HKO (live)\n${line}`);
  assert.match(line, /Protect blocks Outrage's last use .*then Ice Beam/, `Protect, then attack:\n${line}`);
  const HELD = { move: 182, targets: [0], result: 1 };
  const cases = [
    ["3 · Outrage KOs (300)", { outrage: 300, own: 60, ours: 110 }, true],
    ["8 · foe faster, Outrage 130, we 4HKO", { outrage: 130, own: 60, ours: 80 }, true],
    ["9 · we slower and 1HKO, both its hits KO", { foeHp: 100, outrage: 300, own: 300, ours: 110 }, true],
    ["2 · as 1, foe slower", { foeSpe: 60, outrage: 150, own: 60, ours: 110 }, false],
    ["4 · we faster and 1HKO", { mySpe: 140, foeHp: 100, outrage: 150, own: 60, ours: 110 }, false],
    ["5 · we slower, 1HKO, Outrage 150", { foeHp: 100, outrage: 150, own: 60, ours: 110 }, false],
    ["6 · Outrage resisted (40)", { outrage: 40, own: 60, ours: 110 }, false],
    ["7 · its own pick as strong (150)", { outrage: 150, own: 150, ours: 110 }, false],
    ["3 after a Protect that held", { outrage: 300, own: 60, ours: 110, lastMove: HELD }, false],
    ["no lock, Fire Blast 150", { outrage: 0, own: 150, ours: 110, lock: false }, false],
    ["no lock, Fire Blast KOs (300)", { outrage: 0, own: 300, ours: 110, lock: false }, false],
    ["no lock, Fire Blast 60", { outrage: 0, own: 60, ours: 110, lock: false }, false],
  ];
  for (const [label, sc, protects] of cases) {
    const l = lineOf(lockTurn(sc).field, "Vaporeon");
    console.log(`== protect: case ${label} (live)\n${l}`);
    assert.match(l, protects ? /Protect (\d hits )?blocks Outrage's last use .*then Ice Beam/ : /Ice Beam → Salamence/, `case ${label}:\n${l}`);
    if (protects) assert.ok(!/⚠|💀/.test(l), `no threat tag for the hit Protect blocks:\n${l}`);
  }
}
// ---- A Protect play names the hit it blocks, and is not offered where that hit would land anyway (#861).
{
  const playOf = (sc, move = "Protect") => {
    const { scene: s } = lockTurn({ outrage: 300, own: 60, ours: 110, ...sc });
    const [me] = s.facts.party, [foe] = s.facts.foes;
    const info = s.statusMoves(me, foe).find(x => x.name === move);
    return globalThis.__planner.statusPlay(s, me, foe, info);
  };
  const play = playOf({});
  assert.deepEqual([play.kind, play.self, play.patches, play.skip0], ["protect", true, null, 1], `the hit this turn is cancelled: ${JSON.stringify(play)}`);
  assert.equal(play.note, "blocks Outrage's last use");
  assert.equal(playOf({ left: 2 }).note, "blocks Outrage", "a lock with uses still to come");
  assert.equal(playOf({ lock: false }).note, "blocks Fire Blast", "no lock: the foe's own pick");
  // The streak (game-code.md §14).
  assert.equal(playOf({ lastMove: { move: 501, targets: [0], result: 1 } }), null, "not straight after a Quick Guard that held");
  assert.equal(playOf({ lastMove: { move: 469, targets: [0], result: 1 } }), null, "not straight after a Wide Guard that held");
  assert.equal(playOf({ lastMove: { move: 182, targets: [0], result: 2 } })?.kind, "protect", "a Protect that failed starts no streak");
  assert.equal(playOf({ bypass: ["Outrage"] }), null, "not into a move that ignores Protect");
  assert.equal(playOf({ lock: false, picks: [["Fire Blast", 0.6], ["Outrage", 0.4]], bypass: ["Outrage"] }), null,
    "not where part of this turn's pick ignores Protect");
  assert.equal(playOf({ endure: true }, "Endure"), null, "Endure is no Protect play");
}

console.log("ok");
