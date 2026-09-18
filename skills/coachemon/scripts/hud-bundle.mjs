// Prints the HUD as one injectable script: every hud/*.js file in name order, inside a single IIFE, with "__MODE__"
// replaced. Any other mode prints probe.js with only the HUD modules it imports. Used by read.sh and by the tests.
// Usage: node hud-bundle.mjs <hud|hud-off|battle|starters>
//
// Modules. The page can't load real ES modules (read.sh injects a classic inline <script>, and tests `eval` it), so a
// file that uses `import` or `export` is turned into a function with its own scope. The rules, each failing the
// bundle with a named error (`err.code`):
//   - Named imports only, at the top of the file, before any code: `import { a, b } from "./NN-name.js";`
//     (`"./hud/NN-name.js"` from probe.js). Default, star, side-effect imports, `as` renames and an import below code
//     are `unsupported-form`.
//   - Exports are `export const name = …` or `export function name`. `export let` is `export-let`: state another file
//     needs is read and written through functions, since an imported binding never sees a reassignment. Default,
//     star, list and re-exports are `unsupported-form`.
//   - The number prefix is the layer order: a file imports only from lower-numbered files (`forward-import`).
//   - An imported name must be one the target declares: an export of a module, a top-level name of a flat file
//     (`undeclared-import`); the target must exist (`missing-file`).
//   - `// @only <importers>: <names>` restricts who may import those exports, by file name without `.js`. `tests`
//     means expose mode only. Any other importer fails with `only-violation`.
// A module sees only its imports, the injected enums and page globals (`window`, `document`, `Phaser`): it is defined
// outside the shared scope the flat files live in.
//
// Transition (until every file is a module): a module's exports are also declared in the shared scope, so flat files
// keep using them by name, and a module's import from a flat file resolves to that file's top-level name. Flat files'
// references to later files are tolerated; import lines are held to the rules from the start.
//
// Expose mode (`bundle("hud", { expose: true })`, tests only): `globalThis.__hud["NN-name"]` holds each module's
// exports, `@only tests` names included, and, for a flat file, its top-level names (read live, through getters).
// Private module names are never exposed.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as generated from "../../../src/enums/generated.ts";

const TABLES = Object.fromEntries(Object.entries(generated).filter(([k, v]) => k !== "NAMES" && v && typeof v === "object"));

// The game's build inlines its enums as numbers, so no enum names exist in the page. Source written as
// `MoveCategory.STATUS` gets a `const MoveCategory` holding the members it names, from the tables generated at the
// pinned tag (`npm run enums:gen`). A member the tag doesn't have fails the bundle, so a pin bump that renames or
// drops one can't break the HUD silently. Only `Enum.MEMBER` references are injected, never a whole table.
export const enumPrelude = source => {
  const used = new Map();
  for (const [, name, member] of source.matchAll(/(?<![\w$.])([A-Z]\w*)\.([A-Z][A-Z0-9_]*)\b/g)) {
    if (!Object.hasOwn(TABLES, name)) continue;
    if (!Object.hasOwn(TABLES[name], member)) {
      throw new Error(`${name}.${member} is not a member of ${name} at v${generated.GENERATED_GAME_VERSION}`);
    }
    if (!used.has(name)) used.set(name, new Set());
    used.get(name).add(member);
  }
  return [...used].sort(([a], [b]) => a.localeCompare(b)).map(([name, members]) =>
    `const ${name} = Object.freeze({ ${[...members].sort().map(m => `${m}: ${TABLES[name][m]}`).join(", ")} });`).join("\n");
};

export class BundleError extends Error {
  constructor(code, file, line, message) {
    super(`${file}${line ? `:${line}` : ""}: ${message} [${code}]`);
    this.name = "BundleError";
    this.code = code;
  }
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

// Skips a string, template, comment or regex literal starting at `i`; returns the index after it, or `i` when none
// starts there. `prev` is the last significant character, which tells a regex from a division.
const skipLiteral = (src, i, prev) => {
  const c = src[i], d = src[i + 1];
  if (c === "/" && d === "/") { const e = src.indexOf("\n", i); return e < 0 ? src.length : e; }
  if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); return e < 0 ? src.length : e + 2; }
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
    return j + 1;
  }
  if (c === "`") {
    let j = i + 1;
    while (j < src.length && src[j] !== "`") {
      if (src[j] === "\\") { j += 2; continue; }
      if (src[j] === "$" && src[j + 1] === "{") {
        // A substitution is code: `prev` is tracked through it, or `a / b` inside one reads as the start of a regex.
        let depth = 1, p = "{";
        j += 2;
        while (j < src.length && depth) {
          const k = skipLiteral(src, j, p);
          if (k !== j) { p = src[k - 1] ?? p; j = k; continue; }
          if (src[j] === "{") depth++;
          else if (src[j] === "}") depth--;
          if (!/\s/.test(src[j])) p = src[j];
          j++;
        }
        continue;
      }
      j++;
    }
    return j + 1;
  }
  if (c === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev)
    || /(?<![\w$.])(?:return|typeof|case|throw|in|of|void|delete|new|else|do|yield|await)\s*$/.test(src.slice(Math.max(0, i - 12), i)))) {
    let j = i + 1, cls = false;
    while (j < src.length && src[j] !== "\n") {
      if (src[j] === "\\") { j += 2; continue; }
      if (src[j] === "[") cls = true;
      else if (src[j] === "]") cls = false;
      else if (src[j] === "/" && !cls) break;
      j++;
    }
    j++;
    while (/[a-z]/.test(src[j] ?? "")) j++;
    return j;
  }
  return i;
};

// Strips every comment from a bundled script. The extension ships `hud.js` comment-stripped in every flavour (§5.2 of
// docs/spec/extension-distribution.md), which is what removes the comment lines that quote PokéRogue's own code. A
// block comment leaves its newlines behind, so nothing that relied on a line break gets joined; blank lines and
// trailing whitespace then collapse. Uses the same literal scanner as the import rules, so a `//` inside a string, a
// template or a regex survives.
export const stripComments = src => {
  let out = "", i = 0, prev = "";
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
    if (c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2), end = e < 0 ? src.length : e + 2;
      out += src.slice(i, end).replace(/[^\n]/g, "");
      i = end;
      continue;
    }
    const k = skipLiteral(src, i, prev);
    if (k !== i) { out += src.slice(i, k); prev = src[k - 1] ?? prev; i = k; continue; }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out.replace(/[ \t]+$/gm, "").replace(/\n{2,}/g, "\n");
};

// The names a destructuring pattern's braces or brackets declare (`{ a, b: c, d = 1, ...e }` → a, c, d, e).
const patternNames = inner => {
  const out = [];
  let depth = 0, part = "";
  for (const ch of `${inner},`) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      const p = part.trim().replace(/^\.\.\./, "").replace(/=[\s\S]*$/, "").trim();
      const name = (p.includes(":") ? p.slice(p.indexOf(":") + 1) : p).trim();
      if (IDENT.test(name)) out.push(name);
      part = "";
    } else part += ch;
  }
  return out;
};

// Top-level names a flat file declares: `function`, `class`, and every declarator of a `const` / `let` / `var`
// statement that starts at column 0. `lets` holds the ones that can be reassigned.
export const topNames = src => {
  const names = new Set(), lets = new Set();
  for (const m of src.matchAll(/^(?:async\s+)?(?:function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^(const|let|var)\s+/gm)) {
    const mutable = m[1] !== "const";
    let i = m.index + m[0].length, depth = 0, prev = "", expectName = true;
    while (i < src.length) {
      if (expectName && depth === 0) {
        const rest = src.slice(i);
        const id = /^\s*([A-Za-z_$][\w$]*)/.exec(rest);
        const open = /^\s*([{[])/.exec(rest);
        if (open) {
          const start = i + open[0].length;
          let j = start, dd = 1;
          while (j < src.length && dd) {
            const k = skipLiteral(src, j, "{");
            if (k !== j) { j = k; continue; }
            if ("([{".includes(src[j])) dd++;
            else if (")]}".includes(src[j])) dd--;
            j++;
          }
          for (const n of patternNames(src.slice(start, j - 1))) { names.add(n); if (mutable) lets.add(n); }
          i = j; prev = "}"; expectName = false; continue;
        }
        if (id) { names.add(id[1]); if (mutable) lets.add(id[1]); i += id[0].length; prev = "a"; expectName = false; continue; }
        break;
      }
      const k = skipLiteral(src, i, prev);
      if (k !== i) { i = k; prev = "a"; continue; }
      const ch = src[i];
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
      if (depth < 0 || (depth === 0 && ch === ";")) break;
      if (depth === 0 && ch === ",") expectName = true;
      // A statement without a semicolon ends where the next one starts at column 0.
      if (depth === 0 && ch === "\n" && /^[^\s)\]}.,?:+\-*/|&]/.test(src[i + 1] ?? "")) break;
      if (!/\s/.test(ch)) prev = ch;
      i++;
    }
  }
  return { names, lets };
};

const STATIC_IMPORT = /^\s*import\s*(?:[{*"'`]|[A-Za-z_$][\w$]*\s*(?:,|from\b))/;

// Parses one file: its imports, exports, `@only` rules and, for a flat file, its top-level names. `pathRe` matches an
// import path and captures the target's file name.
export const parseFile = (file, src, pathRe) => {
  const id = file.replace(/\.js$/, "");
  const lines = src.split("\n");
  const imports = [];
  const fail = (code, line, msg) => { throw new BundleError(code, file, line, msg); };
  const body = [...lines];
  let i = 0, inComment = false;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (inComment) { if (l.includes("*/")) inComment = false; continue; }
    if (/^\s*$/.test(l) || /^\s*\/\//.test(l)) continue;
    if (/^\s*\/\*/.test(l)) { inComment = !l.includes("*/"); continue; }
    if (!STATIC_IMPORT.test(l)) break;
    const start = i;
    let stmt = l;
    while (!/["'`][^"'`]*["'`]\s*;?\s*$/.test(stmt.replace(/\/\/.*$/, "")) && i + 1 < lines.length) stmt += `\n${lines[++i]}`;
    for (let k = start; k <= i; k++) body[k] = "";
    const line = start + 1;
    const text = stmt.trim();
    if (/^import\s*["'`]/.test(text)) fail("unsupported-form", line, "side-effect import; import named exports instead");
    if (/^import\s*\*/.test(text)) fail("unsupported-form", line, "star import; import names with `import { a } from`");
    if (/^import\s*[A-Za-z_$]/.test(text)) fail("unsupported-form", line, "default import; import names with `import { a } from`");
    const m = /^import\s*\{([^}]*)\}\s*from\s*(["'])([^"']*)\2\s*;?$/.exec(text);
    if (!m) fail("unsupported-form", line, `unrecognised import: ${text}`);
    const names = m[1].split(",").map(s => s.trim()).filter(Boolean);
    const renamed = names.find(n => /\sas\s/.test(n));
    if (renamed) fail("unsupported-form", line, `\`as\` rename (${renamed}); import the name as it is exported`);
    const bad = names.find(n => !IDENT.test(n));
    if (bad) fail("unsupported-form", line, `unrecognised import name: ${bad}`);
    const target = pathRe.exec(m[3])?.[1];
    if (!target) fail("unsupported-form", line, `import path ${m[3]} is not a HUD file`);
    imports.push({ from: target, names, line });
  }
  for (let k = i; k < lines.length; k++) {
    if (STATIC_IMPORT.test(lines[k]) && !/^\s*\/\//.test(lines[k])) fail("unsupported-form", k + 1, "import below code; imports go at the top of the file");
  }

  const exports = new Map(); // name → line
  lines.forEach((l, k) => {
    if (!/^\s*export\b/.test(l)) return;
    const line = k + 1;
    if (/^export\s+let\b/.test(l)) fail("export-let", line, "`export let`; export functions that read and write the state");
    if (/^\s+export\b/.test(l)) fail("unsupported-form", line, "export below the top level");
    if (/^export\s+default\b/.test(l)) fail("unsupported-form", line, "default export; use `export const`");
    if (/^export\s*\*/.test(l)) fail("unsupported-form", line, "star re-export; import the names and export your own");
    if (/^export\s*\{/.test(l)) fail("unsupported-form", line, "export list or re-export; put `export` on the declaration");
    const m = /^export\s+const\s+([A-Za-z_$][\w$]*)\s*=/.exec(l) ?? /^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(l);
    if (!m) fail("unsupported-form", line, `unrecognised export: ${l.trim()}`);
    exports.set(m[1], line);
    body[k] = l.replace(/^export\s+/, "");
  });

  const only = new Map(); // name → Set of importers
  lines.forEach((l, k) => {
    const m = /^\/\/\s*@only\s+([^:]+):\s*(.+)$/.exec(l);
    if (!m) return;
    const importers = m[1].split(/[\s,]+/).filter(Boolean);
    for (const name of m[2].split(/[\s,]+/).filter(Boolean)) {
      if (!exports.has(name)) fail("unsupported-form", k + 1, `@only names ${name}, which this file doesn't export`);
      only.set(name, new Set([...(only.get(name) ?? []), ...importers]));
    }
  });

  const module = imports.length > 0 || exports.size > 0;
  return { file, id, src, module, imports, exports, only, body: body.join("\n"), ...(module ? {} : topNames(src)) };
};

const numberOf = id => (/^(\d+)-/.exec(id)?.[1] ?? null);
const q = JSON.stringify;

// Checks every import against the rules. `files` in load order; `entry` (the probe) may import from any numbered
// file, but only from modules, since a flat file has no scope of its own to take a name from.
const check = (files, entry) => {
  const byId = new Map(files.map(f => [f.id, f]));
  for (const f of entry ? [...files, entry] : files) {
    for (const { from, names, line } of f.imports) {
      const t = byId.get(from);
      if (!t) throw new BundleError("missing-file", f.file, line, `imports from ${from}.js, which doesn't exist`);
      const [mine, theirs] = [numberOf(f.id), numberOf(t.id)];
      if (f !== entry && (mine == null || theirs == null || +theirs >= +mine)) {
        throw new BundleError("forward-import", f.file, line, `imports from ${t.file}; a file imports only from lower-numbered files`);
      }
      if (f === entry && !t.module) throw new BundleError("unsupported-form", f.file, line, `imports from ${t.file}, which is not a module`);
      for (const n of names) {
        if (!(t.module ? t.exports.has(n) : t.names.has(n))) {
          throw new BundleError("undeclared-import", f.file, line, `imports ${n}, which ${t.file} doesn't ${t.module ? "export" : "declare"}`);
        }
        const allowed = t.only.get(n);
        if (allowed && !allowed.has(f.id)) {
          throw new BundleError("only-violation", f.file, line, `imports ${n}, which ${t.file} allows only for ${[...allowed].join(", ")}`);
        }
      }
    }
  }
  return byId;
};

const braces = list => (list.length ? `{ ${list.join(", ")} }` : "{}");
const factory = f => `// ---- ${f.file}\n${q(f.id)}: (${braces(f.imports.flatMap(i => i.names))}) => {\n${f.body}\nreturn ${braces([...f.exports.keys()])};\n},`;
// The call that runs a module, handing it its imports: from a module's instance, or a flat file's top-level name.
const instantiate = (f, byId) => `__hud[${q(f.id)}] = __hudModules[${q(f.id)}](${braces(f.imports.flatMap(({ from, names }) =>
  names.map(n => (byId.get(from).module ? `${n}: __hud[${q(from)}].${n}` : n))))});`;

// Links parsed files into one script body. `hoist`: declare every module's exports in the shared scope (the HUD's
// transition); otherwise only `entry`'s imports are declared, for the entry's code after them.
const link = (files, { expose = false, entry = null } = {}) => {
  const byId = check(files, entry);
  const modules = files.filter(f => f.module);
  const enums = enumPrelude([...files.map(f => (f.module ? f.body : f.src)), entry?.body ?? ""].join("\n"));
  const out = [
    `// ---- enums (src/enums/generated.ts, v${generated.GENERATED_GAME_VERSION})`,
    ...(enums ? [enums] : []),
    `const __hudModules = {\n${modules.map(factory).join("\n")}\n};`,
  ];
  if (entry) {
    out.push("const __hud = {};", ...modules.map(f => instantiate(f, byId)));
    for (const { from, names } of entry.imports) out.push(`const { ${names.join(", ")} } = __hud[${q(from)}];`);
    out.push(`// ---- ${entry.file}\n${entry.body}`);
    return out.join("\n");
  }
  const shared = [expose ? "const __hud = globalThis.__hud = {};" : "const __hud = {};"];
  for (const f of files) {
    if (f.module) {
      shared.push(instantiate(f, byId));
      if (f.exports.size) shared.push(`const { ${[...f.exports.keys()].join(", ")} } = __hud[${q(f.id)}];`);
      continue;
    }
    shared.push(`// ---- ${f.file}\n${f.src}`);
    if (expose) shared.push(`__hud[${q(f.id)}] = { ${[...f.names].map(n => `get ${n}() { return ${n}; }`).join(", ")} };`);
  }
  out.push(`(() => {\n${shared.join("\n")}\n})();`);
  return out.join("\n");
};

const withMode = (text, mode) => text.replaceAll('"__MODE__"', q(mode));

// `files`: [[file name, source]] in load order, for tests of the rules; read from hud/ otherwise.
export const bundle = (mode, { expose = false, files } = {}) => {
  const dir = fileURLToPath(new URL("./hud/", import.meta.url));
  const read = () => files ?? readdirSync(dir).filter(f => f.endsWith(".js")).sort().map(f => [f, readFileSync(dir + f, "utf8")]);
  const hudFiles = read().map(([f, s]) => parseFile(f, s, /^\.\/(\d+-[\w-]+)\.js$/));
  if (mode === "hud" || mode === "hud-off") {
    // `hud-off` is the prelude alone: it stops a running panel and reports.
    const parsed = mode === "hud-off" ? hudFiles.slice(0, 1) : hudFiles;
    return withMode(`// Runs in the PokéRogue page world. Draws the always-on coach panel over the game: battle plan, learn-move
// card, rewards card. Read-only: presses nothing and never changes game state. Idempotent — injecting again
// replaces the running panel. Source: skills/coachemon/scripts/hud/.
(() => {
${link(parsed, { expose })}
})();
`, mode);
  }
  // The probe carries only the modules it imports, transitively. A block, so injecting it twice doesn't redeclare
  // the consts in the page's global scope.
  const probe = parseFile("probe.js", readFileSync(fileURLToPath(new URL("./probe.js", import.meta.url)), "utf8"), /^\.\/hud\/(\d+-[\w-]+)\.js$/);
  const byId = new Map(hudFiles.map(f => [f.id, f]));
  const needed = new Set();
  const visit = id => {
    const f = byId.get(id);
    if (!f || needed.has(id)) return;
    needed.add(id);
    for (const i of f.imports) visit(i.from);
  };
  for (const i of probe.imports) visit(i.from);
  const closure = hudFiles.filter(f => needed.has(f.id));
  const missing = probe.imports.find(i => !byId.has(i.from));
  if (missing) throw new BundleError("missing-file", probe.file, missing.line, `imports from ${missing.from}.js, which doesn't exist`);
  return withMode(`{\n${link(closure, { entry: probe })}\n}\n`, mode);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(bundle(process.argv[2] ?? "hud"));
