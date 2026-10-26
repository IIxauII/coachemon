import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PINNED_GAME_VERSION } from "../../src/escape-ladder/lookup.ts";
import { replay } from "../../src/solver/solver.ts";
import { findPinnedClone, harnessIn } from "../clone-test/clone-test.ts";
import { LIBRARY, replayLibrary } from "./library-replay.ts";

const USAGE = "usage: npm run library:replay -- [--fight <name>]... [--wave <n>]... [<folder of fight folders>]";

const { values, positionals } = parseArgs({
  options: { fight: { type: "string", multiple: true }, wave: { type: "string", multiple: true } },
  allowPositionals: true,
});
const [folder = fileURLToPath(LIBRARY), ...more] = positionals;
const waves = (values.wave ?? []).map(Number);
if (more.length > 0 || waves.some(w => !Number.isInteger(w))) {
  console.error(USAGE);
  process.exit(2);
}
if (!existsSync(folder)) {
  console.error(`library replay: no folder at ${folder}\n${USAGE}`);
  process.exit(2);
}
const found = findPinnedClone();
if ("missing" in found) {
  console.error(`library replay: ${found.missing} Set it up with \`${found.how}\``);
  process.exit(2);
}

const inClone = harnessIn(findPinnedClone);
await replayLibrary(folder, PINNED_GAME_VERSION, (given, script, carry) => replay(given, script, inClone, carry), console.log, {
  fights: values.fight,
  waves,
});
