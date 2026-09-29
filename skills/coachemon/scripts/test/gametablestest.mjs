import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const ORIGIN = "https://pokerogue.net";
const chunk = name => `${ORIGIN}/assets/${name}`;

const BIOMES = chunk("loading-scene-1a2b3c4d.js");
const SPECIES = chunk("FadeOut-5e6f7a8b.js");
const DATA = chunk("data-9c0d1e2f.js");
const REWARDS = chunk("rewards-3a4b5c6d.js");
const ENTRIES = [
  { name: BIOMES, initiatorType: "script" },
  { name: SPECIES, initiatorType: "link" },
  { name: DATA, initiatorType: "other" },
  { name: REWARDS, initiatorType: "script" },
  // Each fails exactly one filter, so each proves that filter alone: a duplicate, another origin, outside /assets/, a
  // stylesheet, unhashed, and an asset a stylesheet pulled in.
  { name: BIOMES, initiatorType: "script" },
  { name: "https://cdn.example.com/assets/vendor-7f8e9d0c.js", initiatorType: "script" },
  { name: `${ORIGIN}/other/loading-scene-1a2b3c4d.js`, initiatorType: "script" },
  { name: chunk("index-2b3c4d5e.css"), initiatorType: "link" },
  { name: chunk("unhashed.js"), initiatorType: "script" },
  { name: chunk("sprite-4d5e6f7a.js"), initiatorType: "css" },
];

const list = (fill) => { const v = Array(140).fill(null); v[1] = fill; return v; };
const NAMESPACES = {
  [BIOMES]: {
    allBiomes: new Map([[1, { biomeLinks: [2], pokemonPool: {} }]]),
    getBiomeName: function getBiomeName(id) { return `biome ${id}`; },
    // A named export the scan has no use for, and a getter that throws: both are stepped over.
    initLoadingScreen: function initLoadingScreen() {},
    get notYet() { throw new ReferenceError("temporal dead zone"); },
  },
  [SPECIES]: { registry: { getSpecies: () => null, getAllSpecies: () => [] } },
  [DATA]: {
    allAbilities: list({ id: 1, name: "Stench", attrs: [] }),
    allMoves: list({ id: 1, power: 40, pp: 35 }),
    speciesEggMoves: { 1: [1, 2, 3, 4], 4: [5, 6, 7, 8], 7: [9, 10, 11, 12] },
    trainerConfigs: { youngster: { trainerType: 1, partyTemplates: [] } },
    timedEventManager: { getShinyCatchMultiplier: () => 3 },
    // Too short to be a table, so it is not mistaken for one.
    SHORT: [{ id: 1, power: 1, pp: 1 }],
  },
  [REWARDS]: {
    regenerateModifierPoolThresholds: function regenerateModifierPoolThresholds() {},
    getPlayerModifierTypeOptions: function getPlayerModifierTypeOptions() {},
  },
};

const injected = [];
const node = tag => {
  const n = { tag, style: {}, children: [], attached: false, remove() { n.attached = false; },
    addEventListener() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } };
  return n;
};
let clock = 1e12;
Date.now = () => clock;
globalThis.window = globalThis;
globalThis.location = { origin: ORIGIN };
globalThis.performance = { now: () => 0, getEntriesByType: kind => (kind === "resource" ? ENTRIES : []) };
globalThis.document = {
  documentElement: { dataset: {}, appendChild(n) { n.attached = true; if (n.tag === "script") injected.push(n); return n; } },
  body: { appendChild() {} },
  createElement: node,
};
globalThis.Phaser = { Math: { RND: { state: () => "!rnd,0" } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => ({ gameMode: {} }) } } } }] } } } };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };
eval(bundle("hud", { expose: true }));
const { gameTables, gameEvents, gameRewardFns } = globalThis.__hud["04-game-tables"];

const row = (label, cells) => console.log(`${label.padEnd(28)}${[cells].flat().join("  ")}`);
const tablesNow = () => {
  const t = gameTables();
  return t ? [...Object.keys(t)].sort().join("+") : "none";
};
const importedUrls = () => injected.map(el => {
  assert.equal(el.tag, "script");
  assert.equal(el.type, "module");
  assert.equal(el.attached, false, "the element was left in the document");
  assert.doesNotMatch(el.textContent, /(?<![\w$.])import\s*\(/, "the module calls import()");
  const url = /^import \* as ns from "([^"]+)";/.exec(el.textContent)?.[1];
  assert.ok(url, `no literal specifier in ${el.textContent}`);
  return url;
});
const arrive = url => {
  assert.ok(NAMESPACES[url], `${url} is not one of the game's chunks`);
  window.__coachHudChunk(NAMESPACES[url]);
};
const attempt = () => { injected.length = 0; gameTables(); return importedUrls(); };

// ---- Which entries are worth importing, and what the module the HUD writes for each looks like.
console.log("== the read the HUD starts");
// The mount's first tick may already have started a read, so the clock goes past the retry first.
clock += 31000;
const first = attempt();
row("imported", first.map(u => u.slice(`${ORIGIN}/assets/`.length)));
row("skipped", `${ENTRIES.length - first.length} of ${ENTRIES.length} entries`);
row("element", "<script type=module>, appended then dropped");
row("source", injected[0].textContent.replace(ORIGIN, "…"));
assert.deepEqual(first, [BIOMES, SPECIES, DATA, REWARDS]);
// The URL is a literal in the module's own source: `hud.js` holds no `import()` call (#381).
assert.equal(injected[0].textContent, `import * as ns from ${JSON.stringify(BIOMES)};window.__coachHudChunk?.(ns);`);

// ---- A second read inside the 30 s window asks for nothing again.
console.log("== a second read, 1 s later");
clock += 1000;
row("imported", `${attempt().length} chunks`);
assert.deepEqual(attempt(), []);

// ---- Biomes alone commit nothing; species commit the tables, and every later chunk fills the same object.
console.log("== what each chunk commits");
row("before any chunk", [tablesNow(), `events=${gameEvents() ? "yes" : "no"}`, `rewardFns=${gameRewardFns() ? "yes" : "no"}`]);
arrive(BIOMES);
row("biomes, no species", tablesNow());
assert.equal(gameTables(), null);
// The biomes from the read before are kept, so species arriving from this one still commit the tables.
clock += 31000;
assert.deepEqual(attempt(), [BIOMES, SPECIES, DATA, REWARDS]);
arrive(SPECIES);
row("species join them", tablesNow());
const committed = gameTables();
assert.ok(committed?.biomes && committed.species);
arrive(DATA);
row("the data chunk", tablesNow());
row("same object, filled", `${gameTables() === committed}`);
assert.equal(gameTables(), committed);
assert.equal(gameEvents().getShinyCatchMultiplier(), 3);
assert.equal(gameTables().moves[1].power, 40);
assert.equal(gameTables().abilities[1].name, "Stench");
assert.deepEqual(gameTables().eggMoves[4], [5, 6, 7, 8]);
assert.equal(gameTables().biomeName(1), "biome 1");
assert.ok(gameTables().trainers.youngster);
row("rewards before", `${gameRewardFns() ? "yes" : "no"}`);
arrive(REWARDS);
row("rewards after", `${gameRewardFns() ? "yes" : "no"}`);
assert.equal(typeof gameRewardFns().regenerate, "function");
assert.equal(typeof gameRewardFns().options, "function");

// ---- With both in hand the HUD stops asking, retry window or not.
console.log("== once both are found");
clock += 31000;
row("imported", `${attempt().length} chunks`);
assert.deepEqual(attempt(), []);

// ---- The read's one mark on the page is the handoff, and teardown drops it (extension-distribution.md §9.6).
console.log("== the panel stops");
row("handoff before", typeof window.__coachHudChunk);
window.__coachHud.stop();
row("handoff after", typeof window.__coachHudChunk);
assert.equal(window.__coachHudChunk, undefined);
