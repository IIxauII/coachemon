/**
 * Given no `env`, the MCP SDK's stdio transport passes a safe subset that drops `COACHEMON_TRANSPORT` and
 * `COACHEMON_DEV`, which pick the transport and the hub port (extension-distribution.md §7.2, §12.1).
 */

/** The SDK's `DEFAULT_INHERITED_ENV_VARS`, both platforms' lists together. */
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
