/**
 * Drift check for everything this repo reads out of PokéRogue's source, the escape ladder, the coach HUD and the
 * registry of game reads, under one pin and one stamp (0001-escape-ladder-hand-curated-checked-at-pin-bump.md,
 * 0004-every-game-read-is-registered.md). Run it at a pin bump, since at the pinned ref no hash can move, and `--stamp`
 * only after re-reading every entry it named: stamping is the sign-off, solving's included (pin-bump.md).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as modifierSets from "../src/enums/modifiers.ts";
import { GLOBAL_DEPS, LADDER } from "../src/escape-ladder/table.ts";
import type { Entry } from "../src/escape-ladder/types.ts";
import type { ClonePin } from "../src/solver/clone.ts";
import { checkForks, type Recheck, replay } from "../src/solver/solver.ts";
import { checkoutOf, findClone, harnessIn, pinOf } from "./clone-test/clone-test.ts";
import { addDep, blockers, type DepIndex, type DepSource, drift, type Finding } from "./drift/check.ts";
import { GameSource } from "./drift/source.ts";
import { generatedTables, loadRepo } from "./game-reads/check.ts";
import { REGISTRY, registryEntries } from "./game-reads/registry/index.ts";
import { builtinNames } from "./game-reads/scan.ts";
import { generate } from "./gen-enums.ts";
import { HUD_DEPS } from "./hud-deps.ts";
import { recheck } from "./recheck/recheck.ts";

const REPO = "https://github.com/pagefaultgames/pokerogue.git";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REVIEWED = new URL("../src/escape-ladder/reviewed.json", import.meta.url);

type Reviewed = {
  pinned: ClonePin & { tag: string };
  hashes: Record<string, string>;
  recheck?: Recheck;
};

const { values: args } = parseArgs({
  options: {
    version: { type: "string" },
    source: { type: "string" },
    stamp: { type: "boolean", default: false },
    only: { type: "string" },
  },
});

const SOURCES = ["ladder", "hud", "reads"];
if (args.only !== undefined && !SOURCES.includes(args.only)) {
  console.error(`--only takes ${SOURCES.map(g => JSON.stringify(g)).join(", ")}, not ${JSON.stringify(args.only)}.`);
  process.exit(2);
}
if (args.only !== undefined && args.stamp) {
  console.error("--only cannot be combined with --stamp: one pin, one sign-off on every source.");
  process.exit(2);
}
const only = args.only as DepSource | undefined;

const reviewed: Reviewed = JSON.parse(readFileSync(REVIEWED, "utf8"));

function checkout(version: string): string {
  const dir = checkoutOf(version);
  if (!existsSync(dir)) {
    execFileSync("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", `v${version}`, REPO, dir], { stdio: "inherit" });
  }
  return dir;
}

const version = args.version ?? reviewed.pinned.gameVersion;
const source = args.source ? path.resolve(args.source) : checkout(version);
const sha = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const deps: DepIndex = new Map();
for (const [screen, entry] of Object.entries(LADDER as Record<string, Entry>)) for (const ref of entry.deps) addDep(deps, ref, screen, "ladder");
for (const ref of GLOBAL_DEPS) addDep(deps, ref, "(every screen)", "ladder");
for (const [module, list] of Object.entries(HUD_DEPS as Record<string, readonly string[]>)) {
  for (const ref of list) addDep(deps, ref, `hud/${module}`, "hud");
}

const game = new GameSource(source);
const repo = loadRepo(ROOT);
const found = drift({
  source: game,
  hashes: reviewed.hashes,
  deps,
  ladder: LADDER as Record<string, Entry>,
  registry: REGISTRY,
  reads: repo.reads,
  tables: generatedTables(),
  modifiers: modifierSets as unknown as Record<string, ReadonlySet<string>>,
  regenerated: await generate(file => readFileSync(path.join(source, file), "utf8"), version),
  language: builtinNames(ROOT, true),
});

const shown = (list: Finding[]) => (only === undefined ? list : list.filter(i => i.sources.includes(only)));
const lines = (list: string[], source: DepSource = "reads") => (only === undefined || only === source ? list : []);
const findings: [string, Finding[]][] = [
  ["MOVED — the body changed since review", shown(found.moved)],
  ["MISSING — no such unit, member or literal at this ref", shown(found.missing)],
  ["UNREVIEWED — never stamped", shown(found.unreviewed)],
];
const lineFindings: [string, string[]][] = [
  ["MISPLACED — mode or handler differs at this ref", lines(found.misplaced, "ladder")],
  ["ADDED — a member the game added to a set we mirror or switch on", lines(found.added)],
  ["SHIFTED — src/enums/generated.ts regenerated at this ref changes these", lines(found.shifted)],
  ["UNREGISTERED — read by a scanned file, declared by the game, in no registry entry", lines(found.unregistered)],
];

const depsFrom = (s: DepSource) => [...deps.values()].filter(d => d.sources.includes(s)).length;
console.log(`drift: ${source} @ ${sha.slice(0, 7)} (game ${version}); pinned ${reviewed.pinned.gameVersion}`);
console.log(
  `${deps.size} deps: ${depsFrom("ladder")} across ${Object.keys(LADDER).length} ladder entries, ` +
    `${depsFrom("hud")} across ${Object.keys(HUD_DEPS).length} HUD modules; ${registryEntries(REGISTRY)} registry entries; ` +
    `${Object.keys(found.hashes).length} hashes in all` + (only === undefined ? "" : ` — reporting ${only} only`),
);
for (const [label, list] of findings) {
  if (list.length === 0) continue;
  console.log(`\n${label} (${list.length}):`);
  for (const i of list) console.log(`  ${i.ref}\n      re-read: ${i.dependents.join(", ")}`);
}
for (const [label, list] of lineFindings) {
  if (list.length === 0) continue;
  console.log(`\n${label} (${list.length}):`);
  for (const line of list) console.log(`  ${line}`);
}

if (args.stamp) {
  const blocking = Object.entries(blockers(found)).filter(([, n]) => n > 0);
  if (blocking.length > 0) {
    console.error(
      `\nRefusing to stamp: ${blocking.map(([k, n]) => `${n} ${k}`).join(", ")}. Fix the deps in src/escape-ladder/table.ts ` +
        "and scripts/hud-deps.ts, the registry in scripts/game-reads/registry/, and the code they name; regenerate the " +
        "enums with `npm run enums:gen -- --source <clone>` once the SHIFTED values are handled.",
    );
    process.exit(1);
  }
  let pin: ClonePin;
  try {
    pin = pinOf(version, source);
  } catch (e) {
    console.error(`\nRefusing to stamp: ${(e as Error).message}`);
    process.exit(1);
  }
  const { pnpm } = pin;
  const inSource = harnessIn(() => findClone(source), pnpm);
  console.log();
  const { failed } = await recheck(
    version,
    {
      replay: (given, script, carry) => replay(given, script, inSource, carry),
      checkForks: (given, inputs, carry) => checkForks(given, inputs, inSource, carry),
    },
    console.log,
  );
  if (failed.length > 0) {
    console.error(`\nRefusing to stamp: the harness re-check failed. ${failed.join("; ")}.`);
    process.exit(1);
  }
  const pinned = { gameVersion: version, tag: `v${version}`, sha: pin.sha, locales: pin.locales, assets: pin.assets, pnpm };
  const next: Reviewed = { pinned, hashes: found.hashes, recheck: { gameVersion: version } };
  writeFileSync(REVIEWED, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `\nStamped ${Object.keys(found.hashes).length} hashes and the harness re-check; pin is now ${version} @ ${sha.slice(0, 7)}, ` +
      `set up with pnpm ${pnpm}.`,
  );
  process.exit(0);
}

if ([...findings, ...lineFindings].some(([, list]) => list.length > 0)) {
  console.log(
    "\nFAIL: re-read the named entries — screens in src/escape-ladder/table.ts, HUD modules in " +
      "skills/coachemon/scripts/hud/ (their deps are listed in scripts/hud-deps.ts), game reads in " +
      "scripts/game-reads/registry/ — then re-run with --stamp.",
  );
  process.exit(1);
}
console.log(`\nOK: every ${only ?? "ladder, HUD and registry"} dep matches its reviewed hash.`);
