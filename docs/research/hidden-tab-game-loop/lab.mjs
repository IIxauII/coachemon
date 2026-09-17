// PROTOTYPE (#174) — the local process. Holds the probes' WebSockets on 127.0.0.1:47174 and runs trials:
// for each (target, hidden state, fix) it hides the pokerogue.net tab, polls the MAIN world every 100 ms the way the
// server's settle loop does, measures loop and game-clock rates, replays #23's fade chain and times how long
// overlayActive stays set, within the server's 30 s call budget. No CDP is attached to any page.
//
// Usage: node lab.mjs [--tags chrome,firefox] [--states front,bgtab,minimize,cover] [--fixes none,pump,worker,timeout,audio]
//                     [--reps 1] [--idle 0] [--out lab.jsonl] [--wait-for chrome,firefox]
//   --idle N  keeps the tab hidden N seconds with no traffic before measuring (intensive throttling after 5 min).
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const list = (k, d) => arg(k, d).split(",").filter(Boolean);
const TAGS = list("tags", "chrome,firefox");
const STATES = list("states", "front,bgtab,minimize,cover");
const FIXES = list("fixes", "none,pump,worker,timeout");
const REPS = Number(arg("reps", 1));
const IDLE_S = Number(arg("idle", 0));
const OUT = arg("out", "lab.jsonl");
const PORT = 47174, POLL_MS = 100, BUDGET_MS = 30000, RATE_MS = 3000;
const PLACE = { left: 120, top: 90, width: 1000, height: 760 };
const here = path.dirname(new URL(import.meta.url).pathname);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const log = (event, data = {}) => {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...data });
  fs.appendFileSync(OUT, line + "\n");
  console.log(line.length > 600 ? line.slice(0, 600) + "…" : line);
};

// ---- WebSocket server (text frames only) ----------------------------------------------
const probes = new Map(); // tag -> { socket, ua }
const waiting = new Map();
let seq = 0;
const frame = text => {
  const p = Buffer.from(text);
  const h = p.length < 126 ? Buffer.from([0x81, p.length]) : Buffer.from([0x81, 126, p.length >> 8, p.length & 255]);
  return Buffer.concat([h, p]);
};
const call = (tag, op, args = {}, timeoutMs = 8000) => new Promise((res, rej) => {
  const pr = probes.get(tag);
  if (!pr) return rej(new Error(`${tag} not connected`));
  const id = ++seq, sentAt = Date.now();
  const timer = setTimeout(() => { waiting.delete(id); rej(new Error(`${tag} ${op} timed out`)); }, timeoutMs);
  waiting.set(id, m => { clearTimeout(timer); m.error ? rej(new Error(m.error)) : res({ ...m.ok, rttMs: Date.now() - sentAt }); });
  pr.socket.write(frame(JSON.stringify({ id, op, args })));
});

const server = http.createServer((_req, res) => { res.writeHead(200); res.end("probe174 lab"); });
server.on("upgrade", (req, socket) => {
  const tag = new URL(req.url, "http://x").searchParams.get("tag");
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  probes.set(tag, { socket });
  log("probe-open", { tag, origin: req.headers.origin ?? null });
  let acc = Buffer.alloc(0);
  socket.on("data", chunk => {
    acc = Buffer.concat([acc, chunk]);
    while (acc.length >= 2) {
      const op = acc[0] & 15;
      let len = acc[1] & 127, off = 2;
      if (len === 126) { if (acc.length < 4) return; len = acc.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (acc.length < 10) return; len = Number(acc.readBigUInt64BE(2)); off = 10; }
      const masked = acc[1] & 128;
      if (acc.length < off + (masked ? 4 : 0) + len) return;
      const mask = masked ? acc.subarray(off, off + 4) : null;
      off += masked ? 4 : 0;
      const data = Buffer.from(acc.subarray(off, off + len));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      acc = acc.subarray(off + len);
      if (op === 8) { socket.end(Buffer.from([0x88, 0])); return; }
      if (op !== 1) continue;
      const m = JSON.parse(data.toString());
      if (m.kind === "reply") { waiting.get(m.id)?.(m); waiting.delete(m.id); }
      else if (m.kind === "hello") { probes.get(tag).ua = m.ua; log("probe-hello", { tag, ua: m.ua }); }
    }
  });
  const gone = why => { if (probes.get(tag)?.socket === socket) { probes.delete(tag); log("probe-closed", { tag, why }); } };
  socket.on("close", () => gone("close"));
  socket.on("error", e => gone(e.code));
});

// ---- hidden states ----------------------------------------------------------------------
const covers = new Set();
for (const sig of ["exit", "SIGINT", "SIGTERM"]) process.on(sig, () => { for (const c of covers) c.kill(); if (sig !== "exit") process.exit(1); });
const applyState = async (tag, state) => {
  if (state === "front") return { cover: null };
  if (state === "cover") {
    const b = await call(tag, "bounds");
    const child = spawn("osascript", ["-l", "JavaScript", path.join(here, "cover.js"), b.left, b.top, b.width, b.height, 600].map(String), { stdio: "ignore" });
    covers.add(child);
    child.on("exit", () => covers.delete(child));
    return { cover: child, bounds: b };
  }
  return { cover: null, ...(await call(tag, "hide", { state })) };
};
const revertState = async (tag, applied) => {
  if (applied.cover) { applied.cover.kill(); await sleep(300); }
  return call(tag, "show");
};

// ---- measurement -------------------------------------------------------------------------
const rate = (a, b) => {
  const s = (b.t - a.t) / 1000;
  const r = k => (a[k] == null || b[k] == null ? null : +((b[k] - a[k]) / s).toFixed(1));
  return { fps: r("frame"), clockMsPerS: r("clock"), rafPerS: r("raf"), timerPerS: r("timer"), workerMsgsPerS: r("workerMsgs"), pumpsPerS: r("pumps"), workerTicksPerS: r("workerTicks") };
};
const pollFor = async (tag, ms, until = null) => {
  const t0 = Date.now(), reads = [];
  for (;;) {
    const r = await call(tag, "read");
    reads.push(r);
    if (until && until(r)) return { reads, doneMs: Date.now() - t0 };
    if (Date.now() - t0 >= ms) return { reads, doneMs: null };
    await sleep(POLL_MS);
  }
};

const trial = async (tag, state, fixName, rep) => {
  await call(tag, "show");
  await call(tag, "fix", { name: "none" });
  await sleep(800);
  const ready = await pollFor(tag, 15000, r => !r.hidden && !r.oa);
  if (ready.doneMs === null) return log("trial-skip", { tag, state, fix: fixName, why: "not visible and idle before trial" });
  await call(tag, "fix", { name: fixName });
  const applied = await applyState(tag, state);
  let rateWin, first, last, fade, settle, during;
  try {
    await sleep(1500);
    if (IDLE_S) await sleep(IDLE_S * 1000);
    rateWin = await pollFor(tag, RATE_MS);
    first = rateWin.reads[0]; last = rateWin.reads.at(-1);
    fade = await call(tag, "fade");
    settle = fade.started ? await pollFor(tag, BUDGET_MS, r => !r.oa) : { reads: [], doneMs: null };
    during = settle.reads.at(-1) ?? last;
  } finally {
    await revertState(tag, applied).catch(e => log("revert-error", { tag, error: String(e) }));
    await call(tag, "fix", { name: "none" }).catch(() => {});
  }
  const after = settle.doneMs === null && fade.started ? await pollFor(tag, 20000, r => !r.oa) : null;
  log("trial", {
    tag, state, fix: fixName, rep, idleS: IDLE_S,
    hidden: first.hidden, vis: first.vis, focus: first.focus, inFocus: first.inFocus, setTimeOut: first.setTimeOut,
    // Contamination check: every poll in the trial should agree with the state (0 hidden for front, all hidden otherwise).
    hiddenPolls: [...rateWin.reads, ...settle.reads].filter(r => r.hidden).length, totalPolls: rateWin.reads.length + settle.reads.length,
    audio: first.audio, mute: first.mute, fixAudio: first.fixAudio, soundsPlaying: first.soundsPlaying,
    ...rate(first, last), polls: rateWin.reads.length, rttMs: Math.max(...rateWin.reads.map(r => r.rttMs)),
    fadeStarted: fade.started, overlayClearedMs: settle.doneMs, settlePolls: settle.reads.length,
    framesDuringSettle: during.frame - (settle.reads[0]?.frame ?? during.frame),
    stillHiddenAtEnd: during.hidden, clearedAfterRestoreMs: after?.doneMs ?? null,
  });
};

server.listen(PORT, "127.0.0.1", async () => {
  log("listening", { port: PORT, tags: TAGS, states: STATES, fixes: FIXES, reps: REPS, idleS: IDLE_S });
  for (let i = 0; i < 600 && !TAGS.every(t => probes.has(t)); i++) await sleep(1000);
  // --parallel runs every tag at once; only safe without the cover state, whose box is placed per window.
  const runTag = async tag => {
    if (!probes.has(tag)) return log("tag-missing", { tag });
    try {
      let info = null;
      for (let i = 0; i < 90 && !info?.hasBattle; i++) { info = await call(tag, "info").catch(() => null); if (!info?.hasBattle) await sleep(1000); }
      log("info", { tag, ...info });
      log("placed", { tag, ...(await call(tag, "place", PLACE)) });
      for (let rep = 1; rep <= REPS; rep++) for (const state of STATES) for (const fixName of FIXES) {
        try { await trial(tag, state, fixName, rep); }
        catch (e) { log("trial-error", { tag, state, fix: fixName, rep, error: String(e) }); await call(tag, "show").catch(() => {}); }
      }
    } catch (e) { log("tag-error", { tag, error: String(e) }); }
  };
  if (process.argv.includes("--parallel")) await Promise.all(TAGS.map(runTag));
  else for (const tag of TAGS) await runTag(tag);
  log("done");
  process.exit(0);
});
