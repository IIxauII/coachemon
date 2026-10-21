// `scene-trace.mjs <test> <scene regex> [P850 json]`: runs a HUD golden test with the prototype's plan trace on and
// prints, for the scenes whose `== ` header matches, every plan the field search scored (best first). A test's header
// is logged after its render, so a scene's plans are the ones pushed since the previous header.
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const [test, scene, cfg = "{}"] = process.argv.slice(2);
process.env.P850 = cfg;
const want = new RegExp(scene);
const log = console.log;
globalThis.__p862plans = [];
globalThis.__p862trace = [];
// Each render evaluates the bundle, which assigns `globalThis.__hud`: that marks where a render's plans begin.
let hud, renderAt = 0, from = 0;
Object.defineProperty(globalThis, "__hud", { configurable: true, get: () => hud, set: v => { hud = v; renderAt = globalThis.__p862plans.length; } });
const r2 = v => (v == null ? "—" : (Math.round(v * 100) / 100).toFixed(2));
const tgt = t => (typeof t === "number" ? `foe ${t}` : t ?? "");
console.log = (...a) => {
  const line = String(a[0] ?? "");
  const head = line.match(/^== (.*)/);
  if (head) {
    const title = head[1].split("\n")[0];
    // The scene's own render: the last one before its header.
    const plans = globalThis.__p862plans.slice(Math.max(from, renderAt));
    from = globalThis.__p862plans.length;
    if (want.test(title)) {
      log(`\n### ${title}\n\n| Plan score | Slot | Move → target | Slot score | Redirect | Joint |\n| --- | --- | --- | --- | --- | --- |`);
      const seen = new Set();
      for (const p of plans.filter(p => p.swaps === 0).sort((a, b) => b.score - a.score)) {
        const k = p.picks.map(q => `${q.me}:${q.move}:${q.target}`).join("|");
        if (seen.has(k)) continue;
        seen.add(k);
        p.picks.forEach((q, i) => log(`| ${i ? "" : r2(p.score)} | ${q.me} | ${q.move} → ${tgt(q.target)}${q.play ? " (play)" : ""} | ${r2(q.score)} | ${q.redir > 0 ? `${r2(q.redir)} × ${r2(q.redirScore)}` : ""} | ${i ? "" : r2(p.jv)} |`));
        if (seen.size >= 6) break;
      }
    }
  }
};
// The soft copy logs a failed assertion instead of throwing, so the scenes after it still run.
const { readFileSync, writeFileSync, rmSync } = await import("node:fs");
const dir = path.join(ROOT, "skills/coachemon/scripts/test");
const SOFT = `import strictAssert from "node:assert/strict";
const assert = new Proxy(strictAssert, {
  apply: (t, _, a) => { try { return t(...a); } catch (e) { console.log("ASSERT FAIL: " + e.message.split("\\n")[0]); } },
  get: (t, k) => (typeof t[k] === "function" ? (...a) => { try { return t[k](...a); } catch (e) { console.log("ASSERT FAIL: " + e.message.split("\\n")[0]); } } : t[k]),
});`;
const copy = path.join(dir, `.trace-${test}.mjs`);
writeFileSync(copy, readFileSync(path.join(dir, `${test}.mjs`), "utf8").replace('import assert from "node:assert/strict";', SOFT));
try { await import(copy); } finally { rmSync(copy, { force: true }); }
