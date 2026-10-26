/** Brings the fights `COACHEMON_CAPTURE=1` recorded under the home into the fight library (#944). */
import { fightsWaiting, mergeWaitingFights, type SolveStart } from "../../src/solver/fight-library.ts";
import { messageOf, type Outcome, type Replay, replayOracleLine } from "../library-replay/library-replay.ts";

export type Imported = {
  fight: string;
  /** The library held the fight already. */
  merged: boolean;
  added: string[];
  /** Statistics entries appended. */
  statistics: number;
  /** Turns the library holds solved from another position: the library's solve stays, and the new one is only aside. */
  differs: string[];
  /** Each waiting solve start left out of the library, and aside with its fight, for not reading, with why. */
  unread: string[];
  /** Each oracle line this import added that didn't replay to its win, by the turn its solve started from. */
  failed: { turn: number; outcome: Exclude<Outcome, { kind: "still_wins" }> }[];
  /** Every Pokémon nickname in the files this import added, the foes' included, as the game shows it. */
  nicknames: string[];
};

/** Replays each oracle line an import adds, once, on `version`. */
export type AtThePin = { version: string; replay: Replay };

/** `asideUnder` holds this import's own `<at>/` folder of the fights it moved aside. */
export type Import = { imported: Imported[]; asideUnder: string };

export async function importFights(home: string, library: string, at: Date, pin: AtThePin): Promise<Import> {
  const { asideUnder, fights } = mergeWaitingFights(home, library, at);
  const imported: Imported[] = [];
  for (const { fight, merged, added, statistics, differs, unread, placed } of fights) {
    const found = new Set<string>();
    for (const p of placed) {
      if (p.input) nicknamesIn(p.start.input, found);
      if (p.oracleLine) nicknamesIn(p.start.oracleLine, found);
    }
    imported.push({
      fight: fight.folder,
      merged,
      added,
      statistics,
      differs,
      unread,
      failed: await replayAdded(placed.flatMap(p => (p.oracleLine ? [p.start] : [])), pin),
      nicknames: [...found].sort(),
    });
  }
  return { imported, asideUnder };
}

/** A replay that throws fails its line, never the import. */
async function replayAdded(starts: readonly SolveStart[], { version, replay }: AtThePin): Promise<Imported["failed"]> {
  const failed: Imported["failed"] = [];
  for (const start of starts) {
    const outcome = await replayOracleLine(start, version, replay).catch(
      (e: unknown): Outcome => ({ kind: "doesnt_load", why: `the replay threw: ${messageOf(e)}` }),
    );
    if (outcome.kind !== "still_wins") failed.push({ turn: start.turn, outcome });
  }
  return failed;
}

export const waiting = fightsWaiting;

function nicknamesIn(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) for (const inner of value) nicknamesIn(inner, found);
  else if (value !== null && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (key === "nickname" && typeof inner === "string" && inner !== "") found.add(decodeNickname(inner));
      else nicknamesIn(inner, found);
    }
  }
}

/** As the game's own `decodeNickname` reads it, except that one it can't decode is listed as the fight keeps it. */
function decodeNickname(kept: string): string {
  const bytes = Buffer.from(kept, "base64");
  if (bytes.toString("base64") !== kept) return kept;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return kept;
  }
}
