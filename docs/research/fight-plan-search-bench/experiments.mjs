// Answer-preserving and answer-changing variants against the original, on the same fixtures.
// Usage: node experiments.mjs [runs] [seeds]
import { timed } from "./bench.mjs";
import { fixture } from "./fixtures.mjs";
const runs = +(process.argv[2] ?? 5);
const seeds = Array.from({ length: +(process.argv[3] ?? 6) }, (_, i) => i + 1);
const ties = process.argv[4] === "ties";
const kinds = (process.argv[5] ?? "quick,stall").split(",");
const SAFE = { nn: { merge: "nn" }, nn2: { merge: "nn2" }, "nn2+key": { merge: "nn2", key: "fast" }, "nn2+key+vmemo": { merge: "nn2", key: "fast", valMemo: true } };
const BASE = { merge: "nn2", key: "fast" };
const LOSSY = {
  "beam12": { ...BASE, beam: 12 }, "beam6": { ...BASE, beam: 6 },
  "turns10": { ...BASE, turns: 10 }, "turns6": { ...BASE, turns: 6 },
  "coarse1%": { ...BASE, coarse: 0.01 }, "coarse3%": { ...BASE, coarse: 0.03 },
};
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const step = s => s && `${s.mi}>${s.fi}:${s.entry}`;
const argmax = ats => ats.reduce((b, a, i) => (a && (b < 0 || a.val > ats[b].val) ? i : b), -1);
const rows = {};
for (const kind of kinds) for (const N of [3, 4, 5, 6]) {
  const acc = { orig: [], phase: [] };
  for (const seed of seeds) {
    const fx = () => fixture(kind, N, 3, seed, { ties });
    const o = timed(fx(), runs);
    acc.orig.push(o.med); acc.phase.push(o.phase);
    (acc.C ??= []).push(o.C); (acc.P ??= []).push(o.P);
    for (const [name, k] of Object.entries({ ...SAFE, ...LOSSY })) {
      const r = timed(fx(), runs, k);
      const a = (acc[name] ??= { ms: [], same: 0, first: 0, result: 0, pin2: 0, pick: 0, dval: [] });
      a.ms.push(r.med);
      if (r.json === o.json) a.same++;
      if (step(r.out.base.steps?.[0]) !== step(o.out.base.steps?.[0])) a.first++;
      if (r.out.base.result !== o.out.base.result) a.result++;
      if (step(r.out.pinned.steps?.[1]) !== step(o.out.pinned.steps?.[1])) a.pin2++;
      if (argmax(r.out.ats) !== argmax(o.out.ats)) a.pick++;
      a.dval.push(Math.abs(r.out.base.val - o.out.base.val));
    }
  }
  const S = seeds.length;
  const sum = k => acc.C.reduce((t, c) => t + (c[k] ?? 0), 0) / S;
  const ptot = acc.P.map(p => Object.values(p).reduce((a, b) => a + b, 0));
  const share = k => Math.round(acc.P.reduce((t, p, i) => t + (p[k] ?? 0) / ptot[i], 0) / S * 100);
  const ph = k => med(acc.phase.map(x => x[k])).toFixed(1);
  console.log(`\n== ${ties ? "ties " : ""}${kind} N=${N} (median over ${S} seeds of per-seed median of ${runs})`);
  console.log(`orig ${med(acc.orig).toFixed(1)} ms (min ${Math.min(...acc.orig).toFixed(1)}, max ${Math.max(...acc.orig).toFixed(1)}) · phases model ${ph("model")} / ats ${ph("ats")} / view ${ph("view")}`);
  console.log(`  mean counts: tpFight ${sum("fight").toFixed(0)} (hit ${sum("hit").toFixed(0)}, miss ${sum("miss").toFixed(0)}) · tpSearch ${sum("search").toFixed(1)} · tpValue ${sum("value").toFixed(0)} · children ${sum("child").toFixed(0)} · tpMerge ${sum("merge").toFixed(0)} (to-1 ${sum("merge1").toFixed(0)}, max n ${Math.max(...acc.C.map(c => c.merge1Max))}; to-4 max n ${Math.max(...acc.C.map(c => c.mergeKMax))})`);
  console.log(`  time share: merge-to-1 ${share("merge1")}% · merge-to-4 ${share("mergeK")}% · tpFight rest (under tpValue ${share("fight@value")}%, elsewhere ${share("fight@other")}%) · tpValue own ${share("value")}% · tpSearch own ${share("search")}% · tpModel own ${share("model")}%`);
  for (const [name, a] of Object.entries(acc)) {
    if (!a.ms) continue;
    const sp = med(a.ms.map((m, i) => acc.orig[i] / m));
    console.log(`  ${name.padEnd(13)} ${med(a.ms).toFixed(1).padStart(7)} ms  x${sp.toFixed(1)}  identical ${a.same}/${S}  base-first-step changed ${a.first}/${S}  result ${a.result}/${S}  pinned-step2 ${a.pin2}/${S}  at()-argmax ${a.pick}/${S}  max|dval| ${Math.max(...a.dval).toFixed(2)}`);
  }
}
