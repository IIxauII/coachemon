// Starts the refresh loop. Last in the bundle, so every draw function (including 95-render-team) is defined
// before the first tick. `stats()` exposes the sandbox restore-mismatch count and refresh cost for live checks.
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
  stats: () => ({ breaches: sandboxBreaches, lastTickMs, maxTickMs }),
};
document.documentElement.dataset.mcpOut = JSON.stringify({ hud: "on" });
