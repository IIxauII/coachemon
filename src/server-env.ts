/**
 * The environment a script's spawned MCP server gets.
 *
 * The MCP SDK's stdio transport passes a safe subset of ours when none is given, and that subset does not include
 * `COACHEMON_TRANSPORT` or `COACHEMON_DEV` — the two that decide which transport the server uses and which hub port it
 * dials (§7.2, §12.1). Without them a checkout could never drive a paired dev build of the extension.
 */

/** What the SDK would have inherited anyway: a server needs a `PATH` and a `HOME` like any other process. */
const PASSED = new Set(["HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER", "APPDATA", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "PROCESSOR_ARCHITECTURE", "PROGRAMFILES", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERNAME", "USERPROFILE"]);

export function serverEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    // A shell function exported into the environment is a hazard the SDK skips too.
    if (value === undefined || value.startsWith("()")) continue;
    if (key.startsWith("COACHEMON_") || PASSED.has(key)) out[key] = value;
  }
  return out;
}
