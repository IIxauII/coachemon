// Cross-check: the meter's own gaps ≥ 50 ms over the same stretch of the lag run, split by the overlay's ms inside.
import fs from "node:fs";

const [log, from = "587.4", to = "832.5"] = process.argv.slice(2);
const gaps = new Map();
for (const line of fs.readFileSync(log, "utf8").split("\n")) {
  if (!line) continue;
  const o = JSON.parse(line);
  if (o.kind === "window") for (const g of o.stats?.gaps ?? []) gaps.set(g.at, g);
}
const inRec = [...gaps.values()].filter(g => g.at / 1000 >= Number(from) && g.at / 1000 <= Number(to) && g.gap >= 50);
const free = inRec.filter(g => g.panel === 0);
const sum = (l, k) => Math.round(l.reduce((t, g) => t + g[k], 0));
console.log(`meter: ${inRec.length} gaps ≥ 50 ms, ${sum(inRec, "gap")} ms; overlay ms inside ${sum(inRec, "panel")} (${Math.round((sum(inRec, "panel") / sum(inRec, "gap")) * 100)}%); with no overlay: ${free.length}, ${sum(free, "gap")} ms`);
