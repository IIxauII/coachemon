// Run: `node docs/research/742-starter-unlock-quality/history.mjs` (needs the `gh` CLI; caches under /tmp/742-history-cache).
// Measures how much upstream PokéRogue's egg moves, starter passives and ability attribute classes change per release tag.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "pagefaultgames/pokerogue";
const CACHE = "/tmp/742-history-cache";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "history.json");

const TAGS = [
  "1.10.0",
  ...[1, 2, 3, 4, 5, 6, 7].map(n => `v1.10.${n}`),
  ...Array.from({ length: 23 }, (_, n) => `v1.11.${n}`),
  ...Array.from({ length: 12 }, (_, n) => `v1.12.0.${n}`),
  ...[0, 1, 2, 3].map(n => `v1.12.1.${n}`),
];

const WATCHED_ATTRS = [
  "AlliedFieldDamageReductionAbAttr",
  "AllyMoveCategoryPowerBoostAbAttr",
  "PostSummonWeatherChangeAbAttr",
  "PostSummonTerrainChangeAbAttr",
  "TypeImmunityAbAttr",
  "TypeImmunityHealAbAttr",
  "RunSuccessAbAttr",
  "StatMultiplierAbAttr",
  "UngroundedAbAttr",
];

// Abilities whose attribute classes we track across releases (nice-to-have mapping).
const WATCHED_ABILITIES = [
  "FRIEND_GUARD", "POWER_SPOT", "PLUS", "MINUS", "DRIZZLE", "ELECTRIC_SURGE", "VOLT_ABSORB", "WATER_ABSORB",
  "LEVITATE", "RUN_AWAY", "AURA_BREAK", "CLOUD_NINE", "MAGIC_BOUNCE", "BATTERY", "STEELY_SPIRIT", "FLOWER_GIFT",
];

function gh(args) {
  return execFileSync("gh", args, { maxBuffer: 1 << 28 }).toString();
}

function cached(file, fetch) {
  if (existsSync(file)) return readFileSync(file, "utf8");
  const body = fetch();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  return body;
}

function treePaths(tag) {
  const json = cached(`${CACHE}/${tag}/__tree.json`, () =>
    JSON.stringify(JSON.parse(gh(["api", `repos/${REPO}/git/trees/${tag}?recursive=1`])).tree.map(e => e.path)),
  );
  return new Set(JSON.parse(json));
}

function source(tag, path) {
  return cached(`${CACHE}/${tag}/${path}`, () =>
    gh(["api", "-H", "Accept: application/vnd.github.raw", `repos/${REPO}/contents/${path}?ref=${tag}`]),
  );
}

function firstExisting(paths, candidates) {
  return candidates.find(p => paths.has(p));
}

// The enum prefix (`Species.` / `SpeciesId.`, `Moves.` / `MoveId.`, `Abilities.` / `AbilityId.`) is dropped: only the member name is kept.
const member = s => s.replace(/^\w+\./, "");

function parseEggMoves(text) {
  const map = {};
  const start = text.indexOf("speciesEggMoves");
  const body = text.slice(start);
  for (const m of body.matchAll(/\[\s*\w+\.(\w+)\s*\]\s*:\s*\[([^\]]*)\]/g)) {
    map[m[1]] = m[2].split(",").map(s => s.trim()).filter(Boolean).map(member);
  }
  return map;
}

function parsePassiveValue(v) {
  v = v.trim();
  if (!v.startsWith("{")) return { 0: member(v) };
  const forms = {};
  for (const m of v.matchAll(/(\d+)\s*:\s*(\w+\.\w+)/g)) forms[m[1]] = member(m[2]);
  return forms;
}

// Pre-1.12: one table `starterPassiveAbilities` in passives.ts, `[SpeciesId.X]: { 0: AbilityId.Y, 1: ... }`.
function parsePassiveTable(text) {
  const map = {};
  const body = text.slice(text.indexOf("starterPassiveAbilities"));
  for (const m of body.matchAll(/\[\s*\w+\.(\w+)\s*\]\s*:\s*(\{[^}]*\})/g)) map[m[1]] = parsePassiveValue(m[2]);
  return map;
}

// 1.12+: each species entry in generation-0N.ts carries `passives: AbilityId.X` or `passives: { 0: ..., 1: ... }`.
function parseGenerationFile(text, map) {
  const parts = text.split(/\w+SpeciesData\[\s*\w+\.(\w+)\s*\]\s*=\s*\{/);
  for (let i = 1; i < parts.length; i += 2) {
    const m = parts[i + 1].match(/\bpassives\s*:\s*(\{[^}]*\}|\w+\.\w+)/);
    if (m) map[parts[i]] = parsePassiveValue(m[1]);
  }
  return map;
}

function parseAbilityCode(text) {
  const classes = new Set();
  // Only attribute classes (`...AbAttr`, plus a few legacy `...Attr`): skips `Ability`, `AbBuilder` and helpers.
  for (const m of text.matchAll(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+Attr)\b/gm)) classes.add(m[1]);
  const abilities = {};
  const parts = text.split(/new\s+(?:Ability|AbBuilder)\(\s*\w+\.(\w+)\s*,/);
  for (let i = 1; i < parts.length; i += 2) {
    abilities[parts[i]] = [...new Set(parts[i + 1].match(/\b\w+AbAttr\b/g) ?? [])].sort();
  }
  return { classes, abilities };
}

function snapshot(tag) {
  const paths = treePaths(tag);
  const files = {};

  files.eggMoves = firstExisting(paths, [
    "src/data/balance/moves/egg-moves.ts",
    "src/data/balance/egg-moves.ts",
    "src/data/egg-moves.ts",
  ]);
  const eggMoves = parseEggMoves(source(tag, files.eggMoves));

  let passives = {};
  const genFiles = [...paths].filter(p => /^src\/data\/balance\/species\/generation-\d+\.ts$/.test(p)).sort();
  files.passives = firstExisting(paths, ["src/data/balance/passives.ts"]);
  if (files.passives) {
    passives = parsePassiveTable(source(tag, files.passives));
  } else if (genFiles.length) {
    files.passives = "src/data/balance/species/generation-*.ts";
    for (const f of genFiles) parseGenerationFile(source(tag, f), passives);
  } else {
    files.passives = "src/data/pokemon-species.ts";
    passives = parsePassiveTable(source(tag, files.passives));
  }

  const abilityFiles = [
    "src/data/abilities/ab-attrs.ts",
    "src/data/abilities/ability.ts",
    "src/data/abilities/init-abilities.ts",
    "src/data/ability.ts",
  ].filter(p => paths.has(p));
  files.abilities = abilityFiles;
  const ab = parseAbilityCode(abilityFiles.map(f => source(tag, f)).join("\n"));

  return { tag, files, eggMoves, passives, abAttrClasses: ab.classes, abilityAttrs: ab.abilities };
}

const CAP = 40;
const cap = list => (list.length > CAP ? [...list.slice(0, CAP), `… ${list.length - CAP} more`] : list);

function diffEggMoves(a, b) {
  const added = Object.keys(b.eggMoves).filter(s => !(s in a.eggMoves));
  const removed = Object.keys(a.eggMoves).filter(s => !(s in b.eggMoves));
  const changed = [];
  const rare = [];
  let commonOnly = 0;
  for (const s of Object.keys(b.eggMoves)) {
    const x = a.eggMoves[s];
    const y = b.eggMoves[s];
    if (!x || x.join() === y.join()) continue;
    changed.push(s);
    if (x[3] !== y[3]) rare.push(`${s}: ${x[3]} → ${y[3]}`);
    else commonOnly++;
  }
  return {
    startersChanged: changed.length,
    rareSlotChanged: rare.length,
    commonSlotOnly: commonOnly,
    added,
    removed,
    rareSlotChanges: cap(rare),
    startersChangedList: cap(changed),
  };
}

function diffPassives(a, b, only) {
  const keep = s => !only || only.has(s);
  const A = Object.keys(a.passives).filter(keep);
  const B = Object.keys(b.passives).filter(keep);
  const added = B.filter(s => !(s in a.passives));
  const removed = A.filter(s => !(s in b.passives));
  const form0 = [];
  const forms = [];
  for (const s of B) {
    const x = a.passives[s];
    const y = b.passives[s];
    if (!x) continue;
    if (x[0] !== y[0]) form0.push(`${s}: ${x[0]} → ${y[0]}`);
    for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (x[f] !== y[f]) forms.push(`${s}/${f}: ${x[f] ?? "-"} → ${y[f] ?? "-"}`);
    }
  }
  return { speciesChanged: form0.length, formsChanged: forms.length, added, removed, changes: cap(forms) };
}

function diffAbAttrs(a, b) {
  const added = [...b.abAttrClasses].filter(c => !a.abAttrClasses.has(c)).sort();
  const removed = [...a.abAttrClasses].filter(c => !b.abAttrClasses.has(c)).sort();
  const abilitiesChanged = Object.keys(b.abilityAttrs).filter(
    k => k in a.abilityAttrs && a.abilityAttrs[k].join() !== b.abilityAttrs[k].join(),
  );
  return { added, removed, abilitiesWithChangedAttrSet: abilitiesChanged.length, abilitiesChanged: cap(abilitiesChanged) };
}

const stats = xs => {
  const s = [...xs].sort((p, q) => p - q);
  const mean = s.reduce((p, q) => p + q, 0) / s.length;
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { mean: Math.round(mean * 100) / 100, median, max: s[s.length - 1] };
};

const lineOf = tag => (tag.startsWith("v1.12.1") ? "1.12.1" : tag.startsWith("v1.12.0") ? "1.12.0" : tag.replace(/^v?(\d+\.\d+).*/, "$1"));

const snaps = TAGS.map(t => {
  process.stderr.write(`${t} `);
  return snapshot(t);
});
process.stderr.write("\n");

const pairs = [];
for (let i = 1; i < snaps.length; i++) {
  const a = snaps[i - 1];
  const b = snaps[i];
  const starters = new Set([...Object.keys(b.eggMoves), "PIKACHU"]);
  pairs.push({
    from: a.tag,
    to: b.tag,
    eggMoves: diffEggMoves(a, b),
    passives: diffPassives(a, b),
    starterPassives: diffPassives(a, b, starters),
    abAttrs: diffAbAttrs(a, b),
  });
}

const byLine = {};
for (const p of pairs) {
  const l = (byLine[lineOf(p.to)] ??= { releases: 0, eggStartersChanged: 0, rareSlotChanged: 0, passiveSpeciesChanged: 0, passiveFormsChanged: 0, starterPassiveSpeciesChanged: 0, abAttrClassesAdded: 0, abAttrClassesRemoved: 0 });
  l.releases++;
  l.eggStartersChanged += p.eggMoves.startersChanged;
  l.rareSlotChanged += p.eggMoves.rareSlotChanged;
  l.passiveSpeciesChanged += p.passives.speciesChanged;
  l.passiveFormsChanged += p.passives.formsChanged;
  l.starterPassiveSpeciesChanged += p.starterPassives.speciesChanged;
  l.abAttrClassesAdded += p.abAttrs.added.length;
  l.abAttrClassesRemoved += p.abAttrs.removed.length;
}

const watchedAbilities = {};
for (const ab of WATCHED_ABILITIES) {
  const seen = [];
  for (const s of snaps) {
    const attrs = (s.abilityAttrs[ab] ?? []).join(", ");
    if (!seen.length || seen[seen.length - 1].attrs !== attrs) seen.push({ from: s.tag, attrs });
  }
  watchedAbilities[ab] = seen;
}

const summary = {
  tags: TAGS,
  releasesCovered: pairs.length,
  releasesWithEggMoveChange: pairs.filter(p => p.eggMoves.startersChanged || p.eggMoves.added.length || p.eggMoves.removed.length).length,
  releasesWithRareSlotChange: pairs.filter(p => p.eggMoves.rareSlotChanged).length,
  releasesWithPassiveChange: pairs.filter(p => p.passives.formsChanged || p.passives.added.length || p.passives.removed.length).length,
  releasesWithStarterPassiveChange: pairs.filter(p => p.starterPassives.formsChanged).length,
  releasesWithAbAttrClassChange: pairs.filter(p => p.abAttrs.added.length || p.abAttrs.removed.length).length,
  rareSlotChangesPerRelease: stats(pairs.map(p => p.eggMoves.rareSlotChanged)),
  eggStartersChangedPerRelease: stats(pairs.map(p => p.eggMoves.startersChanged)),
  passiveSpeciesChangedPerRelease: stats(pairs.map(p => p.passives.speciesChanged)),
  passiveFormsChangedPerRelease: stats(pairs.map(p => p.passives.formsChanged)),
  starterPassiveSpeciesChangedPerRelease: stats(pairs.map(p => p.starterPassives.speciesChanged)),
  totalsByLine: byLine,
  counts: Object.fromEntries(
    snaps.map(s => [s.tag, { eggMoveStarters: Object.keys(s.eggMoves).length, passiveSpecies: Object.keys(s.passives).length, abAttrClasses: s.abAttrClasses.size, abilitiesParsed: Object.keys(s.abilityAttrs).length }]),
  ),
  watchedAttrPresence: Object.fromEntries(
    WATCHED_ATTRS.map(c => {
      const present = snaps.filter(s => s.abAttrClasses.has(c)).map(s => s.tag);
      const absent = snaps.filter(s => !s.abAttrClasses.has(c)).map(s => s.tag);
      return [c, { presentAt: `${present.length}/${snaps.length}`, firstSeen: present[0] ?? null, lastSeen: present.at(-1) ?? null, absentAt: absent }];
    }),
  ),
  watchedAbilityAttrHistory: watchedAbilities,
  sourceFiles: Object.fromEntries(snaps.map(s => [s.tag, s.files])),
};

writeFileSync(OUT, `${JSON.stringify({ summary, pairs }, null, 2)}\n`);
console.log(`wrote ${OUT}`);
