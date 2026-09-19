/**
 * Moveset-prior codegen: trims the pkmn/randbats sets into the snapshot the
 * coach HUD bundles (#70).
 *
 *   npm run randbats:gen            # refetch and rewrite the snapshot
 *   npm run randbats:gen -- --check # fail if the snapshot is stale or oversized
 *
 * Why a snapshot and not a live fetch: the HUD runs inside the PokéRogue page,
 * which may not reach a third-party host, and a prior that disappears when the
 * network does is a prior the card cannot explain. The upstream files are MIT
 * (pkmn/randbats, Showdown's dex); only move *names per role* and the evolution
 * chains are kept — no PokéRogue data is copied (see #77).
 *
 * The prior is a nudge and never a veto, so staleness is cheap: a set that
 * moved on just stops matching. The release re-runs this so the drift stays
 * small (see .releaserc.json).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const RANDBATS = "https://data.pkmn.cc/randbats";
/** Showdown's dex, for evolution chains only: randbats has no not-fully-evolved species. */
const DEX = "https://play.pokemonshowdown.com/data/pokedex.json";
const OUT = new URL("../skills/coachemon/scripts/hud/05-randbats.js", import.meta.url);
/** The snapshot rides in the injected HUD bundle, so it stays small enough to paste. */
const MAX_BYTES = 150 * 1024;

const { values: args } = parseArgs({ options: { check: { type: "boolean" } } });

/** Showdown's id form: lowercase, letters and digits only. The HUD normalises the same way. */
const toId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

type Role = { moves?: string[] };
type Set_ = { roles?: Record<string, Role>; moves?: string[] };
type Sets = Record<string, Set_>;
type DexEntry = { evos?: string[]; baseSpecies?: string };
type Dex = Record<string, DexEntry>;

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
};

/** Move names per role, deduped and sorted, for one randbats file. Older gens have a flat `moves` list. */
const rolesOf = (set: Set_): [string, string[]][] => {
  const roles = set.roles && Object.keys(set.roles).length
    ? Object.entries(set.roles).map(([name, r]) => [name, r.moves ?? []] as [string, string[]])
    : [["Random Set", set.moves ?? []] as [string, string[]]];
  return roles.filter(([, moves]) => moves.length).map(([name, moves]) => [name, [...new Set(moves)].sort()]);
};

/**
 * Species → roles, as indices into the shared move and role tables. Later files only fill species the
 * earlier ones missed, so gen 9 wins and gen 8/7 are the fallback for species it dropped.
 */
const pack = (files: Sets[], moveIx: Map<string, number>, roleIx: Map<string, number>) => {
  const out: Record<string, number[][]> = {};
  for (const sets of files) {
    for (const [name, set] of Object.entries(sets)) {
      const id = toId(name);
      if (out[id]) continue;
      const roles = rolesOf(set);
      if (!roles.length) continue;
      out[id] = roles.map(([role, moves]) => [intern(roleIx, role), ...moves.map(m => intern(moveIx, m))]);
    }
  }
  return out;
};

const intern = (table: Map<string, number>, key: string) => {
  const seen = table.get(key);
  if (seen !== undefined) return seen;
  table.set(key, table.size);
  return table.size - 1;
};

/** Every fully-evolved descendant of `id`, by walking the dex's `evos` to the leaves. */
const finalsOf = (dex: Dex, id: string): string[] => {
  const evos = dex[id]?.evos;
  if (!evos?.length) return [id];
  return [...new Set(evos.flatMap(name => finalsOf(dex, toId(name))))];
};

const build = async () => {
  const [gen9, gen9d, gen8, gen7, dexRaw] = await Promise.all([
    fetchJson<Sets>(`${RANDBATS}/gen9randombattle.json`),
    fetchJson<Sets>(`${RANDBATS}/gen9randomdoublesbattle.json`),
    fetchJson<Sets>(`${RANDBATS}/gen8randombattle.json`),
    fetchJson<Sets>(`${RANDBATS}/gen7randombattle.json`),
    fetchJson<Record<string, DexEntry>>(DEX),
  ]);
  const dex: Dex = Object.fromEntries(Object.entries(dexRaw).map(([id, e]) => [toId(id), e]));

  const moveIx = new Map<string, number>();
  const roleIx = new Map<string, number>();
  const singles = pack([gen9, gen8, gen7], moveIx, roleIx);
  const doubles = pack([gen9d], moveIx, roleIx);
  const has = (id: string) => id in singles || id in doubles;

  // Forms: randbats keys a form ("Rotom-Wash") that a base name ("Rotom") never matches, and the HUD only
  // knows PokéRogue's base species name. Derived from the dex's `baseSpecies`, not hand-listed: every form
  // whose base has no sets of its own lands under that base.
  const forms: Record<string, string[]> = {};
  for (const id of [...new Set([...Object.keys(singles), ...Object.keys(doubles)])].sort()) {
    const base = dex[id]?.baseSpecies ? toId(dex[id].baseSpecies!) : null;
    if (!base || base === id || has(base)) continue;
    (forms[base] ??= []).push(id);
  }
  /** The sets an id stands for: its own, or every form of it. */
  const setsFor = (id: string) => (has(id) ? [id] : (forms[id] ?? []));

  // Not-fully-evolved species: the sets they'd grow into. Only where the species itself has none.
  const evos: Record<string, string[]> = {};
  for (const [id, entry] of Object.entries(dex)) {
    if (has(id) || id in forms || !entry.evos?.length) continue;
    const finals = [...new Set(finalsOf(dex, id).flatMap(setsFor))];
    if (finals.length) evos[id] = finals;
  }

  return { moveIx, roleIx, singles, doubles, evos, forms };
};

const table = (ix: Map<string, number>) => JSON.stringify([...ix.keys()]);
const rows = (map: Record<string, number[][]>) =>
  `{${Object.entries(map).map(([id, roles]) => `${id}:[${roles.map(r => `[${r}]`).join(",")}]`).join(",")}}`;
const list = (map: Record<string, string[]>) =>
  `{${Object.entries(map).map(([id, xs]) => `${id}:${JSON.stringify(xs)}`).join(",")}}`;

const render = (b: Awaited<ReturnType<typeof build>>) => `// GENERATED by scripts/gen-randbats.ts — do not edit. Re-run \`npm run randbats:gen\`.
// A trimmed pkmn/randbats snapshot (MIT): which moves show up on a species' competitive sets, and under
// which role name. Used by 40-learn.js as a small nudge on a move's score, never as a veto (#70).
// \`m\`/\`r\`: the move and role name tables. \`s\`/\`d\`: singles / doubles, species id → [roleIndex, ...moveIndexes].
// \`e\`: a not-fully-evolved species → the fully-evolved ones its sets stand in for (randbats lists no NFEs).
// \`f\`: a species whose sets are all under form names → those form keys.
export const RANDBATS = {
m: ${table(b.moveIx)},
r: ${table(b.roleIx)},
s: ${rows(b.singles)},
d: ${rows(b.doubles)},
e: ${list(b.evos)},
f: ${list(b.forms)},
};
`;

// A refresh is a nicety, not a release gate: if the upstream files are unreachable, keep the snapshot we have.
// The prior only ever nudges a score, so one that is a few weeks stale costs nothing a release should stop for.
let built: Awaited<ReturnType<typeof build>>;
try {
  built = await build();
} catch (err) {
  if (args.check || !existsSync(OUT)) throw err;
  console.warn(`keeping the existing snapshot — could not refresh it: ${(err as Error).message}`);
  process.exit(0);
}
const text = render(built);
const bytes = Buffer.byteLength(text);
if (bytes > MAX_BYTES) {
  console.error(`snapshot is ${(bytes / 1024).toFixed(1)} KB, over the ${MAX_BYTES / 1024} KB budget`);
  process.exit(1);
}
if (args.check) {
  const current = readFileSync(OUT, "utf8");
  if (current !== text) {
    console.error("05-randbats.js is stale — run `npm run randbats:gen`");
    process.exit(1);
  }
  console.log(`randbats snapshot up to date (${(bytes / 1024).toFixed(1)} KB)`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT.pathname} — ${(bytes / 1024).toFixed(1)} KB, ${Object.keys(built.singles).length} species,`
    + ` ${Object.keys(built.doubles).length} in doubles, ${Object.keys(built.evos).length} pre-evolutions,`
    + ` ${Object.keys(built.forms).length} form-only species`);
}
