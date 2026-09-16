// PROTOTYPE (#161) — launches a throwaway Chrome profile with the probe builds loaded and no debugger attached.
// An attached DevTools session disables a service worker's idle timeout, which would pass the control variant
// for the wrong reason, so the default route avoids CDP entirely.
//
// Branded Chrome ignores --load-extension since 137 unless DisableLoadExtensionCommandLineSwitch is disabled.
// Extensions loaded through CDP's Extensions.loadUnpacked do not survive a relaunch (observed on 153), so the
// --hold fallback keeps that install session's pipe open, attached at browser level only.
//
// Usage: node chrome.mjs <target: chrome-lna|chrome-nolna> <profile dir> [--hold]
//   chrome-nolna also disables LocalNetworkAccessChecks and LocalNetworkAccessChecksWebSockets.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { variantsFor } from "./probe/build.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [target, profile] = process.argv.slice(2);
const hold = process.argv.includes("--hold");
const here = path.dirname(new URL(import.meta.url).pathname);
const dirs = variantsFor(target).map(v => path.join(here, "probe", "dist", target, v));
// Chrome keeps only the last --disable-features switch, so everything goes in one.
const disabled = ["DisableLoadExtensionCommandLineSwitch",
  ...(target === "chrome-nolna" ? ["LocalNetworkAccessChecks", "LocalNetworkAccessChecksWebSockets"] : [])];
const common = [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-sync",
  `--disable-features=${disabled.join(",")}`, "--enable-logging=stderr", "--v=0"];

fs.mkdirSync(profile, { recursive: true });
const log = fs.openSync(path.join(profile, "..", `${target}-stderr.log`), "a");

if (!hold) {
  const run = spawn(CHROME, [...common, `--load-extension=${dirs.join(",")}`, "https://pokerogue.net/"],
    { stdio: ["ignore", log, log], detached: true });
  run.unref();
  console.log("launched without a debugger, pid", run.pid);
  process.exit(0);
}

const child = spawn(CHROME, [...common, "--remote-debugging-pipe", "--enable-unsafe-extension-debugging", "about:blank"],
  { stdio: ["ignore", log, log, "pipe", "pipe"] });
let id = 0, buf = "";
const waiting = new Map();
child.stdio[4].on("data", d => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\0")) >= 0) {
    const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  }
});
const cdp = (method, params = {}) => new Promise(res => { waiting.set(++id, res); child.stdio[3].write(JSON.stringify({ id, method, params }) + "\0"); });
for (const dir of dirs) console.log(path.basename(dir), JSON.stringify((await cdp("Extensions.loadUnpacked", { path: dir })).result));
await cdp("Target.createTarget", { url: "https://pokerogue.net/" });
console.log("holding the install session's pipe open, pid", child.pid);
