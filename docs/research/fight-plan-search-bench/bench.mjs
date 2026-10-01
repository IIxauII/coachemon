// Benchmarks what one trainer turn card asks of the fight plan: tpModel (sweep, matrix, held/free searches), then
// at({ mi, free: false }) for every standing mi, then view(pin) (the ⚔ pick, a further pinned search) — on hand-built
// tables, with no game.  Usage: node bench.mjs [quick|stall|all] [runs]
import "./globals.mjs";
import { fixture } from "./fixtures.mjs";
const M = await import("./hud/35-team-plan.bench.js");

export const card = (fx, prof = false) => {
  const { T, party, foes, facing, pin } = fx;
  T.memo = new Map(); delete T.vmemo;
  M.reset(prof);
  const t0 = performance.now();
  M.enter("model");
  const model = M.tpModel(T, false, party, foes, facing);
  const t1 = performance.now();
  const ats = party.map((p, mi) => (p.hp >= 1 ? model.at({ mi, free: false }) : null));
  const t2 = performance.now();
  const view = model.view(pin);
  M.leave();
  const ms = performance.now() - t0;
  const phase = { model: t1 - t0, ats: t2 - t1, view: performance.now() - t2, searches: [...M.SEARCH_MS] };
  const base = model.at(null);
  const plan = model.at(pin);
  const out = { value: model.value, base: { val: base?.val, result: base?.result, steps: base?.steps }, ats: ats.map(a => a && { val: a.val, result: a.result, steps: a.steps }), pinned: { val: plan?.val, steps: plan?.steps }, view };
  return { ms, phase, C: { ...M.C, memo: T.memo.size }, P: { ...M.P }, out, json: JSON.stringify(out) };
};
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
export const timed = (fx, runs, opts = {}) => {
  M.knobs(opts);
  card(fx); // warm
  const ms = [], ph = [];
  let last;
  for (let i = 0; i < runs; i++) { last = card(fx); ms.push(last.ms); ph.push(last.phase); }
  const prof = card(fx, true);
  M.knobs({});
  return { med: median(ms), phase: Object.fromEntries(Object.keys(ph[0]).filter(k => k !== 'searches').map(k => [k, median(ph.map(x => x[k]))])), searches: ph[ph.length >> 1].searches, C: last.C, P: prof.P, profMs: prof.ms, json: last.json, out: last.out };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const kinds = process.argv[2] && process.argv[2] !== "all" ? [process.argv[2]] : ["quick", "stall"];
  const runs = +(process.argv[3] ?? 5);
  const seeds = (process.argv[4] ?? "1").split(",").map(Number);
  for (const kind of kinds) for (const seed of seeds) for (const N of [3, 4, 5, 6]) {
    const r = timed(fixture(kind, N, 3, seed), runs);
    const tot = Object.values(r.P).reduce((a, b) => a + b, 0);
    const pct = k => `${Math.round((r.P[k] ?? 0) / tot * 100)}%`;
    console.log(`${kind} s${seed} N=${N}: ${r.med.toFixed(1)} ms | fight ${r.C.fight} hit ${r.C.hit} miss ${r.C.miss} nomemo ${r.C.nomemo} | search ${r.C.search} value ${r.C.value} merge ${r.C.merge} (avg n ${(r.C.mergeN / r.C.merge).toFixed(1)}) | merge ${pct("merge1")}+${pct("mergeK")} fight@value ${pct("fight@value")} fight@other ${pct("fight@other")} value ${pct("value")} search ${pct("search")} model ${pct("model")} | turns-first ${r.out.pinned.steps?.[0]?.turns} result ${r.out.view?.result}`);
  }
}
