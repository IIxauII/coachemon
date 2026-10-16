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
import { findClone, harnessIn } from "./clone-test/clone-test.ts";
import { blockers, drift, type Group, type Item } from "./drift/check.ts";
import { GameSource } from "./drift/source.ts";
import { generatedTables, loadRepo } from "./game-reads/check.ts";
import { REGISTRY } from "./game-reads/registry/index.ts";
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

const GROUPS = ["ladder", "hud", "reads"];
if (args.only !== undefined && !GROUPS.includes(args.only)) {
  console.error(`--only takes ${GROUPS.map(g => JSON.stringify(g)).join(", ")}, not ${JSON.stringify(args.only)}.`);
  process.exit(2);
}
if (args.only !== undefined && args.stamp) {
  console.error("--only cannot be combined with --stamp: one pin, one sign-off on every group.");
  process.exit(2);
}
const only = args.only as Group | undefined;

const reviewed: Reviewed = JSON.parse(readFileSync(REVIEWED, "utf8"));

function checkout(version: string): string {
  const tag = `v${version}`;
  const dir = path.resolve(".cache/pokerogue", tag);
  if (!existsSync(dir)) {
    execFileSync("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", tag, REPO, dir], { stdio: "inherit" });
  }
  return dir;
}

const version = args.version ?? reviewed.pinned.gameVersion;
const source = args.source ? path.resolve(args.source) : checkout(version);
const sha = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const deps = new Map<string, { dependents: string[]; groups: Group[] }>();
const lean = (ref: string, dependent: string, group: Group) => {
  const d = deps.get(ref) ?? { dependents: [], groups: [] };
  d.dependents.push(dependent);
  if (!d.groups.includes(group)) d.groups.push(group);
  deps.set(ref, d);
};
for (const [screen, entry] of Object.entries(LADDER as Record<string, Entry>)) for (const ref of entry.deps) lean(ref, screen, "ladder");
for (const ref of GLOBAL_DEPS) lean(ref, "(every screen)", "ladder");
for (const [module, list] of Object.entries(HUD_DEPS as Record<string, readonly string[]>)) {
  for (const ref of list) lean(ref, `hud/${module}`, "hud");
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

const shown = (list: Item[]) => (only === undefined ? list : list.filter(i => i.groups.includes(only)));
const lines = (list: string[]) => (only === undefined || only === "reads" ? list : []);
const report = (label: string, list: Item[]) => {
  if (list.length === 0) return;
  console.log(`\n${label} (${list.length}):`);
  for (const i of list) console.log(`  ${i.ref}\n      re-read: ${i.dependents.join(", ")}`);
};
const reportLines = (label: string, list: string[]) => {
  if (list.length === 0) return;
  console.log(`\n${label} (${list.length}):`);
  for (const line of list) console.log(`  ${line}`);
};

const inGroup = (group: Group) => [...deps.values()].filter(d => d.groups.includes(group)).length;
const registered = Object.values(REGISTRY).reduce((n, a) => n + a.reads.length + (a.mirrors?.length ?? 0) + (a.sets?.length ?? 0), 0);
console.log(`drift: ${source} @ ${sha.slice(0, 7)} (game ${version}); pinned ${reviewed.pinned.gameVersion}`);
console.log(
  `${deps.size} deps: ${inGroup("ladder")} across ${Object.keys(LADDER).length} ladder entries, ` +
    `${inGroup("hud")} across ${Object.keys(HUD_DEPS).length} HUD modules; ${registered} registry entries; ` +
    `${Object.keys(found.hashes).length} hashes in all` + (only === undefined ? "" : ` — reporting ${only} only`),
);
report("MOVED — the body changed since review", shown(found.moved));
report("MISSING — no such unit, member or literal at this ref", shown(found.missing));
report("UNREVIEWED — never stamped", shown(found.unreviewed));
reportLines("MISPLACED — mode or handler differs at this ref", only === "hud" || only === "reads" ? [] : found.misplaced);
reportLines("ADDED — a member the game added to a set we mirror or switch on", lines(found.added));
reportLines("SHIFTED — src/enums/generated.ts regenerated at this ref changes these", lines(found.shifted));
reportLines("UNREGISTERED — read by a scanned file, declared by the game, in no registry entry", lines(found.unregistered));

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
  const gitlink = (submodule: string) =>
    execFileSync("git", ["-C", source, "rev-parse", `HEAD:${submodule}`], { encoding: "utf8" }).trim();
  const packageManager = JSON.parse(readFileSync(path.join(source, "package.json"), "utf8")).packageManager ?? "";
  const pnpm = /^pnpm@([^+]+)/.exec(packageManager)?.[1];
  if (pnpm === undefined) {
    console.error("\nRefusing to stamp: the game's package.json names no pnpm `packageManager` to set the player's clone up with.");
    process.exit(1);
  }
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
  const pinned = { gameVersion: version, tag: `v${version}`, sha, locales: gitlink("locales"), assets: gitlink("assets"), pnpm };
  const next: Reviewed = { pinned, hashes: found.hashes, recheck: { gameVersion: version } };
  writeFileSync(REVIEWED, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `\nStamped ${Object.keys(found.hashes).length} hashes and the harness re-check; pin is now ${version} @ ${sha.slice(0, 7)}, ` +
      `set up with pnpm ${pnpm}.`,
  );
  process.exit(0);
}

const failing =
  shown(found.moved).length + shown(found.missing).length + shown(found.unreviewed).length +
  (only === "hud" || only === "reads" ? 0 : found.misplaced.length) +
  lines(found.added).length + lines(found.shifted).length + lines(found.unregistered).length;
if (failing > 0) {
  console.log(
    "\nFAIL: re-read the named entries — screens in src/escape-ladder/table.ts, HUD modules in " +
      "skills/coachemon/scripts/hud/ (their deps are listed in scripts/hud-deps.ts), game reads in " +
      "scripts/game-reads/registry/ — then re-run with --stamp.",
  );
  process.exit(1);
}
console.log(`\nOK: every ${only ?? "ladder, HUD and registry"} dep matches its reviewed hash.`);
