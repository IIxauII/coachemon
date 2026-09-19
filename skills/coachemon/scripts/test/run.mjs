// Runs every HUD scenario script against mocked game state and compares its rendered panel text with
// test/golden/<name>.txt. `--update` rewrites the golden files; review the diff — it is the behaviour change.
// A golden that is absent is a failure, not a pass: a new scenario's first run says to pass `--update` once.
// Usage: node test/run.mjs [--update]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const update = process.argv.includes("--update");
let failed = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith("test.mjs")).sort()) {
  const out = execFileSync(process.execPath, ["--no-warnings", dir + f], { encoding: "utf8" })
    .split("\n").filter(l => !/localstorage/i.test(l)).join("\n");
  const golden = `${dir}golden/${f.replace(".mjs", ".txt")}`;
  if (update) { writeFileSync(golden, out); console.log(`updated ${f}`); continue; }
  if (!existsSync(golden)) {
    failed++;
    console.log(`MISSING ${f} — no golden at golden/${f.replace(".mjs", ".txt")}; run \`node test/run.mjs --update\` and commit it`);
    continue;
  }
  if (readFileSync(golden, "utf8") === out) { console.log(`ok      ${f}`); continue; }
  failed++;
  console.log(`CHANGED ${f} — diff against golden:`);
  try { execFileSync("diff", ["-u", golden, "-"], { input: out, stdio: ["pipe", "inherit", "inherit"] }); } catch {}
}
process.exit(failed ? 1 : 0);
