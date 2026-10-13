// Writes the HUD bundle the way scripts/encounter-oracle/run.ts does: every hud/*.js but 99-start.js, expose mode.
// usage: node make-bundle.mjs <out.js>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "../../../../skills/coachemon/scripts/hud-bundle.mjs";

const HUD = path.resolve(import.meta.dirname, "../../../../skills/coachemon/scripts/hud");
const files = readdirSync(HUD)
  .filter(f => f.endsWith(".js") && f !== "99-start.js")
  .sort()
  .map(f => [f, readFileSync(path.join(HUD, f), "utf8")]);
writeFileSync(process.argv[2], bundle("hud", { expose: true, files }));
