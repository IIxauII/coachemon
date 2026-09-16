// PROTOTYPE (#161): builds one unpacked extension per (target, variant) into dist/<target>/<variant>.
// One source; each variant differs only in how its background holds the loopback channel.
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const src = f => fs.readFileSync(path.join(here, "src", f), "utf8");

export const VARIANTS = {
  // control: a held WebSocket and nothing else
  "ws":           { means: "ws",   wsKeepalive: false, tabKeepalive: false, loopbackPerm: true },
  // WebSocket plus a text frame every 20 s from the extension
  "ws-ka":        { means: "ws",   wsKeepalive: true,  tabKeepalive: false, loopbackPerm: true },
  // long-poll fetch only, held 25 s by the listener, re-polled at once
  "poll":         { means: "poll", wsKeepalive: false, tabKeepalive: false, loopbackPerm: true },
  // WebSocket, no socket keepalive; the content script messages the background every 20 s
  "tab-ka":       { means: "ws",   wsKeepalive: false, tabKeepalive: true,  loopbackPerm: true },
  "ws-ka-noperm": { means: "ws",   wsKeepalive: true,  tabKeepalive: false, loopbackPerm: false },
  "poll-noperm":  { means: "poll", wsKeepalive: false, tabKeepalive: false, loopbackPerm: false },
  // Firefox only: ws-ka with Firefox's default MV3 extension CSP, whose upgrade-insecure-requests
  // turned every ws:// into a failed TLS handshake (close code 1015). Every other Firefox build overrides it.
  "ws-ka-defaultcsp": { means: "ws", wsKeepalive: true, tabKeepalive: false, loopbackPerm: true, targets: ["firefox"], defaultCsp: true },
};
export const variantsFor = target => Object.keys(VARIANTS).filter(v => !VARIANTS[v].targets || VARIANTS[v].targets.includes(target));
export const TARGETS = { "chrome-lna": "chrome", "chrome-nolna": "chrome", "firefox": "firefox" };

const manifest = (target, variant, cfg) => ({
  manifest_version: 3,
  name: `probe161 ${target} ${variant}`,
  version: "0.0.1",
  description: "PROTOTYPE, throwaway (#161): does a loopback channel stay deliverable after 5+ min idle?",
  background: TARGETS[target] === "chrome" ? { service_worker: "background.js" } : { scripts: ["background.js"] },
  host_permissions: ["https://pokerogue.net/*", ...(cfg.loopbackPerm ? ["http://127.0.0.1/*"] : [])],
  content_scripts: [
    { matches: ["https://pokerogue.net/*"], js: ["main.js"], world: "MAIN", run_at: "document_idle" },
    { matches: ["https://pokerogue.net/*"], js: ["isolated.js"], run_at: "document_idle" },
  ],
  ...(TARGETS[target] === "firefox" && {
    browser_specific_settings: { gecko: { id: `probe161-${variant}@coachemon.invalid`, strict_min_version: "128.0" } },
    ...(!cfg.defaultCsp && { content_security_policy: { extension_pages: "script-src 'self'" } }),
  }),
});

if (import.meta.url === `file://${process.argv[1]}`) {
  // node build.mjs [target...] rebuilds only those targets, so a browser still running another target keeps its files.
  const targets = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(TARGETS);
  for (const target of targets) fs.rmSync(path.join(here, "dist", target), { recursive: true, force: true });
  for (const target of targets) for (const variant of variantsFor(target)) {
    const cfg = VARIANTS[variant];
    const dir = path.join(here, "dist", target, variant);
    fs.mkdirSync(dir, { recursive: true });
    // A block, not a top-level const: every variant's main.js shares the page's global scope, and a
    // second top-level `const CONFIG` there is a SyntaxError that silently kills that variant's script.
    const config = `const CONFIG = ${JSON.stringify({ tag: `${target}/${variant}`, ...cfg })};\n`;
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest(target, variant, cfg), null, 2));
    for (const f of ["background.js", "isolated.js", "main.js"]) fs.writeFileSync(path.join(dir, f), `{\n${config}${src(f)}}\n`);
  }
  console.log(`built ${targets.map(t => `${t}: ${variantsFor(t).join(", ")}`).join("; ")}`);
}
