import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseEnum } from "../../src/enums/parse.ts";
import type { Generated } from "../gen-enums.ts";
import { type Registry, scan } from "../game-reads/check.ts";
import type { AreaName } from "../game-reads/files.ts";
import { blockers, type Drift, drift, type DriftInput } from "./check.ts";
import { GameSource } from "./source.ts";

const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));
const ENUM_FILES = { UiMode: "src/enums/ui-mode.ts", PartyUiMode: "src/enums/party-ui-mode.ts", Challenges: "src/enums/challenges.ts" };

const enumsAt = (version: string): Generated["enums"] =>
  Object.fromEntries(
    Object.entries(ENUM_FILES).map(([name, file]) => [name, parseEnum(readFileSync(`${FIXTURES}/${version}/${file}`, "utf8"), name)]),
  );
const V1 = enumsAt("v1");
const tables = Object.fromEntries(Object.entries(V1).map(([k, v]) => [k, Object.fromEntries(v)]));

const OURS: Record<AreaName, { file: string; text: string }[]> = {
  page: [
    {
      file: "src/page/read.ts",
      text: [
        "export function read(L: any, game: any) {",
        "  const h = L.ui.handlers[L.m.STARTER_SELECT];",
        "  return [h.filteredStarterContainers, h.lastSpecies, h.cursor, L.scene.phaseManager, game.config.gameVersion, L.ui.mode, L.ui.modeChain];",
        "}",
        "export function stored(L: any) {",
        "  return globalThis.localStorage.getItem(\"sessionData\" + L.slot);",
        "}",
      ].join("\n"),
    },
  ],
  server: [
    {
      file: "src/screen.ts",
      text: [
        'import { UiMode } from "./enums/generated.ts";',
        "export const isSettingsMode = (mode: number) => mode >= UiMode.SETTINGS && mode <= UiMode.KEYBOARD_BINDING;",
        "// @mirrors title-new-game",
        "export const newGameIndex = (options: unknown[]) => (options.length >= 2 ? 1 : 0);",
        "// @mirrors SAVE_KEY",
        'const SAVE_KEY = "x0i2O7WRiANTqPmZ";',
      ].join("\n"),
    },
  ],
  hud: [
    {
      file: "skills/coachemon/scripts/hud/52-shop.js",
      text: [
        "// @mirrors LAB_LINKS",
        'const LAB_LINKS = ["CONSTRUCTION_SITE"];',
        'export const reward = ph => ph.phaseName === "SelectModifierPhase" && ph.rerollCount > 0;',
        'export const trainerTable = t => "level" in t.YOUNGSTER;',
      ].join("\n"),
    },
  ],
  templates: [],
  harness: [
    {
      file: "src/solver/harness.test.ts.template",
      text: [
        'import { applySessionVersionMigration } from "#system/version-converter";',
        "export const sweep = (s: any) => [s.spriteSparkleHandler, applySessionVersionMigration(s)];",
      ].join("\n"),
    },
  ],
};

const SSU = "src/ui/handlers/starter-select-ui-handler.ts";
const REGISTRY: Registry = {
  page: {
    reads: [
      { name: "filteredStarterContainers", kind: "field", at: [`${SSU}#StarterSelectUiHandler.filteredStarterContainers`] },
      { name: "lastSpecies", kind: "field", at: [`${SSU}#StarterSelectUiHandler.lastSpecies`] },
      { name: "cursor", kind: "field", at: [`${SSU}#StarterSelectUiHandler.cursor`] },
      { name: "ui", kind: "locator", at: ["src/battle-scene.ts#BattleScene.ui"] },
      { name: "mode", kind: "field", at: ["src/ui/ui.ts#UI.mode"] },
      { name: "modeChain", kind: "locator", at: ["src/ui/ui.ts#UI.modeChain"] },
      { name: "phaseManager", kind: "locator", at: ["src/battle-scene.ts#BattleScene.phaseManager"] },
      { name: "gameVersion", kind: "locator", at: ["src/main.ts#startGame"], from: "phaser" },
      { name: "sessionData", kind: "storage-key", at: ["src/system/game-data.ts#GameData.getSessionKey"] },
    ],
  },
  server: {
    reads: [],
    sets: [
      { at: "src/enums/ui-mode.ts#UiMode", known: V1.UiMode.map(([k]) => k), handledIn: ["src/screen.ts"] },
      { at: "src/enums/party-ui-mode.ts#PartyUiMode", known: V1.PartyUiMode.map(([k]) => k), handledIn: ["src/screen.ts"] },
      { at: "src/enums/challenges.ts#Challenges", known: V1.Challenges.map(([k]) => k), handledIn: ["skills/coachemon/scripts/hud/03-calendar.js"] },
      { at: "src/phase-manager.ts#PHASES", known: ["CommandPhase", "SelectModifierPhase"], handledIn: ["skills/coachemon/scripts/hud/02-decision.js"] },
    ],
    mirrors: [
      { ours: "src/screen.ts#title-new-game", of: ["src/phases/title-phase.ts#TitlePhase.showOptions"] },
      { ours: "src/screen.ts#SAVE_KEY", of: ["src/constants.ts#saveKey"] },
    ],
  },
  hud: {
    reads: [
      { name: "SelectModifierPhase", kind: "phase", at: ["src/phases/select-modifier-phase.ts#SelectModifierPhase"] },
      { name: "phaseName", kind: "field", at: ["src/phases/select-modifier-phase.ts#SelectModifierPhase.phaseName"] },
      { name: "level", kind: "table", at: ["src/data/trainers/trainer-config.ts#trainerConfigs"] },
    ],
    mirrors: [{ ours: "skills/coachemon/scripts/hud/52-shop.js#LAB_LINKS", of: ["src/data/balance/biomes.ts#biomeLinks"] }],
  },
  templates: { reads: [] },
  harness: {
    reads: [
      {
        name: "#system/version-converter",
        kind: "import",
        at: ["src/system/version-migration/version-converter.ts#applySessionVersionMigration"],
      },
      { name: "spriteSparkleHandler", kind: "field", at: ["src/battle-scene.ts#BattleScene.spriteSparkleHandler"] },
    ],
  },
};

const DEPS: DriftInput["deps"] = new Map([
  ["src/field/pokemon.ts#EnemyPokemon.generateAndPopulateMoveset", { dependents: ["hud/49-ahead.js"], groups: ["hud"] }],
  [`${SSU}#StarterSelectUiHandler.processInput`, { dependents: ["STARTER_SELECT"], groups: ["ladder"] }],
]);

const at = (version: string, hashes: Record<string, string>): Drift =>
  drift({
    source: new GameSource(`${FIXTURES}/${version}`),
    hashes,
    deps: DEPS,
    ladder: {},
    registry: REGISTRY,
    reads: scan(OURS, tables),
    tables,
    modifiers: {},
    regenerated: { enums: enumsAt(version), modifiers: {}, generated: "", modifiersText: "" },
    language: new Set(["length", "getItem"]),
  });

const STAMP = at("v1", {}).hashes;
const V2 = at("v2", STAMP);
const refs = (items: Drift["missing"]) => items.map(i => i.ref);

test("at the stamped version every kind is clean, so the stamp would record only what is new", () => {
  const first = at("v1", {});
  assert.deepEqual(first.missing, []);
  assert.ok(first.unreviewed.length > 0);
  const again = at("v1", STAMP);
  const found = { ...again, hashes: undefined };
  assert.deepEqual(found, {
    hashes: undefined, moved: [], missing: [], unreviewed: [], misplaced: [], added: [], shifted: [], unregistered: [],
  });
});

test("a handler field the new version drops is MISSING", () => {
  assert.ok(refs(V2.missing).includes(`${SSU}#StarterSelectUiHandler.filteredStarterContainers`));
  assert.ok(refs(V2.missing).includes(`${SSU}#StarterSelectUiHandler.lastSpecies`));
  assert.ok(!refs(V2.missing).includes(`${SSU}#StarterSelectUiHandler.cursor`));
});

test("a field the game turns into a getter is MOVED, not MISSING", () => {
  assert.ok(refs(V2.moved).includes("src/ui/ui.ts#UI.mode"));
  assert.ok(!refs(V2.missing).includes("src/ui/ui.ts#UI.mode"));
});

test("a field the harness template reads, renamed, is MISSING", () => {
  assert.ok(refs(V2.missing).includes("src/battle-scene.ts#BattleScene.spriteSparkleHandler"));
});

test("a callee one level down of a hashed dep is hashed", () => {
  assert.ok(`${SSU}#StarterSelectUiHandler.popStarter` in STAMP);
});

test("a super call costs no level: the base method and its callees are hashed, and MOVED when a body changes", () => {
  assert.ok("src/field/pokemon.ts#Pokemon.generateAndPopulateMoveset" in STAMP);
  const moved = V2.moved.find(i => i.ref === "src/ai/ai-moveset-gen.ts#generateMoveset");
  assert.deepEqual(moved?.dependents, ["callee of src/field/pokemon.ts#EnemyPokemon.generateAndPopulateMoveset"]);
});

test("a phase whose phaseName no longer matches the string we compare is MISSING", () => {
  assert.ok(refs(V2.missing).includes('src/phases/select-modifier-phase.ts#SelectModifierPhase (phaseName "SelectModifierPhase")'));
});

test("members the game adds to a UiMode, PartyUiMode, phase or Challenges set are ADDED", () => {
  assert.deepEqual(V2.added, [
    "UiMode.SETTINGS_GENERAL (src/enums/ui-mode.ts#UiMode) — handle in src/screen.ts",
    "UiMode.SETTINGS_AUDIO (src/enums/ui-mode.ts#UiMode) — handle in src/screen.ts",
    "PartyUiMode.CHECK (src/enums/party-ui-mode.ts#PartyUiMode) — handle in src/screen.ts",
    "Challenges.MOVESET_RANDOMIZER (src/enums/challenges.ts#Challenges) — handle in skills/coachemon/scripts/hud/03-calendar.js",
    "PHASES.ReorderPartyPhase (src/phase-manager.ts#PHASES) — handle in skills/coachemon/scripts/hud/02-decision.js",
  ]);
});

test("a data table read by shape is hashed whole, and MOVED when its data changes", () => {
  assert.ok(refs(V2.moved).includes("src/data/trainers/trainer-config.ts#trainerConfigs"));
});

test("a hand constant mirroring game data is MOVED when what it mirrors changes", () => {
  const lab = V2.moved.find(i => i.ref === "src/data/balance/biomes.ts#biomeLinks");
  assert.deepEqual(lab?.dependents, ["hud: mirror skills/coachemon/scripts/hud/52-shop.js#LAB_LINKS"]);
});

test("the title indices start_run picks by are MOVED when the title's options change", () => {
  const title = V2.moved.find(i => i.ref === "src/phases/title-phase.ts#TitlePhase.showOptions");
  assert.deepEqual(title?.dependents, ["server: mirror src/screen.ts#title-new-game"]);
});

test("the settings range loses its first member: the read is MISSING and the regenerated values SHIFTED", () => {
  assert.ok(refs(V2.missing).includes("enum member UiMode.SETTINGS"));
  assert.ok(refs(V2.missing).includes("src/enums/ui-mode.ts#UiMode member SETTINGS"));
  assert.deepEqual(V2.shifted, ["UiMode.SETTINGS: 3 → gone", "UiMode.SETTINGS_DISPLAY: 4 → 5", "UiMode.KEYBOARD_BINDING: 5 → 6"]);
});

test("a page locator path renamed is MISSING, and a Phaser upgrade under gameVersion is MOVED", () => {
  assert.ok(refs(V2.missing).includes("src/battle-scene.ts#BattleScene.phaseManager"));
  const phaser = V2.moved.find(i => i.ref === "package.json#dependencies.phaser");
  assert.deepEqual(phaser?.dependents, ["page: locator gameVersion"]);
});

test("a page locator whose declaration changes is MOVED, naming the read that leans on it", () => {
  const chain = V2.moved.find(i => i.ref === "src/ui/ui.ts#UI.modeChain");
  assert.deepEqual(chain?.dependents, ["page: locator modeChain"]);
});

test("a save key change is MOVED, and a storage key the game no longer writes is MISSING", () => {
  assert.ok(refs(V2.moved).includes("src/constants.ts#saveKey"));
  assert.ok(refs(V2.missing).includes('src/system/game-data.ts#GameData.getSessionKey (no "sessionData")'));
});

test("an import specifier of the harness that no longer resolves is MISSING", () => {
  assert.ok(refs(V2.missing).includes("#system/version-converter (resolves to no file)"));
  assert.ok(refs(V2.missing).includes("src/system/version-migration/version-converter.ts#applySessionVersionMigration"));
});

test("a name we read and the new version declares, with no registry entry, is UNREGISTERED", () => {
  assert.deepEqual(V2.unregistered, [
    "rerollCount — read at skills/coachemon/scripts/hud/52-shop.js:3; the game declares it at " +
      `${SSU}#StarterSelectUiHandler.rerollCount`,
  ]);
});

test("the stamp refuses while anything MISSING, ADDED, SHIFTED or UNREGISTERED remains", () => {
  const b = blockers(V2);
  assert.ok(b.MISSING > 0 && b.ADDED > 0 && b.SHIFTED > 0 && b.UNREGISTERED > 0);
  assert.deepEqual(blockers(at("v1", STAMP)), { MISSING: 0, MISPLACED: 0, ADDED: 0, SHIFTED: 0, UNREGISTERED: 0 });
});
