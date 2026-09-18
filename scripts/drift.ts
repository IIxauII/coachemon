/**
 * Drift check for everything this repo reads out of PokéRogue's source: the
 * escape ladder (`src/escape-ladder/table.ts`) and the coach HUD
 * (`scripts/hud-deps.ts`). Run at pin bump, not per push: at a fixed pinned ref
 * the hashes cannot move, so the check only means something against a candidate
 * ref. One pin, one stamp, one sign-off for both groups.
 *
 *   npm run drift:check                          # check the pinned ref
 *   npm run drift:check -- --version 1.12.0.12   # check a candidate build
 *   npm run drift:check -- --source ../pokerogue # check a local checkout
 *   npm run drift:check -- --only hud            # or `ladder`: report one group
 *   npm run drift:check -- --version 1.12.0.12 --stamp
 *       # after re-reading every entry the check named: record the new
 *       # hashes and move the pin. Stamping is the review sign-off.
 *
 * Each hashed unit is one method (`path#Class.method`, `path#Class.constructor`),
 * top-level function or enum (`path#name`), printed without comments so
 * formatting-only churn does not trip it. Exit 1 when any dep moved, vanished,
 * or has never been reviewed.
 *
 * `--only` narrows the report and the verdict to one group, for a bump that has
 * only one group left to re-read. It cannot be combined with `--stamp`: the pin
 * is shared, so a stamp is always a sign-off on both groups at once.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import ts from "typescript";
import { GLOBAL_DEPS, LADDER } from "../src/escape-ladder/table.ts";
import { HUD_DEPS } from "./hud-deps.ts";
import type { Entry } from "../src/escape-ladder/types.ts";

const REPO = "https://github.com/pagefaultgames/pokerogue.git";
const REVIEWED = new URL("../src/escape-ladder/reviewed.json", import.meta.url);

type Reviewed = {
  pinned: { gameVersion: string; tag: string; sha: string };
  hashes: Record<string, string>;
};

const { values: args } = parseArgs({
  options: {
    version: { type: "string" },
    source: { type: "string" },
    stamp: { type: "boolean", default: false },
    only: { type: "string" },
  },
});

if (args.only !== undefined && args.only !== "ladder" && args.only !== "hud") {
  console.error(`--only takes "ladder" or "hud", not ${JSON.stringify(args.only)}.`);
  process.exit(2);
}
if (args.only !== undefined && args.stamp) {
  console.error("--only cannot be combined with --stamp: one pin, one sign-off on both groups.");
  process.exit(2);
}
const only = args.only as "ladder" | "hud" | undefined;

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

/** Which screens and HUD modules lean on each ref, so a moved hash names what to re-read. */
const dependents = new Map<string, string[]>();
/** Which group a ref is reported under. A ref both groups lean on belongs to both. */
const groups = new Map<string, Set<"ladder" | "hud">>();
const lean = (ref: string, dependent: string, group: "ladder" | "hud") => {
  dependents.set(ref, [...(dependents.get(ref) ?? []), dependent]);
  groups.set(ref, (groups.get(ref) ?? new Set()).add(group));
};
for (const [screen, entry] of Object.entries(LADDER as Record<string, Entry>)) {
  for (const ref of entry.deps) lean(ref, screen, "ladder");
}
for (const ref of GLOBAL_DEPS) lean(ref, "(every screen)", "ladder");
for (const [module, deps] of Object.entries(HUD_DEPS as Record<string, readonly string[]>)) {
  for (const ref of deps) lean(ref, `hud/${module}`, "hud");
}

const printer = ts.createPrinter({ removeComments: true });
const parsed = new Map<string, ts.SourceFile | null>();

function sourceFile(file: string): ts.SourceFile | null {
  if (!parsed.has(file)) {
    const abs = path.join(source, file);
    parsed.set(
      file,
      existsSync(abs) ? ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true) : null,
    );
  }
  return parsed.get(file) ?? null;
}

function findUnit(sf: ts.SourceFile, symbol: string): ts.Node | undefined {
  const [className, member] = symbol.includes(".") ? symbol.split(".", 2) : [undefined, symbol];
  for (const node of sf.statements) {
    if (className === undefined) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === member) return node;
      // An enum is a unit too: the coach reads several of them as bare numbers, so a reordered member is drift.
      if (ts.isEnumDeclaration(node) && node.name.text === member) return node;
      if (ts.isVariableStatement(node)) {
        const decl = node.declarationList.declarations.find(d => ts.isIdentifier(d.name) && d.name.text === member);
        if (decl) return decl;
      }
    } else if (ts.isClassDeclaration(node) && node.name?.text === className) {
      return node.members.find(m =>
        member === "constructor"
          ? ts.isConstructorDeclaration(m)
          : (ts.isMethodDeclaration(m) || ts.isGetAccessor(m)) && m.name.getText(sf) === member,
      );
    }
  }
  return undefined;
}

function hashOf(ref: string): string | null {
  const [file, symbol] = ref.split("#", 2);
  const sf = sourceFile(file);
  const unit = sf && findUnit(sf, symbol);
  if (!sf || !unit) return null;
  const text = printer.printNode(ts.EmitHint.Unspecified, unit, sf);
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

const refs = [...dependents.keys()].sort();
const current: Record<string, string> = {};
const moved: string[] = [];
const missing: string[] = [];
const unreviewed: string[] = [];

for (const ref of refs) {
  const hash = hashOf(ref);
  if (hash === null) {
    missing.push(ref);
    continue;
  }
  current[ref] = hash;
  const was = reviewed.hashes[ref];
  if (was === undefined) unreviewed.push(ref);
  else if (was !== hash) moved.push(ref);
}

/** Each entry's `mode` and `handler` are claims too: check them against UiMode and `UI.handlers` at this ref. */
const misplaced: string[] = [];
{
  const read = (file: string) => (existsSync(path.join(source, file)) ? readFileSync(path.join(source, file), "utf8") : "");
  const uiModes = (read("src/enums/ui-mode.ts").match(/enum UiMode \{([\s\S]*?)\}/)?.[1] ?? "")
    .split(",")
    .map(s => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "").trim())
    .filter(Boolean);
  const handlers = [...(read("src/ui/ui.ts").match(/this\.handlers = \[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/new (\w+)\(/g)]
    .map(m => m[1]);
  for (const [screen, entry] of Object.entries(LADDER as Record<string, Entry>)) {
    const name = screen.split(/[/:]/, 1)[0];
    if (uiModes[entry.mode] !== name || handlers[entry.mode] !== entry.handler) {
      misplaced.push(
        `${screen}: table says ${entry.mode} / ${entry.handler}, ref has ` +
          `${uiModes.indexOf(name)} / ${handlers[uiModes.indexOf(name)] ?? "nothing"}`,
      );
    }
  }
}

/** `--only` narrows every list below to the chosen group; the hashing above always covers both. */
const shown = (list: string[]) => (only === undefined ? list : list.filter(ref => groups.get(ref)?.has(only)));
const shownMisplaced = only === "hud" ? [] : misplaced;

const report = (label: string, list: string[]) => {
  if (list.length === 0) return;
  console.log(`\n${label} (${list.length}):`);
  for (const ref of list) console.log(`  ${ref}\n      re-read: ${dependents.get(ref)?.join(", ")}`);
};

const inGroup = (group: "ladder" | "hud") => refs.filter(ref => groups.get(ref)?.has(group)).length;
console.log(`drift: ${source} @ ${sha.slice(0, 7)} (game ${version}); pinned ${reviewed.pinned.gameVersion}`);
console.log(
  `${refs.length} deps: ${inGroup("ladder")} across ${Object.keys(LADDER).length} ladder entries, ` +
    `${inGroup("hud")} across ${Object.keys(HUD_DEPS).length} HUD modules` +
    (only === undefined ? "" : ` — reporting ${only} only`),
);
report("MOVED — the body changed since review", shown(moved));
report("MISSING — no such method or file at this ref", shown(missing));
report("UNREVIEWED — never stamped", shown(unreviewed));
if (shownMisplaced.length > 0) {
  console.log(`\nMISPLACED — mode or handler differs at this ref (${shownMisplaced.length}):`);
  for (const line of shownMisplaced) console.log(`  ${line}`);
}

if (args.stamp) {
  if (missing.length + misplaced.length > 0) {
    console.error(
      "\nRefusing to stamp: fix the MISSING / MISPLACED entries in src/escape-ladder/table.ts " +
        "and scripts/hud-deps.ts first.",
    );
    process.exit(1);
  }
  const next: Reviewed = { pinned: { gameVersion: version, tag: `v${version}`, sha }, hashes: current };
  writeFileSync(REVIEWED, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\nStamped ${refs.length} hashes; pin is now ${version} @ ${sha.slice(0, 7)}.`);
  process.exit(0);
}

if (shown(moved).length + shown(missing).length + shown(unreviewed).length + shownMisplaced.length > 0) {
  console.log(
    "\nFAIL: re-read the named entries — screens in src/escape-ladder/table.ts, HUD modules in " +
      "skills/coachemon/scripts/hud/ (their deps are listed in scripts/hud-deps.ts) — then re-run with --stamp.",
  );
  process.exit(1);
}
console.log(`\nOK: every ${only ?? "ladder and HUD"} dep matches its reviewed hash.`);
