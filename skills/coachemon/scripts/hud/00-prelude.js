// Bundle prelude, first in the HUD: stops a panel that is already running. hud-bundle.mjs loads every hud/*.js file
// in name order; its header comment has the module rules. `hud-off` bundles this file alone.
// The bundle's mode, "hud" or "hud-off".
export const MODE = "__MODE__";
window.__coachHud?.stop();
if (MODE === "hud-off") document.documentElement.dataset.mcpOut = JSON.stringify({ hud: "off" });
