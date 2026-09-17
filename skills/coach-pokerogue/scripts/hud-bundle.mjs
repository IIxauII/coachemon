// Prints the HUD as one injectable script: every hud/*.js file in name order (00-prelude first) wrapped in a
// single IIFE, with __MODE__ replaced. Any other mode prints probe.js the same way. Used by read.sh and by the tests.
// Usage: node hud-bundle.mjs <hud|hud-off|battle|starters>
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as generated from "../../../src/enums/generated.ts";

const TABLES = Object.fromEntries(Object.entries(generated).filter(([k, v]) => k !== "NAMES" && v && typeof v === "object"));

// The game's build inlines its enums as numbers, so no enum names exist in the page. Source written as
// `MoveCategory.STATUS` gets a `const MoveCategory` holding the members it names, from the tables generated at the
// pinned tag (`npm run enums:gen`). A member the tag doesn't have fails the bundle, so a pin bump that renames or
// drops one can't break the HUD silently. Only `Enum.MEMBER` references are injected, never a whole table.
export const enumPrelude = source => {
  const used = new Map();
  for (const [, name, member] of source.matchAll(/(?<![\w$.])([A-Z]\w*)\.([A-Z][A-Z0-9_]*)\b/g)) {
    if (!Object.hasOwn(TABLES, name)) continue;
    if (!Object.hasOwn(TABLES[name], member)) {
      throw new Error(`${name}.${member} is not a member of ${name} at v${generated.GENERATED_GAME_VERSION}`);
    }
    if (!used.has(name)) used.set(name, new Set());
    used.get(name).add(member);
  }
  return [...used].sort(([a], [b]) => a.localeCompare(b)).map(([name, members]) =>
    `const ${name} = Object.freeze({ ${[...members].sort().map(m => `${m}: ${TABLES[name][m]}`).join(", ")} });`).join("\n");
};

const probe = mode => {
  const src = readFileSync(fileURLToPath(new URL("./probe.js", import.meta.url)), "utf8");
  // A block, so injecting the probe twice doesn't redeclare the enum consts in the page's global scope.
  return `{\n// ---- enums (src/enums/generated.ts, v${generated.GENERATED_GAME_VERSION})\n${enumPrelude(src)}\n${src}}\n`.replace("__MODE__", mode);
};

export const bundle = mode => {
  if (mode !== "hud" && mode !== "hud-off") return probe(mode);
  const dir = fileURLToPath(new URL("./hud/", import.meta.url));
  const files = readdirSync(dir).filter(f => f.endsWith(".js")).sort().map(f => [f, readFileSync(dir + f, "utf8")]);
  const enums = `// ---- enums (src/enums/generated.ts, v${generated.GENERATED_GAME_VERSION})\n${enumPrelude(files.map(([, s]) => s).join("\n"))}`;
  const parts = files.map(([f, s]) => `// ---- ${f}\n${s}`);
  parts.splice(1, 0, enums);
  return `// Runs in the PokéRogue page world. Draws the always-on coach panel over the game: battle plan, learn-move
// card, rewards card. Read-only: presses nothing and never changes game state. Idempotent — injecting again
// replaces the running panel. Source: skills/coach-pokerogue/scripts/hud/.
(() => {
${parts.join("\n")}
})();
`.replace("__MODE__", mode);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(bundle(process.argv[2] ?? "hud"));
