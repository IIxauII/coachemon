import { readFileSync } from "node:fs";
const files = process.argv.slice(2);
const by = new Map(); const seen = new Set();
for (const f of files) for (const line of readFileSync(f, "utf8").split("\n")) {
  if (!line.includes('"window"')) continue;
  let r; try { r = JSON.parse(line); } catch { continue; }
  for (const t of r.stats?.ticks ?? []) {
    const id = f + t.seq; if (seen.has(id)) continue; seen.add(id);
    const k = `${t.kind ?? "-"}|${t.drew ? "drew" : "held"}`;
    if (!by.has(k)) by.set(k, { ms: [], stages: {} });
    const b = by.get(k); b.ms.push(t.ms);
    for (const [s, v] of Object.entries(t.stages ?? {})) (b.stages[s] ??= []).push(v);
  }
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rows = [...by].sort((a, b) => b[1].ms.length - a[1].ms.length);
for (const [k, b] of rows) {
  const st = Object.entries(b.stages).map(([s, v]) => `${s}:${q(v, .5)}/${q(v, .95)}`).filter(x => !/:0\/0$/.test(x)).join(" ");
  console.log(k.padEnd(22), String(b.ms.length).padStart(5), `p50 ${q(b.ms,.5)} p95 ${q(b.ms,.95)} max ${Math.max(...b.ms)}`.padEnd(28), st);
}
