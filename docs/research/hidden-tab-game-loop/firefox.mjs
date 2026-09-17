// PROTOTYPE (#174), adapted from #161's firefox.mjs. Launches a throwaway Firefox profile and installs dist/firefox
// as a temporary add-on over the Remote Debugging Protocol, then closes the connection so no debugger stays attached.
//
// Usage: node firefox.mjs <Firefox.app path> <profile dir> [--autoplay]
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const [app, profile] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const PORT = 6174;

const prefs = {
  "devtools.debugger.remote-enabled": true,
  "devtools.chrome.enabled": true,
  "devtools.debugger.prompt-connection": false,
  "browser.shell.checkDefaultBrowser": false,
  "browser.aboutwelcome.enabled": false,
  "datareporting.policy.dataSubmissionEnabled": false,
  "browser.startup.homepage_override.mstone": "ignore",
  "startup.homepage_welcome_url": "",
  ...(process.argv.includes("--autoplay") && { "media.autoplay.default": 0, "media.autoplay.blocking_policy": 0 }),
};
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(path.join(profile, "user.js"), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("\n") + "\n");

const log = fs.openSync(path.join(profile, "..", "firefox-stdout.log"), "a");
const ff = spawn(path.join(app, "Contents/MacOS/firefox"), ["-profile", profile, "-no-remote", "-start-debugger-server", String(PORT), "https://pokerogue.net/"],
  { stdio: ["ignore", log, log], detached: true });
ff.unref();
console.log("firefox pid", ff.pid);

const connect = async () => {
  for (let i = 0; i < 60; i++) {
    try { return await new Promise((res, rej) => { const s = net.connect(PORT, "127.0.0.1", () => res(s)); s.on("error", rej); }); }
    catch { await new Promise(r => setTimeout(r, 500)); }
  }
  throw new Error("RDP never came up");
};
const sock = await connect();
let buf = Buffer.alloc(0);
const inbox = [];
let wake = null;
sock.on("data", d => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const colon = buf.indexOf(":");
    if (colon < 0) break;
    const len = Number(buf.subarray(0, colon).toString());
    if (buf.length < colon + 1 + len) break;
    inbox.push(JSON.parse(buf.subarray(colon + 1, colon + 1 + len).toString()));
    buf = buf.subarray(colon + 1 + len);
  }
  wake?.();
});
const next = async from => {
  for (;;) {
    const i = inbox.findIndex(m => m.from === from);
    if (i >= 0) return inbox.splice(i, 1)[0];
    await new Promise(r => (wake = r));
  }
};
const request = async msg => {
  const text = Buffer.from(JSON.stringify(msg));
  sock.write(`${text.length}:`); sock.write(text);
  return next(msg.to);
};

await next("root");
const root = await request({ to: "root", type: "getRoot" });
const r = await request({ to: root.addonsActor, type: "installTemporaryAddon", addonPath: path.join(here, "probe", "dist", "firefox") });
console.log("install", JSON.stringify(r.addon ?? r));
sock.end();
console.log("RDP closed; add-on stays installed until Firefox exits");
process.exit(0);
