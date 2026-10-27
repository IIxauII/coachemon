import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { checkoutOf } from "../clone-test/clone-test.ts";

/** `command` runs through the shell, from the repo root. */
export type Step = { name: string; command: string; env?: Record<string, string> };
export type StepResult = { name: string; ok: boolean; ms: number; log: string };

export const logsAt = (version: string): string => path.join(".cache/bump-suite", `v${version}`);

/**
 * The suite at a game version, but for the stamp's harness re-check (`drift:check --stamp`) and the live MCP run. The
 * clone steps read `COACHEMON_GAME_VERSION`, so the drift checkout at `version` must already be provisioned (pin-bump.md).
 */
export const steps = (version: string): Step[] => {
  const at = { COACHEMON_GAME_VERSION: version };
  const [unit, goldens] = pkg.scripts.test.split(" && ");
  return [
    { name: "typecheck", command: "npm run typecheck" },
    { name: "unit tests", command: unit },
    { name: "HUD goldens", command: goldens },
    {
      name: "enums:gen --check",
      command: `npm run enums:gen -- --check --version ${version} --source ${checkoutOf(version)}`,
    },
    { name: "clone:smoke", command: "npm run clone:smoke", env: at },
    { name: "oracle:encounter", command: "npm run oracle:encounter", env: at },
    { name: "oracle:combatant", command: "npm run oracle:combatant", env: at },
    {
      name: "oracle:preview",
      command: `npm run oracle:preview -- --out ${path.join(logsAt(version), "preview-stability.json")}`,
      env: at,
    },
  ];
};

const TAIL = 40;

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};

const run = (step: Step, log: string): Promise<boolean> =>
  new Promise(resolve => {
    const out = createWriteStream(log);
    const child = spawn(step.command, { shell: true, env: { ...process.env, ...step.env }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    child.on("error", err => out.write(`\n${err.message}\n`));
    child.on("close", code => out.end(() => resolve(code === 0)));
  });

/** Runs every step whatever came before it, so one run names every failure; a step's output goes to its log alone. */
export async function runSuite(all: Step[], { logs, print }: { logs: string; print: (line: string) => void }): Promise<StepResult[]> {
  mkdirSync(logs, { recursive: true });
  const results: StepResult[] = [];
  for (const [i, step] of all.entries()) {
    const log = path.join(logs, `${String(i + 1).padStart(2, "0")}-${step.name.replace(/[^\w-]+/g, "-")}.log`);
    print(`… ${step.name}: ${step.command}`);
    const started = Date.now();
    const ok = await run(step, log);
    const result = { name: step.name, ok, ms: Date.now() - started, log };
    results.push(result);
    print(`${ok ? "PASS" : "FAIL"}  ${step.name}  ${clock(result.ms)}  ${log}`);
    if (!ok) {
      const lines = readFileSync(log, "utf8").trimEnd().split("\n");
      print(lines.slice(-TAIL).map(line => `    ${line}`).join("\n"));
    }
  }
  print("\nbump:suite summary:");
  for (const r of results) print(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(18)} ${clock(r.ms).padStart(7)}  ${r.log}`);
  return results;
}
