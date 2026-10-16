// Watches the game tab of a Chrome started with --remote-debugging-port: frames drawn per second and the main thread's
// longest stall, every `every` seconds, as JSON lines. It also answers how long the page takes to run a click handler.
// usage: node tab.ts <port> <out.jsonl> [every=5] [samples=forever]
import { appendFileSync } from "node:fs";
import WebSocket from "ws";

const [port, out, every = "5", samples = "0"] = process.argv.slice(2);
const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; url: string; webSocketDebuggerUrl: string }[];
const page = targets.find(t => t.type === "page" && /pokerogue/.test(t.url)) ?? targets.find(t => t.type === "page");
if (!page) throw new Error("no page target");
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise(resolve => ws.once("open", resolve));
let id = 0;
const pending = new Map<number, (v: any) => void>();
ws.on("message", data => {
  const msg = JSON.parse(String(data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  }
});
const send = (method: string, params: object = {}) =>
  new Promise<any>(resolve => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression: string) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

// A rAF counter and a 50 ms heartbeat: the heartbeat's worst lateness is how long the main thread was busy.
await evaluate(`(() => {
  if (window.__probe) return;
  const p = window.__probe = { frames: 0, worstLate: 0 };
  const tick = () => { p.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  let last = performance.now();
  setInterval(() => { const now = performance.now(); p.worstLate = Math.max(p.worstLate, now - last - 50); last = now; }, 50);
})()`);
const ms = Number(every) * 1000;
for (let n = 1; ; n++) {
  const before = Date.now();
  await evaluate("(window.__probe.frames = 0, window.__probe.worstLate = 0)");
  await new Promise(r => setTimeout(r, ms));
  const probe = await evaluate("({ frames: window.__probe.frames, worstLate: window.__probe.worstLate, url: location.href })");
  // The round trip of a trivial evaluate: how long the page's event loop takes to get to a message from outside.
  const t0 = performance.now();
  await evaluate("1");
  const roundTripMs = performance.now() - t0;
  const secs = (Date.now() - before) / 1000;
  appendFileSync(
    out,
    `${JSON.stringify({ t: Date.now(), fps: +(probe.frames / secs).toFixed(1), worstStallMs: Math.round(probe.worstLate), roundTripMs: +roundTripMs.toFixed(1), url: probe.url })}\n`,
  );
  if (n === Number(samples)) process.exit(0);
}
