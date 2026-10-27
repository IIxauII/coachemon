/**
 * The coach's Mystery Encounter card judged against the real game: upstream's vitest harness plays each encounter
 * headless in the pinned clone, and the claims the card reads off that live scene are compared with what the game did
 * (game-code.md §13).
 */
import { runOracle } from "../clone-test/oracle.ts";

await runOracle({
  name: "oracle",
  template: new URL("oracle.test.ts.template", import.meta.url),
  subject: "the card",
});
