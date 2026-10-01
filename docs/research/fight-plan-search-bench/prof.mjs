import { timed } from "./bench.mjs";
import { fixture } from "./fixtures.mjs";
const opts = JSON.parse(process.argv[2] ?? "{}");
for (const seed of [1, 2, 3]) {
  const r = timed(fixture("stall", 6, 3, seed), 3, opts);
  const tot = Object.values(r.P).reduce((a, b) => a + b, 0);
  console.log(seed, r.med.toFixed(0), "prof", r.profMs.toFixed(0), Object.entries(r.P).map(([k, v]) => `${k} ${Math.round(v / tot * 100)}%`).join(" "), "vhit", r.C.valueHit, "/", r.C.value, "miss", r.C.miss, "mergeOps", r.C.mergeOps);
}
