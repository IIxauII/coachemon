// `hud-off` bundles this file alone, so anything added here runs when the panel is switched off too.
// The bundler replaces "__MODE__" with "hud" or "hud-off".
export const MODE = "__MODE__";
window.__coachHud?.stop();
if (MODE === "hud-off") document.documentElement.dataset.mcpOut = JSON.stringify({ hud: "off" });
