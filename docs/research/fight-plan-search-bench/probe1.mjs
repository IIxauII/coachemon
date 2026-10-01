import { timed } from "./bench.mjs";
import { fixture } from "./fixtures.mjs";
for (const kind of ["quick", "stall"]) for (const N of [3, 4, 5, 6]) {
  const r = timed(fixture(kind, N, 3, 1), 1);
  const tot = Object.values(r.P).reduce((a, b) => a + b, 0);
  const pct = k => `${Math.round((r.P[k] ?? 0) / tot * 100)}%`;
  console.log(kind, N, `merge1 ${pct("merge1")} (calls ${r.C.merge1}, avg n ${(r.C.merge1N / r.C.merge1).toFixed(0)}, max ${r.C.merge1Max}) mergeK ${pct("mergeK")} (max n ${r.C.mergeKMax}) children ${r.C.child}`);
}
