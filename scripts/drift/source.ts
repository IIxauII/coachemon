/** The game's source at one version, as drift reads it: units found by ref, hashed, and every name it declares. */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { refParts } from "../game-reads/types.ts";

const printer = ts.createPrinter({ removeComments: true });

export const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const memberName = (sf: ts.SourceFile, m: ts.Node & { name?: ts.Node }) =>
  m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) || ts.isPrivateIdentifier(m.name))
    ? m.name.text
    : m.name?.getText(sf);

/**
 * Classes, interfaces, type aliases and enums named `name`: top-level ones first, then any nested in a function or a
 * method (a mixin's class, a method's local type), whose members the game declares all the same.
 */
function containers(sf: ts.SourceFile, name: string): ts.Node[] {
  const named = (n: ts.Node) =>
    (ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isEnumDeclaration(n)) &&
    n.name?.text === name;
  const top = sf.statements.filter(named);
  const deep: ts.Node[] = [];
  const visit = (n: ts.Node): void => {
    if (named(n) && !top.includes(n as ts.Statement)) deep.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...top, ...deep];
}

type ThisAssignment = ts.BinaryExpression & { left: ts.PropertyAccessExpression };

/** `this.<name> = …` assignments anywhere in a class body, a nested class's own left out. */
function thisAssignments(cls: ts.ClassDeclaration): ThisAssignment[] {
  const out: ThisAssignment[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) && n.left.expression.kind === ts.SyntaxKind.ThisKeyword
    ) out.push(n as ThisAssignment);
    if (!ts.isClassDeclaration(n) || n === cls) ts.forEachChild(n, visit);
  };
  visit(cls);
  return out;
}

export class GameSource {
  readonly root: string;
  readonly #parsed = new Map<string, ts.SourceFile | null>();
  #declared: Map<string, string[]> | null = null;
  #paths: Record<string, string[]> | null = null;

  constructor(root: string) {
    this.root = root;
  }

  exists(file: string): boolean {
    return existsSync(path.join(this.root, file));
  }

  read(file: string): string | null {
    const abs = path.join(this.root, file);
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
  }

  file(file: string): ts.SourceFile | null {
    if (!this.#parsed.has(file)) {
      const text = this.read(file);
      this.#parsed.set(file, text === null ? null : ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
    }
    return this.#parsed.get(file) ?? null;
  }

  /**
   * The node a ref names. A function, enum or top-level variable wins over a class or type of the same name, and a
   * method, getter or constructor over a field. Reordering them moves stamped hashes.
   */
  unit(ref: string): ts.Node | undefined {
    const { file, symbol, outer, member } = refParts(ref);
    const sf = this.file(file);
    if (!sf || symbol === "") return undefined;
    // `file#*` is the whole module: what the game does at its top level has no unit of its own.
    if (symbol === "*") return sf;
    if (member === undefined) {
      for (const node of sf.statements) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === outer) return node;
        if (ts.isEnumDeclaration(node) && node.name.text === outer) return node;
        if (ts.isVariableStatement(node)) {
          const decl = node.declarationList.declarations.find(d => ts.isIdentifier(d.name) && d.name.text === outer);
          if (decl) return decl;
        }
      }
      return containers(sf, outer)[0];
    }
    for (const node of containers(sf, outer)) {
      if (ts.isClassDeclaration(node)) {
        const method = node.members.find(m =>
          member === "constructor"
            ? ts.isConstructorDeclaration(m)
            : (ts.isMethodDeclaration(m) || ts.isGetAccessor(m)) && m.name.getText(sf) === member,
        );
        if (method) return method;
        const field = node.members.find(m => (ts.isPropertyDeclaration(m) || ts.isSetAccessor(m)) && memberName(sf, m) === member);
        if (field) return field;
        const ctor = node.members.find(ts.isConstructorDeclaration);
        const param = ctor?.parameters.find(p => ts.getModifiers(p)?.length && ts.isIdentifier(p.name) && p.name.text === member);
        if (param) return param;
        return thisAssignments(node).find(a => a.left.name.text === member);
      }
      const members = ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)
        ? node.members
        : ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type) ? node.type.members : undefined;
      const found = members?.find((m: ts.Node & { name?: ts.Node }) => memberName(sf, m) === member);
      if (found) return found;
    }
    return undefined;
  }

  /** A class hashes by its shape, what it extends and the names it declares, never its bodies. */
  hashOf(ref: string): string | null {
    const unit = this.unit(ref);
    if (!unit) return null;
    const sf = unit.getSourceFile();
    if (ts.isClassDeclaration(unit)) {
      const heritage = unit.heritageClauses?.map(h => h.getText(sf)).join(" ") ?? "";
      const names = unit.members.map(m => memberName(sf, m) ?? "constructor").sort();
      return hash(`class ${unit.name?.text} ${heritage} {${names.join(",")}}`);
    }
    return hash(printer.printNode(ts.EmitHint.Unspecified, unit, sf));
  }

  /** The printed text of a unit, for checks that look for a literal inside it. */
  text(ref: string): string | null {
    const unit = this.unit(ref);
    return unit ? printer.printNode(ts.EmitHint.Unspecified, unit, unit.getSourceFile()) : null;
  }

  sourceFiles(dir = "src"): string[] {
    const out: string[] = [];
    const walk = (rel: string) => {
      const abs = path.join(this.root, rel);
      if (!existsSync(abs)) return;
      for (const f of readdirSync(abs)) {
        const r = `${rel}/${f}`;
        if (statSync(path.join(this.root, r)).isDirectory()) walk(r);
        else if (f.endsWith(".ts") && !f.endsWith(".d.ts")) out.push(r);
      }
    };
    walk(dir);
    return out.sort();
  }

  /** Every member name `src/` and `test/` declare, with the refs that declare it: class and interface members, enum members, `this.x =`. */
  declared(): Map<string, string[]> {
    if (this.#declared) return this.#declared;
    const out = new Map<string, string[]>();
    const add = (name: string | undefined, ref: string) => {
      if (!name) return;
      const list = out.get(name) ?? [];
      if (!list.includes(ref)) list.push(ref);
      out.set(name, list);
    };
    for (const file of [...this.sourceFiles("src"), ...this.sourceFiles("test").filter(f => !/\.test(?:-d)?\.ts$/.test(f))]) {
      const sf = this.file(file);
      if (!sf) continue;
      const visit = (n: ts.Node): void => {
        if (ts.isClassDeclaration(n) && n.name) {
          const cls = n.name.text;
          for (const m of n.members) {
            if (ts.isConstructorDeclaration(m)) {
              for (const p of m.parameters) if (ts.getModifiers(p)?.length && ts.isIdentifier(p.name)) add(p.name.text, `${file}#${cls}.${p.name.text}`);
            } else add(memberName(sf, m), `${file}#${cls}.${memberName(sf, m)}`);
          }
          for (const a of thisAssignments(n)) add(a.left.name.text, `${file}#${cls}.${a.left.name.text}`);
        } else if (ts.isInterfaceDeclaration(n)) {
          for (const m of n.members) add(memberName(sf, m), `${file}#${n.name.text}.${memberName(sf, m)}`);
        } else if (ts.isEnumDeclaration(n)) {
          for (const m of n.members) add(memberName(sf, m), `${file}#${n.name.text}.${memberName(sf, m)}`);
        } else if (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type)) {
          for (const m of n.type.members) add(memberName(sf, m), `${file}#${n.name.text}.${memberName(sf, m)}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    this.#declared = out;
    return out;
  }

  /** `#…` import specifiers resolve through the game's tsconfig `paths`, the first existing file winning. */
  resolve(specifier: string): string | null {
    if (this.#paths === null) {
      const text = this.read("tsconfig.json");
      const parsed = text === null ? {} : ts.parseConfigFileTextToJson("tsconfig.json", text).config ?? {};
      this.#paths = parsed.compilerOptions?.paths ?? {};
    }
    for (const [pattern, targets] of Object.entries(this.#paths ?? {})) {
      const star = pattern.indexOf("*");
      const hit = star < 0
        ? specifier === pattern ? "" : null
        : specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1))
          ? specifier.slice(star, specifier.length - (pattern.length - star - 1))
          : null;
      if (hit === null) continue;
      for (const t of targets) {
        const file = path.posix.normalize(t.replace("*", hit)).replace(/^\.\//, "");
        if (this.exists(file)) return file;
      }
    }
    return null;
  }

  packageJson(): Record<string, any> {
    return JSON.parse(this.read("package.json") ?? "{}");
  }
}
