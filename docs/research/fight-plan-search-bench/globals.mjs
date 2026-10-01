// Installs the game enums the HUD files reference as globals, the way hud-bundle injects them.
import { readdirSync, readFileSync } from "node:fs";
import { enumPrelude } from "../../../skills/coachemon/scripts/hud-bundle.mjs";
const dir = new URL("./hud/", import.meta.url).pathname;
const src = readdirSync(dir).filter(f => f.endsWith(".js")).map(f => readFileSync(dir + f, "utf8")).join("\n");
const pre = enumPrelude(src).replace(/^const (\w+) =/gm, "globalThis.$1 =");
(0, eval)(pre);
globalThis.window ??= globalThis;
