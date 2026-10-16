// A stand-in for the game tab's main thread where no real tab can be measured: every 1/60 s it does `work` ms of CPU
// work, as a frame would, and reports how many frames it finished per second and how late the latest one started.
// The VM's own Chrome tab drew 1–3 frames per second with or without a solve beside it (software rendering), so it
// could not show what a solve takes from the game. This shows what the solve's CPU use leaves for one busy thread.
// usage: node frames.ts <out.jsonl> [work-ms=8] [every-s=5]
import { appendFileSync } from "node:fs";

const [out, work = "8", every = "5"] = process.argv.slice(2);
const frameMs = 1000 / 60;
const busy = (ms: number) => {
  const end = performance.now() + ms;
  while (performance.now() < end) {}
};
let frames = 0;
let worstLate = 0;
let windowStart = performance.now();
let due = performance.now();
for (;;) {
  const now = performance.now();
  worstLate = Math.max(worstLate, now - due);
  busy(Number(work));
  frames++;
  due = Math.max(due + frameMs, performance.now());
  if (performance.now() - windowStart >= Number(every) * 1000) {
    const secs = (performance.now() - windowStart) / 1000;
    appendFileSync(out, `${JSON.stringify({ t: Date.now(), fps: +(frames / secs).toFixed(1), worstLateMs: Math.round(worstLate) })}\n`);
    frames = 0;
    worstLate = 0;
    windowStart = performance.now();
  }
  await new Promise(r => setTimeout(r, Math.max(0, due - performance.now())));
}
