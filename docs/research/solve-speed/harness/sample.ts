// Samples the machine every `every` seconds as JSON lines: load average, memory in use, the resident memory and CPU
// time of the process tree under <pid> (the solve), and the resident memory of every Chrome process. Linux and macOS.
// usage: node sample.ts <pid> <out.jsonl> [every=2]
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";

const [root, out, every = "2"] = process.argv.slice(2);
const rootPid = Number(root);

const seconds = (t: string) =>
  t
    .split(/[-:]/)
    .reverse()
    .reduce((a, x, i) => a + Number(x) * [1, 60, 3600, 86400][i], 0);

function used(): number {
  if (existsSync("/proc/meminfo")) {
    const info = Object.fromEntries(
      readFileSync("/proc/meminfo", "utf8")
        .split("\n")
        .filter(Boolean)
        .map(l => {
          const [k, v] = l.split(":");
          return [k, Number.parseInt(v, 10) * 1024];
        }),
    );
    return info.MemTotal - info.MemAvailable;
  }
  return os.totalmem() - os.freemem();
}

for (;;) {
  let rows: { pid: number; ppid: number; rss: number; cpu: number; args: string }[] = [];
  try {
    rows = execFileSync("ps", ["-eo", "pid=,ppid=,rss=,time=,args="], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map(l => {
        const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l);
        return m ? { pid: +m[1], ppid: +m[2], rss: +m[3] * 1024, cpu: seconds(m[4]), args: m[5] } : null;
      })
      .filter(r => r !== null);
  } catch {}
  const kids = new Map<number, number[]>();
  for (const r of rows) kids.set(r.ppid, [...(kids.get(r.ppid) ?? []), r.pid]);
  const tree = new Set<number>();
  const walk = (pid: number) => {
    tree.add(pid);
    for (const k of kids.get(pid) ?? []) walk(k);
  };
  walk(rootPid);
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((a, r) => a + r.rss, 0);
  const procs = rows.filter(r => tree.has(r.pid));
  appendFileSync(
    out,
    `${JSON.stringify({
      t: Date.now(),
      load: os.loadavg().map(x => +x.toFixed(2)),
      usedMb: Math.round(used() / 2 ** 20),
      solveMb: Math.round(sum(r => tree.has(r.pid)) / 2 ** 20),
      solveProcs: procs.length,
      // Cumulative CPU seconds of the processes in the tree now: a process that has ended drops out.
      solveCpuS: Math.round(procs.reduce((a, r) => a + r.cpu, 0)),
      biggestMb: Math.round(Math.max(0, ...procs.map(r => r.rss)) / 2 ** 20),
      chromeMb: Math.round(sum(r => /chrom/i.test(r.args) && !tree.has(r.pid)) / 2 ** 20),
    })}\n`,
  );
  if (!rows.some(r => r.pid === rootPid)) break;
  await new Promise(r => setTimeout(r, Number(every) * 1000));
}
