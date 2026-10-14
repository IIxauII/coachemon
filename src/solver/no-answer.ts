import type { NoAnswer, Reason } from "./line.ts";

export const noAnswer = (reason: Reason): NoAnswer => ({ kind: "no_answer", reason, message: explain(reason) });

function explain(reason: Reason): string {
  switch (reason.code) {
    case "daily":
      return "a Daily's seed is shared by every player, so solving is never offered there. The card still coaches.";
    case "version_mismatch": {
      const waitsOn =
        reason.live.localeCompare(reason.clone, undefined, { numeric: true }) > 0
          ? `a Coachemon release pinned to ${reason.live}`
          : `the game serving ${reason.clone}`;
      return (
        `the live game is ${reason.live}, but solving runs on ${reason.clone} only, and waits on ${waitsOn}. ` +
        "The card still coaches."
      );
    }
    case "not_rechecked":
      return (
        `the oracle's harness hasn't been re-checked on game version ${reason.version}, so no line found on it could ` +
        "be trusted. Solving waits on a Coachemon release that has re-checked it. The card still coaches."
      );
    case "mystery_encounter":
      return "the oracle can't replay a Mystery Encounter battle yet. The card still coaches.";
    case "double":
      return "the oracle can't replay a double battle yet. The card still coaches.";
    case "safeguard":
      return "Safeguard is up, and a reload of the fight would lose it. The card still coaches.";
    case "dropped_item":
      return (
        `the oracle's clone would drop ${reason.items.join(", ")} on load, so a line would be found for a different ` +
        "team. The card still coaches."
      );
    case "not_built":
      return "solving not built yet";
  }
}
