// #514: does `tpMerge(list, 1)` — how `tpFight`'s `one()` collapses an ending's pool — equal the plain p-weighted
// mean for its continuous fields? Runs the real `tpMerge` out of 35-team-plan.js on random pools.
//   node docs/research/read-stage-stall/merge-one.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../../skills/coachemon/scripts/hud/35-team-plan.js", import.meta.url), "utf8");
const body = src.slice(src.indexOf("const tpMerge = "), src.indexOf("const tpFoeLeft"));
const tpMerge = new Function(`${body}; return tpMerge;`)();

const CONT = ["mh", "fh", "ox", "od", "og", "fd", "fg", "turns"];
const DISC = ["fs", "mb", "fb"];
let seed = 514;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const T = { ourMax: [45], foeMax: [51] };

let worstCont = 0, discSame = 0, discHeaviest = 0, trials = 0;
const timing = [];
for (const n of [8, 32, 128, 256, 372]) {
  for (let k = 0; k < 20; k++) {
    const list = Array.from({ length: n }, () => ({
      p: rnd() / n, mh: rnd() * 45 - 5, fh: rnd() * 51 - 5, fs: rnd() < 0.1 ? 1 : 0, mb: rnd() < 0.2 ? 1 : 0, fb: rnd() < 0.2 ? 2 : 0,
      ox: rnd(), od: rnd(), og: rnd(), fd: rnd(), fg: rnd(), turns: 1 + Math.floor(rnd() * 12),
    }));
    const t0 = performance.now();
    const [one] = tpMerge(list, 1, T, 0, 0);
    if (k === 0) timing.push(`n=${n}: ${Math.round((performance.now() - t0) * 10) / 10} ms`);
    const P = list.reduce((t, b) => t + b.p, 0);
    for (const f of CONT) {
      const mean = list.reduce((t, b) => t + b[f] * b.p, 0) / P;
      worstCont = Math.max(worstCont, Math.abs(mean - one[f]) / Math.max(1, Math.abs(mean)));
    }
    const heaviest = list.reduce((b, x) => (x.p > b.p ? x : b));
    // The most likely discrete combination, by summed p.
    const by = new Map();
    for (const b of list) { const key = DISC.map(f => b[f]).join(); by.set(key, (by.get(key) ?? 0) + b.p); }
    const mode = [...by].sort((a, b) => b[1] - a[1])[0][0];
    trials++;
    if (DISC.map(f => one[f]).join() === mode) discSame++;
    if (DISC.every(f => one[f] === heaviest[f])) discHeaviest++;
    if (Math.abs(one.p - P) > 1e-12) throw new Error("p not conserved");
  }
}
console.log(`continuous fields: worst relative gap to the p-weighted mean ${worstCont.toExponential(2)} over ${trials} pools`);
console.log(`discrete fields (fs, mb, fb): equal the most likely combination in ${discSame}/${trials}, the heaviest branch's in ${discHeaviest}/${trials}`);
console.log(`tpMerge(list, 1) time: ${timing.join(", ")}`);
