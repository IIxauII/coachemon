/**
 * The dev loop (§5.4): watch what the extension is built from, rerun the dev build, and tell the running dev build to
 * reload itself. It is `wxt dev`'s job, done by hand, because `wxt dev` force-adds `tabs` and `scripting`, runs a
 * throwaway profile, does not watch `hud/`, and covers neither Safari nor Orion (§5.2).
 *
 *   node extension/scripts/dev.ts                       # chrome
 *   node extension/scripts/dev.ts --target chrome,firefox
 *   node extension/scripts/dev.ts --once                # build once, reload once, exit
 *
 * The reload goes out as a `dev-reload` frame through the dev hub on 47148 (§5.4), which the hub fans out to every
 * `flavour: "dev"` extension and to nothing else. A frame rather than the dev table's `reload` command, because a
 * command needs the one counted tab the hub routes to — and the build that most needs reloading is the one whose relay
 * the last change broke, which has no counted tab at all.
 *
 * The extension reloads and puts the content scripts back into the open game tabs itself, so a run keeps its place.
 * Whether Firefox, Safari and Orion honour that is unmeasured; where an engine cannot, the dev reloads by hand.
 */
import { spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HubClient } from "../../src/hub/client.ts";
import { PLUGIN_VERSION } from "../../src/plugin-version.ts";
import { DEV_PORT } from "../../src/protocol/version.ts";
import { SETTLE_MS, WATCHED, interesting } from "../src/dev/watch.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const extension = join(here, "..");
const repo = join(extension, "..");

const argv = process.argv.slice(2);
const at = argv.indexOf("--target");
const targets = (at > -1 && argv[at + 1] ? argv[at + 1] : "chrome").split(",").map(t => t.trim()).filter(Boolean);
const once = argv.includes("--once");

const say = (line: string) => process.stderr.write(`${line}\n`);

/** One dev build per target, in order. A target that fails stops the round: reloading a stale build would mislead. */
function build(): boolean {
  for (const target of targets) {
    const t0 = Date.now();
    const r = spawnSync("npx", ["wxt", "build", "-b", target, "--mode", "dev"], { cwd: extension, stdio: ["ignore", "ignore", "inherit"] });
    if (r.status !== 0) {
      say(`build ${target}: failed`);
      return false;
    }
    say(`build ${target}: ${Date.now() - t0} ms`);
  }
  return true;
}

/** The `dev-reload` frame, over a client of its own: the socket is open only for as long as it takes to send. */
async function reload(): Promise<void> {
  const client = new HubClient({ port: DEV_PORT, version: PLUGIN_VERSION });
  try {
    // Nothing answers it: every extension it reaches is restarting (§5.4). Only a hub we could not reach is news.
    const trouble = await client.devReload();
    say(trouble === null ? "reload: sent" : `reload: no hub on ${DEV_PORT} (${trouble.kind})`);
  } finally {
    client.close();
  }
}

async function round(): Promise<void> {
  if (build()) await reload();
}

await round();
if (once) process.exit(0);

let pending: NodeJS.Timeout | null = null;
let running = false;
/** A change during a build is not lost: the round that is running finishes, then one more runs for it. */
let again = false;

function touched(rel: string): void {
  if (!interesting(rel)) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    if (running) {
      again = true;
      return;
    }
    void (async () => {
      running = true;
      try {
        do {
          again = false;
          say(`--- ${rel}`);
          await round();
        } while (again);
      } finally {
        running = false;
      }
    })();
  }, SETTLE_MS);
}

for (const root of WATCHED) {
  const dir = join(repo, root);
  try {
    watch(dir, { recursive: true }, (_event, name) => touched(join(root, String(name ?? ""))));
    say(`watching ${root}`);
  } catch (e) {
    // A root that is not there yet is not a reason to refuse to watch the others.
    say(`not watching ${root}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
