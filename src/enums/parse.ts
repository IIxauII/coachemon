/**
 * Parse one TypeScript enum out of PokéRogue source, in any of the three
 * forms the repo uses: `enum X { A, B = 3 }`, `const X = { A: 0 } as const`
 * and `const X = Object.freeze({ A: 0 })`. A value is an integer literal or a
 * bit flag `1 << n`. Auto-increment follows TS rules, so `ISLAND: 40` followed
 * by `LABORATORY` would read 41.
 */
export function parseEnum(source: string, name: string): [string, number][] {
  const m =
    source.match(new RegExp(`(?:export\\s+)?enum\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`)) ??
    source.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}\\s*as\\s+const`)) ??
    source.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*Object\\.freeze\\(\\{([\\s\\S]*?)\\n\\}\\)`));
  if (!m) throw new Error(`enum ${name} not found`);
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const out: [string, number][] = [];
  let next = 0;
  for (const raw of body.split(",")) {
    const line = raw.trim();
    if (!line) continue;
    const mm = line.match(/^([A-Z0-9_]+)\s*(?:[=:]\s*(?:(-?\d+)|1\s*<<\s*(\d+)))?$/);
    if (!mm) throw new Error(`cannot parse member ${JSON.stringify(line)} of ${name}`);
    const value = mm[2] !== undefined ? Number(mm[2]) : mm[3] !== undefined ? 1 << Number(mm[3]) : next;
    out.push([mm[1], value]);
    next = value + 1;
  }
  return out;
}
