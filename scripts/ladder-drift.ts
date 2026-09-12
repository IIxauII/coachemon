/**
 * Escape-ladder drift check. Run at pin bump, not per push: at a fixed pinned
 * ref the hashes cannot move, so the check only means something against a
 * candidate ref.
 *
 *   npm run ladder:drift                          # check the pinned ref
 *   npm run ladder:drift -- --version 1.12.0.12   # check a candidate build
 *   npm run ladder:drift -- --source ../pokerogue # check a local checkout
 *   npm run ladder:drift -- --version 1.12.0.12 --stamp
 *       # after re-reading every entry the check named: record the new
 *       # hashes and move the pin. Stamping is the review sign-off.
 *
 * Each hashed unit is one method (`path#Class.method`) or top-level function
 * (`path#name`), printed without comments so formatting-only churn does not
 * trip it. Exit 1 when any dep moved, vanished, or has never been reviewed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import ts from "typescript";
import { GLOBAL_DEPS, LADDER } from "../src/escape-ladder/table.ts";
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
  },
});

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

/** Which screens lean on each ref, so a moved hash names the entries to re-read. */
const dependents = new Map<string, string[]>();
for (const [screen, entry] of Object.entries(LADDER as Record<string, Entry>)) {
  for (const ref of entry.deps) dependents.set(ref, [...(dependents.get(ref) ?? []), screen]);
}
for (const ref of GLOBAL_DEPS) dependents.set(ref, ["(every screen)"]);

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
      if (ts.isVariableStatement(node)) {
        const decl = node.declarationList.declarations.find(d => ts.isIdentifier(d.name) && d.name.text === member);
        if (decl) return decl;
      }
    } else if (ts.isClassDeclaration(node) && node.name?.text === className) {
      return node.members.find(
        m => (ts.isMethodDeclaration(m) || ts.isGetAccessor(m)) && m.name.getText(sf) === member,
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

const report = (label: string, list: string[]) => {
  if (list.length === 0) return;
  console.log(`\n${label} (${list.length}):`);
  for (const ref of list) console.log(`  ${ref}\n      re-read: ${dependents.get(ref)?.join(", ")}`);
};

console.log(`ladder drift: ${source} @ ${sha.slice(0, 7)} (game ${version}); pinned ${reviewed.pinned.gameVersion}`);
console.log(`${refs.length} deps across ${Object.keys(LADDER).length} entries`);
report("MOVED — the method body changed since review", moved);
report("MISSING — no such method or file at this ref", missing);
report("UNREVIEWED — never stamped", unreviewed);
if (misplaced.length > 0) {
  console.log(`\nMISPLACED — mode or handler differs at this ref (${misplaced.length}):`);
  for (const line of misplaced) console.log(`  ${line}`);
}

if (args.stamp) {
  if (missing.length + misplaced.length > 0) {
    console.error("\nRefusing to stamp: fix the MISSING / MISPLACED entries in table.ts first.");
    process.exit(1);
  }
  const next: Reviewed = { pinned: { gameVersion: version, tag: `v${version}`, sha }, hashes: current };
  writeFileSync(REVIEWED, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\nStamped ${refs.length} hashes; pin is now ${version} @ ${sha.slice(0, 7)}.`);
  process.exit(0);
}

if (moved.length + missing.length + unreviewed.length + misplaced.length > 0) {
  console.log("\nFAIL: re-read the named entries in src/escape-ladder/table.ts, then re-run with --stamp.");
  process.exit(1);
}
console.log("\nOK: every dep matches its reviewed hash.");
