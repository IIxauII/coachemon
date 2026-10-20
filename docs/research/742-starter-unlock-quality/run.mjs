// `node docs/research/742-starter-unlock-quality/run.mjs` scores every starter's egg moves and final-form passive with
// the HUD's own code on the pinned game's data, then replays the starter card under flat and derived weights.
// Needs the provisioned pinned clone under .cache/pokerogue (in a worktree: link the main checkout's .cache).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "../../../skills/coachemon/scripts/hud-bundle.mjs";
import { suiteClone, testInClone, vitestOn } from "../../../scripts/clone-test/clone-test.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const HUD = path.join(ROOT, "skills/coachemon/scripts/hud");
const reviewed = JSON.parse(readFileSync(path.join(ROOT, "src/escape-ladder/reviewed.json"), "utf8"));

// Research-only edits to the bundle, never to the HUD source: expose four private helpers, let the test set the
// starter card's passive and egg-move weights, and rebuild the card on every call.
const PATCHES = {
  "40-learn.js": [["const moveScore = (", "export const moveScore = ("]],
  "12-value.js": [["const learnsetMoves = ", "export const learnsetMoves = "]],
  "51-starters.js": [
    ["const lineOf = ", "export const lineOf = "],
    [": { w: 8, text: own ?", ": { w: globalThis.__w742?.passive?.(id) ?? 8, text: own ?"],
    ["why.push({ w: 6, text: name ? `rare egg move", "why.push({ w: globalThis.__w742?.egg?.(id) ?? 6, text: name ? `rare egg move"],
    ["if (cache.key !== key) cache =", "if (true) cache ="],
  ],
};
const patch = (f, src) => {
  for (const [from, to] of PATCHES[f] ?? []) {
    if (src.split(from).length !== 2) throw new Error(`${f}: patch anchor not found exactly once: ${from}`);
    src = src.replace(from, to);
  }
  return src;
};
const files = readdirSync(HUD).filter(f => f.endsWith(".js") && f !== "99-start.js").sort()
  .map(f => [f, patch(f, readFileSync(path.join(HUD, f), "utf8"))]);

const input = JSON.parse(readFileSync(path.join(HERE, "config.json"), "utf8"));
const r = await testInClone({
  clone: suiteClone(), name: "742", echo: false,
  source: readFileSync(path.join(HERE, "starter742.test.ts.template"), "utf8"),
  bundle: bundle("hud", { expose: true, files }),
  input: JSON.stringify(input),
  vitest: vitestOn(reviewed.pinned.pnpm),
});
const plain = r.output.replace(/\u001b\[[0-9;]*m/g, "");
console.log(plain.split("\n").filter(l => /✓|×|FAIL|Error|Tests |742:/.test(l)).join("\n"));
if (!r.out) { console.error(plain.slice(-4000)); process.exit(2); }
const out = JSON.parse(r.out);
writeFileSync(path.join(HERE, "results.json"), `${JSON.stringify({ pin: reviewed.pinned, ...out })}\n`);
console.log(`wrote results.json (${Object.keys(out).join(", ")})`);
