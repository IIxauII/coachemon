// Builds hud/35-team-plan.bench.js: a copy of 35-team-plan.js with counters, a stack profiler, knobs and exports.
// The original is never touched; every edit asserts it matched exactly once.
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL("./hud/", import.meta.url).pathname;
let s = readFileSync(dir + "35-team-plan.js", "utf8");
const sub = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${n} matches for ${a}`); s = s.replace(a, () => b); };

sub("const TP_BEAM = 24;", "let TP_BEAM = 24;");
sub("const TP_TURNS = 15;", "let TP_TURNS = 15;");
// tpFight: memo key builder and hit counting.
sub(`  const key = !over && T.memo && [mi, fi, entry, Math.round(st.oh[mi]), st.ob[mi], Math.round(st.fh[fi]), st.fs[fi], st.fb[fi], nUs, nFoe,
    ...[st.ox?.[mi], st.od?.[mi], st.og?.[mi], st.fd?.[fi], st.fg?.[fi]].map(x => Math.round((x ?? 0) * 20))].join();
  if (key && T.memo.has(key)) return T.memo.get(key);`,
`  const key = !over && T.memo && KEY(T, st, mi, fi, entry, nUs, nFoe);
  if (key) { const got = T.memo.get(key); if (got !== undefined) { C.hit++; return got; } C.miss++; } else C.nomemo++;`);
sub("export const tpFight = (T, st, mi, fi, entry, over = null) => {", "const tpFightRaw = (T, st, mi, fi, entry, over = null) => {");
sub("const tpMerge = (list, k, T, mi, fi) => {", "const tpMergeOrig = (list, k, T, mi, fi) => {");
sub("const tpValue = (T, st, end) => {", "const tpValueRaw = (T, st, end) => {");
sub("const tpSearch = (T, start, reserve, pin = null) => {", "const tpSearchRaw = (T, start, reserve, pin = null) => {");
sub("        const c = child(r);", "        C.child++;\n        const c = child(r);");

s += `
// ---- bench instrumentation ----
export const C = {};
export const SEARCH_MS = [];
export const P = {};
let PROF = false;
const stack = [];
let last = 0;
export const enter = cat => { if (!PROF) return; const now = performance.now(); if (stack.length) P[stack.at(-1)] = (P[stack.at(-1)] ?? 0) + now - last; stack.push(cat); last = now; };
export const leave = () => { if (!PROF) return; const now = performance.now(); const c = stack.pop(); P[c] = (P[c] ?? 0) + now - last; last = now; };
export const reset = prof => { for (const k of ["fight", "hit", "miss", "nomemo", "merge", "mergeN", "mergeOps", "value", "valueHit", "search", "child", "merge1", "merge1N", "merge1Max", "mergeKMax"]) C[k] = 0; for (const k in P) delete P[k]; PROF = !!prof; stack.length = 0; SEARCH_MS.length = 0; };
reset(false);

const keyOrig = (T, st, mi, fi, entry, nUs, nFoe) => [mi, fi, entry, Math.round(st.oh[mi]), st.ob[mi], Math.round(st.fh[fi]), st.fs[fi], st.fb[fi], nUs, nFoe,
  ...[st.ox?.[mi], st.od?.[mi], st.og?.[mi], st.fd?.[fi], st.fg?.[fi]].map(x => Math.round((x ?? 0) * 20))].join();
// Same string as keyOrig whenever every field is defined (always so in the plan's states).
const r20 = x => Math.round((x ?? 0) * 20);
const keyFast = (T, st, mi, fi, entry, nUs, nFoe) => \`\${mi},\${fi},\${entry},\${Math.round(st.oh[mi])},\${st.ob[mi]},\${Math.round(st.fh[fi])},\${st.fs[fi]},\${st.fb[fi]},\${nUs},\${nFoe},\${r20(st.ox?.[mi])},\${r20(st.od?.[mi])},\${r20(st.og?.[mi])},\${r20(st.fd?.[fi])},\${r20(st.fg?.[fi])}\`;
// Answer-changing: HP keyed in steps of \`q\` of max HP instead of whole HP points.
const keyCoarse = q => (T, st, mi, fi, entry, nUs, nFoe) => {
  const a = Math.round(st.oh[mi] / (T.ourMax[mi] * q)), b = Math.round(st.fh[fi] / (T.foeMax[fi] * q));
  return \`\${mi},\${fi},\${entry},\${a},\${st.ob[mi]},\${b},\${st.fs[fi]},\${st.fb[fi]},\${nUs},\${nFoe},\${r20(st.ox?.[mi])},\${r20(st.od?.[mi])},\${r20(st.og?.[mi])},\${r20(st.fd?.[fi])},\${r20(st.fg?.[fi])}\`;
};
let KEY = keyOrig;

// The same greedy closest-pair merge, same pair order and same arithmetic, with the distances kept in a matrix and
// each row's nearest later neighbour cached: O(n^2) distance evaluations in all instead of O(n^3).
const tpMergeNN = (list, k, T, mi, fi) => {
  const n = list.length;
  if (n <= k) return list.slice();
  const out = list.slice();
  const om = T.ourMax[mi], fm = T.foeMax[fi];
  const far = (a, b) => Math.abs(a.mh - b.mh) / om + Math.abs(a.fh - b.fh) / fm + (a.fs !== b.fs || a.mb !== b.mb || a.fb !== b.fb ? 1 : 0);
  const D = new Float64Array(n * n);
  const live = new Uint8Array(n).fill(1);
  const nn = new Int32Array(n).fill(-1), nd = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = far(out[i], out[j]); D[i * n + j] = d; if (d < nd[i]) { nd[i] = d; nn[i] = j; } }
  const rescan = i => { nd[i] = Infinity; nn[i] = -1; for (let j = i + 1; j < n; j++) if (live[j]) { const d = D[i * n + j]; if (d < nd[i]) { nd[i] = d; nn[i] = j; } } };
  let left = n;
  while (left > k) {
    // First i (in order) with the smallest row minimum; its first j is the original scan's first (i, j) at that distance.
    let bi = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (live[i] && nn[i] >= 0 && nd[i] < bd) { bd = nd[i]; bi = i; }
    if (bi < 0) { // every remaining distance is NaN/Infinity: the original then merges positions 0 and 1
      const idx = []; for (let i = 0; i < n && idx.length < 2; i++) if (live[i]) idx.push(i);
      bi = idx[0]; nn[bi] = idx[1];
    }
    const bj = nn[bi];
    const a = out[bi], b = out[bj];
    const p = a.p + b.p;
    const w = f => (p > 0 ? (a[f] * a.p + b[f] * b.p) / p : a[f]);
    const big = a.p >= b.p ? a : b;
    out[bi] = { ...big, p, mh: w("mh"), fh: w("fh"), ox: w("ox"), od: w("od"), og: w("og"), fd: w("fd"), fg: w("fg"), ...(a.turns != null ? { turns: w("turns") } : {}) };
    live[bj] = 0; left--;
    C.mergeOps++;
    for (let i = 0; i < bi; i++) if (live[i]) D[i * n + bi] = far(out[i], out[bi]);
    for (let j = bi + 1; j < n; j++) if (live[j]) D[bi * n + j] = far(out[bi], out[j]);
    rescan(bi);
    for (let i = 0; i < bi; i++) {
      if (!live[i]) continue;
      if (nn[i] === bi || nn[i] === bj) rescan(i);
      else { const d = D[i * n + bi]; if (d < nd[i] || (d === nd[i] && bi < nn[i])) { nd[i] = d; nn[i] = bi; } }
    }
    for (let i = bi + 1; i < bj; i++) if (live[i] && nn[i] === bj) rescan(i);
  }
  const res = [];
  for (let i = 0; i < n; i++) if (live[i]) res.push(out[i]);
  return res;
};
// nn2: tpMergeNN with the branches held column-wise and the distance buffer reused; objects are built only for the
// survivors. Same pairs, same order, same arithmetic.
let BUF = new Float64Array(1 << 16);
const tpMergeNN2 = (list, k, T, mi, fi) => {
  const n = list.length;
  if (n <= k) return list.slice();
  if (BUF.length < n * n) BUF = new Float64Array(n * n * 2);
  const D = BUF;
  const om = T.ourMax[mi], fm = T.foeMax[fi];
  const P = new Float64Array(n), MH = new Float64Array(n), FH = new Float64Array(n), OX = new Float64Array(n), OD = new Float64Array(n), OG = new Float64Array(n), FD = new Float64Array(n), FG = new Float64Array(n);
  const TU = new Array(n), FS = new Array(n), MB = new Array(n), FB = new Array(n);
  const src = new Int32Array(n), merged = new Uint8Array(n), live = new Uint8Array(n).fill(1);
  for (let i = 0; i < n; i++) { const o = list[i]; P[i] = o.p; MH[i] = o.mh; FH[i] = o.fh; OX[i] = o.ox; OD[i] = o.od; OG[i] = o.og; FD[i] = o.fd; FG[i] = o.fg; TU[i] = o.turns; FS[i] = o.fs; MB[i] = o.mb; FB[i] = o.fb; src[i] = i; }
  const far = (i, j) => Math.abs(MH[i] - MH[j]) / om + Math.abs(FH[i] - FH[j]) / fm + (FS[i] !== FS[j] || MB[i] !== MB[j] || FB[i] !== FB[j] ? 1 : 0);
  const nn = new Int32Array(n).fill(-1), nd = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = far(i, j); D[i * n + j] = d; if (d < nd[i]) { nd[i] = d; nn[i] = j; } }
  const rescan = i => { let b = Infinity, bj = -1; const row = i * n; for (let j = i + 1; j < n; j++) if (live[j]) { const d = D[row + j]; if (d < b) { b = d; bj = j; } } nd[i] = b; nn[i] = bj; };
  let left = n;
  while (left > k) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (live[i] && nn[i] >= 0 && nd[i] < bd) { bd = nd[i]; bi = i; }
    if (bi < 0) { const idx = []; for (let i = 0; i < n && idx.length < 2; i++) if (live[i]) idx.push(i); bi = idx[0]; nn[bi] = idx[1]; }
    const bj = nn[bi];
    const ap = P[bi], bp = P[bj], p = ap + bp;
    const w = A => (p > 0 ? (A[bi] * ap + A[bj] * bp) / p : A[bi]);
    const big = ap >= bp ? bi : bj;
    const tu = TU[bi] != null ? w(TU) : TU[big];
    const mh = w(MH), fh = w(FH), ox = w(OX), od = w(OD), og = w(OG), fd = w(FD), fg = w(FG);
    FS[bi] = FS[big]; MB[bi] = MB[big]; FB[bi] = FB[big]; src[bi] = src[big];
    P[bi] = p; MH[bi] = mh; FH[bi] = fh; OX[bi] = ox; OD[bi] = od; OG[bi] = og; FD[bi] = fd; FG[bi] = fg; TU[bi] = tu; merged[bi] = 1;
    live[bj] = 0; left--;
    C.mergeOps++;
    for (let i = 0; i < bi; i++) if (live[i]) D[i * n + bi] = far(i, bi);
    for (let j = bi + 1; j < n; j++) if (live[j]) D[bi * n + j] = far(bi, j);
    rescan(bi);
    for (let i = 0; i < bi; i++) {
      if (!live[i]) continue;
      if (nn[i] === bi || nn[i] === bj) rescan(i);
      else { const d = D[i * n + bi]; if (d < nd[i] || (d === nd[i] && bi < nn[i])) { nd[i] = d; nn[i] = bi; } }
    }
    for (let i = bi + 1; i < bj; i++) if (live[i] && nn[i] === bj) rescan(i);
  }
  const res = [];
  for (let i = 0; i < n; i++) {
    if (!live[i]) continue;
    if (!merged[i]) { res.push(list[i]); continue; }
    const o = { ...list[src[i]], p: P[i], mh: MH[i], fh: FH[i], ox: OX[i], od: OD[i], og: OG[i], fd: FD[i], fg: FG[i] };
    if (TU[i] !== undefined || "turns" in list[src[i]]) o.turns = TU[i];
    res.push(o);
  }
  return res;
};
let MERGE = tpMergeOrig;

const tpMerge = (list, k, T, mi, fi) => {
  C.merge++; C.mergeN += list.length;
  enter(k === 1 ? "merge1" : "mergeK"); if (k === 1) { C.merge1 = (C.merge1 ?? 0) + 1; C.merge1N = (C.merge1N ?? 0) + list.length; C.merge1Max = Math.max(C.merge1Max ?? 0, list.length); } else C.mergeKMax = Math.max(C.mergeKMax ?? 0, list.length);
  try { return MERGE(list, k, T, mi, fi); } finally { leave(); }
};
export const tpFight = (T, st, mi, fi, entry, over = null) => {
  C.fight++;
  enter(PROF && stack.at(-1) === "value" ? "fight@value" : "fight@other");
  try { return tpFightRaw(T, st, mi, fi, entry, over); } finally { leave(); }
};
// Exact-state memo of tpValue (answer-preserving: the value reads only these fields).
let VALMEMO = false;
const tpValue = (T, st, end) => {
  C.value++;
  let k = null;
  if (VALMEMO) {
    T.vmemo ??= new Map();
    k = \`\${end ? 1 : 0}|\${st.oh.join()}|\${st.ob.join()}|\${st.fh.join()}|\${st.fs.join()}|\${st.fb.join()}|\${st.ox.join()}|\${st.od.join()}|\${st.og.join()}|\${st.fd.join()}|\${st.fg.join()}|\${st.ok.join()}|\${st.fk.join()}\`;
    const got = T.vmemo.get(k);
    if (got !== undefined) { C.valueHit++; return got; }
  }
  enter("value");
  try { const v = tpValueRaw(T, st, end); if (k) T.vmemo.set(k, v); return v; } finally { leave(); }
};
const tpSearch = (T, start, reserve, pin = null) => {
  C.search++;
  enter("search");
  const t0 = performance.now();
  try { return tpSearchRaw(T, start, reserve, pin); } finally { SEARCH_MS.push(performance.now() - t0); leave(); }
};
export const knobs = (o = {}) => {
  TP_BEAM = o.beam ?? 24; TP_TURNS = o.turns ?? 15;
  MERGE = o.merge === "nn2" ? tpMergeNN2 : o.merge === "nn" ? tpMergeNN : tpMergeOrig;
  KEY = o.coarse ? keyCoarse(o.coarse) : o.key === "fast" ? keyFast : keyOrig;
  VALMEMO = !!o.valMemo;
};
export { tpModel, tpSearch, tpMergeOrig, tpMergeNN };
`;
writeFileSync(dir + "35-team-plan.bench.js", s);
console.log("wrote", dir + "35-team-plan.bench.js");
