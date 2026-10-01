/**
 * Research harness for #514 (research branch only, never merged): the overlay's battle card built against the real
 * game, headless, with the `read` stage split into what it spends its time on.
 *
 *   node docs/research/read-stage-stall/run.ts [vitest args]     # writes .cache/read-stage/<stamp>.json
 *
 * It is the encounter oracle's mechanics (scripts/encounter-oracle/run.ts): the HUD bundle is evaluated inside
 * upstream's vitest harness in the pinned clone, so every damage and AI answer comes from the game itself. Unlike the
 * oracle it bundles *patched* copies of the HUD sources: each patch below wraps one function in a timer or a counter
 * kept on `globalThis.__prof`. The sources in the repo are never touched, and a patch whose anchor is gone fails
 * loudly rather than measuring nothing.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../../skills/coachemon/scripts/hud-bundle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const HUD = path.join(ROOT, "skills/coachemon/scripts/hud");
const pin = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).config?.pokerogueVersion
  ?? readdirSync(path.join(ROOT, ".cache/pokerogue")).find(d => d.startsWith("v"))?.slice(1);
const clone = path.join(ROOT, `.cache/pokerogue/v${pin}`);

const P = "globalThis.__prof";
// [file, anchor, replacement]: each anchor must occur exactly once.
const PATCHES: [string, string, string][] = [
  // --- 35-team-plan: the fight plan
  ["35-team-plan.js", "export const tpFight = (T, st, mi, fi, entry, over = null) => {",
    `export const tpFight = (...a) => ${P}.fight(tpFight0, a);\nconst tpFight0 = (T, st, mi, fi, entry, over = null) => {`],
  ["35-team-plan.js", "  const mass = list => list.reduce((t, b) => t + b.p, 0);",
    `  ${P}.fightEnd(turns, standing.length);\n  const mass = list => list.reduce((t, b) => t + b.p, 0);`],
  ["35-team-plan.js", "const tpMerge = (list, k, T, mi, fi) => {",
    `const tpMerge = (...a) => ${P}.merge(tpMerge0, a);\nconst tpMerge0 = (list, k, T, mi, fi) => {`],
  ["35-team-plan.js", "const tpSearch = (T, start, reserve, pin = null) => {",
    `const tpSearch = (T, start, reserve, pin = null) => ${P}.span(pin ? (pin.move ? "search:at+move" : "search:at") : reserve.length ? "search:held" : "search:free", () => tpSearch0(T, start, reserve, pin), true);\nconst tpSearch0 = (T, start, reserve, pin = null) => {`],
  ["35-team-plan.js", "      for (const [mi, entry] of cands) {",
    `      ${P}.count("search.states"); ${P}.count("search.cands", cands.length);\n      for (const [mi, entry] of cands) {`],
  ["35-team-plan.js", "    beam = [...next.values()].sort((a, b) => b.val - a.val).slice(0, TP_BEAM);",
    `    ${P}.count("search.depths"); ${P}.max("search.beam", next.size);\n    beam = [...next.values()].sort((a, b) => b.val - a.val).slice(0, TP_BEAM);`],
  ["35-team-plan.js", "export const tpTables = (turn, party, foes, double = false) => {",
    `export const tpTables = (...a) => ${P}.span("tables", () => tpTables0(...a));\nconst tpTables0 = (turn, party, foes, double = false) => {`],
  ["35-team-plan.js", "  const kills = foes.map((_, fi) => sweep(fi));",
    `  const kills = ${P}.span("sweep", () => foes.map((_, fi) => sweep(fi)));`],
  ["35-team-plan.js", "  const matrix = foes.map((f, fi) => tpAlive(start.oh)",
    `  const matrix = ${P}.span("matrix", () => foes.map((f, fi) => tpAlive(start.oh)`],
  ["35-team-plan.js", "    .sort((a, b) => b.per - a.per));\n",
    "    .sort((a, b) => b.per - a.per)));\n"],
  ["35-team-plan.js", "const tpView = (M, plan, pinned) => {",
    `const tpView = (...a) => ${P}.span("tpView", () => tpView0(...a));\nconst tpView0 = (M, plan, pinned) => {`],
  // --- 25-turn: every game call goes through `asDamage` (the AI through `asAi`, which calls it), the exact-moves
  // replay through `beforeTera`, and the per-mon record through `monRecord`.
  ["25-turn.js", "  const asDamage = fn => (patches.length ? withPatches(patches, fn) : fn());",
    `  const asDamage = fn => ${P}.game(() => (patches.length ? withPatches(patches, fn) : fn()));`],
  ["25-turn.js", "      return beforeTera(() => sceneExactMoves(env, asking, ranges));",
    `      return ${P}.game(() => beforeTera(() => sceneExactMoves(env, asking, ranges)));`],
  ["25-turn.js", "    mon: p => memo(\"mon\", p, () => monRecord(env, live, p)),",
    `    mon: p => memo("mon", p, () => ${P}.game(() => monRecord(env, live, p))),`],
  // --- 60-card: the three parts of a battle card
  ["60-card.js", "  const team = trainer ? teamPlanner(arrivalTurn(turn)) : null;",
    `  const team = trainer ? ${P}.span("teamPlanner", () => teamPlanner(arrivalTurn(turn))) : null;`],
  ["60-card.js", "  const { pin, ...model } = battleModel(turn, { team });",
    `  const { pin, ...model } = ${P}.span("battleModel", () => battleModel(turn, { team }));`],
  ["60-card.js", "    teamPlan: team ? team.view(pin) : null,",
    `    teamPlan: team ? ${P}.span("view", () => team.view(pin)) : null,`],
];

const sources = new Map(readdirSync(HUD).filter(f => f.endsWith(".js") && f !== "99-start.js").sort()
  .map(f => [f, readFileSync(path.join(HUD, f), "utf8")]));
for (const [file, from, to] of PATCHES) {
  const src = sources.get(file)!;
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`patch anchor in ${file} found ${n} times: ${from.slice(0, 80)}`);
  sources.set(file, src.replace(from, () => to));
}

const outDir = path.join(ROOT, ".cache/read-stage");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const bundlePath = path.join(clone, "test/tests/.coach-readstage.bundle.js");
const testPath = path.join(clone, "test/tests/coach-readstage.test.ts");
try {
  writeFileSync(bundlePath, bundle("hud", { expose: true, files: [...sources] }));
  writeFileSync(testPath, readFileSync(path.join(HERE, "profile.test.ts.template"), "utf8"));
  const code = await new Promise<number>(resolve => {
    const child = spawn("npx", ["--yes", "pnpm@10.33.2", "exec", "vitest", "run", "test/tests/coach-readstage.test.ts",
      "--testTimeout=1800000", ...process.argv.slice(2)], {
      cwd: clone, stdio: "inherit",
      env: { ...process.env, COACH_BUNDLE: bundlePath, COACH_PROF_OUT: out, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    });
    child.on("exit", c => resolve(c ?? 1));
  });
  console.log(`\nread-stage: vitest exited ${code}; results in ${path.relative(ROOT, out)}`);
} finally {
  for (const f of [bundlePath, testPath]) rmSync(f, { force: true });
}
