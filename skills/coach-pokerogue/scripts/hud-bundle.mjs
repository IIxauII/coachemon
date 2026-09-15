// Prints the HUD as one injectable script: every hud/*.js file in name order (00-prelude first) wrapped in a
// single IIFE, with __MODE__ replaced. Used by read.sh and by the tests.
// Usage: node hud-bundle.mjs <hud|hud-off>
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const bundle = mode => {
  const dir = fileURLToPath(new URL("./hud/", import.meta.url));
  const parts = readdirSync(dir).filter(f => f.endsWith(".js")).sort().map(f => `// ---- ${f}\n${readFileSync(dir + f, "utf8")}`);
  return `// Runs in the PokéRogue page world. Draws the always-on coach panel over the game: battle plan, learn-move
// card, rewards card. Read-only: presses nothing and never changes game state. Idempotent — injecting again
// replaces the running panel. Source: skills/coach-pokerogue/scripts/hud/.
(() => {
${parts.join("\n")}
})();
`.replace("__MODE__", mode);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(bundle(process.argv[2] ?? "hud"));
