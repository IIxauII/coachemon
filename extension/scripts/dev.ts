/** The dev loop (extension-distribution.md §5.4). */
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

/**
 * A `dev-reload` frame, not the dev table's `reload` command: a command needs a counted tab, and the build that most
 * needs reloading is the one whose relay the last change broke, which has none.
 */
async function reload(): Promise<void> {
  const client = new HubClient({ port: DEV_PORT, version: PLUGIN_VERSION });
  try {
    // Nothing answers it, since every extension it reaches is restarting: only an unreachable hub is news.
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
    say(`not watching ${root}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
