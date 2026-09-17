/**
 * This plugin copy's version, as `package.json` states it. The hub and every client compare it in the handshake, and
 * the skew decides whether a client retires the hub, refuses every call, or proceeds (§7.3).
 */
import { readFileSync } from "node:fs";

export const PLUGIN_VERSION: string = read();

function read(): string {
  try {
    return (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
