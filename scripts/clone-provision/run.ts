/**
 * Sets up `.cache/pokerogue/v<version>` (the pin by default) for the harness: the clone, its `assets` and `locales`
 * submodules and the game's own pnpm install (pin-bump.md §The checks).
 */
import { parseArgs } from "node:util";
import reviewed from "../../src/escape-ladder/reviewed.json" with { type: "json" };
import { provision } from "./provision.ts";

const { values: args } = parseArgs({ options: { version: { type: "string" } } });
const dir = provision(args.version ?? reviewed.pinned.gameVersion);
console.log(`clone: ready at ${dir}`);
