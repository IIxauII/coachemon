// Every `*test.mjs` here is also a golden test: its stdout must equal `golden/<name>.txt`. `--update` rewrites the
// goldens, and their diff is the behaviour change to review. `--update <name>…` rewrites only the named ones and checks
// the rest, so a new golden can be written beside goldens nobody may touch.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const tests = readdirSync(dir).filter(f => f.endsWith("test.mjs")).sort();
const args = process.argv.slice(2);
const update = args.includes("--update");
const named = args.filter(a => !a.startsWith("--")).map(a => a.replace(/\.(mjs|txt)$/, "") + ".mjs");
const unknown = named.filter(f => !tests.includes(f));
if (unknown.length) {
  console.log(`no such test: ${unknown.join(", ")}`);
  process.exit(2);
}
if (named.length && !update) {
  console.log("test names are taken only with --update");
  process.exit(2);
}
const rewrites = f => update && (!named.length || named.includes(f));
let failed = 0;
for (const f of tests) {
  const out = execFileSync(process.execPath, ["--no-warnings", dir + f], { encoding: "utf8" })
    .split("\n").filter(l => !/localstorage/i.test(l)).join("\n");
  const golden = `${dir}golden/${f.replace(".mjs", ".txt")}`;
  if (rewrites(f)) { writeFileSync(golden, out); console.log(`updated ${f}`); continue; }
  if (!existsSync(golden)) {
    failed++;
    console.log(`MISSING ${f} — no golden at ${golden.slice(dir.length)}; run \`node test/run.mjs --update ${f.replace(".mjs", "")}\` and commit it`);
    continue;
  }
  if (readFileSync(golden, "utf8") === out) { console.log(`ok      ${f}`); continue; }
  failed++;
  console.log(`CHANGED ${f} — diff against golden:`);
  try { execFileSync("diff", ["-u", golden, "-"], { input: out, stdio: ["pipe", "inherit", "inherit"] }); } catch {}
}
process.exit(failed ? 1 : 0);
