/**
 * This plugin copy's own version, read from its `package.json`. The hub and every client compare it in the handshake,
 * which is what catches two Claude sessions running different plugin copies against one hub (§7.3).
 */
import { readFileSync } from "node:fs";

export const PLUGIN_VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
