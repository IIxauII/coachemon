// PROTOTYPE (#174), adapted from #161's chrome.mjs. Launches a throwaway Chrome profile and loads dist/chrome.
// Branded Chrome 153 ignores --load-extension, so the probe is loaded with CDP's Extensions.loadUnpacked over
// --remote-debugging-pipe, and the pipe is held open. That connection is browser-level only: it never attaches
// to the page, so no Emulation.setFocusEmulationEnabled is in play.
//
// Usage: node chrome.mjs <profile dir> [--autoplay]
//   --autoplay lets the game's audio start without a user gesture, standing in for a player who has clicked the tab.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [profile] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const args = [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-sync",
  "--disable-features=DisableLoadExtensionCommandLineSwitch", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
  ...(process.argv.includes("--autoplay") ? ["--autoplay-policy=no-user-gesture-required"] : []), "about:blank"];

fs.mkdirSync(profile, { recursive: true });
const log = fs.openSync(path.join(profile, "..", "chrome-stderr.log"), "a");
const child = spawn(CHROME, args, { stdio: ["ignore", log, log, "pipe", "pipe"] });
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
console.log("load", JSON.stringify((await cdp("Extensions.loadUnpacked", { path: path.join(here, "probe", "dist", "chrome") })).result));
await cdp("Target.createTarget", { url: "https://pokerogue.net/" });
console.log("holding the install session's pipe open, pid", child.pid);
