// `double-score.mjs [--move protect|spore|twave] [--terms] [config…]`: #850's double scene (our lead and Ally against
// Salamence and Snorlax) through `fieldPlan` under `prototype.patch`'s switches (a `CONFIGS` name or JSON). Prints the
// card's ⚔ lines and, with `--terms`, the best plan with the lead playing against the best with it attacking.
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const T = path.join(ROOT, "skills/coachemon/scripts/test");
const { bundle } = await import(path.join(ROOT, "skills/coachemon/scripts/hud-bundle.mjs"));
const { fakeTurn } = await import(path.join(T, "fake-turn.mjs"));

const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
const cat = { P: 0, S: 1, X: 2 };
const attr = a => (Array.isArray(a) ? Object.assign(new ({ [a[0]]: class {} })[a[0]](), a[1]) : new ({ [a]: class {} })[a]());
const mon = (name, lv, types, [hp, atk, def, spa, spd, spe], moves, field, curHp, extra = {}) => ({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)), getAbility: () => ({ name: "x" }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0, 0, 0, 0, 0, 0, 0], types: [] }, isOnField: () => field, isBoss: () => false,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null, getBattlerIndex: () => (field ? 0 : -1), getHeldItems: () => [],
  moveset: moves.map(([n, t, p, c, priority = 0, { target = 3, attrs = [], id } = {}]) => ({ getName: () => n, moveId: id, getMove: () => ({ id, name: n, type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, priority, accuracy: 100, attrs: attrs.map(attr) }), getMovePp: () => 10, ppUsed: 0 })),
  ...extra,
});

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

const render = ({ party, foes, dist, replay, cfg }) => {
  globalThis.window = globalThis; delete globalThis.__coachHud;
  const onField = () => party.filter(p => p.isOnField());
  for (const f of foes) { f.getOpponents = () => onField(); f.getMatchupScore = () => 1; }
  const trainer = { getName: () => "Trainer", config: { isBoss: true }, isDouble: () => true,
    getPartyMemberMatchupScores: () => [], getSortedPartyMemberMatchupScores: x => x, getNextSummonIndex: () => 1 };
  const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
  globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
  globalThis.Phaser = { Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } }, Display: { Canvas: { CanvasPool: { pool: [] } } } };
  globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: () => "full", setItem() {} };
  globalThis.__p850 = cfg;
  eval(bundle("hud", { expose: true }));
  const turn = fakeTurn({
    live: true, wave: 200, turn: 3, trainer, party, foes, double: true, decision: "command",
    outcome: (atk, def, pm) => outcome(atk, def, pm),
    statusMoves: atk => atk.moveset.filter(pm => pm.getMove().category === 2).map(pm => ({
      pm, name: pm.getName(), type: TY[pm.getMove().type], cat: "status", acc: 1, e: 1, priority: pm.getMove().priority ?? 0, bypassProtect: false, bounce: false, blocked: null,
    })),
    moves: dist, replay, switchTo: () => null,
  });
  globalThis.__p850trace = []; globalThis.__p862trace = []; globalThis.__p862plans = [];
  const card = { ...globalThis.__hud["60-card"].composeBattleCard(turn, null), wave: 200 };
  const out = { duel: globalThis.__p850trace, hyp: globalThis.__p862trace, plans: globalThis.__p862plans };
  globalThis.__p850trace = globalThis.__p862trace = globalThis.__p862plans = null;
  const txt = n => (n == null ? "" : typeof n === "string" ? n : n.children ? n.children.map(txt).join(" ") : "");
  const act = globalThis.__hud["96-render-battle"].drawBattle(card).find(g => g.id === "act");
  return { field: act.rows.map(txt).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean), ...out };
};

// The lead's status move: Protect (self, cancels this turn's hit at it), Spore (sleep) or Thunder Wave (paralysis).
const MOVES = {
  protect: ["Protect", "Normal", 0, "X", 4, { target: 0, attrs: ["ProtectAttr"], id: 182 }],
  spore: ["Spore", "Grass", 0, "X", 0, { id: 147, attrs: [["StatusEffectAttr", { effect: 4 }]] }],
  twave: ["Thunder Wave", "Electric", 0, "X", 0, { id: 86, attrs: [["StatusEffectAttr", { effect: 3 }]] }],
};

// #850's double: our lead beside Ally, Salamence beside Snorlax. With `lock`, Outrage's last use (`left` 1) is queued at
// the lead (battler 0); without, Salamence picks Fire Blast at it. Ally's Thunderbolt chips Salamence (60) or Snorlax
// (70), too little to fell either first, and Snorlax's Body Slam goes at Ally. `allyTb` raises Ally's hit on Salamence.
export const doubleScenario = ({ myHp = 250, mySpe = 80, foeHp = 300, foeSpe = 120, outrage, own, ours, left = 1, protectedLast = false, lock = true, move = "protect", allyTb = 60 }, cfg) => {
  Object.assign(TABLE, {
    "Lead>Ice Beam>Salamence": [[ours], 1, 4], "Lead>Ice Beam>Snorlax": [[50], 1, 1],
    "Ally>Thunderbolt>Salamence": [[allyTb], 1, 1], "Ally>Thunderbolt>Snorlax": [[70], 1, 1],
    "Salamence>Outrage>Lead": [[outrage], 1, 1], "Salamence>Fire Blast>Lead": [[own], 1, 1],
    "Salamence>Outrage>Ally": [[outrage], 1, 1], "Salamence>Fire Blast>Ally": [[own], 1, 1],
    "Snorlax>Body Slam>Lead": [[40], 1, 1], "Snorlax>Body Slam>Ally": [[40], 1, 1],
  });
  const extra = protectedLast ? { getLastXMoves: () => [{ move: 182, result: 1 }] } : {};
  const me = mon("Lead", 80, ["Water"], [myHp, 100, 100, 100, 100, mySpe], [["Ice Beam", "Ice", 90, "S"], MOVES[move]], true, undefined, { ...extra, getBattlerIndex: () => 0 });
  const ally = mon("Ally", 80, ["Electric"], [300, 100, 100, 100, 100, 70], [["Thunderbolt", "Electric", 90, "S"]], true, undefined, { getBattlerIndex: () => 1 });
  const foe = mon("Salamence", 80, ["Dragon", "Flying"], [foeHp, 200, 100, 100, 100, foeSpe],
    [["Outrage", "Dragon", 120, "P", 0, { target: 7, id: 200 }], ["Fire Blast", "Fire", 110, "S", 0, { id: 126 }]], true, undefined,
    lock ? { getTag: t => (t === "FRENZY" ? { turnCount: left } : null), getMoveQueue: () => [{ move: 200, targets: [0], useMode: 2 }], getBattlerIndex: () => 2 } : { getBattlerIndex: () => 2 });
  const snorlax = mon("Snorlax", 80, ["Normal"], [460, 150, 110, 80, 150, 40], [["Body Slam", "Normal", 85, "P"]], true, undefined, { getBattlerIndex: () => 3 });
  const first = lock ? "Outrage" : "Fire Blast";
  const dist = e => (e === foe ? [{ name: first, type: lock ? "Dragon" : "Fire", p: 1, score: 10, targets: [0], exact: lock }] : [{ name: "Body Slam", type: "Normal", p: 1, score: 10, targets: [1] }]);
  const replay = (e, _t, opts) => (e === foe ? [{ name: !lock || opts?.afterLock || left === 0 ? "Fire Blast" : "Outrage", type: "Dragon", p: 1 }] : [{ name: "Body Slam", type: "Normal", p: 1 }]);
  return render({ party: [me, ally], foes: [foe, snorlax], dist, replay, cfg });
};

// #850's cases. The target for Protect: picked in 1, 3, 8 and 9; attack in 2, 4–7, 3p and 10–12.
export const CASES = [
  ["1", "foe faster, Outrage 150 / own 60, we 3HKO", { outrage: 150, own: 60, ours: 110 }, true],
  ["2", "as 1, foe slower", { foeSpe: 60, outrage: 150, own: 60, ours: 110 }, false],
  ["3", "foe faster, Outrage KOs (300), own 60, we 3HKO", { outrage: 300, own: 60, ours: 110 }, true],
  ["4", "we faster and 1HKO", { mySpe: 140, foeHp: 100, outrage: 150, own: 60, ours: 110 }, false],
  ["5", "we slower, 1HKO, Outrage 150", { foeHp: 100, outrage: 150, own: 60, ours: 110 }, false],
  ["6", "Outrage resisted (40), own 60", { outrage: 40, own: 60, ours: 110 }, false],
  ["7", "own pick as strong (150)", { outrage: 150, own: 150, ours: 110 }, false],
  ["9", "we slower and 1HKO, both its hits KO", { foeHp: 100, outrage: 300, own: 300, ours: 110 }, true],
  ["8", "foe faster, Outrage 130 / own 60, we 4HKO", { outrage: 130, own: 60, ours: 80 }, true],
  ["3p", "as 3, Protect held last turn", { outrage: 300, own: 60, ours: 110, protectedLast: true }, false],
  ["10", "no lock, Fire Blast 150 a turn, we 3HKO", { outrage: 0, own: 150, ours: 110, lock: false }, false],
  ["11", "no lock, Fire Blast KOs (300), we 3HKO", { outrage: 0, own: 300, ours: 110, lock: false }, false],
  ["12", "no lock, Fire Blast 60, we 3HKO", { outrage: 0, own: 60, ours: 110, lock: false }, false],
];

export const CONFIGS = {
  // Today: Protect offered through #262's field hypothesis.
  today: { protect: true },
  // #850's own-duel Protect.
  "own duel": { protect: true, dprotect: "own" },
  // Every double status play priced on its slot's own duel, the race priced by the foe that threatens the slot most.
  own: { protect: true, dplay: "own", pfield: true },
  // …and the partner redirected by the play's follow-up, as by an attack's knockout this turn.
  "own + redirect": { protect: true, dplay: "own", pfield: true, redir: "then" },
  // Rejected: …with #860's singles prices in the double too.
  "own + redirect + singles prices": { protect: true, dplay: "own", pfield: true, redir: "then", hp: 1, loss: 4, scope: "all" },
  // Recommended: …with the hit the play cancels credited at its `danger`, and the double's prices left as they are.
  proposed: { protect: true, dplay: "own", pfield: true, redir: "then", dcredit: true },
};

const r2 = v => (v == null ? "—" : (Math.round(v * 100) / 100).toFixed(2));
const lines = field => field.filter(l => /^(now: )?[⚔⇄]/.test(l)).join(" ⏐ ").replace(/\|/g, "/");
const plays = (field, name) => field.some(l => /^(now: )?⚔ Lead/.test(l) && l.includes(name));
// The best plan with the lead playing, and the best with it attacking, from every plan the search scored.
const bestOf = (plans, f) => plans.filter(f).reduce((b, p) => (!b || p.score > b.score ? p : b), null);
const leadOf = p => p?.picks.find(q => q.me === "Lead");
const allyOf = p => p?.picks.find(q => q.me === "Ally");
const tgt = t => (t === 0 ? "Salamence" : t === 1 ? "Snorlax" : t ?? "");

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const terms = args.includes("--terms");
  const mi = args.indexOf("--move");
  const move = mi >= 0 ? args[mi + 1] : "protect";
  const which = args.filter((a, i) => !a.startsWith("--") && !(mi >= 0 && i === mi + 1));
  const name = MOVES[move][0];
  if (args.includes("--credit")) {
    // The lead's play as the field prices it (its −1.2 plus its attack re-read on the hypothesis), against the same
    // play on the slot's own duel (`playOption`, the singles price).
    const cfg = { protect: true, ...(which[0] ? CONFIGS[which[0]] ?? JSON.parse(which[0]) : {}) };
    console.log(`\n### ${name}: the field hypothesis against the own duel — \`${JSON.stringify(cfg)}\`\n`);
    console.log("| Case | Ice Beam, real turn (lasts) | Ice Beam on the hypothesis (lasts) | Field's price of the play | Own-duel price | Over-credit | of it, `lasts` |\n| --- | --- | --- | --- | --- | --- | --- |");
    for (const [id, label, sc] of CASES) {
      const r = doubleScenario({ ...sc, move }, cfg);
      const h = r.hyp.find(x => x.kind === "hyp" && x.me === "Lead" && x.landed);
      const o = r.hyp.find(x => x.kind === "own" && x.me === "Lead" && x.target === 0);
      if (!h || !o) { console.log(`| ${id} · ${label} | not offered | | | | | |`); continue; }
      const att = r.duel.filter(x => x.kind === "attack" && x.me === "Lead" && x.move === "Ice Beam" && x.target === 0);
      const real = att.find(x => !x.hyp), hy = att.find(x => x.hyp);
      const field = h.own + h.hypScore;
      // No own-duel price: the foe fells us before the play goes off (`standing` < 0.05), and the field agrees.
      const gap = o.ownScore == null ? "n/a" : r2(field - o.ownScore);
      console.log(`| ${id} · ${label} | ${r2(real?.score)} (${r2(real?.lasts)}) | ${r2(hy?.score)} (${r2(hy?.lasts)}) | ${r2(field)} | ${r2(o.ownScore)} | ${gap} | ${o.ownScore == null ? "" : r2(hy.lasts - real.lasts)} |`);
    }
    process.exit(0);
  }
  for (const cname of which.length ? which : Object.keys(CONFIGS)) {
    const cfg = CONFIGS[cname] ?? JSON.parse(cname);
    console.log(`\n### ${name}, ${cname} — \`${JSON.stringify(cfg)}\`\n`);
    console.log(terms
      ? "| Case | Plan | Plan score | Lead | Lead score | Ally | Ally score (redirect) | Joint |\n| --- | --- | --- | --- | --- | --- | --- | --- |"
      : "| Case | Want | Got | The card's ⚔ lines |\n| --- | --- | --- | --- |");
    let wrong = 0;
    for (const [id, label, sc, want] of CASES) {
      const r = doubleScenario({ ...sc, move }, cfg);
      const got = plays(r.field, name);
      if (move === "protect" && got !== want) wrong++;
      if (!terms) { console.log(`| ${id} · ${label} | ${move === "protect" ? (want ? name : "attack") : ""} | ${got ? name : "attack"} | ${lines(r.field)} |`); continue; }
      const pl = bestOf(r.plans, p => leadOf(p)?.move === name && p.swaps === 0);
      const at = bestOf(r.plans, p => leadOf(p)?.move && leadOf(p).move !== name && p.swaps === 0);
      for (const [p, nm] of [[at, "attack"], [pl, name]]) {
        if (!p) { console.log(`| ${id} | ${nm} | not offered | | | | | |`); continue; }
        const L = leadOf(p), A = allyOf(p);
        const red = A?.redir > 0 ? ` (${r2(A.redir)} × ${r2(A.redirScore)} + ${r2(1 - A.redir)} × ${r2(A.own)})` : "";
        console.log(`| ${id} | ${nm} | ${r2(p.score)} | ${L.move} → ${tgt(L.target)} | ${r2(L.score)} | ${A?.move} → ${tgt(A?.target)} | ${r2(A?.score)}${red} | ${r2(p.jv)} |`);
      }
      if (args.includes("--hyp")) for (const h of r.hyp.filter(h => h.me === "Lead")) {
        console.log(`| ${id} | hyp w ${r2(h.w)}${h.landed ? " landed" : ""} | | ${h.best} → ${tgt(h.target)} | real ${r2(h.realScore)} → hyp ${r2(h.hypScore)} (+${r2(h.hypScore - h.realScore)}); own ${r2(h.own)} | | | |`);
      }
    }
    if (move === "protect" && !terms) console.log(`\n${wrong} of ${CASES.length} cases off the target.`);
  }
}
