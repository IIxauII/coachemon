/** Brings the fights `COACHEMON_CAPTURE=1` recorded under the home into the fight library (#944). */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { FIGHTS, STATISTICS } from "../../src/solver/capture.ts";
import { WIN_SCRIPT } from "../../src/solver/script.ts";

export type Imported = {
  fight: string;
  /** The library held the fight already. */
  merged: boolean;
  added: string[];
  /** Statistics entries appended. */
  statistics: number;
  /** Turns the library holds solved from another position: the library's solve stays, and the new one is only aside. */
  differs: string[];
};

export type Import = { imported: Imported[] };

export const LIBRARY = new URL("../../src/solver/fixtures/library/", import.meta.url);

export const IMPORTED = "fights-imported";

/** Each fight imported moves to `<home>/fights-imported/<at>/`, so a lost import is redone by moving its fights back. */
export function importFights(home: string, library: string, at: Date): Import {
  const fights = path.join(home, FIGHTS);
  const aside = path.join(home, IMPORTED, at.toISOString().replaceAll(":", "-"));
  const imported: Imported[] = [];
  for (const fight of waitingIn(fights)) {
    imported.push({ fight, ...merge(path.join(fights, fight), path.join(library, fight)) });
    mkdirSync(aside, { recursive: true });
    renameSync(path.join(fights, fight), path.join(aside, fight));
  }
  return { imported };
}

export const waiting = (home: string): number => waitingIn(path.join(home, FIGHTS)).length;

const waitingIn = (fights: string): string[] =>
  existsSync(fights)
    ? readdirSync(fights, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort()
    : [];

function merge(from: string, to: string): Omit<Imported, "fight"> {
  const merged = existsSync(to);
  mkdirSync(to, { recursive: true });
  const files = readdirSync(from)
    .filter(f => !f.endsWith(".part"))
    .sort();
  const added: string[] = [];
  const differs: string[] = [];
  const isInput = (f: string) => f.endsWith(".json") && !f.endsWith(WIN_SCRIPT);
  for (const file of files.filter(isInput)) {
    if (!existsSync(path.join(to, file))) place(from, to, file, added);
    else if (!samePosition(path.join(from, file), path.join(to, file))) differs.push(file.slice(0, -".json".length));
  }
  for (const file of files.filter(f => !isInput(f) && f !== STATISTICS)) {
    const turn = file.endsWith(WIN_SCRIPT) ? file.slice(0, -WIN_SCRIPT.length) : null;
    if (!existsSync(path.join(to, file)) && (turn === null || !differs.includes(turn))) place(from, to, file, added);
  }
  const held = new Set(entries(path.join(to, STATISTICS)));
  const fresh = entries(path.join(from, STATISTICS)).filter(l => !held.has(l));
  if (fresh.length > 0) appendFileSync(path.join(to, STATISTICS), fresh.map(l => l + "\n").join(""));
  return { merged, added: added.sort(), statistics: fresh.length, differs };
}

/** Blind to the budget: a re-solve under a bigger one starts from the same position. */
function samePosition(a: string, b: string): boolean {
  const position = (file: string) => {
    const { budget: _budget, ...rest } = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    return JSON.stringify(rest);
  };
  return position(a) === position(b);
}

/** Whole or not at all. */
function place(from: string, to: string, file: string, added: string[]): void {
  const part = path.join(to, `${file}.part`);
  copyFileSync(path.join(from, file), part);
  renameSync(part, path.join(to, file));
  added.push(file);
}

const entries = (file: string): string[] => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(l => l !== "") : []);
