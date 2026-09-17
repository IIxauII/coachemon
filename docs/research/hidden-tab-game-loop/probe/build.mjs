// PROTOTYPE (#174): builds the probe into dist/<target> for chrome, firefox, safari and orion.
// orion is the chrome build under its own tag, zipped for Orion's Install from Disk.
// Safari and Orion keep the http://127.0.0.1/* host permission their loopback checks (#119, #150) ran with.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const here = path.dirname(new URL(import.meta.url).pathname);
export const TARGETS = ["chrome", "firefox", "safari", "orion"];

const manifest = target => ({
  manifest_version: 3,
  name: `probe174 ${target}`,
  version: "0.0.1",
  description: "PROTOTYPE, throwaway (#174): does the game loop settle in a hidden tab without CDP focus emulation?",
  background: ["chrome", "orion"].includes(target) ? { service_worker: "background.js" } : { scripts: ["background.js"], ...(target === "safari" && { persistent: false }) },
  host_permissions: ["https://pokerogue.net/*", ...(["safari", "orion"].includes(target) ? ["http://127.0.0.1/*"] : [])],
  content_scripts: [
    { matches: ["https://pokerogue.net/*"], js: ["main.js"], world: "MAIN", run_at: "document_idle" },
    { matches: ["https://pokerogue.net/*"], js: ["isolated.js"], run_at: "document_idle" },
  ],
  ...(target === "firefox" && {
    browser_specific_settings: { gecko: { id: "probe174@coachemon.invalid", strict_min_version: "128.0" } },
    // #161: Firefox's default MV3 CSP upgrades ws://127.0.0.1 into a failed TLS handshake.
    content_security_policy: { extension_pages: "script-src 'self'" },
  }),
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const targets = process.argv.length > 2 ? process.argv.slice(2) : TARGETS;
  for (const target of targets) {
    const dir = path.join(here, "dist", target);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest(target), null, 2));
    const config = `const CONFIG = ${JSON.stringify({ tag: target })};\n`;
    fs.writeFileSync(path.join(dir, "background.js"), config + fs.readFileSync(path.join(here, "src", "background.js"), "utf8"));
    for (const f of ["isolated.js", "main.js"]) fs.copyFileSync(path.join(here, "src", f), path.join(dir, f));
    if (target === "orion") {
      fs.rmSync(path.join(here, "dist", "probe174-orion.zip"), { force: true });
      execFileSync("zip", ["-qj", path.join(here, "dist", "probe174-orion.zip"), ...fs.readdirSync(dir).map(f => path.join(dir, f))]);
    }
  }
  console.log("built", targets.join(", "));
}
