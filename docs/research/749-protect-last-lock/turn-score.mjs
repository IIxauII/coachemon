// `node docs/research/749-protect-last-lock/turn-score.mjs`: Protect on a foe's last locked use against attacking, in
// the planner's own turn score, on stubbed singles turns. The harness is plannertest.mjs's, cut to what this needs; the
// foe's lock is set up as in its "A foe's lock lands its uses left on our switch-in" scenario.
//
// Attacking is scored as `fieldPlan`'s `one()` scores it, less the terms equal across options (`lasts`, `lost`, `feed`,
// the AI-benefit nudge): −eTurnsWe + pWeKoFirst − pTheyKoFirst − cost. Protect is not an option the planner offers in
// singles (`statusPlay` returns null for it), so it is priced the way `playOption` prices a status play: turn 1 an
// exchange in which we deal nothing — here also take nothing — then the attack from the state it leaves, less
// STATUS_COST. After a Protect that succeeded last turn it holds ⅓ of the time (game-code.md §14); the other ⅔ is the
// same line with the locked hit landing.
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const T = path.join(ROOT, "skills/coachemon/scripts/test");
const { bundle } = await import(path.join(ROOT, "skills/coachemon/scripts/hud-bundle.mjs"));
const { fakeTurn } = await import(path.join(T, "fake-turn.mjs"));

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const STATUS_COST = 0.2; // 30-planner.js

const attr = a => (Array.isArray(a) ? Object.assign(new ({ [a[0]]: class {} })[a[0]](), a[1]) : new ({ [a]: class {} })[a]());
const mon = (name, lv, types, [hp, atk, def, spa, spd, spe], moves, field, curHp, extra = {}) => {
  const summonData = { statStages: [0, 0, 0, 0, 0, 0, 0], types: [] };
  return {
    id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
    name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), hasPassive: () => false,
    getStat: i => [hp, atk, def, spa, spd, spe][i], summonData, isOnField: () => field, isBoss: () => false,
    getIconAtlasKey: () => "k", getIconId: () => 1, status: null, getBattlerIndex: () => (field ? 0 : -1), getHeldItems: () => [],
    moveset: moves.map(([n, t, p, c, priority = 0, { target = 3, attrs = [], id } = {}]) => ({ getName: () => n, moveId: id, getMove: () => ({ id, name: n, type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, priority, accuracy: 100, attrs: attrs.map(attr) }), getMovePp: () => 10, ppUsed: 0 })),
    ...extra,
  };
};

const TABLE = {};
const TRAITS = { charge: false, semiCharge: false, recharge: false, interrupt: false, needsAttack: false, once: false, lock: false, noRepeat: false, recoil: null, halfSac: false, crash: false, selfKo: null, drops: {}, removesType: false };
// plannertest.mjs's `outcome`, without boss bars: per-hit max damage × 16 rolls.
const outcome = (atk, def, pm) => {
  const row = TABLE[`${atk.name}>${pm.getName()}>${def.name}`];
  if (!row) return null;
  const [per, acc, e] = row;
  let expected = 0, pKo = 0, uncapped = 0;
  for (let r = 0; r < 16; r++) {
    const d = Math.floor(per[0] * (85 + r) / 100);
    uncapped += acc / 16 * d;
    expected += acc / 16 * Math.min(def.hp, d);
    if (d >= def.hp) pKo += acc / 16;
  }
  const mv = pm.getMove();
  return {
    name: pm.getName(), type: TY[mv.type], cat: mv.category ? "special" : "physical", e, priority: mv.priority, spread: false,
    acc, dist: [{ n: 1, p: 1 }], perHit: [{ max: per[0], min: Math.floor(per[0] * 0.85) }],
    expected, uncapped, max: Math.min(def.hp, per[0]), pKo, traits: { ...TRAITS }, costs: [], notes: [],
  };
};

const render = ({ party, foes, dist, replay }) => {
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const onField = () => party.filter(p => p.isOnField());
  for (const f of foes) { f.getOpponents = () => onField(); f.getMatchupScore = () => 1; }
  const trainer = { getName: () => "Trainer", config: { isBoss: true }, isDouble: () => false,
    getPartyMemberMatchupScores: () => [], getSortedPartyMemberMatchupScores: x => x, getNextSummonIndex: () => 1 };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [] } } } };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  eval(bundle("hud", { expose: true }));
  const turn = fakeTurn({
    live: true, wave: 200, turn: 3, trainer, party, foes, decision: "command",
    outcome: (atk, def, pm) => outcome(atk, def, pm),
    statusMoves: atk => atk.moveset.filter(pm => pm.getMove().category === 2).map(pm => ({
      pm, name: pm.getName(), type: TY[pm.getMove().type], cat: "status", acc: 1, e: 1, priority: pm.getMove().priority ?? 0, bypassProtect: false, bounce: false, blocked: null,
    })),
    moves: dist, replay, switchTo: () => null,
  });
  const card = { ...globalThis.__hud["60-card"].composeBattleCard(turn, null), wave: 200 };
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
  const groups = globalThis.__hud["96-render-battle"].drawBattle(card);
  const act = groups.find(g => g.id === "act");
  return { field: act.rows.map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean), scene: turn, planner: globalThis.__hud["30-planner"] };
};

// One stubbed singles turn: Salamence's Outrage on its last use (`left` 1) at our lead, which can Ice Beam or Protect.
// `outrage`, `own`: max damage a hit of Outrage, and of the Fire Blast it picks itself once the lock is spent; `ours`:
// Ice Beam's. Speeds decide the order.
const scenario = ({ name, myHp = 250, mySpe = 80, foeHp = 300, foeSpe = 120, outrage, own, ours, left = 1, bench = false }) => {
  Object.assign(TABLE, {
    "Lead>Ice Beam>Salamence": [[ours], 1, 4],
    "Salamence>Outrage>Lead": [[outrage], 1, 1],
    "Salamence>Fire Blast>Lead": [[own], 1, 1],
    // `bench`: a Clefable behind, immune to Outrage.
    "Clefable>Moonblast>Salamence": [[90], 1, 2],
    "Salamence>Outrage>Clefable": [[0], 1, 0],
    "Salamence>Fire Blast>Clefable": [[100], 1, 1],
  });
  const me = mon("Lead", 80, ["Water"], [myHp, 100, 100, 100, 100, mySpe],
    [["Ice Beam", "Ice", 90, "S"], ["Protect", "Normal", 0, "X", 4, { target: 0, attrs: ["ProtectAttr"], id: 182 }]], true);
  const foe = mon("Salamence", 80, ["Dragon", "Flying"], [foeHp, 200, 100, 100, 100, foeSpe],
    [["Outrage", "Dragon", 120, "P", 0, { target: 7, id: 200 }], ["Fire Blast", "Fire", 110, "S", 0, { id: 126 }]], true, undefined,
    { getTag: t => (t === "FRENZY" ? { turnCount: left } : null), getMoveQueue: () => [{ move: 200, targets: [0], useMode: 2 }] });
  const dist = () => [{ name: "Outrage", type: "Dragon", p: 1, score: 10, targets: [0], exact: true }];
  const replay = (_e, _t, opts) => [{ name: opts?.afterLock ? "Fire Blast" : "Outrage", type: "Dragon", p: 1 }];
  const clefable = mon("Clefable", 80, ["Fairy"], [300, 80, 120, 120, 140, 60], [["Moonblast", "Fairy", 95, "S"]], false);
  const { field, scene: s, planner: P } = render({ party: bench ? [me, clefable] : [me], foes: [foe], dist, replay });
  const [beam, protect] = me.moveset;
  const hp = me.hp;
  const scoreOf = x => -x.eTurnsWe + x.pWeKoFirst - x.pTheyKoFirst - (x.cost ?? 0);

  const a = P.exchange(s, me, beam, foe, { hp });
  const t1p = { we: 0, they: 0, me: [{ hp, p: 1 }], hp, foe: [{ hp: foe.hp, p: 1 }] };
  const b = P.exchange(s, me, beam, foe, { hp, after: t1p, next: true });
  const prot = -(1 + b.eTurnsWe) + b.pWeKoFirst - b.pTheyKoFirst - (b.cost ?? 0) - STATUS_COST;
  // Protect failing: turn 1 we deal nothing and Outrage lands, then the same attack.
  const f1 = P.exchange(s, me, protect, foe, { hp }).turn1;
  const standing = 1 - f1.they;
  const f2 = P.exchange(s, me, beam, foe, { hp: f1.hp, after: { ...f1, we: 0 }, next: true });
  // As `playOption` mixes it: `eTurns` unweighted, the edge weighted by the share still standing.
  const failed = -(1 + f2.eTurnsWe) - f1.they + standing * (f2.pWeKoFirst - f2.pTheyKoFirst) - (f2.cost ?? 0) - STATUS_COST;
  const again = prot / 3 + failed * 2 / 3;
  const line = field.find(l => /^(now: )?[⚔⇄]/.test(l)) ?? field[0] ?? "";
  const r3 = v => (Math.round(v * 1000) / 1000).toFixed(3);
  console.log(`| ${name} | ${r3(scoreOf(a))} (${r3(a.pWeKoFirst)} / ${r3(a.pTheyKoFirst)}, ${a.expectedHpLeft} HP) | ${r3(prot)} (${r3(b.pWeKoFirst)} / ${r3(b.pTheyKoFirst)}, ${b.expectedHpLeft} HP) | ${r3(prot - scoreOf(a))} | ${r3(again - scoreOf(a))} | ${line.replace(/\|/g, "/")} |`);
  return { attack: scoreOf(a), protect: prot, again };
};

console.log("| Case | Attack: score (P we KO first / P they do, HP left) | Protect | Protect − attack | Protect again − attack | The card's ⚔ line today |");
console.log("| --- | --- | --- | --- | --- | --- |");
// Outrage is the danger and the foe's own pick is weak: three Ice Beams fell it, and the faster foe wins the race only
// with the locked hit in it.
scenario({ name: "1 · foe faster, Outrage 150 / own 60, we 3HKO", outrage: 150, own: 60, ours: 110 });
// The same with the foe slower: we land the third hit first either way.
scenario({ name: "2 · as 1, foe slower", foeSpe: 60, outrage: 150, own: 60, ours: 110 });
// The locked hit knocks us out this turn.
scenario({ name: "3 · foe faster, Outrage KOs (300), own 60, we 3HKO", outrage: 300, own: 60, ours: 110 });
// Our hit knocks it out first.
scenario({ name: "4 · we faster and 1HKO", mySpe: 140, foeHp: 100, outrage: 150, own: 60, ours: 110 });
// We 1HKO but move second; Outrage doesn't KO.
scenario({ name: "5 · we slower, 1HKO, Outrage 150", foeHp: 100, outrage: 150, own: 60, ours: 110 });
// The blocked hit isn't dangerous: a resisted Outrage.
scenario({ name: "6 · Outrage resisted (40), own 60", outrage: 40, own: 60, ours: 110 });
// The foe's own pick hits as hard as Outrage: blocking one hit shifts both clocks by a turn.
scenario({ name: "7 · own pick as strong (150)", outrage: 150, own: 150, ours: 110 });
// As 3, with an Outrage-immune Clefable on the bench.
scenario({ name: "3b · as 3, immune Clefable benched", outrage: 300, own: 60, ours: 110, bench: true });
// Both its hits KO us; we 1HKO but move second: only a confusion self-hit lets us act.
scenario({ name: "9 · we slower and 1HKO, both its hits KO", foeHp: 100, outrage: 300, own: 300, ours: 110 });
// A long race: we 4HKO, Outrage 2HKOs, own weak.
scenario({ name: "8 · foe faster, Outrage 130 / own 60, we 4HKO", outrage: 130, own: 60, ours: 80 });
