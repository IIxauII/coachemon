import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { check, format, loadRepo, program, type Registry, type Repo, scan } from "./check.ts";
import type { AreaName } from "./files.ts";
import { REGISTRY } from "./registry/index.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES = "scripts/game-reads/fixtures";
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const TABLES = { UiMode: { STARTER_SELECT: 9 }, BiomeId: { SPACE: 1 } };

const CLEAN: Registry = {
  page: {
    reads: [
      { name: "ui", kind: "field", at: ["src/battle-scene.ts#BattleScene.ui"] },
      { name: "handlers", kind: "field", at: ["src/ui/ui.ts#UI.handlers"] },
      { name: "cursor", kind: "field", at: ["src/ui/handlers/ui-handler.ts#UiHandler.cursor"] },
      { name: "phaseManager", kind: "locator", at: ["src/battle-scene.ts#BattleScene.phaseManager"] },
      { name: "getCurrentPhase", kind: "method", at: ["src/phase-manager.ts#PhaseManager.getCurrentPhase"] },
      { name: "phaseName", kind: "field", at: ["src/phase.ts#Phase.phaseName"] },
      { name: "SelectStarterPhase", kind: "phase", at: ["src/phases/select-starter-phase.ts#SelectStarterPhase"] },
    ],
  },
  server: { reads: [] },
  hud: {
    reads: [
      { name: "arena", kind: "field", at: ["src/battle-scene.ts#BattleScene.arena"] },
      { name: "biomeId", kind: "field", at: ["src/field/arena.ts#Arena.biomeId"] },
      { name: "prLang", kind: "storage-key", at: ["src/plugins/i18n.ts#initI18n"] },
    ],
    mirrors: [{ ours: `${FIXTURES}/hud.js#rare-biomes`, of: ["src/data/balance/biomes.ts#biomeLinks"] }],
  },
  templates: { reads: [] },
  harness: {
    reads: [
      {
        name: "#system/version-converter",
        kind: "import",
        at: ["src/system/version-migration/version-converter.ts#applySessionVersionMigration"],
      },
      { name: "sessionData", kind: "field", at: ["test/framework/game-manager.ts#GameManager.sessionData"] },
    ],
  },
};

const repo = (edit: Partial<Record<"page" | "hud" | "harness", string>> = {}, declared: Record<string, string[]> = {}): Repo => {
  const text = (name: "page" | "hud" | "harness", file: string) => edit[name] ?? fixture(file);
  const files: Record<AreaName, { file: string; text: string }[]> = {
    page: [{ file: `${FIXTURES}/page.ts`, text: text("page", "page.ts") }],
    server: [],
    hud: [{ file: `${FIXTURES}/hud.js`, text: text("hud", "hud.js") }],
    harness: [{ file: `${FIXTURES}/harness.ts.template`, text: text("harness", "harness.ts.template") }],
    templates: [],
  };
  return {
    reads: scan(files, TABLES),
    own: new Set(["m", "scene", "result"]),
    builtin: new Set(["keys", "has", "getItem"]),
    language: new Set(["keys", "has"]),
    game: { version: "1.0", names: new Map(Object.entries(declared)) },
    tables: TABLES,
  };
};

const problems = (r: Repo, registry: Registry = CLEAN) => check(r, registry).map(format);

test("a fixture whose every game read is registered passes", () => {
  assert.deepEqual(problems(repo()), []);
});

test("a game read added to a fixture and left unregistered fails the check", () => {
  const page = fixture("page.ts").replace("cursor: h.cursor,", "cursor: h.cursor, grid: h.filteredStarterContainers,");
  assert.deepEqual(problems(repo({ page })), [
    `UNREGISTERED [page] property filteredStarterContainers (${FIXTURES}/page.ts:3)`,
  ]);
});

test('a name our code declares is UNREGISTERED when the game declares it too, naming the version and the from: "ours" fix', () => {
  assert.deepEqual(problems(repo({}, { scene: [] })), [
    `UNREGISTERED [page] property scene (${FIXTURES}/page.ts:4) — the game declares it at v1.0: register it with the ` +
      'game\'s ref, or with from: "ours" if the name is ours and the game only shares it',
  ]);
});

test("a DOM or Node name the game declares needs an entry; a language name never does", () => {
  assert.deepEqual(
    check(repo({}, { getItem: [], keys: [] }), CLEAN).map(p => `${p.what} (${p.where})`),
    [`property getItem (${FIXTURES}/hud.js:3)`],
  );
});

test('an entry, from: "ours" included, keeps a name the game declares from failing', () => {
  const registry: Registry = { ...CLEAN, page: { reads: [...CLEAN.page.reads, { name: "scene", kind: "field", at: [], from: "ours" }] } };
  assert.deepEqual(problems(repo({}, { scene: [] }), registry), []);
});

test("a name registered only as a storage key does not cover a property read of it", () => {
  assert.deepEqual(check(repo({}, { prLang: [] }), CLEAN).map(p => p.what), []);
  const page = fixture("page.ts").replace("cursor: h.cursor,", "cursor: h.cursor, lang: L.prLang,");
  assert.deepEqual(check(repo({ page }, { prLang: [] }), CLEAN).map(p => p.what), ["property prLang"]);
});

test("the game's refs, where the source was read, are named three at most", () => {
  const refs = ["a.ts#A.scene", "b.ts#B.scene", "c.ts#C.scene", "d.ts#D.scene", "e.ts#E.scene"];
  assert.match(problems(repo({}, { scene: refs }))[0], /at v1\.0 \(a\.ts#A\.scene, b\.ts#B\.scene, c\.ts#C\.scene, \+2 more\): register/);
});

test("a registry entry no scanned file reads is STALE", () => {
  const registry = { ...CLEAN, page: { reads: [...CLEAN.page.reads, { name: "lastSpecies", kind: "field" as const, at: [] }] } };
  assert.deepEqual(problems(repo(), registry), ["STALE [page] field lastSpecies", "INVALID [page] field lastSpecies names no game ref"]);
});

test("an unregistered phase-name string fails", () => {
  const page = fixture("page.ts").replace('"SelectStarterPhase"', '"SelectModifierPhase"');
  assert.deepEqual(problems(repo({ page })), [
    `UNREGISTERED [page] phase SelectModifierPhase (${FIXTURES}/page.ts:4)`,
    "STALE [page] phase SelectStarterPhase",
  ]);
});

test("an unregistered storage key fails, a prefix built by concatenation included", () => {
  const hud = fixture("hud.js").replace('getItem("prLang")', 'getItem("sessionData" + slot)');
  assert.deepEqual(problems(repo({ hud })), [
    `UNREGISTERED [hud] storage key sessionData (${FIXTURES}/hud.js:3)`,
    "STALE [hud] storage-key prLang",
  ]);
});

test("an unregistered import specifier fails, and so does a binding its entry does not name", () => {
  const moved = fixture("harness.ts.template").replace("#system/version-converter", "#system/version-migration");
  assert.deepEqual(problems(repo({ harness: moved })), [
    `UNREGISTERED [harness] import #system/version-migration (${FIXTURES}/harness.ts.template:1)`,
    "STALE [harness] import #system/version-converter",
  ]);
  const extra = fixture("harness.ts.template").replace("{ applySessionVersionMigration }", "{ applySessionVersionMigration, migrate }");
  assert.deepEqual(problems(repo({ harness: extra })), [
    `UNREGISTERED [harness] import #system/version-converter { migrate } (${FIXTURES}/harness.ts.template:1)`,
  ]);
});

test("a mirror marker must resolve to a Mirror entry, and a Mirror must keep its marker", () => {
  const renamed = fixture("hud.js").replace("@mirrors rare-biomes", "@mirrors rare-onward");
  assert.deepEqual(problems(repo({ hud: renamed })), [
    `UNREGISTERED [hud] mirror rare-onward (${FIXTURES}/hud.js:1)`,
    `STALE [hud] mirror ${FIXTURES}/hud.js#rare-biomes`,
  ]);
});

test("a mirror id is lower-kebab: one in any other case is INVALID", () => {
  const shouting = fixture("hud.js").replace("@mirrors rare-biomes", "@mirrors RARE_BIOMES");
  const registry: Registry = { ...CLEAN, hud: { ...CLEAN.hud, mirrors: [{ ours: `${FIXTURES}/hud.js#RARE_BIOMES`, of: ["src/data/balance/biomes.ts#biomeLinks"] }] } };
  assert.deepEqual(problems(repo({ hud: shouting }), registry), [`INVALID [hud] mirror ${FIXTURES}/hud.js#RARE_BIOMES is not lower-kebab`]);
});

test("one mirror marker may sit in several files, each named by the Mirror and each kept", () => {
  const again = { file: `${FIXTURES}/hud-too.js`, text: "// @mirrors rare-biomes\nexport const rareCount = () => 1;\n" };
  const both: Repo = { ...repo(), reads: [...repo().reads, ...scan({ page: [], server: [], hud: [again], harness: [], templates: [] }, TABLES)] };
  const registry: Registry = {
    ...CLEAN,
    hud: { ...CLEAN.hud, mirrors: [{ ours: [`${FIXTURES}/hud.js#rare-biomes`, again.file + "#rare-biomes"], of: ["src/data/balance/biomes.ts#biomeLinks"] }] },
  };
  assert.deepEqual(problems(both, registry), []);
  assert.deepEqual(problems(repo(), registry), [`STALE [hud] mirror ${FIXTURES}/hud-too.js#rare-biomes`]);
});

test("an enum member the generated table lacks fails", () => {
  const hud = fixture("hud.js").replace("BiomeId.SPACE", "BiomeId.SPACE, BiomeId.ISLAND");
  assert.deepEqual(problems(repo({ hud })), [`UNREGISTERED [hud] enum member BiomeId.ISLAND (${FIXTURES}/hud.js:2)`]);
});

test("in a typed file only a read off an `any` counts: a read our own types declare is never the game's", () => {
  const file = `${FIXTURES}/typed.ts`;
  const files = { page: [{ file, text: fixture("typed.ts") }], server: [], hud: [], harness: [], templates: [] };
  const reads = scan(files, TABLES, program(ROOT, [file])).filter(r => r.kind === "property").map(r => r.name);
  assert.deepEqual(reads, ["optionsContainer"]);
});

test("every game read in the repo is registered, and every registry entry is read", () => {
  const found = check(loadRepo(ROOT), REGISTRY).map(format);
  assert.deepEqual(found, [], `${found.length} problems:\n${found.join("\n")}`);
});
