/**
 * Replays the newcomer corpus in the pinned clone and tabulates what each scorer answers: who the newcomer replaces,
 * whether it is an upgrade, and whether it is worth taking.
 *
 *   node scripts/newcomer-corpus/run.ts                         # every scorer in scorers/, every case file
 *   node scripts/newcomer-corpus/run.ts scorers/today.mjs mine.mjs
 *   node scripts/newcomer-corpus/run.ts --cases hand-built      # only cases/hand-built.json
 *   node scripts/newcomer-corpus/run.ts --record                # also write answers/<scorer>.json
 *   node scripts/newcomer-corpus/run.ts -- -t all-water         # anything after `--` goes to vitest
 *
 * A scorer is a self-contained `.mjs` whose default export is `{ name, score({ party, newcomer, hud, scene, case }) }`;
 * see scorers/today.mjs for the answer shape. It is copied into the clone, so it cannot import its neighbours.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs without type declarations
import { bundle } from "../../skills/coachemon/scripts/hud-bundle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HUD = path.resolve(HERE, "../../skills/coachemon/scripts/hud");
const reviewed = JSON.parse(readFileSync(path.resolve(HERE, "../../src/escape-ladder/reviewed.json"), "utf8"));
const clone = path.resolve(".cache/pokerogue", `v${reviewed.pinned.gameVersion}`);

const argv = process.argv.slice(2);
const dash = argv.indexOf("--");
const own = dash < 0 ? argv : argv.slice(0, dash);
const vitestArgs = dash < 0 ? [] : argv.slice(dash + 1);
const record = own.includes("--record");
const only = own.includes("--cases") ? own[own.indexOf("--cases") + 1].split(",") : null;
const named = own.filter((a, i) => a.endsWith(".mjs") && own[i - 1] !== "--cases");
const scorerFiles = (named.length ? named.map(f => path.resolve(HERE, f)) : readdirSync(path.join(HERE, "scorers"))
  .filter(f => f.endsWith(".mjs")).sort().map(f => path.join(HERE, "scorers", f)));

if (!existsSync(path.join(clone, "node_modules"))) {
  console.error(`No provisioned clone at ${clone}.\n\n  npm run drift:check   # in a worktree: ln -s <main-checkout>/.cache .cache\n`);
  process.exit(2);
}

const caseFiles = readdirSync(path.join(HERE, "cases")).filter(f => f.endsWith(".json"))
  .filter(f => !only || only.includes(f.replace(/\.json$/, ""))).sort();
const cases = caseFiles.flatMap(f => JSON.parse(readFileSync(path.join(HERE, "cases", f), "utf8")));
const ids = new Set<string>();
for (const c of cases) {
  if (ids.has(c.id)) throw new Error(`duplicate case id ${c.id}`);
  ids.add(c.id);
}

// Named apart from the encounter oracle's, so the two can run against the shared clone at once.
const dir = path.join(clone, "test/tests");
const scorerDir = path.join(dir, ".coach-corpus-scorers");
const bundlePath = path.join(dir, ".coach-corpus.bundle.js");
const corpusPath = path.join(dir, ".coach-corpus.cases.json");
const outPath = path.join(dir, ".coach-corpus.out.json");
const testPath = path.join(dir, "coach-corpus.test.ts");

const files = readdirSync(HUD).filter(f => f.endsWith(".js") && f !== "99-start.js").sort()
  .map(f => [f, readFileSync(path.join(HUD, f), "utf8")] as [string, string]);

const vitest = (): Promise<number> => new Promise(resolve => {
  const child = spawn("npx", ["--yes", "pnpm@10.33.2", "exec", "vitest", "run", "test/tests/coach-corpus.test.ts",
    "--silent", "--reporter=dot", ...vitestArgs], {
    cwd: clone,
    stdio: "inherit",
    env: { ...process.env, COACH_BUNDLE: bundlePath, COACH_CORPUS: corpusPath, COACH_OUT: outPath,
      COACH_SCORERS: scorerFiles.map(f => path.join(scorerDir, path.basename(f))).join(","),
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });
  child.on("close", code => resolve(code ?? 1));
});

const cell = (a: any) => (!a ? "—" : a.error ? `ERROR ${a.error}`
  : `${a.verdict}${a.upgrade ? " ↑" : ""} ${a.replaces ? `−${a.replaces}` : "free"} (${Math.round(a.value * 10) / 10})`);

let results: any[] = [];
try {
  rmSync(outPath, { force: true });
  mkdirSync(scorerDir, { recursive: true });
  for (const f of scorerFiles) copyFileSync(f, path.join(scorerDir, path.basename(f)));
  writeFileSync(bundlePath, bundle("hud", { expose: true, files }));
  writeFileSync(corpusPath, JSON.stringify(cases));
  writeFileSync(testPath, readFileSync(path.join(HERE, "replay.test.ts.template"), "utf8"));
  await vitest();
  results = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];
} finally {
  for (const p of [bundlePath, corpusPath, outPath, testPath, scorerDir]) rmSync(p, { force: true, recursive: true });
}

if (!results.length) {
  console.error("\ncorpus: no answers — vitest produced none. Its own output is above.");
  process.exit(2);
}
const names = Object.keys(results[0].answers);
const order = new Map(cases.map((c, i) => [c.id, i]));
results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
console.log(`\n${"case".padEnd(46)}${"newcomer".padEnd(18)}${names.map(n => n.padEnd(34)).join("")}`);
for (const r of results) {
  console.log(`${r.id.padEnd(46)}${`${r.newcomer.name} L${r.newcomer.level}`.padEnd(18)}${names.map(n => cell(r.answers[n]).padEnd(34)).join("")}`);
}
// With vitest's own filter some cases are skipped on purpose, so only a full run can call one missing.
const missing = vitestArgs.length ? [] : cases.filter(c => !results.some(r => r.id === c.id)).map(c => c.id);
if (missing.length) console.log(`\nnot replayed (the case failed to build; see vitest above): ${missing.join(", ")}`);
const outDir = path.resolve(".cache/newcomer-corpus");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "last.json"), JSON.stringify(results, null, 1));
console.log(`\n${results.length}/${cases.length} cases replayed; full report in .cache/newcomer-corpus/last.json`);
if (record) {
  mkdirSync(path.join(HERE, "answers"), { recursive: true });
  for (const n of names) {
    const out = Object.fromEntries(results.map(r => [r.id, r.answers[n]]));
    writeFileSync(path.join(HERE, "answers", `${n}.json`), `${JSON.stringify(out, null, 1)}\n`);
    console.log(`recorded answers/${n}.json`);
  }
}
process.exit(missing.length ? 1 : 0);
