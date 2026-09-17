import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error: plain .mjs without type declarations
import { bundle, topNames } from "../skills/coach-pokerogue/scripts/hud-bundle.mjs";

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

test("imports must name what the target declares", () => {
  fails([["01-core.js", core], ["02-x.js", `import { secret } from "./01-core.js";\nexport const x = secret;\n`]],
    "undeclared-import", /imports secret, which 01-core\.js doesn't export/);
  fails([["01-flat.js", "const here = 1;\n"], ["02-x.js", `import { gone } from "./01-flat.js";\nexport const x = gone;\n`]],
    "undeclared-import", /which 01-flat\.js doesn't declare/);
  fails([["02-x.js", `import { a } from "./01-none.js";\nexport const x = a;\n`]], "missing-file", /01-none\.js, which doesn't exist/);
});

test("export let fails", () => {
  fails([["01-a.js", "export let n = 0;\n"]], "export-let", /01-a\.js:1: `export let`/);
});

test("expose mode: module exports, flat names live, private names hidden", () => {
  const got = load([
    ["01-core.js", `// @only tests: probeOnly\n${core}export const probeOnly = () => secret;\n`],
    ["02-flat.js", "let count = 0;\nconst bump = () => ++count, sum = add(2, 3);\nfunction later() { return twice(sum); }\n"],
    ["03-mod.js", `import { twice } from "./01-core.js";\nimport { bump, later } from "./02-flat.js";\nexport const run = () => [bump(), later(), twice(1)];\n`],
  ]);
  assert.deepEqual(Object.keys(got["01-core"]).sort(), ["add", "probeOnly", "twice"]);
  assert.equal((got["01-core"].probeOnly as () => number)(), 1);
  assert.deepEqual((got["03-mod"].run as () => number[])(), [1, 10, 2]);
  assert.equal(got["02-flat"].count, 1, "a flat let is read live");
  assert.equal(got["02-flat"].sum, 5, "a flat file uses a module export by name");
});

test("a module sees only its imports, not the shared scope", () => {
  assert.throws(() => load([
    ["01-flat.js", "const shared = 1;\n"],
    ["02-mod.js", "export const x = shared;\n"],
  ]), /shared is not defined/);
});

test("top-level names of a flat file", () => {
  const { names, lets } = topNames([
    "const a = 1, b = f(x, y), c = /,[)]/.test(s) ? `${d, e}` : 2;",
    "let { p, q: r, s = 1, ...t } = obj, [u] = arr;",
    "function g() { const inner = 1; }",
    "async function h() {}",
    "const k = (() => {",
    "  const hidden = 1;",
    "  return 1;",
    "})()",
    "class K {}",
    "const last = 1",
  ].join("\n"));
  assert.deepEqual([...names].sort(), ["K", "a", "b", "c", "g", "h", "k", "last", "p", "r", "s", "t", "u"]);
  assert.deepEqual([...lets].sort(), ["p", "r", "s", "t", "u"]);
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
