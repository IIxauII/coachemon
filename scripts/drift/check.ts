/**
 * Everything drift finds at one game version, as data: the CLI in `scripts/drift.ts` prints it and stamps from it. It
 * reads the target's source only, against the stamped hashes, the registry and `src/enums/generated.ts`.
 */
import path from "node:path";
import ts from "typescript";
import type { Entry } from "../../src/escape-ladder/types.ts";
import type { Generated } from "../gen-enums.ts";
import type { Registry, ScannedRead } from "../game-reads/check.ts";
import type { Tables } from "../game-reads/scan.ts";
import type { GameSet } from "../game-reads/types.ts";
import { GameSource, hash } from "./source.ts";

export type Group = "ladder" | "hud" | "reads";
export type Item = { ref: string; dependents: string[]; groups: Group[] };

export type Drift = {
  /** What `--stamp` records: every hash drift could take. */
  hashes: Record<string, string>;
  moved: Item[];
  missing: Item[];
  unreviewed: Item[];
  misplaced: string[];
  added: string[];
  shifted: string[];
  unregistered: string[];
};

export type DriftInput = {
  source: GameSource;
  hashes: Readonly<Record<string, string>>;
  /** The hand-registered deps (ladder entries, HUD modules), each with who leans on it. */
  deps: ReadonlyMap<string, { dependents: readonly string[]; groups: readonly Group[] }>;
  ladder: Readonly<Record<string, Entry>>;
  registry: Registry;
  reads: readonly ScannedRead[];
  /** `src/enums/generated.ts` and `src/enums/modifiers.ts` as they stand. */
  tables: Tables;
  modifiers: Readonly<Record<string, ReadonlySet<string>>>;
  /** gen-enums run at the target. */
  regenerated: Generated;
  /** Language builtins: a read of one of these names is never asked for a registry entry. */
  language: ReadonlySet<string>;
};

/** What `--stamp` refuses on. */
export const blockers = (d: Drift) => ({
  MISSING: d.missing.length, MISPLACED: d.misplaced.length, ADDED: d.added.length, SHIFTED: d.shifted.length,
  UNREGISTERED: d.unregistered.length,
});

/** A read from one of the game's libraries hashes the version the game's `package.json` asks for. */
const LIBS = { phaser: ["dependencies", "phaser"], vitest: ["devDependencies", "vitest"] } as const;

/** Calls one level down from a unit: same-file functions, imported functions, and `this.m()` in the same class. */
export function callees(source: GameSource, ref: string): string[] {
  const unit = source.unit(ref);
  if (!unit || !(ts.isFunctionDeclaration(unit) || ts.isMethodDeclaration(unit) || ts.isGetAccessor(unit) ||
    ts.isConstructorDeclaration(unit) || ts.isVariableDeclaration(unit))) return [];
  const sf = unit.getSourceFile();
  const file = ref.split("#", 1)[0];
  const cls = ref.split("#", 2)[1].includes(".") ? ref.split("#", 2)[1].split(".", 1)[0] : null;
  const imported = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings || !ts.isNamedImports(st.importClause.namedBindings)) continue;
    const spec = (st.moduleSpecifier as ts.StringLiteral).text;
    const target = spec.startsWith("#")
      ? source.resolve(spec)
      : spec.startsWith(".")
        ? [`${spec}`, `${spec}.ts`].map(s => path.posix.join(path.posix.dirname(file), s)).find(f => f.endsWith(".ts") && source.exists(f)) ?? null
        : null;
    if (target === null) continue;
    for (const el of st.importClause.namedBindings.elements) imported.set(el.name.text, `${target}#${(el.propertyName ?? el.name).text}`);
  }
  const out = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      let callee: string | null = null;
      if (ts.isIdentifier(e)) callee = imported.get(e.text) ?? `${file}#${e.text}`;
      else if (cls && ts.isPropertyAccessExpression(e) && e.expression.kind === ts.SyntaxKind.ThisKeyword) callee = `${file}#${cls}.${e.name.text}`;
      if (callee !== null && callee !== ref) {
        const u = source.unit(callee);
        if (u && (ts.isFunctionDeclaration(u) || ts.isMethodDeclaration(u) || ts.isVariableDeclaration(u))) out.add(callee);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(unit);
  return [...out].sort();
}

/** A GameSet's members at the target: an enum's members, an object's keys, an array's elements. */
export function members(source: GameSource, ref: string): string[] | null {
  const unit = source.unit(ref);
  if (!unit) return null;
  if (ts.isEnumDeclaration(unit)) return unit.members.map(m => m.name.getText());
  if (!ts.isVariableDeclaration(unit) || !unit.initializer) return null;
  let e: ts.Expression = unit.initializer;
  for (;;) {
    if (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
    else if (ts.isCallExpression(e) && e.arguments.length === 1) e = e.arguments[0];
    else break;
  }
  if (ts.isObjectLiteralExpression(e)) return e.properties.flatMap(p => (p.name ? [p.name.getText().replace(/^["']|["']$/g, "")] : []));
  if (ts.isArrayLiteralExpression(e)) {
    return e.elements.map(el => (ts.isPropertyAccessExpression(el) ? el.name.text : ts.isStringLiteral(el) ? el.text : el.getText()));
  }
  return null;
}

export function drift(input: DriftInput): Drift {
  const { source } = input;
  const items = new Map<string, { dependents: Set<string>; groups: Set<Group> }>();
  const lean = (ref: string, dependent: string, group: Group) => {
    const it = items.get(ref) ?? { dependents: new Set(), groups: new Set() };
    it.dependents.add(dependent);
    it.groups.add(group);
    items.set(ref, it);
  };
  for (const [ref, d] of input.deps) for (const g of d.groups) for (const who of d.dependents) lean(ref, who, g);
  for (const ref of [...input.deps.keys()]) {
    const d = input.deps.get(ref)!;
    for (const c of callees(source, ref)) if (!input.deps.has(c)) for (const g of d.groups) lean(c, `callee of ${ref}`, g);
  }

  const missing: Item[] = [];
  const miss = (ref: string, dependents: string[], groups: Group[] = ["reads"]) => missing.push({ ref, dependents, groups });

  const registered = new Set<string>();
  const libs = new Map<keyof typeof LIBS, string[]>();
  for (const [area, a] of Object.entries(input.registry)) {
    for (const r of a.reads) {
      registered.add(r.name);
      const who = `${area}: ${r.kind} ${r.name}`;
      if (r.from === "phaser" || r.from === "vitest") libs.set(r.from, [...(libs.get(r.from) ?? []), who]);
      for (const ref of r.at) lean(ref, who, "reads");
      if (r.kind === "phase") {
        for (const ref of r.at) {
          const text = source.text(ref);
          if (text !== null && !new RegExp(`phaseName(?:\\s*:[^=]*)?\\s*=\\s*"${r.name}"`).test(text)) miss(`${ref} (phaseName "${r.name}")`, [who]);
        }
      } else if (r.kind === "storage-key" && r.from !== "ours") {
        for (const ref of r.at) {
          const text = source.text(ref);
          if (text !== null && !text.includes(r.name)) miss(`${ref} (no "${r.name}")`, [who]);
        }
      } else if (r.kind === "import") {
        const resolved = source.resolve(r.name);
        if (resolved === null) miss(`${r.name} (resolves to no file)`, [who]);
        else for (const ref of r.at) if (ref.split("#", 1)[0] !== resolved) miss(`${ref} (${r.name} now resolves to ${resolved})`, [who]);
      }
    }
    for (const m of a.mirrors ?? []) for (const ref of m.of) lean(ref, `${area}: mirror ${m.ours}`, "reads");
  }

  const hashes: Record<string, string> = {};
  const moved: Item[] = [];
  const unreviewed: Item[] = [];
  const pkg = source.packageJson();
  for (const [ref, it] of [...items].sort(([a], [b]) => a.localeCompare(b))) {
    const item = { ref, dependents: [...it.dependents], groups: [...it.groups] };
    const h = source.hashOf(ref);
    if (h === null) {
      missing.push(item);
      continue;
    }
    hashes[ref] = h;
    const was = input.hashes[ref];
    if (was === undefined) unreviewed.push(item);
    else if (was !== h) moved.push(item);
  }
  for (const [lib, who] of libs) {
    const [section, name] = LIBS[lib];
    const key = `package.json#${section}.${name}`;
    const h = hash(String(pkg[section]?.[name] ?? ""));
    hashes[key] = h;
    const item = { ref: key, dependents: who, groups: ["reads" as Group] };
    if (input.hashes[key] === undefined) unreviewed.push(item);
    else if (input.hashes[key] !== h) moved.push(item);
  }

  const added: string[] = [];
  for (const [area, a] of Object.entries(input.registry)) {
    for (const set of (a.sets ?? []) as GameSet[]) {
      const now = members(source, set.at);
      if (now === null) {
        miss(set.at, [`${area}: game set`]);
        continue;
      }
      const handle = set.handledIn.length ? ` — handle in ${set.handledIn.join(", ")}` : "";
      for (const m of now) if (!set.known.includes(m)) added.push(`${set.at.split("#", 2)[1]}.${m} (${set.at})${handle}`);
      for (const m of set.known) if (!now.includes(m)) miss(`${set.at} member ${m}`, [`${area}: game set`]);
    }
  }

  const shifted: string[] = [];
  const target = Object.fromEntries(Object.entries(input.regenerated.enums).map(([k, v]) => [k, new Map(v)]));
  for (const [name, table] of Object.entries(input.tables)) {
    const now = target[name];
    if (!now) continue;
    for (const [member, value] of Object.entries(table)) {
      if (!now.has(member)) shifted.push(`${name}.${member}: ${value} → gone`);
      else if (now.get(member) !== value) shifted.push(`${name}.${member}: ${value} → ${now.get(member)}`);
    }
  }
  for (const [name, set] of Object.entries(input.modifiers)) {
    const now = new Set(input.regenerated.modifiers[name] ?? []);
    for (const m of set) if (!now.has(m)) shifted.push(`${name} ${m} → gone`);
  }

  const enumReads = new Map<string, Set<string>>();
  for (const r of input.reads) {
    if (r.kind !== "enum-member") continue;
    const tables = r.table !== null ? [r.table] : Object.keys(input.tables).filter(t => Object.hasOwn(input.tables[t], r.name));
    if (tables.some(t => target[t]?.has(r.name))) continue;
    const key = `${r.table ?? tables.join("|")}.${r.name}`;
    enumReads.set(key, (enumReads.get(key) ?? new Set()).add(`${r.file}:${r.line}`));
  }
  for (const [key, where] of enumReads) miss(`enum member ${key}`, [...where]);

  const unregistered: string[] = [];
  const declared = source.declared();
  const flagged = new Set<string>();
  for (const r of input.reads) {
    if (r.kind !== "property" || flagged.has(r.name) || registered.has(r.name) || input.language.has(r.name)) continue;
    const refs = declared.get(r.name);
    if (!refs) continue;
    flagged.add(r.name);
    const more = refs.length > 3 ? `, +${refs.length - 3} more` : "";
    unregistered.push(`${r.name} — read at ${r.file}:${r.line}; the game declares it at ${refs.slice(0, 3).join(", ")}${more}`);
  }

  return { hashes, moved, missing, unreviewed, misplaced: misplaced(source, input.ladder), added, shifted, unregistered };
}

function misplaced(source: GameSource, ladder: Readonly<Record<string, Entry>>): string[] {
  const uiModes = (source.read("src/enums/ui-mode.ts")?.match(/enum UiMode \{([\s\S]*?)\}/)?.[1] ?? "")
    .split(",")
    .map(s => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "").trim())
    .filter(Boolean);
  const handlers = [...(source.read("src/ui/ui.ts")?.match(/this\.handlers = \[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/new (\w+)\(/g)]
    .map(m => m[1]);
  const out: string[] = [];
  for (const [screen, entry] of Object.entries(ladder)) {
    const name = screen.split(/[/:]/, 1)[0];
    if (uiModes[entry.mode] !== name || handlers[entry.mode] !== entry.handler) {
      out.push(
        `${screen}: table says ${entry.mode} / ${entry.handler}, ref has ` +
          `${uiModes.indexOf(name)} / ${handlers[uiModes.indexOf(name)] ?? "nothing"}`,
      );
    }
  }
  return out;
}
