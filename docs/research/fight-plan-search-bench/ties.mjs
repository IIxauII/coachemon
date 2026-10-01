// Sensitivity: every pairing's speed order uncertain (as with paralysis tokens or speed ties), so both orders branch.
import { timed } from "./bench.mjs";
import { fixture } from "./fixtures.mjs";
for (const kind of ["quick", "stall"]) for (const N of [3, 4, 5, 6]) {
  const o = [], n = [], same = [];
  for (const seed of [1, 2, 3]) {
    const a = timed(fixture(kind, N, 3, seed, { ties: true }), 3), b = timed(fixture(kind, N, 3, seed, { ties: true }), 3, { merge: "nn2", key: "fast" });
    o.push(a.med); n.push(b.med); same.push(a.json === b.json);
    if (seed === 1) console.log(`  searches s1 (ms, in call order: held?, free, at(mi)..., pinned): ${a.searches.map(x => x.toFixed(0)).join(" ")}`);
  }
  console.log(`ties ${kind} N=${N}: orig ${o.map(x => x.toFixed(0)).join("/")} ms · nn2+key ${n.map(x => x.toFixed(0)).join("/")} ms · identical ${same.join(",")}`);
}
