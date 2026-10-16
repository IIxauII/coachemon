/**
 * The static check behind `npm run reads:check`: every game read in a scanned file resolves to the registry, and every
 * registry entry is still read. It needs no game clone; `drift:check` finds what a declaration of our own hides.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import * as generated from "../../src/enums/generated.ts";
import { type AreaName, ownFiles, scannedFiles } from "./files.ts";
import ts from "typescript";
import { builtinNames, declaredIn, type Found, readsIn, type Tables, type Typed } from "./scan.ts";
import { type Area, oursOf, refParts } from "./types.ts";

export type Registry = Readonly<Record<AreaName, Area>>;

export type ScannedRead = Found & { area: AreaName; file: string };

export type Problem = { kind: "UNREGISTERED" | "STALE" | "INVALID"; area: AreaName; what: string; where?: string };

/** A mirror id: lower-kebab, so it never reads as the name of the constant it marks. */
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type Repo = {
  reads: ScannedRead[];
  own: ReadonlySet<string>;
  builtin: ReadonlySet<string>;
  tables: Tables;
};

/** Kinds a property read can be registered under; the rest are matched by their own scan. */
const BY_STRING = new Set(["phase", "storage-key", "import"]);

export const generatedTables = (mod: Record<string, unknown> = generated): Tables =>
  Object.fromEntries(Object.entries(mod).filter(([k, v]) => k !== "NAMES" && v !== null && typeof v === "object")) as Tables;

export function scan(
  files: Record<AreaName, { file: string; text: string }[]>,
  tables: Tables,
  typed: (file: string) => Typed | undefined = () => undefined,
): ScannedRead[] {
  const out: ScannedRead[] = [];
  for (const [area, list] of Object.entries(files) as [AreaName, { file: string; text: string }[]][]) {
    for (const { file, text } of list) for (const r of readsIn(file, text, tables, typed(file))) out.push({ ...r, area, file });
  }
  return out;
}

/** The repo's own TypeScript, type-checked, so a read our own types declare is never taken for the game's. */
export function program(root: string, files: string[]): (file: string) => Typed | undefined {
  const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile).config;
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, root);
  const tsFiles = files.filter(f => f.endsWith(".ts")).map(f => path.join(root, f));
  const p = ts.createProgram(tsFiles, { ...options, noEmit: true });
  const checker = p.getTypeChecker();
  return file => {
    const sf = file.endsWith(".ts") ? p.getSourceFile(path.join(root, file)) : undefined;
    return sf ? { sf, checker } : undefined;
  };
}

export function loadRepo(root: string): Repo {
  const tables = generatedTables();
  const scanned = scannedFiles(root);
  const files = Object.fromEntries(
    Object.entries(scanned).map(([area, list]) => [area, list.map(file => ({ file, text: readFileSync(path.join(root, file), "utf8") }))]),
  ) as Record<AreaName, { file: string; text: string }[]>;
  const own = new Set<string>();
  for (const f of ownFiles(root)) for (const n of declaredIn(f, readFileSync(path.join(root, f), "utf8"))) own.add(n);
  const typed = program(root, Object.values(scanned).flat());
  return { reads: scan(files, tables, typed), own, builtin: builtinNames(root), tables };
}

export function check(repo: Repo, registry: Registry): Problem[] {
  const problems: Problem[] = [];
  const all = Object.values(registry);
  const props = new Set(all.flatMap(a => a.reads.filter(r => !BY_STRING.has(r.kind)).map(r => r.name)));
  const strings = (kind: string) => new Map(all.flatMap(a => a.reads.filter(r => r.kind === kind).map(r => [r.name, r] as const)));
  const phases = strings("phase");
  const keys = strings("storage-key");
  const imports = new Map<string, string[]>();
  for (const a of all) for (const r of a.reads) if (r.kind === "import") imports.set(r.name, [...(imports.get(r.name) ?? []), ...r.at]);
  const mirrors = new Set(all.flatMap(a => (a.mirrors ?? []).flatMap(oursOf)));
  const where = (r: ScannedRead) => `${r.file}:${r.line}`;
  const seen = new Set<string>();

  for (const r of repo.reads) {
    const fail = (what: string) => {
      const key = `${r.area}|${what}`;
      if (seen.has(key)) return;
      seen.add(key);
      problems.push({ kind: "UNREGISTERED", area: r.area, what, where: where(r) });
    };
    switch (r.kind) {
      case "property":
        if (!repo.builtin.has(r.name) && !repo.own.has(r.name) && !props.has(r.name)) fail(`property ${r.name}`);
        break;
      case "phase":
        if (!phases.has(r.name)) fail(`phase ${r.name}`);
        break;
      case "storage-key":
        if (!keys.has(r.name)) fail(`storage key ${r.name}`);
        break;
      case "import": {
        const entry = imports.get(r.name);
        if (!entry) fail(`import ${r.name}`);
        else for (const b of r.bindings) if (!entry.some(ref => refParts(ref).outer === b)) fail(`import ${r.name} { ${b} }`);
        break;
      }
      case "enum-member":
        if (r.table !== null && !Object.hasOwn(repo.tables[r.table] ?? {}, r.name)) fail(`enum member ${r.table}.${r.name}`);
        break;
      case "mirror":
        if (!mirrors.has(`${r.file}#${r.name}`)) fail(`mirror ${r.name}`);
        break;
    }
  }

  for (const [area, entries] of Object.entries(registry) as [AreaName, Area][]) {
    const mine = repo.reads.filter(r => r.area === area);
    const readAs = (kind: string, name: string) =>
      mine.some(r => (BY_STRING.has(kind) ? r.kind === kind : r.kind === "property") && r.name === name);
    for (const e of entries.reads) {
      if (!readAs(e.kind, e.name)) problems.push({ kind: "STALE", area, what: `${e.kind} ${e.name}` });
      if (e.at.length === 0 && e.from === undefined) problems.push({ kind: "INVALID", area, what: `${e.kind} ${e.name} names no game ref` });
    }
    for (const m of entries.mirrors ?? []) {
      for (const ours of oursOf(m)) {
        const { file, symbol: id } = refParts(ours);
        if (!mine.some(r => r.kind === "mirror" && r.file === file && r.name === id)) problems.push({ kind: "STALE", area, what: `mirror ${ours}` });
        if (!KEBAB.test(id)) problems.push({ kind: "INVALID", area, what: `mirror ${ours} is not lower-kebab` });
      }
      if (m.of.length === 0) problems.push({ kind: "INVALID", area, what: `mirror ${oursOf(m).join(", ")} names no game ref` });
    }
  }
  return problems;
}

export const format = (p: Problem) => `${p.kind} [${p.area}] ${p.what}${p.where ? ` (${p.where})` : ""}`;
