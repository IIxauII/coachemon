// Starts the refresh loop. Last in the bundle, so every module it calls is built before the first tick.
// `stats()` exposes the sandbox restore-mismatch count and refresh cost for live checks; `last()` the card last
// drawn and `summary()` its plain-text verdict, which probe.js passes through to the battle read.
let lastTickMs = 0, maxTickMs = 0;
const timedTick = () => {
  const t0 = performance.now();
  tick();
  lastTickMs = performance.now() - t0;
  maxTickMs = Math.max(maxTickMs, lastTickMs);
};
const timer = setInterval(timedTick, 1000);
timedTick();
window.__coachHud = {
  stop: () => { clearInterval(timer); el.remove(); delete window.__coachHud; },
  stats: () => ({ breaches: sandboxBreachCount(), lastTickMs, maxTickMs }),
  last: () => shownCard(),
  summary: () => cardSummary(shownCard()),
  // How the next-wave preview has actually scored this run: hits and misses per field, and the last wave it got
  // wrong. A field with a miss is drawn `!` on the card from then on.
  preview: () => previewStats(),
  // How the reroll preview has scored: every reroll made against the offers previewed for it.
  reroll: () => rerollStats(),
};
document.documentElement.dataset.mcpOut = JSON.stringify({ hud: "on" });
