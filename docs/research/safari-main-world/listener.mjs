// Loopback listener for the probe: POST /report and a minimal WebSocket echo on /ws.
// Usage: node listener.mjs [out.jsonl]
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const OUT = process.argv[2] ?? "probe-log.jsonl";
const write = (via, req, body) => {
  const line = JSON.stringify({ receivedAt: new Date().toISOString(), via, origin: req.headers.origin ?? null, body });
  fs.appendFileSync(OUT, line + "\n");
  console.log(line);
};
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, GET, OPTIONS" };

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { write("http-preflight", req, req.url); res.writeHead(204, cors); return res.end(); }
  if (req.method === "GET") { res.writeHead(200, cors); return res.end("pong"); }
  let buf = "";
  req.on("data", c => (buf += c));
  req.on("end", () => {
    let body; try { body = JSON.parse(buf); } catch { body = buf; }
    write("http", req, body);
    res.writeHead(200, { ...cors, "content-type": "text/plain" });
    res.end("ok");
  });
});

const frame = text => {
  const payload = Buffer.from(text);
  const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([header, payload]);
};

server.on("upgrade", (req, socket) => {
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
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
      if (op === 8) return socket.end(Buffer.from([0x88, 0]));
      if (op === 1) {
        const text = data.toString();
        let body; try { body = JSON.parse(text); } catch { body = text; }
        write("ws", req, body);
        socket.write(frame("echo:" + text.slice(0, 60)));
      }
    }
  });
  socket.on("error", () => {});
});

server.listen(47119, "127.0.0.1", () => console.log(`listening on 127.0.0.1:47119 → ${OUT}`));
