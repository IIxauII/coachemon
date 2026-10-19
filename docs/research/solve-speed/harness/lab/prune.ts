// What filters before simulating could have saved, read off a fight's recorded tree, and whether any winning line
// found needed what they would skip.
// usage: node prune.ts <tree-dir> <method-out.json>...
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Action, Child, Position } from "../../../../../src/solver/search.ts";
import { asked, HANDLE, Tree } from "./tree.ts";

const [dir, ...outs] = process.argv.slice(2);
const tree = new Tree(dir);
const root: Position = JSON.parse(readFileSync(path.join(dir, "root.json"), "utf8"));

type Mon = { species: string; hp: string; onField: boolean; status: string; stages: string; tags: string; pp: string };
type Sig = { field: string[]; ours: Mon[]; foes: Mon[] };
// `sig()` in harness.test.ts.template: six field entries, our mons, "|", the foe's mons.
function parse(sig: string): Sig {
  const parts = sig.split(",");
  const field = parts.slice(0, 6);
  const bar = parts.indexOf("|");
  const mon = (s: string): Mon => {
    const f = s.split(":");
    return { species: f[0], hp: f[3], onField: f[4] === "1", status: f[5], stages: f[9], tags: f[10].split(".").map(t => t.split("/")[0]).join("."), pp: f[12] };
  };
  return { field, ours: parts.slice(6, bar).map(mon), foes: parts.slice(bar + 1).map(mon) };
}
const withoutPp = (sig: string) => {
  const p = parse(sig);
  return JSON.stringify([p.field.slice(1), p.ours.map(m => ({ ...m, pp: "" })), p.foes]);
};
/** The foe's side as our move can touch it: HP, status, stages, tag types of each foe. */
const foeSide = (s: Sig) => JSON.stringify(s.foes.map(m => [m.species, m.hp, m.status, m.onField ? m.stages : "", m.onField ? m.tags : ""]));

const sigOf = new Map<string, string>([[root.forkPoint.slice(HANDLE.length), root.sig]]);
for (const [, children] of tree.entries()) for (const c of children) if (c.end === "on") sigOf.set(c.at.forkPoint.slice(HANDLE.length), c.at.sig);

let tries = 0;
let dupExact = 0;
let dupNoPp = 0;
let moveTries = 0;
let noFoeEffect = 0;
const noEffectKeys = new Set<string>();
for (const [k, children] of tree.entries()) {
  const [parent, input] = [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
  const parentSig = sigOf.get(parent);
  for (const c of children) {
    tries++;
    if (c.end !== "on" || !parentSig) continue;
    if (input.includes('"kind":"move"')) {
      moveTries++;
      if (foeSide(parse(c.at.sig)) === foeSide(parse(parentSig))) {
        noFoeEffect++;
        noEffectKeys.add(k);
      }
    }
  }
}
// Siblings: every input recorded from one parent.
const byParent = new Map<string, Child[]>();
for (const [k, children] of tree.entries()) {
  const parent = k.slice(0, k.indexOf("|"));
  byParent.set(parent, [...(byParent.get(parent) ?? []), ...children]);
}
for (const [, children] of byParent) {
  const exact = new Set<string>();
  const loose = new Set<string>();
  for (const c of children) {
    if (c.end !== "on") continue;
    if (exact.has(c.at.sig)) dupExact++;
    else exact.add(c.at.sig);
    const l = withoutPp(c.at.sig);
    if (loose.has(l)) dupNoPp++;
    else loose.add(l);
  }
}

// Each winning line found: which of its moves did nothing to the foe's side.
const lines = outs.flatMap(o => {
  const r = JSON.parse(readFileSync(o, "utf8")).result;
  return r?.path ? [{ from: path.basename(o), path: r.path as Action[] }] : [];
});
const onLines = lines.map(({ from, path: p }) => {
  let at = root.forkPoint;
  const quiet: string[] = [];
  for (const [i, a] of p.entries()) {
    const k = tree.key(at, a);
    if (noEffectKeys.has(k)) quiet.push(`${i + 1}:${asked(a)}`);
    const next = tree.get(at, a)?.find(c => JSON.stringify(c.input) === JSON.stringify(a));
    if (!next || next.end !== "on") break;
    at = next.at.forkPoint;
  }
  return { from, turns: p.length, movesThatLeftTheFoeUntouched: quiet };
});
console.log(JSON.stringify({ tree: dir, tries, moveTries, noFoeEffect, dupExact, dupNoPp, lines: onLines }, null, 1));
