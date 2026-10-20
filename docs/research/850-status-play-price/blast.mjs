// `node docs/research/850-status-play-price/blast.mjs '<P850 json>' [test…]`: every HUD golden test run under one
// set of `prototype.patch`'s switches. Unlike `test/run.mjs` it does not stop at the first failed assertion: each test
// is run on its own, and the report gives its failed assertion (if any) and its diff against the golden. With `--soft`
// a failed assertion is printed as an `ASSERT FAIL` line and the test runs on, so everything after it shows too: each
// test is run from a copy beside it whose `assert` logs instead of throwing.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = path.join(ROOT, "skills/coachemon/scripts/test");
const argv = process.argv.slice(2);
const soft = argv.includes("--soft");
const [cfg = "{}", ...only] = argv.filter(a => a !== "--soft");
const SOFT = `import strictAssert from "node:assert/strict";
const assert = new Proxy(strictAssert, {
  apply: (t, _, a) => { try { return t(...a); } catch (e) { console.log("ASSERT FAIL: " + e.message.split("\\n")[0]); } },
  get: (t, k) => (typeof t[k] === "function" ? (...a) => { try { return t[k](...a); } catch (e) { console.log("ASSERT FAIL: " + e.message.split("\\n")[0]); } } : t[k]),
});`;
const tests = readdirSync(dir).filter(f => f.endsWith("test.mjs") && (!only.length || only.some(o => f.startsWith(o)))).sort();
const scratch = mkdtempSync(path.join(process.env.CLAUDE_JOB_DIR ? path.join(process.env.CLAUDE_JOB_DIR, "tmp") : tmpdir(), "blast-"));
for (const f of tests) {
  let file = path.join(dir, f);
  if (soft) {
    file = path.join(dir, `.soft-${f}`);
    writeFileSync(file, readFileSync(path.join(dir, f), "utf8").replace('import assert from "node:assert/strict";', SOFT));
  }
  const r = spawnSync(process.execPath, ["--no-warnings", file], { encoding: "utf8", env: { ...process.env, P850: cfg } });
  if (soft) rmSync(file);
  const out = r.stdout.split("\n").filter(l => !/localstorage/i.test(l)).join("\n");
  const golden = readFileSync(path.join(dir, "golden", f.replace(".mjs", ".txt")), "utf8");
  const failed = r.status !== 0 ? (r.stderr.match(/AssertionError[^\n]*\n(?:[^\n]*\n){0,1}/)?.[0] ?? r.stderr.split("\n").slice(0, 3).join("\n")) : null;
  const msg = r.status !== 0 ? (r.stderr.match(/AssertionError \[ERR_ASSERTION\]: ([^\n]*)/)?.[1] ?? "") : "";
  const actual = r.status !== 0 ? (r.stderr.match(/actual: ('[^\n]*'|"[^\n]*")/)?.[1] ?? "") : "";
  if (out === golden && !failed) continue;
  console.log(`\n## ${f}${failed ? ` — FAILED: ${msg}${actual ? ` (actual ${actual})` : ""}` : ""}`);
  // A failed test stops early, so only the lines it printed are compared.
  const a = path.join(scratch, "golden.txt"), b = path.join(scratch, "out.txt");
  writeFileSync(a, failed ? golden.split("\n").slice(0, out.split("\n").length - 1).join("\n") + "\n" : golden);
  writeFileSync(b, out);
  const d = spawnSync("diff", ["-U0", a, b], { encoding: "utf8" }).stdout.split("\n").filter(l => !/^(---|\+\+\+)/.test(l)).join("\n");
  if (d.trim()) console.log(d);
}
