// Bundle prelude. read.sh wraps every hud/*.js file, in name order, into one IIFE injected into the page world,
// so top-level declarations in one module are visible to the modules after it.
const MODE = "__MODE__";
window.__coachHud?.stop();
if (MODE === "hud-off") {
  document.documentElement.dataset.mcpOut = JSON.stringify({ hud: "off" });
  return;
}
