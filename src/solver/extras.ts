import { z } from "zod";
import type { Battle, MidFightExtras, SessionSave } from "./input.ts";

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
  rndState: z.string(),
  battleSeedState: z.string().nullable(),
  enemySwitchCounter: z.int(),
  lastMove: z.int(),
  enemyFaints: z.int(),
  playerFaintsHistory: faints,
  enemyFaintsHistory: faints,
  arenaTags: z.array(z.object({ tagType: z.string(), side: z.int() })),
  foes: z.array(foe),
  party: z.array(mon),
  unread: z.array(z.string()),
});

export type Extras = z.infer<typeof extras>;

export type ExtrasRead =
  | { kind: "read"; read: Extras; live: Battle; forkPoint: string }
  /** By each one's path in the read, as its `unread` names them. */
  | { kind: "missing"; extras: readonly string[] };

type SavedMon = {
  id: number;
  status?: { toxicTurnCount: number; sleepTurnsRemaining: number } | null;
  summonData?: unknown;
};

/** The augmented export as the fork point `harness.test.ts.template` restores, or each extra it lacks. */
export function readExtras(save: SessionSave, given: MidFightExtras): ExtrasRead {
  const parsed = extras.safeParse(given);
  const missing = new Set(parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join(".")));
  const raw = given as Partial<Record<keyof Extras, unknown>>;
  for (const path of Array.isArray(raw.unread) ? raw.unread : []) missing.add(String(path));
  for (const [side, saved] of [
    ["foes", save.enemyParty],
    ["party", save.party],
  ] as const) {
    const read = raw[side];
    if (!Array.isArray(read)) continue;
    (saved as SavedMon[]).forEach(({ id }, slot) => {
      if (!read.some(entry => entry?.id === id)) missing.add(`${side}.${slot}`);
    });
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

/** In the shape `forkPoint()` in `harness.test.ts.template` writes. */
function forkPoint(save: SessionSave, read: Extras): string {
  const ours = save.party as SavedMon[];
  const all = [...ours, ...(save.enemyParty as SavedMon[])];
  const toxic = new Map([...read.party, ...read.foes].map(m => [m.id, m.toxicTurnCount]));
  const byId = <M extends { id: number }, T>(mons: readonly M[], value: (m: M) => T) =>
    Object.fromEntries(mons.map(m => [m.id, value(m)]));
  return JSON.stringify({
    session: JSON.stringify(save),
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
