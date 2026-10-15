import { describeInput } from "./describe.ts";
import type { BeamEnd, HygieneRule, NoAnswer, Reason } from "./oracle-line.ts";

const BROKE: Record<HygieneRule, string> = {
  max_rolls: "rolled every battle draw at its maximum",
  overrides: "loaded the teams through upstream's test overrides",
  enemy_items: "kept the foe's items from before the reload",
  item_totals: "loaded other item stacks than the save holds",
  stray_prompt: "left a prompt queued for a decision the game never asked",
};

const firstFew = (all: readonly string[]) =>
  all.length > 3 ? `${all.slice(0, 3).join("; ")}; and ${all.length - 3} more` : all.join("; ");

export const noAnswer = (reason: Reason): NoAnswer => ({
  kind: "no_answer",
  reason,
  message: `${cause(reason)} The card still coaches.`,
});

/** Ends in a full stop. */
export function cause(reason: Reason): string {
  switch (reason.code) {
    case "daily":
      return "a Daily's seed is shared by every player, so solving is never offered there.";
    case "version_mismatch": {
      const waitsOn =
        reason.live.localeCompare(reason.clone, undefined, { numeric: true }) > 0
          ? `a Coachemon release pinned to ${reason.live}`
          : `the game serving ${reason.clone}`;
      return `the live game is ${reason.live}, but solving runs on ${reason.clone} only, and waits on ${waitsOn}.`;
    }
    case "not_rechecked":
      return (
        `the oracle's harness hasn't been re-checked on game version ${reason.version}, so no oracle line found on it ` +
        "could be trusted. Solving waits on a Coachemon release that has re-checked it."
      );
    case "mystery_encounter":
      return "the oracle can't replay a Mystery Encounter battle yet.";
    case "double":
      return "the oracle can't replay a double battle yet.";
    case "safeguard":
      return "Safeguard is up, and a reload of the fight would lose it.";
    case "dropped_item":
      return (
        `the oracle's clone would drop ${reason.items.join(", ")} on load, so an oracle line would be found for a ` +
        "different team."
      );
    case "no_live_battle":
      return "no live battle came with the save, so nothing shows the save is this fight's.";
    case "no_live_export":
      return "no live export came with the save, so nothing shows the scene it loads is the one at the decision.";
    case "not_wave_start":
      return (
        "only the wave-start save replays a fight from its first turn, and this is the session export, whose reload " +
        "applies the entry effects twice."
      );
    case "save_mismatch": {
      const seed = reason.save.battleSeed === undefined ? "" : ` with battle seed ${reason.save.battleSeed}`;
      return (
        `the save is for wave ${reason.save.wave}${seed}, but the live battle is wave ${reason.live.wave} with battle ` +
        `seed ${reason.live.battleSeed}, so an oracle line found on it would be another fight's.`
      );
    }
    case "no_clone":
      return `the oracle's clone of game version ${reason.version} isn't set up: ${reason.cause}.`;
    case "clone_version":
      return `the oracle's clone is game version ${reason.clone}, not the ${reason.pinned} it is pinned to.`;
    case "load_hygiene":
      return `the oracle's harness ${BROKE[reason.rule]} (${reason.detail}), so the fight it played was not the game's.`;
    case "illegal_step": {
      if (reason.index === null || reason.tried === null) {
        return `turn ${reason.turn}, which has no input of its own, ${reason.why}.`;
      }
      const offered = reason.legal.length > 0 ? `; the game offers ${reason.legal.map(describeInput).join(", ")}` : "";
      return `input ${reason.index + 1}, ${describeInput(reason.tried)}, ${reason.why} at turn ${reason.turn}${offered}.`;
    }
    case "scene_mismatch":
      return `the scene the oracle loaded isn't the live one at the decision: ${firstFew(reason.differences)}.`;
    case "known_turn_missed":
      return `a turn whose outcome is known didn't reproduce: ${firstFew(reason.misses)}.`;
    case "harness_failed":
      return `the oracle's harness failed: ${reason.why}${/[.!?]$/.test(reason.why) ? "" : "."}`;
    case "no_win": {
      const n = reason.unreplayed.length;
      const unreplayed =
        n === 0 ? "" : ` ${n} win${n === 1 ? "" : "s"} it found didn't replay, the last because ${reason.unreplayed.at(-1)}`;
      const dropped =
        reason.dropped === 0 ? "" : ` ${reason.dropped} turn${reason.dropped === 1 ? "" : "s"} the harness couldn't play were dropped.`;
      return `no winning path turned up: ${reason.beams.map(beamEnd).join("; ")}.${unreplayed}${dropped}`;
    }
  }
}

function beamEnd({ width, ours, ended, turn, expansions }: BeamEnd): string {
  const beam = `width ${width} at our-HP weight ${ours}`;
  switch (ended) {
    case "emptied":
      return `${beam} lost every path by turn ${turn}`;
    case "stalled":
      return `${beam} stalled by turn ${turn}, its foes no longer losing HP`;
    case "turns":
      return `${beam} reached turn ${turn}, the limit`;
    case "budget":
      return `${beam} ran out of its budget, ${expansions.toLocaleString("en")} turns played, by turn ${turn}`;
  }
}
