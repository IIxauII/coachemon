/**
 * The combatant adapter (`09-combatant.js`) judged against the real game: upstream's vitest harness sets each case up
 * headless in the pinned clone, and the duel a combatant built off a live member is scored in is compared with what the
 * game does.
 */
import { runOracle } from "../clone-test/oracle.ts";

await runOracle({
  name: "combatant",
  template: new URL("combatant.test.ts.template", import.meta.url),
  subject: "the combatant adapter",
});
