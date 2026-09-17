/**
 * The hub process (§7.2): `node src/hub/main.ts --port <port>`, spawned detached by the first client that finds nothing
 * on the port. It writes nothing to disk, takes no configuration beyond the port, and exits on its own once nothing
 * needs it: after the idle window, when a newer plugin copy retires it, or at once when another hub already has the
 * port — two clients racing to spawn one is normal, and the loser exits 0 in silence.
 */
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
  // Another hub owns the port: it is the one per machine, and there is nothing to say (§7.2).
  if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") process.exit(0);
  process.stderr.write(`[coachemon-hub] ${(e as Error).message}\n`);
  process.exit(1);
}
