// #518, not run yet: prints a snippet that measures the watch on a live pokerogue.net tab, the number the note could
// not take. Paste the output into Orion's Web Inspector console on the game tab, play for `SECONDS`, then read
// `window.__coachWatchProbe`:
//
//   node docs/research/decision-signals/bench-live.mjs [seconds=120] | pbcopy
//
// It reports (1) ns per watch() call on whatever screen is up, over 200k calls (about 2-5 ms of main thread), and
// (2) for every decision the watch saw open: its kind, the frames and ms from the phase starting to the watch calling
// it ready, and the watch's own share of each frame.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const seconds = Number(process.argv[2] ?? 120);
const watchSource = readFileSync(path.join(here, "watch.js"), "utf8").replace("export const makeWatch", "const makeWatch");

process.stdout.write(`(() => {
// Enum values at the pinned game, 1.12.0.11 (src/enums/generated.ts): the served build inlines them as numbers.
const E = {
  UiMode: { MESSAGE: 0, COMMAND: 2, FIGHT: 3, TARGET_SELECT: 5, MODIFIER_SELECT: 6, PARTY: 8, SUMMARY: 9,
    STARTER_SELECT: 10, CONFIRM: 14, OPTION_SELECT: 15, MYSTERY_ENCOUNTER: 45 },
  PartyUiMode: { SPLICE: 9 },
  BattlerIndex: { ENEMY: 2 },
};
${watchSource}
const game = Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game;
const s = game.scene.getScene("battle");
const steady = makeWatch(E);
for (let i = 0; i < 20000; i++) steady.watch(s);
const N = 200000;
let t0 = performance.now();
for (let i = 0; i < N; i++) steady.watch(s);
const out = window.__coachWatchProbe = {
  engine: navigator.userAgent,
  screen: { phase: s.phaseManager.getCurrentPhase()?.phaseName, mode: s.ui.getMode() },
  nsPerCall: ((performance.now() - t0) * 1e6) / N,
  frames: 0, watchMs: 0, decisions: [], done: false,
};
const W = makeWatch(E);
let phase = null, phaseFrame = 0, phaseAt = 0;
const end = performance.now() + ${seconds} * 1000;
const step = () => {
  const a = performance.now();
  const d = W.watch(s);
  out.watchMs += performance.now() - a;
  const ph = s.phaseManager.getCurrentPhase();
  if (ph !== phase) { phase = ph; phaseFrame = out.frames; phaseAt = a; }
  if (d.fresh) out.decisions.push({ kind: d.kind, phase: ph.phaseName, mode: s.ui.getMode(),
    framesAfterPhaseStart: out.frames - phaseFrame, msAfterPhaseStart: Math.round(a - phaseAt) });
  out.frames++;
  if (a < end) requestAnimationFrame(step); else out.done = true;
};
requestAnimationFrame(step);
return "probing for ${seconds} s: read window.__coachWatchProbe when .done";
})()
`);
