import type { NoAnswer, Reason } from "./line.ts";

export const noAnswer = (reason: Reason): NoAnswer => ({
  kind: "no_answer",
  reason,
  message: reason.code === "not_built" ? cause(reason) : `${cause(reason)} The card still coaches.`,
});

function cause(reason: Reason): string {
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
    case "not_built":
      return "solving not built yet";
  }
}
