// CPU used by the processes whose command line matches <pattern>, in cores, over <secs> seconds. Linux and macOS.
// usage: node cpu.ts <pattern> [secs=30]
import { execFileSync } from "node:child_process";

const [pattern, secs = "30"] = process.argv.slice(2);
const seconds = (t: string) =>
  t
    .split(/[-:]/)
    .reverse()
    .reduce((a, x, i) => a + Number(x) * [1, 60, 3600, 86400][i], 0);
const read = () =>
  new Map(
    execFileSync("ps", ["-eo", "pid=,time=,rss=,args="], { encoding: "utf8" })
      .split("\n")
      .map(l => /^\s*(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/.exec(l))
      .filter(m => m !== null && new RegExp(pattern).test(m[4]) && !m[4].includes("cpu.ts"))
      .map(m => [Number(m?.[1]), { cpu: seconds(m?.[2] ?? "0"), rss: Number(m?.[3]) * 1024 }]),
  );
const a = read();
const t0 = Date.now();
await new Promise(r => setTimeout(r, Number(secs) * 1000));
const b = read();
const wall = (Date.now() - t0) / 1000;
let used = 0;
for (const [pid, { cpu }] of b) used += cpu - (a.get(pid)?.cpu ?? cpu);
const rss = [...b.values()].reduce((x, p) => x + p.rss, 0);
console.log(JSON.stringify({ pattern, cores: +(used / wall).toFixed(2), rssMb: Math.round(rss / 2 ** 20), procs: b.size, wall }));
