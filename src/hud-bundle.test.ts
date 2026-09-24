import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error: plain .mjs without type declarations
import { bundle, stripComments } from "../skills/coachemon/scripts/hud-bundle.mjs";

type Files = [string, string][];
const hud = (files: Files, expose = false): string => bundle("hud", { files, expose });
const fails = (files: Files, code: string, message: RegExp) =>
  assert.throws(() => hud(files), (e: Error & { code?: string }) => {
    assert.equal(e.code, code, e.message);
    assert.match(e.message, message);
    return true;
  });
// Loads an expose-mode bundle and returns what it put on globalThis.__hud.
const load = (files: Files): Record<string, Record<string, unknown>> => {
  new Function(hud(files, true))();
  return (globalThis as unknown as { __hud: Record<string, Record<string, unknown>> }).__hud;
};

const core = `export const add = (a, b) => a + b;\nconst secret = 1;\nexport function twice(x) { return add(x, x); }\n`;

test("an import from an equal- or higher-numbered file fails", () => {
  fails([["01-a.js", `import { b } from "./02-b.js";\nexport const a = b;\n`], ["02-b.js", "export const b = 1;\n"]],
    "forward-import", /01-a\.js:1: imports from 02-b\.js/);
  fails([["02-a.js", "export const a = 1;\n"], ["02-b.js", `import { a } from "./02-a.js";\nexport const b = a;\n`]],
    "forward-import", /02-b\.js:1/);
});

test("@only restricts who may import a name", () => {
  const guarded = `// @only 03-turn, tests: scene\nexport const scene = 1;\nexport const open = 2;\n`;
  fails([["01-core.js", guarded], ["02-other.js", `import { scene } from "./01-core.js";\nexport const x = scene;\n`]],
    "only-violation", /02-other\.js:1: imports scene, which 01-core\.js allows only for 03-turn, tests/);
  assert.doesNotThrow(() => hud([["01-core.js", guarded], ["02-other.js", `import { open } from "./01-core.js";\nexport const x = open;\n`],
    ["03-turn.js", `import { scene } from "./01-core.js";\nexport const y = scene;\n`]]));
  fails([["01-core.js", "// @only tests: nope\nexport const scene = 1;\n"]], "unsupported-form", /@only names nope/);
});

test("unsupported import and export forms fail by name", () => {
  const importer = (line: string): Files => [["01-core.js", core], ["02-x.js", `${line}\nexport const x = 1;\n`]];
  fails(importer(`import core from "./01-core.js";`), "unsupported-form", /default import/);
  fails(importer(`import * as core from "./01-core.js";`), "unsupported-form", /star import/);
  fails(importer(`import { add as plus } from "./01-core.js";`), "unsupported-form", /`as` rename/);
  fails(importer(`import "./01-core.js";`), "unsupported-form", /side-effect import/);
  fails(importer(`import { add } from "../elsewhere/01-core.js";`), "unsupported-form", /not a HUD file/);
  fails([["01-core.js", core], ["02-x.js", `export const x = 1;\nimport { add } from "./01-core.js";\n`]], "unsupported-form", /02-x\.js:2: import below code/);
  fails([["01-a.js", "export default 1;\n"]], "unsupported-form", /default export/);
  fails([["01-a.js", "const a = 1;\nexport { a };\n"]], "unsupported-form", /export list or re-export/);
  fails([["01-a.js", `export * from "./00-b.js";\n`]], "unsupported-form", /star re-export/);
  fails([["01-a.js", "export const { a, b } = { a: 1, b: 2 };\n"]], "unsupported-form", /unrecognised export/);
});

test("imports must name what the target exports", () => {
  fails([["01-core.js", core], ["02-x.js", `import { secret } from "./01-core.js";\nexport const x = secret;\n`]],
    "undeclared-import", /imports secret, which 01-core\.js doesn't export/);
  // A file that exports nothing is still a module with its own scope: none of its names can be imported.
  fails([["01-quiet.js", "const here = 1;\n"], ["02-x.js", `import { here } from "./01-quiet.js";\nexport const x = here;\n`]],
    "undeclared-import", /imports here, which 01-quiet\.js doesn't export/);
  fails([["02-x.js", `import { a } from "./01-none.js";\nexport const x = a;\n`]], "missing-file", /01-none\.js, which doesn't exist/);
});

test("export let fails", () => {
  fails([["01-a.js", "export let n = 0;\n"]], "export-let", /01-a\.js:1: `export let`/);
});

test("expose mode: every module's exports, private names hidden", () => {
  const got = load([
    ["01-core.js", `// @only tests: probeOnly\n${core}export const probeOnly = () => secret;\n`],
    ["02-count.js", `import { add } from "./01-core.js";\nlet count = 0;\nexport const bump = () => ++count;\nexport const sum = add(2, 3);\n`],
    ["03-mod.js", `import { twice } from "./01-core.js";\nimport { bump, sum } from "./02-count.js";\nexport const run = () => [bump(), twice(sum), twice(1)];\n`],
  ]);
  assert.deepEqual(Object.keys(got["01-core"]).sort(), ["add", "probeOnly", "twice"]);
  assert.equal((got["01-core"].probeOnly as () => number)(), 1);
  assert.deepEqual(Object.keys(got["02-count"]).sort(), ["bump", "sum"], "`count` is private to its module");
  assert.deepEqual((got["03-mod"].run as () => number[])(), [1, 10, 2]);
});

test("a file sees only its imports: there is no shared scope", () => {
  assert.throws(() => load([
    ["01-other.js", "const shared = 1;\n"],
    ["02-mod.js", "export const x = shared;\n"],
  ]), /shared is not defined/);
});

test("hud-off is the prelude alone, and the probe carries only its imports", () => {
  const off = bundle("hud-off");
  assert.match(off, /const MODE = "hud-off";/);
  assert.doesNotMatch(off, /01-core/);
  const probe = bundle("starters");
  assert.match(probe, /const MODE = "starters";/);
  // The probe imports the shared screen detection (02-screens) as well as the type chart, and nothing else.
  assert.deepEqual([...probe.matchAll(/^\/\/ ---- ([\w-]+\.js|enums)\b/gm)].map(m => m[1]), ["enums", "01-core.js", "02-screens.js", "probe.js"]);
  assert.match(probe, /^const \{ TYPES \} = __hud\["01-core"\];$/m);
  assert.match(probe, /^const \{ learnState, rewardsScreen \} = __hud\["02-screens"\];$/m);
});

test("the probe names Stellar, which the HUD's type chart leaves out", () => {
  const scope = globalThis as unknown as Record<string, unknown>;
  const mon = (types: number[]) => ({
    name: "x", level: 1, hp: 1, getMaxHp: () => 1, getTypes: () => types, getAbility: () => null, getStat: () => 1,
    isOnField: () => true, isBoss: () => false, moveset: [{ getMove: () => ({ name: "Tera Blast", type: 18 }), getName: () => "Tera Blast", getMovePp: () => 5, ppUsed: 0 }],
  });
  const scene = { ui: { getHandler: () => null, getMode: () => 0 }, currentBattle: { waveIndex: 1 }, getPlayerParty: () => [mon([11, 18])],
    getEnemyParty: () => [], modifiers: [] };
  scope.Phaser = { Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene } } } }] } } } };
  const root = { dataset: {} as Record<string, string> };
  scope.document = { documentElement: root, getElementById: () => null };
  scope.window = globalThis;
  try {
    new Function(bundle("battle"))();
    const out = JSON.parse(root.dataset.mcpOut);
    assert.deepEqual(out.party[0].types, ["Grass", "Stellar"]);
    assert.equal(out.party[0].moves[0].type, "Stellar");
  } finally {
    delete scope.Phaser; delete scope.document; delete scope.window;
  }
});

test("stripComments drops comments and keeps everything else", () => {
  assert.equal(stripComments("const a = 1; // trailing\nconst b = 2;\n"), "const a = 1;\nconst b = 2;\n");
  assert.equal(stripComments('const s = "// not a comment";\n'), 'const s = "// not a comment";\n');
  assert.equal(stripComments("const r = /\\/\\//.test(x);\n"), "const r = /\\/\\//.test(x);\n");
  assert.equal(stripComments("const t = `a // b ${x} d`;\n"), "const t = `a // b ${x} d`;\n");
  // A block comment leaves its newlines behind, so the two statements stay on their own lines.
  assert.equal(stripComments("const a = 1 /* one\ntwo */\nconst b = 2\n"), "const a = 1\nconst b = 2\n");
});

test("the HUD bundle ships comment-stripped and still parses (§5.2)", () => {
  const stripped = stripComments(bundle("hud"));
  assert.match(bundle("hud"), /Pokemon\.getAttackDamage,/);
  assert.doesNotMatch(stripped, /Pokemon\.getAttackDamage,/);
  assert.doesNotMatch(stripped, /^\/\//m);
  assert.doesNotMatch(stripped, /^\s*\/\*/m);
  assert.doesNotThrow(() => new Function(stripped));
});

// The Firefox add-on linter rejects `import()` whose argument it can't see is a literal, and `hud.js` ships inside the
// extension (#381). The chunk scan reaches the game's own modules through an injected module script instead, so what
// ships holds no `import()` call at all — the one shape of this check that can't drift with how the scan is written.
// Stripped, because that is the form the linter reads (§5.2): the scan's own comments may name the call it avoids.
test("the shipped HUD calls no import() (§5.2)", () => {
  assert.doesNotMatch(stripComments(bundle("hud")), /(?<![\w$.])import\s*\(/);
  // And still reads the chunks: a script the HUD gives `type = "module"`, whose source is the import. Without this the
  // check above would also pass on a HUD that had stopped reading them altogether.
  assert.match(stripComments(bundle("hud")), /\.type = "module";/);
});
