/** The hub and every client compare it in the handshake (extension-distribution.md §7.3). */
import { readFileSync } from "node:fs";

export const PLUGIN_VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
