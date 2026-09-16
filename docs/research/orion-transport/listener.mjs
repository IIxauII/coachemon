// PROTOTYPE (#150) — throwaway local process for the Orion loopback probe.
// Holds WebSocket clients on /ws and long-polls on /poll, sends a command every IDLE seconds of
// silence, and scores each command against the pass bar: ack from the tab within ~1 s.
//
// Usage: node listener.mjs [--idle 330] [--means both|ws|poll] [--out probe-log.jsonl]
// Keys:  Enter = send a command now, q = quit.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const IDLE_S = Number(arg("idle", 330));
const MEANS = arg("means", "both");
const OUT = arg("out", "probe-log.jsonl");
const PORT = 47150;
const PASS_MS = 1000, TIMEOUT_MS = 15000;

const t = () => new Date().toISOString();
const log = (event, data = {}) => {
  const line = JSON.stringify({ at: t(), event, ...data });
  fs.appendFileSync(OUT, line + "\n");
  console.log(line);
};

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, GET, OPTIONS" };
const sockets = new Set();   // { socket, build, openedAt }
const polls = new Set();     // { res, build, since }
const pending = new Map();   // id -> { sentAt, deliveredVia: [], acked, timer, queued }
let lastTraffic = Date.now(); // last listener→extension command
let seq = 0;

// --- commands -------------------------------------------------------------
const deliver = cmd => {
  const via = [];
  if (MEANS !== "poll") for (const s of sockets) { s.socket.write(frame(JSON.stringify(cmd))); via.push(`ws:${s.build}`); }
  if (MEANS !== "ws") for (const p of [...polls]) {
    polls.delete(p);
    p.res.writeHead(200, { ...cors, "content-type": "application/json" });
    p.res.end(JSON.stringify(cmd));
    via.push(`poll:${p.build}`);
  }
  return via;
};

const send = trigger => {
  const cmd = { kind: "cmd", id: `c${++seq}`, sentAt: Date.now() };
  const idleMs = Date.now() - lastTraffic;
  lastTraffic = Date.now();
  const live = { liveSockets: sockets.size, livePolls: polls.size };
  const via = deliver(cmd);
  const entry = { sentAt: cmd.sentAt, via, queued: via.length === 0, acked: false };
  entry.timer = setTimeout(() => { if (!entry.acked) log("FAIL", { id: cmd.id, reason: `no ack in ${TIMEOUT_MS} ms`, via }); }, TIMEOUT_MS);
  pending.set(cmd.id, { ...entry, cmd });
  log("cmd-sent", { id: cmd.id, trigger, idleSeconds: Math.round(idleMs / 1000), via, ...live });
};

// A command sent with no live channel waits here for the next channel to appear (reconnect-on-wake).
const flushQueued = () => {
  for (const [id, p] of pending) if (p.queued && !p.acked) {
    const via = deliver(p.cmd);
    if (via.length) { p.queued = false; log("cmd-delivered-late", { id, via, lateByMs: Date.now() - p.sentAt }); }
  }
};

setInterval(() => { if (Date.now() - lastTraffic >= IDLE_S * 1000) send(`idle ${IDLE_S}s`); }, 1000);

// --- HTTP -----------------------------------------------------------------
const body = req => new Promise(r => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => { try { r(JSON.parse(b)); } catch { r(b); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

  if (url.pathname === "/poll") {
    const build = url.searchParams.get("build");
    if (MEANS === "ws") { res.writeHead(200, { ...cors, "content-type": "application/json" }); return res.end(JSON.stringify({ kind: "disable" })); }
    const p = { res, build, since: Date.now() };
    polls.add(p);
    const timer = setTimeout(() => { if (polls.delete(p)) { res.writeHead(204, cors); res.end(); } }, 25000);
    req.on("close", () => { clearTimeout(timer); if (polls.delete(p)) log("poll-dropped", { build, heldMs: Date.now() - p.since }); });
    flushQueued();
    return;
  }

  if (req.method === "POST" && url.pathname === "/ack") {
    const a = await body(req);
    const p = pending.get(a.id);
    res.writeHead(200, cors); res.end("ok");
    if (!p) return log("ack-unknown", a);
    const latencyMs = Date.now() - p.sentAt;
    const first = !p.acked;
    p.acked = true; clearTimeout(p.timer);
    return log(first ? (latencyMs <= PASS_MS ? "PASS" : "SLOW") : "ack-dup", { id: a.id, latencyMs, ...a });
  }

  if (req.method === "POST" && url.pathname === "/event") {
    const e = await body(req);
    res.writeHead(200, cors); res.end("ok");
    return log("ext:" + e.event, e);
  }

  if (url.pathname === "/send") { send("manual-http"); res.writeHead(200, cors); return res.end("sent"); }

  res.writeHead(200, cors); res.end("pong");
});

// --- WebSocket (minimal, text frames only) ----------------------------------
const frame = text => {
  const payload = Buffer.from(text);
  const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([header, payload]);
};

server.on("upgrade", (req, socket) => {
  const build = new URL(req.url, "http://x").searchParams.get("build");
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const s = { socket, build, openedAt: Date.now() };
  if (MEANS === "poll") { socket.write(frame(JSON.stringify({ kind: "disable" }))); }
  else { sockets.add(s); log("ws-open", { build, origin: req.headers.origin ?? null }); flushQueued(); }
  const closed = why => { if (sockets.delete(s)) log("ws-closed", { build, why, openForS: Math.round((Date.now() - s.openedAt) / 1000) }); };
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
      if (op === 8) { closed("close-frame"); return socket.end(Buffer.from([0x88, 0])); }
      if (op === 9) socket.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); // ping → pong
      if (op === 1) log("ws-msg", { build, text: data.toString().slice(0, 200) });
    }
  });
  socket.on("close", () => closed("tcp-close"));
  socket.on("error", e => closed("error: " + e.code));
});

server.listen(PORT, "127.0.0.1", () => log("listening", { port: PORT, idleSeconds: IDLE_S, means: MEANS, out: OUT }));

process.stdin.setRawMode?.(true);
process.stdin.on("data", d => {
  const k = d.toString();
  if (k === "q" || k === "") process.exit(0);
  if (k === "\r" || k === "\n") send("manual");
});
