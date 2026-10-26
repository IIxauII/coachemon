/**
 * The fight library's one owner: its fight folders, each solve start kept as an input and the oracle line that same solve
 * found, and its statistics entries (#936, #937, #938, #969). Only the merge throws on what it finds on disk; every
 * other entry point answers a fault with a `{ why }` or by leaving it out.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NAMES, TrainerVariant } from "../enums/generated.ts";
import { readScript, type Script, WIN_SCRIPT } from "./script.ts";
import type { SessionSave, SolveInput, SolveReport } from "./solver.ts";
import { entryOf, RECORDER, readEntry, type Recorder, type SolveEnd, type StatisticsEntry } from "./statistics-entry.ts";

export { endOf, type Recorder, type SolveEnd, type StatisticsEntry } from "./statistics-entry.ts";

/** A home holds its waiting fights and the ones each import moved aside; a library is any folder of fight folders. */
export type Where = { home: string } | { library: string };

/** `wave` is null, and `name` the folder's, for a folder not named as the recorder names a fight. */
export type Fight = { folder: string; name: string; wave: number | null };

/** A fight is selected when it is any of `fights`, by its folder or its fight's name, whole, and on any of `waves`; unset keeps all. */
export type Filter = { fights?: readonly string[]; waves?: readonly number[] };

export type Why = { why: string };

/** What a solve started from, as the recorder keeps it. */
export type KeptInput = Pick<SolveInput, "live" | "save" | "extras" | "liveExport" | "cloneVersion" | "budget">;

/** `oracleLine` is null where no oracle line file sits beside the input. */
export type SolveStart = {
  fight: Fight;
  turn: number;
  input: KeptInput | Why;
  oracleLine: Script | null | Why;
  /** Contract: for messages only; every read goes through this module. */
  files: { input: string; oracleLine: string };
};

/** `ended` is null for an answer no entry is made from. */
export type Finish = { ended: SolveEnd | null; report: SolveReport | null; oracleLine?: Script };

/** Contract: the first `finish` wins, and a later one does nothing. */
export type Recording = { fight: Fight; turn: number; finish(end: Finish): void };

const FIGHTS = "fights";

const IMPORTED = "fights-imported";

const STATISTICS = "statistics.jsonl";

const inputFile = (turn: number) => `turn-${turn}.json`;

const lineFile = (turn: number) => `turn-${turn}${WIN_SCRIPT}`;

/**
 * Starts recording a solve from `input`: null, and nothing written, for an augmented export with no turn. Its input
 * replaces that turn's pair; where the old oracle line can't be removed, the old pair stays and only the entry is kept.
 */
export function recordSolveStart(where: Where, input: SolveInput, recorder: Recorder = RECORDER): Recording | null {
  const turn = turnOf(input);
  if (turn === null) return null;
  const fight = fightOf(fightKey(input.save));
  const folder = path.join(rootOf(where), fight.folder);
  const { live, save, extras, liveExport, cloneVersion, budget } = input;
  const landed = dropped(path.join(folder, lineFile(turn))) && kept(path.join(folder, inputFile(turn)), { live, save, extras, liveExport, cloneVersion, budget });
  let finished = false;
  return {
    fight,
    turn,
    finish({ ended, report, oracleLine }) {
      if (finished) return;
      finished = true;
      if (ended !== null) {
        try {
          mkdirSync(folder, { recursive: true });
          // One write of one line, so two processes appending to one fight interleave whole entries.
          appendFileSync(path.join(folder, STATISTICS), JSON.stringify(entryOf(input, turn, ended, report, recorder)) + "\n");
        } catch {}
      }
      if (landed && oracleLine !== undefined) kept(path.join(folder, lineFile(turn)), oracleLine);
    },
  };
}

const rootOf = (where: Where) => ("home" in where ? path.join(where.home, FIGHTS) : where.library);

/** Every solve start under `where` that `filter` selects, by fight folder name, then by turn. */
export function solveStartsIn(where: Where, filter: Filter = {}): SolveStart[] {
  return fightsIn(where)
    .filter(({ fight }) => selected(fight, filter))
    .flatMap(({ fight, folder }) => turnsIn(folder).map(turn => startAt(fight, folder, turn)));
}

/** A fight folder is its first turn's solve start, and either file of a solve start is that turn's. */
export function solveStartAt(file: string): SolveStart | Why {
  if (isDirectory(file)) return startAt(fightOf(path.basename(file)), file, 1);
  const turn = STEM.exec(path.basename(file))?.[1];
  if (turn === undefined) return { why: `${file} is no fight folder and no solve start's file` };
  const folder = path.dirname(file);
  return startAt(fightOf(path.basename(folder)), folder, Number(turn));
}

function isDirectory(file: string): boolean {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

/** The fight folders waiting in `home` for an import. */
export const fightsWaiting = (home: string): number => directories(path.join(home, FIGHTS)).length;

type Found = { fight: Fight; folder: string };

/** A home's waiting fights, then each import's in name order; a folder that doesn't exist holds none. */
function fightsIn(where: Where): Found[] {
  if ("library" in where) return fightFolders(where.library);
  const imported = path.join(where.home, IMPORTED);
  return [path.join(where.home, FIGHTS), ...directories(imported).map(when => path.join(imported, when))].flatMap(fightFolders);
}

const fightFolders = (dir: string): Found[] => directories(dir).map(folder => ({ fight: fightOf(folder), folder: path.join(dir, folder) }));

function directories(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

function selected(fight: Fight, { fights, waves }: Filter): boolean {
  if (fights?.length && !fights.some(f => f === fight.folder || f === fight.name)) return false;
  return !waves?.length || (fight.wave !== null && waves.includes(fight.wave));
}

const STEM = /^turn-([1-9]\d*)(?:\.json|\.win\.script\.json)$/;

/** Each turn either of whose files is there, in number order; a part file is no file. */
function turnsIn(folder: string): number[] {
  let files: string[];
  try {
    files = readdirSync(folder);
  } catch {
    return [];
  }
  const turns = new Set(
    files.flatMap(file => {
      const turn = STEM.exec(file)?.[1];
      return turn === undefined ? [] : [Number(turn)];
    }),
  );
  return [...turns].sort((a, b) => a - b);
}

function startAt(fight: Fight, folder: string, turn: number): SolveStart {
  const files = { input: path.join(folder, inputFile(turn)), oracleLine: path.join(folder, lineFile(turn)) };
  return { fight, turn, input: readInput(files.input), oracleLine: readLine(files.oracleLine), files };
}

function readInput(file: string): KeptInput | Why {
  try {
    const kept = JSON.parse(readFileSync(file, "utf8")) as KeptInput;
    return typeof kept?.save?.gameVersion === "string" ? kept : { why: `${path.basename(file)} holds no save` };
  } catch (e) {
    return { why: `${path.basename(file)} doesn't read: ${messageOf(e)}` };
  }
}

function readLine(file: string): Script | null | Why {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    return { why: `${path.basename(file)} doesn't read as a script: ${messageOf(e)}` };
  }
  try {
    return readScript(text);
  } catch (e) {
    return { why: `${path.basename(file)} doesn't read as a script: ${messageOf(e)}` };
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A benchmark run's entry for `start`, marked with its setting set; where it can't be appended, why. */
export function appendStatisticsEntry(
  start: SolveStart,
  { input, ended, report, set }: { input: SolveInput; ended: SolveEnd; report: SolveReport | null; set: string },
  recorder: Recorder = RECORDER,
): Why | null {
  try {
    const entry = entryOf(input, start.turn, ended, report, recorder, set);
    appendFileSync(path.join(path.dirname(start.files.input), STATISTICS), JSON.stringify(entry) + "\n");
    return null;
  } catch (e) {
    return { why: messageOf(e) };
  }
}

export type FightMerge = {
  /** The library's, as merged into. */
  fight: Fight;
  /** The library held the fight already. */
  merged: boolean;
  /** File names, in turn order. */
  added: string[];
  /** Turns the library holds solved from another position (`turn-<n>`): its pair stays, and the waiting one is only aside. */
  differs: string[];
  /** Statistics entries appended. */
  statistics: number;
  /** Each waiting solve start left out for not reading, as `turn-<n>: <why>`. */
  unread: string[];
  /** Each solve start that gained its input or its oracle line, read back from the library. */
  placed: { start: SolveStart; input: boolean; oracleLine: boolean }[];
};

/**
 * Merges each fight waiting in `home` into `library`, then moves it to `<asideUnder>/<at>/`, so a lost import is redone
 * by moving its fights back. Contract: a fight moves only once its whole merge is done.
 */
export function mergeWaitingFights(home: string, library: string, at: Date): { asideUnder: string; fights: FightMerge[] } {
  const asideUnder = path.join(home, IMPORTED);
  const aside = path.join(asideUnder, at.toISOString().replaceAll(":", "-"));
  const fights: FightMerge[] = [];
  for (const { fight, folder } of fightFolders(path.join(home, FIGHTS))) {
    fights.push(merged(fight, folder, path.join(library, fight.folder)));
    mkdirSync(aside, { recursive: true });
    renameSync(folder, path.join(aside, fight.folder));
  }
  return { asideUnder, fights };
}

function merged(fight: Fight, from: string, to: string): FightMerge {
  const out: FightMerge = { fight, merged: existsSync(to), added: [], differs: [], statistics: 0, unread: [], placed: [] };
  mkdirSync(to, { recursive: true });
  for (const turn of turnsIn(from)) {
    const waiting = startAt(fight, from, turn);
    const why = whyOf(waiting.input) ?? whyOf(waiting.oracleLine);
    if (why !== null) {
      out.unread.push(`turn-${turn}: ${why}`);
      continue;
    }
    const held = startAt(fight, to, turn);
    const input = !existsSync(held.files.input) && placed(waiting.files.input, held.files.input, out.added);
    if (!input && !samePosition(waiting.input as KeptInput, held.input)) {
      out.differs.push(`turn-${turn}`);
      continue;
    }
    const oracleLine = waiting.oracleLine !== null && !existsSync(held.files.oracleLine) && placed(waiting.files.oracleLine, held.files.oracleLine, out.added);
    if (input || oracleLine) out.placed.push({ start: startAt(fight, to, turn), input, oracleLine });
  }
  const held = new Set(linesIn(path.join(to, STATISTICS)));
  const fresh = linesIn(path.join(from, STATISTICS)).filter(line => !held.has(line));
  if (fresh.length > 0) appendFileSync(path.join(to, STATISTICS), fresh.map(line => line + "\n").join(""));
  out.statistics = fresh.length;
  return out;
}

const whyOf = (read: object | null): string | null => (read !== null && "why" in read ? (read as Why).why : null);

/** Blind to the budget: a re-solve under a bigger one starts from the same position. */
function samePosition(waiting: KeptInput, held: KeptInput | Why): boolean {
  if ("why" in held) return false;
  const position = ({ budget: _budget, ...rest }: KeptInput) => JSON.stringify(rest);
  return position(waiting) === position(held);
}

/** Whole or not at all. */
function placed(from: string, to: string, added: string[]): true {
  const part = `${to}.part`;
  copyFileSync(from, part);
  renameSync(part, to);
  added.push(path.basename(to));
  return true;
}

function linesIn(file: string): string[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(line => line !== "");
}

/** Every statistics entry under `where`, with its fight; `unread` names each line that isn't one `<path> line <n>`, and why. */
export function statisticsEntriesIn(where: Where): { entries: { fight: Fight; statistics: StatisticsEntry }[]; unread: string[] } {
  const root = "home" in where ? where.home : where.library;
  const entries: { fight: Fight; statistics: StatisticsEntry }[] = [];
  const unread: string[] = [];
  for (const { fight, folder } of fightsIn(where)) {
    const file = path.join(folder, STATISTICS);
    const named = path.relative(root, file);
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") unread.push(`${named}: doesn't read: ${messageOf(e)}`);
      continue;
    }
    text.split("\n").forEach((line, i) => {
      if (line.trim() === "") return;
      const statistics = readEntry(line);
      if ("why" in statistics) unread.push(`${named} line ${i + 1}: ${statistics.why}`);
      else entries.push({ fight, statistics });
    });
  }
  return { entries, unread };
}

function turnOf(input: SolveInput): number | null {
  if (input.extras === undefined) return 1;
  return Number.isInteger(input.extras.turn) ? input.extras.turn : null;
}

/** The recorder's `<seed>-w<wave>-<fight>`. */
const FOLDER = /^.+-w(\d+)-([a-z0-9-]+)$/;

function fightOf(folder: string): Fight {
  const [, wave, name] = FOLDER.exec(folder) ?? [];
  return wave === undefined ? { folder, name: folder, wave: null } : { folder, name, wave: Number(wave) };
}

const fightKey = (save: SessionSave): string => `${save.seed.replace(/[^A-Za-z0-9]+/g, "-")}-w${save.waveIndex}-${fightName(save)}`;

/** The trainer, plural for a double, or the lead foe of a wild fight: `gordie`, `swimmers`, `eternatus`. */
export function fightName(save: SessionSave): string {
  const trainer = save.trainer;
  if (trainer) {
    const name = dashed(NAMES.TrainerType[trainer.trainerType] ?? `trainer-${trainer.trainerType}`);
    return trainer.variant === TrainerVariant.DOUBLE ? `${name}s` : name;
  }
  const lead = (save.enemyParty[0] as { species?: number } | undefined)?.species;
  return lead === undefined ? "wild" : dashed(NAMES.SpeciesId[lead] ?? `species-${lead}`);
}

const dashed = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Whole or not at all: false, and no part file left, where it can't be written. */
function kept(file: string, value: unknown): boolean {
  const part = `${file}.part`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(part, JSON.stringify(value) + "\n");
    renameSync(part, file);
    return true;
  } catch {
    dropped(part);
    return false;
  }
}

/** Gotcha: no `recursive`, so a directory planted at `file` is a removal that failed. */
function dropped(file: string): boolean {
  try {
    rmSync(file, { force: true });
    return true;
  } catch {
    return false;
  }
}
