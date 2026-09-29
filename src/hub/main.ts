/** The hub process (extension-distribution.md §7.2). */
import { startHub } from "./hub.ts";
import { PLUGIN_VERSION } from "../plugin-version.ts";
import { STORE_PORT } from "../protocol/version.ts";

const args = process.argv.slice(2);
const flag = args.indexOf("--port");
const port = flag >= 0 ? Number(args[flag + 1]) : STORE_PORT;
if (!Number.isInteger(port) || port <= 0) {
  process.stderr.write(`[coachemon-hub] bad --port ${JSON.stringify(args[flag + 1])}\n`);
  process.exit(1);
}

try {
  const hub = await startHub({ port, version: PLUGIN_VERSION, onIdle: () => process.exit(0), onRetire: () => process.exit(0) });
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(sig, () => {
      hub.close();
      process.exit(0);
    });
  }
} catch (e) {
  // A lost race to spawn: another hub has the port (extension-distribution.md §7.2).
  if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") process.exit(0);
  process.stderr.write(`[coachemon-hub] ${(e as Error).message}\n`);
  process.exit(1);
}
