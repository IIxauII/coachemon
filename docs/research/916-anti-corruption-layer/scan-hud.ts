// Per-file inventory of game reads in skills/coachemon/scripts/hud/*.js, using the repo's own scanner (readsIn)
// and the HUD registry. Usage: node scan-hud.ts <repo-root> [json]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.argv[2];
const scan = await import(path.join(root, "scripts/game-reads/scan.ts"));
const check = await import(path.join(root, "scripts/game-reads/check.ts"));
const reg = await import(path.join(root, "scripts/game-reads/registry/index.ts"));

const tables = check.generatedTables();
const all = Object.values(reg.REGISTRY).flatMap((a: any) => a.reads) as { name: string; kind: string; at: string[]; from?: string }[];
// A name registered in any area passes (check.ts pools them); prefer a game entry over an "ours" one.
const byName = new Map<string, any>();
for (const e of all) { const had = byName.get(e.name); if (!had || (had.from === "ours" && e.from !== "ours")) byName.set(e.name, e); }
const dir = path.join(root, "skills/coachemon/scripts/hud");
const filesMod = await import(path.join(root, "scripts/game-reads/files.ts"));
// Names our own product code declares (check.ts loadRepo): a registered name outside this set is read only off game objects.
const own = new Set<string>();
for (const f of filesMod.ownFiles(root)) for (const n of scan.declaredIn(f, readFileSync(path.join(root, f), "utf8"))) own.add(n);
// DOM and Node names (addEventListener, dispatchEvent) count as shared: the game declares them too, but a HUD read of one is the DOM's.
for (const n of scan.builtinNames(root).all) own.add(n);
const files = readdirSync(dir).filter(f => f.endsWith(".js")).sort();

const GLOBALS: [string, RegExp][] = [
  ["Phaser", /\bPhaser\./g],
  ["battleScene()", /\bbattleScene\s*\(/g],
  ["globalThis", /\bglobalThis\b/g],
  ["window", /\bwindow\b/g],
];

const out: any[] = [];
for (const f of files) {
  const text = readFileSync(path.join(dir, f), "utf8");
  const reads = scan.readsIn(f, text, tables);
  const row: any = { file: f, lines: text.split("\n").length, game: Object.create(null), phaser: Object.create(null), ours: Object.create(null), unreg: Object.create(null), enums: Object.create(null), phases: [], globals: Object.create(null) };
  for (const r of reads) {
    if (r.kind === "property") {
      const e = byName.get(r.name);
      const bucket = !e ? "unreg" : e.from === "ours" ? "ours" : e.from === "phaser" ? "phaser" : "game";
      const key = e && bucket === "game" ? `${r.name}:${e.kind}${own.has(r.name) ? ":shared" : ":only"}` : r.name;
      (row[bucket][key] ??= []).push(r.line);
    } else if (r.kind === "enum-member") {
      const k = `${r.table ?? "?"}.${r.name}`;
      (row.enums[k] ??= []).push(r.line);
    } else if (r.kind === "phase") row.phases.push(`${r.name}:${r.line}`);
  }
  for (const [g, re] of GLOBALS) {
    const lines: number[] = [];
    text.split("\n").forEach((l, i) => { if (l.match(re) && !/^\s*\/\//.test(l)) lines.push(i + 1); });
    if (lines.length) row.globals[g] = lines;
  }
  out.push(row);
}

if (process.argv[3] === "json") {
  process.stdout.write(JSON.stringify(out, null, 1));
} else {
  const n = (o: any) => Object.values(o).reduce((s: number, v: any) => s + v.length, 0);
  console.log("file\tlines\tregistered(occ)\tgameOnly(occ)\tgameOnlyNames\tonlyMethods(occ)\tshared(occ)\tphaser\tenumOcc\tphases\tglobals");
  for (const r of out) {
    const only = Object.entries(r.game).filter(([k]) => k.endsWith(":only"));
    const occ = (l: any[]) => l.reduce((s, [, v]: any) => s + v.length, 0);
    const onlyM = only.filter(([k]) => k.includes(":method:"));
    console.log([r.file, r.lines, n(r.game), occ(only), only.length, occ(onlyM), n(r.game) - occ(only), n(r.phaser), n(r.enums), r.phases.length,
      Object.entries(r.globals).map(([g, l]: any) => `${g}×${l.length}`).join(",")].join("\t"));
  }
}
