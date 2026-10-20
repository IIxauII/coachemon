// `turn-score.mjs [--terms] [--double] [config…]`: #749's lock turns through `fieldPlan` under `prototype.patch`'s
// `P850` switches (a `CONFIGS` name or JSON); prints the card's pick and, with `--terms`, each option's scored terms.
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const T = path.join(ROOT, "skills/coachemon/scripts/test");
const { bundle } = await import(path.join(ROOT, "skills/coachemon/scripts/hud-bundle.mjs"));
const { fakeTurn } = await import(path.join(T, "fake-turn.mjs"));

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };

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

const render = ({ party, foes, dist, replay, cfg, double = false }) => {
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const onField = () => party.filter(p => p.isOnField());
  for (const f of foes) { f.getOpponents = () => onField(); f.getMatchupScore = () => 1; }
  const trainer = { getName: () => "Trainer", config: { isBoss: true }, isDouble: () => double,
    getPartyMemberMatchupScores: () => [], getSortedPartyMemberMatchupScores: x => x, getNextSummonIndex: () => 1 };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [] } } } };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  globalThis.__p850 = cfg;
  eval(bundle("hud", { expose: true }));
  const turn = fakeTurn({
    live: true, wave: 200, turn: 3, trainer, party, foes, double, decision: "command",
    outcome: (atk, def, pm) => outcome(atk, def, pm),
    statusMoves: atk => atk.moveset.filter(pm => pm.getMove().category === 2).map(pm => ({
      pm, name: pm.getName(), type: TY[pm.getMove().type], cat: "status", acc: 1, e: 1, priority: pm.getMove().priority ?? 0, bypassProtect: false, bounce: false, blocked: null,
    })),
    moves: dist, replay, switchTo: () => null,
  });
  globalThis.__p850trace = [];
  const card = { ...globalThis.__hud["60-card"].composeBattleCard(turn, null), wave: 200 };
  const trace = globalThis.__p850trace;
  globalThis.__p850trace = null;
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
  const groups = globalThis.__hud["96-render-battle"].drawBattle(card);
  const act = groups.find(g => g.id === "act");
  return { field: act.rows.map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean), trace };
};

// One stubbed singles turn: Salamence's Outrage on its last use (`left` 1) at our lead, which can Ice Beam or Protect.
// `outrage`, `own`: max damage a hit of Outrage, and of the Fire Blast it picks itself once the lock is spent; `ours`:
// Ice Beam's. Speeds decide the order.
export const scenario = ({ myHp = 250, mySpe = 80, foeHp = 300, foeSpe = 120, outrage, own, ours, left = 1, bench = false, protectedLast = false, lock = true }, cfg) => {
  Object.assign(TABLE, {
    "Lead>Ice Beam>Salamence": [[ours], 1, 4],
    "Salamence>Outrage>Lead": [[outrage], 1, 1],
    "Salamence>Fire Blast>Lead": [[own], 1, 1],
    "Clefable>Moonblast>Salamence": [[90], 1, 2],
    "Salamence>Outrage>Clefable": [[0], 1, 0],
    "Salamence>Fire Blast>Clefable": [[100], 1, 1],
  });
  const extra = protectedLast ? { getLastXMoves: () => [{ move: 182, result: 1 }] } : {};
  const me = mon("Lead", 80, ["Water"], [myHp, 100, 100, 100, 100, mySpe],
    [["Ice Beam", "Ice", 90, "S"], ["Protect", "Normal", 0, "X", 4, { target: 0, attrs: ["ProtectAttr"], id: 182 }]], true, undefined, extra);
  const foe = mon("Salamence", 80, ["Dragon", "Flying"], [foeHp, 200, 100, 100, 100, foeSpe],
    [["Outrage", "Dragon", 120, "P", 0, { target: 7, id: 200 }], ["Fire Blast", "Fire", 110, "S", 0, { id: 126 }]], true, undefined,
    lock ? { getTag: t => (t === "FRENZY" ? { turnCount: left } : null), getMoveQueue: () => [{ move: 200, targets: [0], useMode: 2 }] } : {});
  // `lock` false: no lock running, and the foe picks Fire Blast every turn.
  const dist = () => (lock ? [{ name: "Outrage", type: "Dragon", p: 1, score: 10, targets: [0], exact: true }] : [{ name: "Fire Blast", type: "Fire", p: 1, score: 10, targets: [0], exact: true }]);
  const replay = (_e, _t, opts) => [{ name: !lock || opts?.afterLock || left === 0 ? "Fire Blast" : "Outrage", type: "Dragon", p: 1 }];
  const clefable = mon("Clefable", 80, ["Fairy"], [300, 80, 120, 120, 140, 60], [["Moonblast", "Fairy", 95, "S"]], false);
  return render({ party: bench ? [me, clefable] : [me], foes: [foe], dist, replay, cfg });
};

// The same turn in a double: our Ally stands beside the lead and Snorlax beside Salamence. Outrage's last use is queued
// at the lead (battler 0); Ally's Thunderbolt chips Salamence (60) or Snorlax (70), too little to fell either first,
// so `supportFor`'s Protect (the partner KOs that foe first) never applies, and Snorlax's Body Slam goes at Ally.
export const doubleScenario = ({ myHp = 250, mySpe = 80, foeHp = 300, foeSpe = 120, outrage, own, ours, left = 1, protectedLast = false }, cfg) => {
  Object.assign(TABLE, {
    "Lead>Ice Beam>Salamence": [[ours], 1, 4], "Lead>Ice Beam>Snorlax": [[50], 1, 1],
    "Ally>Thunderbolt>Salamence": [[60], 1, 1], "Ally>Thunderbolt>Snorlax": [[70], 1, 1],
    "Salamence>Outrage>Lead": [[outrage], 1, 1], "Salamence>Fire Blast>Lead": [[own], 1, 1],
    "Salamence>Outrage>Ally": [[outrage], 1, 1], "Salamence>Fire Blast>Ally": [[own], 1, 1],
    "Snorlax>Body Slam>Lead": [[40], 1, 1], "Snorlax>Body Slam>Ally": [[40], 1, 1],
  });
  const extra = protectedLast ? { getLastXMoves: () => [{ move: 182, result: 1 }] } : {};
  const me = mon("Lead", 80, ["Water"], [myHp, 100, 100, 100, 100, mySpe],
    [["Ice Beam", "Ice", 90, "S"], ["Protect", "Normal", 0, "X", 4, { target: 0, attrs: ["ProtectAttr"], id: 182 }]], true, undefined, { ...extra, getBattlerIndex: () => 0 });
  const ally = mon("Ally", 80, ["Electric"], [300, 100, 100, 100, 100, 70], [["Thunderbolt", "Electric", 90, "S"]], true, undefined, { getBattlerIndex: () => 1 });
  const foe = mon("Salamence", 80, ["Dragon", "Flying"], [foeHp, 200, 100, 100, 100, foeSpe],
    [["Outrage", "Dragon", 120, "P", 0, { target: 7, id: 200 }], ["Fire Blast", "Fire", 110, "S", 0, { id: 126 }]], true, undefined,
    { getTag: t => (t === "FRENZY" ? { turnCount: left } : null), getMoveQueue: () => [{ move: 200, targets: [0], useMode: 2 }], getBattlerIndex: () => 2 });
  const snorlax = mon("Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]], true, undefined, { getBattlerIndex: () => 3 });
  const dist = e => (e === foe ? [{ name: "Outrage", type: "Dragon", p: 1, score: 10, targets: [0], exact: true }] : [{ name: "Body Slam", type: "Normal", p: 1, score: 10, targets: [1] }]);
  const replay = (e, _t, opts) => (e === foe ? [{ name: opts?.afterLock || left === 0 ? "Fire Blast" : "Outrage", type: "Dragon", p: 1 }] : [{ name: "Body Slam", type: "Normal", p: 1 }]);
  return render({ party: [me, ally], foes: [foe, snorlax], dist, replay, cfg, double: true });
};

export const CASES = [
  // Outrage is the danger and the foe's own pick is weak: three Ice Beams fell it, and the faster foe wins the race
  // only with the locked hit in it.
  ["1", "foe faster, Outrage 150 / own 60, we 3HKO", { outrage: 150, own: 60, ours: 110 }],
  ["2", "as 1, foe slower", { foeSpe: 60, outrage: 150, own: 60, ours: 110 }],
  ["3", "foe faster, Outrage KOs (300), own 60, we 3HKO", { outrage: 300, own: 60, ours: 110 }],
  ["4", "we faster and 1HKO", { mySpe: 140, foeHp: 100, outrage: 150, own: 60, ours: 110 }],
  ["5", "we slower, 1HKO, Outrage 150", { foeHp: 100, outrage: 150, own: 60, ours: 110 }],
  ["6", "Outrage resisted (40), own 60", { outrage: 40, own: 60, ours: 110 }],
  ["7", "own pick as strong (150)", { outrage: 150, own: 150, ours: 110 }],
  ["3b", "as 3, immune Clefable benched", { outrage: 300, own: 60, ours: 110, bench: true }],
  ["9", "we slower and 1HKO, both its hits KO", { foeHp: 100, outrage: 300, own: 300, ours: 110 }],
  ["8", "foe faster, Outrage 130 / own 60, we 4HKO", { outrage: 130, own: 60, ours: 80 }],
  ["3p", "as 3, Protect held last turn", { outrage: 300, own: 60, ours: 110, protectedLast: true }],
  // No lock: Protect only puts the same duel off a turn.
  ["10", "no lock, Fire Blast 150 a turn, we 3HKO", { outrage: 0, own: 150, ours: 110, lock: false }],
  ["11", "no lock, Fire Blast KOs (300), we 3HKO", { outrage: 0, own: 300, ours: 110, lock: false }],
  ["12", "no lock, Fire Blast 60, we 3HKO", { outrage: 0, own: 60, ours: 110, lock: false }],
];

export const CONFIGS = {
  // Today's score, Protect offered.
  today: { protect: true },
  // Rejected: a play's margin read off the state it leaves (§1).
  stall: { protect: true, stall: true },
  // Rejected: the foe's bar left when we fall, generalising `pNeverUsed` (§4).
  left: { protect: true, left: true, hp: 1, loss: 4 },
  // The HP a duel costs the mon fighting it, at 1 turn a bar (the rate `cost` charges for recoil), alone.
  hp: { protect: true, hp: 1 },
  // Our mon lost at 4 turns (`ALLY_KO_COST`), alone.
  loss4: { protect: true, loss: 4 },
  "hp+loss2": { protect: true, hp: 1, loss: 2 },
  // Recommended.
  "hp+loss4": { protect: true, hp: 1, loss: 4 },
  "hp+loss4, STATUS_COST 0": { protect: true, hp: 1, loss: 4, sc: 0 },
  // A double's Protect priced on the slot's own duel instead of #262's field hypothesis (§6).
  "own duel": { protect: true, dprotect: "own" },
};

const r2 = v => (v == null ? "—" : (Math.round(v * 100) / 100).toFixed(2));
const pick = field => (field.find(l => /^(now: )?[⚔⇄]/.test(l)) ?? field[0] ?? "").replace(/\|/g, "/");
const named = (trace, move) => trace.filter(r => r.me === "Lead" && r.move === move).at(-1);

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const terms = args.includes("--terms");
  const double = args.includes("--double");
  const which = args.filter(a => !a.startsWith("--"));
  if (double) {
    for (const name of which.length ? which : Object.keys(CONFIGS)) {
      const cfg = CONFIGS[name] ?? JSON.parse(name);
      console.log(`\n### double, ${name} — \`${JSON.stringify(cfg)}\`\n`);
      console.log("| Case | The card's ⚔ lines |\n| --- | --- |");
      for (const [id, label, sc] of CASES.filter(c => !c[2].bench)) {
        const { field } = doubleScenario(sc, cfg);
        console.log(`| ${id} · ${label} | ${field.filter(l => /^(now: )?[⚔⇄]/.test(l)).join(" ⏐ ").replace(/\|/g, "/")} |`);
      }
    }
    process.exit(0);
  }
  for (const name of which.length ? which : Object.keys(CONFIGS)) {
    const cfg = CONFIGS[name] ?? JSON.parse(name);
    console.log(`\n### ${name} — \`${JSON.stringify(cfg)}\`\n`);
    console.log(terms
      ? "| Case | Option | score | lasts | eTurns | short | P we / P they | HP left | kept | Protect − attack |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
      : "| Case | Attack score | Protect score | Protect − attack | The card's ⚔ line |\n| --- | --- | --- | --- | --- |");
    for (const [id, label, sc] of CASES) {
      const { field, trace } = scenario(sc, cfg);
      const a = named(trace, "Ice Beam"), p = named(trace, "Protect");
      const d = a && p ? p.score - a.score : null;
      if (!terms) { console.log(`| ${id} · ${label} | ${r2(a?.score)} | ${r2(p?.score)} | ${r2(d)} | ${pick(field)} |`); continue; }
      for (const [x, nm] of [[a, "Ice Beam"], [p, "Protect"]]) {
        if (!x) { console.log(`| ${id} | ${nm} | not offered | | | | | | | |`); continue; }
        console.log(`| ${id} | ${nm} | ${r2(x.score)} | ${r2(x.lasts)} | ${r2(x.eTurns)} | ${r2(x.short)} | ${r2(x.we)} / ${r2(x.they)} | ${x.hpLeft} | ${r2(x.kept)} | ${x === p ? r2(d) : ""} |`);
      }
    }
  }
}
