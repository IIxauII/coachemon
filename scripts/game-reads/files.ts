import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export type AreaName = "page" | "server" | "hud" | "harness";

const listed = (root: string, dir: string, keep: (f: string) => boolean): string[] =>
  readdirSync(path.join(root, dir)).filter(keep).sort().map(f => `${dir}/${f}`);

const product = (f: string) => /\.(?:ts|js|mjs)$/.test(f) && !/\.test\.ts$|^fake-/.test(f);

/** Every file that runs in the page or reads what it hands back, by area: the files `reads:check` scans. */
export function scannedFiles(root: string): Record<AreaName, string[]> {
  return {
    page: listed(root, "src/page", product),
    server: ["src/driver.ts", "src/screen.ts", "src/slots.ts", "src/call-outcome.ts", "src/stuck/hang.ts", "src/game/save.ts"],
    hud: [...listed(root, "skills/coachemon/scripts/hud", f => f.endsWith(".js")), "skills/coachemon/scripts/probe.js"],
    harness: ["src/solver/harness.test.ts.template"],
  };
}

/**
 * Our own product code, whose declarations make a name ours. Tests, fakes and fixtures are left out: they build stand-ins
 * for game objects, and a game name they declare would pass as ours. The generated enums are the game's.
 */
export function ownFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(path.join(root, dir))) {
      const rel = `${dir}/${f}`;
      if (statSync(path.join(root, rel)).isDirectory()) {
        if (f !== "test" && f !== "fixtures" && f !== "node_modules") walk(rel);
      } else if (product(f) && rel !== "src/enums/generated.ts") out.push(rel);
    }
  };
  walk("src");
  walk("skills/coachemon/scripts");
  out.push("src/solver/harness.test.ts.template");
  return out.sort();
}
