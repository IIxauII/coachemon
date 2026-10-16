import { readFileSync } from "node:fs";
import { PINNED_GAME_VERSION } from "./lookup.ts";

/**
 * A recorded fixture as if recorded at the pin: each `key` field, the game version it was recorded on, reads as the pin,
 * the one version the gate, solving and the ladder accept.
 */
export const readAtPin = (file: URL | string, key: "gameVersion" | "liveVersion"): any =>
  JSON.parse(readFileSync(file, "utf8"), (k, value) => (k === key ? PINNED_GAME_VERSION : value));
