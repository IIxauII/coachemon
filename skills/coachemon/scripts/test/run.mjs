// Runs every HUD scenario script against mocked game state and compares its rendered panel text with
// test/golden/<name>.txt. `--update` rewrites the golden files; review the diff — it is the behaviour change.
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
  if (update || !existsSync(golden)) { writeFileSync(golden, out); console.log(`updated ${f}`); continue; }
  if (readFileSync(golden, "utf8") === out) { console.log(`ok      ${f}`); continue; }
  failed++;
  console.log(`CHANGED ${f} — diff against golden:`);
  try { execFileSync("diff", ["-u", golden, "-"], { input: out, stdio: ["pipe", "inherit", "inherit"] }); } catch {}
}
process.exit(failed ? 1 : 0);
