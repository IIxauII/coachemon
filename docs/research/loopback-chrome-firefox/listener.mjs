// PROTOTYPE (#161) — throwaway local process for the Chrome/Firefox loopback probe, adapted from #150.
// Holds WebSocket clients on /ws and long-polls on /poll. After IDLE seconds with no command traffic it sends
// one command to every probe it has ever heard from, and scores each probe on its own against the pass bar:
// a MAIN-world answer from the tab within ~1 s. A probe with no live channel at send time gets the command
// as soon as it reconnects, and is scored from the original send time.
//
// Usage: node listener.mjs [--idle 330] [--out probe-log.jsonl]
// HTTP:  GET /send = send a command now, GET /status = live channels and last results.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const IDLE_S = Number(arg("idle", 330));
const OUT = arg("out", "probe-log.jsonl");
const PORT = 47161;
const PASS_MS = 1000, TIMEOUT_MS = 20000;

const log = (event, data = {}) => {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...data });
  fs.appendFileSync(OUT, line + "\n");
  console.log(line);
};

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, GET, OPTIONS" };
const known = new Map();   // tag -> { firstSeen, lastEvent, keepalives, results: [] }
const sockets = new Set(); // { socket, tag, openedAt }
const polls = new Set();   // { res, tag, since }
const pending = new Map(); // cmd id -> { cmd, perTag: Map(tag -> { deliveredAt, via, acked }) }
let lastTraffic = Date.now();
let seq = 0;
const RUN = Date.now().toString(36);

const see = tag => {
  if (tag && !known.has(tag)) { known.set(tag, { firstSeen: new Date().toISOString(), keepalives: 0, results: [] }); log("probe-known", { tag }); }
  return known.get(tag);
};

// Deliver to one tag over whatever channel it has live; returns the channel used, or null.
const deliverTo = (tag, cmd) => {
  for (const s of sockets) if (s.tag === tag) { s.socket.write(frame(JSON.stringify(cmd))); return `ws`; }
  for (const p of polls) if (p.tag === tag) {
    polls.delete(p);
    p.res.writeHead(200, { ...cors, "content-type": "application/json" });
    p.res.end(JSON.stringify(cmd));
    return "poll";
  }
  return null;
};

const send = trigger => {
  const cmd = { kind: "cmd", id: `r${RUN}-c${++seq}`, sentAt: Date.now() };
  const idleSeconds = Math.round((Date.now() - lastTraffic) / 1000);
  lastTraffic = Date.now();
  const perTag = new Map();
  for (const tag of known.keys()) {
    const via = deliverTo(tag, cmd);
    perTag.set(tag, { via, deliveredAt: via ? Date.now() : null, acked: false });
  }
  pending.set(cmd.id, { cmd, perTag });
  log("cmd-sent", { id: cmd.id, trigger, idleSeconds, delivered: Object.fromEntries([...perTag].map(([t, s]) => [t, s.via ?? "no-channel"])) });
  setTimeout(() => {
    for (const [tag, s] of perTag) if (!s.acked) {
      const reason = s.via ? `delivered via ${s.via}, no page ack in ${TIMEOUT_MS} ms` : `no live channel within ${TIMEOUT_MS} ms`;
      known.get(tag).results.push({ id: cmd.id, verdict: "FAIL", idleSeconds });
      log("FAIL", { id: cmd.id, tag, idleSeconds, reason });
    }
  }, TIMEOUT_MS);
  return cmd.id;
};

const flushQueued = tag => {
  for (const [id, p] of pending) {
    const s = p.perTag.get(tag);
    if (!s || s.via || s.acked || Date.now() - p.cmd.sentAt > TIMEOUT_MS) continue;
    const via = deliverTo(tag, p.cmd);
    if (via) { s.via = via; s.deliveredAt = Date.now(); log("cmd-delivered-late", { id, tag, via, lateByMs: s.deliveredAt - p.cmd.sentAt }); }
  }
};

setInterval(() => { if (Date.now() - lastTraffic >= IDLE_S * 1000) send(`idle ${IDLE_S}s`); }, 1000);

// --- HTTP -------------------------------------------------------------------------
const body = req => new Promise(r => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => { try { r(JSON.parse(b)); } catch { r(b); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

  if (url.pathname === "/poll") {
    const tag = url.searchParams.get("tag");
    see(tag);
    const p = { res, tag, since: Date.now() };
    polls.add(p);
    const timer = setTimeout(() => { if (polls.delete(p)) { res.writeHead(204, cors); res.end(); } }, 25000);
    req.on("close", () => { clearTimeout(timer); if (polls.delete(p)) log("poll-dropped", { tag, heldMs: Date.now() - p.since }); });
    flushQueued(tag);
    return;
  }

  if (req.method === "POST" && url.pathname === "/ack") {
    const a = await body(req);
    res.writeHead(200, cors); res.end("ok");
    const s = pending.get(a.id)?.perTag.get(a.tag);
    if (!s) return log("ack-unknown", a);
    const latencyMs = Date.now() - pending.get(a.id).cmd.sentAt;
    const page = a.results?.find(r => r.reply?.main?.source === "probe161-main");
    if (!page) return log("ack-no-page", { latencyMs, ...a });
    if (s.acked) return log("ack-dup", { latencyMs, id: a.id, tag: a.tag });
    s.acked = true;
    const verdict = latencyMs <= PASS_MS ? "PASS" : "SLOW";
    known.get(a.tag).results.push({ id: a.id, verdict, latencyMs });
    return log(verdict, { id: a.id, tag: a.tag, latencyMs, via: a.via, bgUptimeS: a.bgUptimeS, bgLagMs: a.bgLagMs, tabLagMs: page.reply.tabLagMs, page: page.reply.main, keepalives: known.get(a.tag).keepalives });
  }

  if (req.method === "POST" && url.pathname === "/event") {
    const e = await body(req);
    res.writeHead(200, cors); res.end("ok");
    see(e.tag);
    return log("ext:" + e.event, e);
  }

  if (url.pathname === "/send") { const id = send("manual-http"); res.writeHead(200, cors); return res.end(id); }

  if (url.pathname === "/status") {
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    return res.end(JSON.stringify({
      idleForS: Math.round((Date.now() - lastTraffic) / 1000),
      sockets: [...sockets].map(s => ({ tag: s.tag, openForS: Math.round((Date.now() - s.openedAt) / 1000) })),
      polls: [...polls].map(p => p.tag),
      probes: Object.fromEntries(known),
    }, null, 2));
  }

  res.writeHead(200, cors); res.end("pong");
});

// --- WebSocket (minimal, text frames only) --------------------------------------------
const frame = text => {
  const payload = Buffer.from(text);
  const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([header, payload]);
};

server.on("upgrade", (req, socket) => {
  const tag = new URL(req.url, "http://x").searchParams.get("tag");
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const s = { socket, tag, openedAt: Date.now() };
  sockets.add(s);
  see(tag);
  log("ws-open", { tag, origin: req.headers.origin ?? null });
  flushQueued(tag);
  const closed = why => { if (sockets.delete(s)) log("ws-closed", { tag, why, openForS: Math.round((Date.now() - s.openedAt) / 1000) }); };
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
      if (op === 1) {
        const text = data.toString();
        if (text.includes('"keepalive"')) known.get(tag).keepalives++;
        else log("ws-msg", { tag, text: text.slice(0, 200) });
      }
    }
  });
  socket.on("close", () => closed("tcp-close"));
  socket.on("error", e => closed("error: " + e.code));
});

server.listen(PORT, "127.0.0.1", () => log("listening", { port: PORT, idleSeconds: IDLE_S, out: OUT, run: RUN }));
