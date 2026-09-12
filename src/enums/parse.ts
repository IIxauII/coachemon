/**
 * Parse one TypeScript enum out of PokéRogue source, in either of the two
 * forms the repo uses: `enum X { A, B = 3 }` and `const X = { A: 0 } as const`.
 * Auto-increment follows TS rules, so `ISLAND: 40` followed by `LABORATORY`
 * would read 41.
 */
export function parseEnum(source: string, name: string): [string, number][] {
  const m =
    source.match(new RegExp(`(?:export\\s+)?enum\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`)) ??
    source.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}\\s*as\\s+const`));
  if (!m) throw new Error(`enum ${name} not found`);
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const out: [string, number][] = [];
  let next = 0;
  for (const raw of body.split(",")) {
    const line = raw.trim();
    if (!line) continue;
    const mm = line.match(/^([A-Z0-9_]+)\s*(?:[=:]\s*(-?\d+))?$/);
    if (!mm) throw new Error(`cannot parse member ${JSON.stringify(line)} of ${name}`);
    const value = mm[2] === undefined ? next : Number(mm[2]);
    out.push([mm[1], value]);
    next = value + 1;
  }
  return out;
}
