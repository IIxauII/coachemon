/** The coach's feed, run under Claude's `Monitor` (extension-distribution.md §11.2). */
import { hubPort } from "../../../src/hub/link.ts";
import { runWatch } from "../../../src/hub/watch.ts";
import { PLUGIN_VERSION } from "../../../src/plugin-version.ts";

const stop = new AbortController();
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(sig, () => stop.abort());

await runWatch({ port: hubPort(), version: PLUGIN_VERSION, signal: stop.signal });
