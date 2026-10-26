import { z } from "zod";
import { ArenaTagSide, GameModes, SpeciesId } from "../enums/generated.ts";
import type { Battle, MidFightExtras, SessionSave, SolveInput } from "./input.ts";

const mon = z.object({
  id: z.int(),
  toxicTurnCount: z.int().nullable(),
  tempSummonData: z.record(z.string(), z.number()),
  waveData: z.object({ endured: z.boolean(), abilityRevealed: z.boolean(), abilitiesApplied: z.array(z.int()) }),
});
const foe = mon.extend({
  initialTeamIndex: z.int(),
  bossSegmentIndex: z.int().nullable(),
  onField: z.boolean(),
  summonData: z.record(z.string(), z.unknown()).nullable(),
});
const faints = z.array(z.object({ id: z.int(), turn: z.int() }));

/** Null only where the game's own value can be. */
const extras = z.object({
  wave: z.int(),
  battleSeed: z.string(),
  turn: z.int(),
  double: z.boolean().optional(),
  rndState: z.string(),
  battleSeedState: z.string().nullable(),
  enemySwitchCounter: z.int(),
  lastMove: z.int(),
  enemyFaints: z.int(),
  playerFaintsHistory: faints,
  enemyFaintsHistory: faints,
  arenaTags: z.array(z.object({ tagType: z.string(), side: z.enum(ArenaTagSide) })),
  foes: z.array(foe),
  party: z.array(mon),
  unread: z.array(z.string()),
}) satisfies z.ZodType<MidFightExtras>;

/** A `MidFightExtras` with every extra read. */
export type CheckedExtras = z.infer<typeof extras>;

export type MidFightRead = { kind: "read"; read: CheckedExtras; live: Battle; forkPoint: string };

export type MidFightReadOrMissing =
  | MidFightRead
  /** By each one's path in the read, as its `unread` names them. */
  | { kind: "missing"; extras: readonly string[] };

/** For a caller past the gate. */
export function augmentedExport({ save, extras }: Pick<SolveInput, "save" | "extras">): MidFightRead | undefined {
  if (!extras) return undefined;
  const read = readExtras(save, extras);
  if (read.kind === "missing") throw new Error(`the gate let through an augmented export lacking ${read.extras.join(", ")}`);
  return read;
}

type SavedMon = {
  id: number;
  status?: { toxicTurnCount: number; sleepTurnsRemaining: number } | null;
  summonData?: unknown;
};

/** The augmented export as the fork point `harness.test.ts.template` restores, or each extra it lacks. */
export function readExtras(save: SessionSave, given: MidFightExtras): MidFightReadOrMissing {
  const parsed = extras.safeParse(given);
  const missing = new Set(parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join(".")));
  const raw = given as Partial<Record<keyof CheckedExtras, unknown>>;
  for (const path of Array.isArray(raw.unread) ? raw.unread : []) missing.add(String(path));
  if (raw.double === undefined && secondStage(save)) missing.add("double");
  for (const [side, saved] of [
    ["foes", save.enemyParty],
    ["party", save.party],
  ] as const) {
    const read = raw[side];
    if (!Array.isArray(read)) continue;
    // An entry with no id could stand for any saved mon, so while one has none no slot is named, only that id.
    if (read.every(entry => Number.isInteger(entry?.id))) {
      (saved as SavedMon[]).forEach(({ id }, slot) => {
        if (!read.some(entry => entry.id === id)) missing.add(`${side}.${slot}`);
      });
    }
    // A foe off the field has none (`src/page/extras.ts`).
    if (side === "foes") {
      read.forEach((entry, i) => {
        if (entry?.onField === true && entry.summonData == null) missing.add(`foes.${i}.summonData`);
      });
    }
  }
  if (!parsed.success || missing.size > 0) {
    return { kind: "missing", extras: [...missing].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) };
  }
  const read = parsed.data;
  return { kind: "read", read, live: { wave: read.wave, battleSeed: read.battleSeed }, forkPoint: forkPoint(save, read) };
}

/**
 * The classic final boss past its first form: the one double a solve reaches, which a reloaded tab plays single, so only
 * the live read tells which (#788, game-code.md §34).
 */
const secondStage = (save: SessionSave) =>
  save.gameMode === GameModes.CLASSIC &&
  (save.enemyParty as { species?: number; formIndex?: number }[]).some(m => m.species === SpeciesId.ETERNATUS && (m.formIndex ?? 0) > 0);

// A Challenge run's final boss is the classic one (game-code.md §34).
// @mirrors classic-final-boss
const classicFinalWave = (save: SessionSave) =>
  (save.gameMode === GameModes.CLASSIC || save.gameMode === GameModes.CHALLENGE) && save.waveIndex === 200;

type FinalBoss = { id: number; formIndex?: number; hp: number; stats: number[] };

/**
 * The save with the classic final boss's first form on the live export's stats and HP, which `harness.test.ts.template`
 * puts back after each load (#917, game-code.md §34).
 */
export function withLiveFinalBoss(save: SessionSave, liveExport: SessionSave | undefined): SessionSave {
  if (liveExport === undefined || !classicFinalWave(save)) return save;
  const firstForm = (m: FinalBoss) => (m.formIndex ?? 0) === 0;
  const live = new Map((liveExport.enemyParty as FinalBoss[]).filter(firstForm).map(m => [m.id, m]));
  const enemyParty = (save.enemyParty as FinalBoss[]).map(m => {
    const fought = firstForm(m) && live.get(m.id);
    return fought ? { ...m, hp: fought.hp, stats: [...fought.stats] } : m;
  });
  return { ...save, enemyParty };
}

/** In the shape `forkPoint()` in `harness.test.ts.template` writes. */
function forkPoint(save: SessionSave, read: CheckedExtras): string {
  const ours = save.party as SavedMon[];
  const all = [...ours, ...(save.enemyParty as SavedMon[])];
  const toxic = new Map([...read.party, ...read.foes].map(m => [m.id, m.toxicTurnCount]));
  const byId = <M extends { id: number }, T>(mons: readonly M[], value: (m: M) => T) =>
    Object.fromEntries(mons.map(m => [m.id, value(m)]));
  return JSON.stringify({
    session: JSON.stringify(save),
    ...(read.double !== undefined && { double: read.double }),
    turn: read.turn,
    rng: read.rndState,
    battleSeedState: read.battleSeedState,
    switchCounter: read.enemySwitchCounter,
    lastMove: read.lastMove,
    enemyFaints: read.enemyFaints,
    faints: { ours: read.playerFaintsHistory, foes: read.enemyFaintsHistory },
    teamIndex: byId(read.foes, f => f.initialTeamIndex),
    bossIndex: byId(read.foes, f => f.bossSegmentIndex),
    temp: byId([...read.party, ...read.foes], m => m.tempSummonData),
    wave: byId([...read.party, ...read.foes], m => m.waveData),
    // Ours from the save, which a reload keeps; the foe's from the read, as a reload resets it (game-code.md §30).
    summon: { ...byId(ours, m => m.summonData), ...byId(read.foes.filter(f => f.onField), f => f.summonData) },
    status: byId(
      all.filter(m => m.status),
      m => ({ toxic: toxic.get(m.id) ?? m.status?.toxicTurnCount, sleep: m.status?.sleepTurnsRemaining }),
    ),
  });
}
