/**
 * The hub's entry point (§7.1): `node src/hub/main.ts --port <port>`, spawned detached by whichever client found the
 * port refused. It takes no configuration beyond the port, writes nothing to disk, and exits on its own once it has
 * been idle for ten minutes.
 *
 * Two clients spawning at once is harmless: the loser gets `EADDRINUSE` and exits 0 silently (§7.2).
 */
import { STORE_PORT } from "../protocol/version.ts";
import { Hub } from "./hub.ts";
import { PLUGIN_VERSION } from "./plugin-version.ts";

const flag = process.argv.indexOf("--port");
const port = flag === -1 ? STORE_PORT : Number(process.argv[flag + 1]);
if (!Number.isInteger(port) || port <= 0) {
  process.stderr.write("usage: node src/hub/main.ts --port <port>\n");
  process.exit(2);
}

try {
  await Hub.listen({ port, version: PLUGIN_VERSION });
} catch (e) {
  // The other hub won the port and is the one hub this machine needs. Nothing to say, nothing failed.
  if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") process.exit(0);
  process.stderr.write(`${(e as Error).message}\n`);
  process.exit(1);
}
