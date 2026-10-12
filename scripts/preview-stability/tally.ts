/**
 * Miss rates of graded preview reads, by how many waves ahead each was read (#590). The grading is the HUD's own
 * (`previewGrade`), so a field counts here exactly where the in-game tally would score it.
 */
export const FIELDS = ["type", "trainer", "foes", "double", "levels"] as const;
export type Field = (typeof FIELDS)[number];

/**
 * One read of wave `wave`, taken at `from`, graded when the game played it. `kind` is the calendar's big-fight kind,
 * and `rebuilt` whether a new arena came between the read and the wave (`arenaRebuiltBetween`).
 */
export type Graded = {
  seed: string;
  from: number;
  wave: number;
  kind: string | null;
  rebuilt: boolean;
  right: Field[];
  wrong: Field[];
  confidence?: Partial<Record<Field, string | null>>;
};

export type Stop = { seed: string; stopped: string | null; reached: number };

export type Rate = { checked: number; missed: number };
export type Rates = Record<number, Record<Field, Rate>>;

const row = (): Record<Field, Rate> =>
  Object.fromEntries(FIELDS.map(f => [f, { checked: 0, missed: 0 }])) as Record<Field, Rate>;

export const missRates = (reads: Graded[]): Rates => {
  const rates: Rates = {};
  for (const r of reads) {
    const at = (rates[r.wave - r.from] ??= row());
    for (const f of r.right) at[f].checked++;
    for (const f of r.wrong) {
      at[f].checked++;
      at[f].missed++;
    }
  }
  return rates;
};

export const NEAR = [1, 5] as const;
export const FAR = [6, 10] as const;

export const pool = (rates: Rates, [lo, hi]: readonly [number, number]): Record<Field, Rate> => {
  const out = row();
  for (let d = lo; d <= hi; d++) {
    for (const f of FIELDS) {
      out[f].checked += rates[d]?.[f].checked ?? 0;
      out[f].missed += rates[d]?.[f].missed ?? 0;
    }
  }
  return out;
};

const cell = ({ checked, missed }: Rate) =>
  checked ? `${missed}/${checked} (${Math.round((missed / checked) * 100)}%)` : "—";
const line = (label: string, r: Record<Field, Rate>) => `| ${label} | ${FIELDS.map(f => cell(r[f])).join(" | ")} |`;
const table = (reads: Graded[]) => {
  const rates = missRates(reads);
  return [
    `| waves ahead | ${FIELDS.join(" | ")} |`,
    `|---|${FIELDS.map(() => "---").join("|")}|`,
    ...Array.from({ length: FAR[1] }, (_, i) => line(String(i + 1), rates[i + 1] ?? row())),
    line(`${NEAR[0]}–${NEAR[1]}`, pool(rates, NEAR)),
    line(`${FAR[0]}–${FAR[1]}`, pool(rates, FAR)),
  ].join("\n");
};

const claimed = (r: Graded): Graded => {
  const kept = (f: Field) => r.confidence?.[f] !== "estimate";
  return { ...r, right: r.right.filter(kept), wrong: r.wrong.filter(kept) };
};

/** A cell is misses over reads graded, and "—" where no read graded that field. */
export const report = (records: (Graded | Stop)[]): string => {
  const reads = records.filter((r): r is Graded => "from" in r);
  const stops = records.filter((r): r is Stop => "reached" in r);
  const early = stops.filter(s => s.stopped);
  return [
    `${stops.length} seeds, ${early.length} stopped early${early.length ? ": " : ""}` +
      early.map(s => `${s.seed} at wave ${s.reached} (${s.stopped})`).join("; "),
    "",
    "### Every wave",
    table(reads),
    "",
    "### Big fights",
    table(reads.filter(r => r.kind)),
    "",
    "### Big fights, read in the fight's biome",
    table(reads.filter(r => r.kind && !r.rebuilt)),
    "",
    "### Big fights, read across a biome change",
    table(reads.filter(r => r.kind && r.rebuilt)),
    "",
    "### Big fights, fields claimed replay or exact",
    table(reads.filter(r => r.kind).map(claimed)),
  ].join("\n");
};
