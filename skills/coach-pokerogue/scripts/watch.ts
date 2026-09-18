/**
 * The coach's feed (§11.2): `node <skill dir>/scripts/watch.ts`, run under Claude's `Monitor`. One short line per card
 * the HUD shows — a new battle, a learn prompt, a reward screen, a biome choice, a Mystery Encounter — plus the HUD's
 * own failures and the tab-count notices. Lines are summaries, because notifications truncate; `read_card` has the rest.
 *
 * Read-only and hands-off: it is a hub client with `role: "watch"`, so it never claims the driver grant, presses
 * nothing and injects nothing. The player drives; the coach reads.
 *
 * Everything but the port and the version lives in `src/hub/watch.ts`, which is where the tests drive it. Until the
 * flip this file ships beside `watch.mjs`, which still polls over CDP for the pre-extension route (§13.1).
 */
import { hubPort } from "../../../src/hub/link.ts";
import { runWatch } from "../../../src/hub/watch.ts";
import { PLUGIN_VERSION } from "../../../src/plugin-version.ts";

const stop = new AbortController();
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(sig, () => stop.abort());

await runWatch({ port: hubPort(), version: PLUGIN_VERSION, signal: stop.signal });
