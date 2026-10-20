/**
 * What a scanned file reads, found by syntax alone: no types, so the HUD's untyped JavaScript and the typed harness
 * template are read the same way. `check.ts` decides which reads need the registry.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export type Tables = Readonly<Record<string, Readonly<Record<string, number>>>>;

export type Found =
  | { kind: "property"; name: string; line: number }
  | { kind: "phase"; name: string; line: number }
  | { kind: "storage-key"; name: string; line: number }
  | { kind: "import"; name: string; bindings: string[]; line: number }
  /** `table` is null where the enum is reached through a runtime object (`L.m.MESSAGE`), not a table name. */
  | { kind: "enum-member"; table: string | null; name: string; line: number }
  | { kind: "mirror"; name: string; line: number };

const STORAGE_CALLS = new Set(["getItem", "setItem", "removeItem"]);
const PHASE = /^[A-Z][A-Za-z0-9]*Phase$/;
const MEMBER = /^[A-Z][A-Z0-9_]*$/;
const SCREEN = /^([A-Z][A-Z0-9_]*)(?:[/:]([A-Z][A-Z0-9_]*))?(?:[/:].*)?$/;
const MIRROR = /\/\/\s*@mirrors\s+(\S+)/g;

export function parse(file: string, text: string): ts.SourceFile {
  const js = /\.(?:js|mjs)$/.test(file);
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, js ? ts.ScriptKind.JS : ts.ScriptKind.TS);
}

const nameText = (n: ts.Node | undefined): string | null =>
  n && (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isPrivateIdentifier(n))
    ? ts.isPrivateIdentifier(n) ? null : n.text
    : null;

const literalText = (n: ts.Node | undefined): string | null =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;

/** The constant a storage key starts with: a literal, a template's head, the left of a `+`, or a const holding one. */
function keyOf(sf: ts.SourceFile, e: ts.Expression | undefined, depth = 0): string | null {
  if (!e || depth > 4) return null;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isTemplateExpression(e)) return e.head.text || null;
  if (ts.isParenthesizedExpression(e)) return keyOf(sf, e.expression, depth + 1);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) return keyOf(sf, e.left, depth + 1);
  if (ts.isIdentifier(e)) {
    let init: ts.Expression | undefined;
    const find = (n: ts.Node): void => {
      if (init) return;
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === e.text && n.initializer) init = n.initializer;
      else ts.forEachChild(n, find);
    };
    find(sf);
    return keyOf(sf, init, depth + 1);
  }
  return null;
}

/** A typed file's program: only a read off an `any` reaches the game, since every other receiver is a type we declare. */
export type Typed = { sf: ts.SourceFile; checker: ts.TypeChecker };

export function readsIn(file: string, text: string, tables: Tables, typed?: Typed): Found[] {
  const sf = typed?.sf ?? parse(file, text);
  const out: Found[] = [];
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const usesStorage = /\b(?:localStorage|sessionStorage)\b/.test(text);
  const tableOf = (name: string) => Object.keys(tables).find(t => Object.hasOwn(tables[t], name)) ?? null;
  const typedReceiver = (receiver: ts.Node | undefined): boolean =>
    !!typed && receiver !== undefined && !(typed.checker.getTypeAtLocation(receiver).flags & ts.TypeFlags.Any);
  const property = (name: string, at: ts.Node, receiver?: ts.Node) => {
    if (MEMBER.test(name) && tableOf(name) !== null) out.push({ kind: "enum-member", table: null, name, line: line(at) });
    else if (!typedReceiver(receiver)) out.push({ kind: "property", name, line: line(at) });
  };

  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n)) {
      const spec = (n.moduleSpecifier as ts.StringLiteral).text;
      if (spec.startsWith("#")) {
        const bindings: string[] = [];
        const clause = n.importClause;
        if (clause?.name) bindings.push("default");
        const named = clause?.namedBindings;
        if (named && ts.isNamedImports(named)) for (const el of named.elements) bindings.push((el.propertyName ?? el.name).text);
        out.push({ kind: "import", name: spec, bindings, line: line(n) });
      }
      return;
    }
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.name)) {
      const obj = n.expression;
      if (ts.isIdentifier(obj) && obj.text === "NAMES") return;
      if (ts.isIdentifier(obj) && Object.hasOwn(tables, obj.text)) {
        out.push({ kind: "enum-member", table: obj.text, name: n.name.text, line: line(n) });
        return;
      }
      property(n.name.text, n.name, n.expression);
    } else if (ts.isElementAccessExpression(n)) {
      const name = literalText(n.argumentExpression);
      if (name !== null) property(name, n.argumentExpression, n.expression);
    } else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
      const name = nameText(n.propertyName ?? n.name);
      if (name !== null) property(name, n, n.parent);
    } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.InKeyword) {
      const name = literalText(n.left);
      if (name !== null) property(name, n.left, n.right);
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const callee = n.expression.name.text;
      if (callee === "hasOwn" || callee === "hasOwnProperty") {
        const name = literalText(n.arguments[callee === "hasOwn" ? 1 : 0]);
        if (name !== null) property(name, n, callee === "hasOwn" ? n.arguments[0] : n.expression.expression);
      } else if (usesStorage && (STORAGE_CALLS.has(callee) || callee === "startsWith")) {
        const key = keyOf(sf, n.arguments[0]);
        if (key !== null) out.push({ kind: "storage-key", name: key, line: line(n) });
      }
    } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !ts.isPropertyAssignment(n.parent)) {
      if (PHASE.test(n.text)) out.push({ kind: "phase", name: n.text, line: line(n) });
      else {
        const m = SCREEN.exec(n.text);
        if (m && tables.UiMode && Object.hasOwn(tables.UiMode, m[1])) {
          out.push({ kind: "enum-member", table: "UiMode", name: m[1], line: line(n) });
          if (m[1] === "PARTY" && m[2] && tables.PartyUiMode && Object.hasOwn(tables.PartyUiMode, m[2])) {
            out.push({ kind: "enum-member", table: "PartyUiMode", name: m[2], line: line(n) });
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const m of text.matchAll(MIRROR)) {
    out.push({ kind: "mirror", name: m[1], line: text.slice(0, m.index).split("\n").length });
  }
  return out;
}

/**
 * Property names a file declares: object literal keys, class and type members, and any name it assigns, so a write to a
 * game object passes as ours here unless the game declares the name too (0005-the-games-declared-names-at-the-pin-are-checked-in.md).
 */
export function declaredIn(file: string, text: string): Set<string> {
  const sf = parse(file, text);
  const out = new Set<string>();
  const assigns = new Set([
    ts.SyntaxKind.EqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken, ts.SyntaxKind.BarBarEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ]);
  const visit = (n: ts.Node): void => {
    if (
      ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n) || ts.isMethodDeclaration(n) ||
      ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isPropertyDeclaration(n) ||
      ts.isPropertySignature(n) || ts.isMethodSignature(n) || ts.isEnumMember(n)
    ) {
      const name = nameText(n.name);
      if (name !== null) out.add(name);
    } else if (
      (ts.isFunctionDeclaration(n) || ts.isVariableStatement(n)) &&
      ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      // An export is a member of its module's namespace, which the HUD's expose mode reads by name.
      if (ts.isFunctionDeclaration(n) && n.name) out.add(n.name.text);
      if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name)) out.add(d.name.text);
    } else if (ts.isParameter(n) && ts.isConstructorDeclaration(n.parent) && ts.getModifiers(n)?.length) {
      const name = nameText(n.name);
      if (name !== null) out.add(name);
    } else if (ts.isBinaryExpression(n) && assigns.has(n.operatorToken.kind)) {
      const left = n.left;
      if (ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.name)) out.add(left.name.text);
      else if (ts.isElementAccessExpression(left)) {
        const name = literalText(left.argumentExpression);
        if (name !== null) out.add(name);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Every member and global the JavaScript, DOM and Node type libraries declare (`all`), and JavaScript's alone
 * (`language`): the DOM and Node declare names the game declares too (`level`, `cursor`, `text`).
 */
export function builtinNames(root: string): { all: Set<string>; language: Set<string> } {
  const files: { file: string; language: boolean }[] = [];
  const lib = path.join(root, "node_modules/typescript/lib");
  for (const f of readdirSync(lib)) {
    if (/^lib\..*\.d\.ts$/.test(f)) files.push({ file: path.join(lib, f), language: /^lib\.(?:es|decorators)/.test(f) });
  }
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const abs = path.join(dir, f);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (f.endsWith(".d.ts")) files.push({ file: abs, language: false });
    }
  };
  walk(path.join(root, "node_modules/@types/node"));
  const all = new Set<string>();
  const language = new Set<string>();
  for (const { file, language: isLanguage } of files) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, false);
    const visit = (n: ts.Node): void => {
      if (
        ts.isPropertySignature(n) || ts.isMethodSignature(n) || ts.isPropertyDeclaration(n) || ts.isMethodDeclaration(n) ||
        ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isFunctionDeclaration(n) ||
        ts.isVariableDeclaration(n) || ts.isEnumMember(n) || ts.isClassDeclaration(n) || ts.isModuleDeclaration(n)
      ) {
        const name = n.name && nameText(n.name);
        if (name) {
          all.add(name);
          if (isLanguage) language.add(name);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { all, language };
}
