/**
 * Turns the catch cards the lag runs logged (`.cache/lag-run/*.jsonl`) into corpus cases: one per wild foe per wave,
 * the party as the wave record last listed it, and what the card said at the time as `recorded`.
 *
 * The log keeps only species and level for the party, so the replay fills moves from the game's own level-up moveset.
 * It logs a catch card only when the verdict was not `skip`, so these cases lean towards "worth catching".
 *
 *   node scripts/newcomer-corpus/extract-lag-run.ts > scripts/newcomer-corpus/cases/lag-run.json
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(".cache/lag-run");

type Recorded = { verdict: string; replaces: string | null; team: string[]; account: string[] };
type Case = {
  id: string;
  source: { kind: "lag-run"; file: string; line: number };
  offer: "catch";
  wave: number;
  party: { species: string; level: number }[];
  newcomer: { species: string; level: number; types: string[] };
  recorded: Recorded;
};

/** The game's `SpeciesId` key for a display name: `Mr. Mime` → `MR_MIME`. */
export const speciesKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[.'’:]/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

const TYPES = new Set(["Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel", "Fire", "Water",
  "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark", "Fairy"]);

const cases: Case[] = [];
const seen = new Set<string>();
for (const file of readdirSync(DIR).filter(f => f.endsWith(".jsonl")).sort()) {
  let party: Record<string, number> | null = null;
  readFileSync(path.join(DIR, file), "utf8").split("\n").forEach((raw, i) => {
    let d: any;
    try { d = JSON.parse(raw); } catch { return; }
    if (d.kind === "wave") { party = d.levels ?? null; return; }
    const text: string = d.text ?? "";
    if (d.call !== "read_card" || !party) return;
    const lines = text.split("\n");
    const head = lines.find(l => l.startsWith("Catch: "));
    if (!head) return;
    const m = /^Catch: (catch|maybe|skip) (.+?)(?: — .*)?$/.exec(head);
    if (!m) return;
    const [, verdict, name] = m;
    // `Taillow Taillow L7 Normal Flying 100% …`: the sprite's label, then the name, level and types.
    const foe = lines.map(l => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} L(\\d+) (.*)$`).exec(l)).find(Boolean);
    if (!foe) return;
    const key = `${file}|${d.wave}|${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    // The types end where the HP percentage starts: after it come the weakness, ability and move markers.
    const tokens = foe[2].split(" ");
    const hpAt = tokens.findIndex(t => t.endsWith("%"));
    const types = tokens.slice(0, hpAt < 0 ? 2 : hpAt).filter(t => TYPES.has(t));
    const reasons = (kind: string) => lines.filter(l => l.startsWith(`· ${kind} `)).map(l => l.slice(kind.length + 3));
    const team = reasons("team");
    const replaced = team.map(t => /^party full: replaces (.+)$/.exec(t)?.[1]).find(Boolean) ?? null;
    cases.push({
      id: `lag-${file.replace(/\.jsonl$/, "").replace(/\d{4}-(\d\d)-(\d\d)T(\d\d)-(\d\d)[-\d]*Z?$/, "$1$2T$3$4")}-w${d.wave}-${speciesKey(name).toLowerCase()}`,
      source: { kind: "lag-run", file, line: i + 1 },
      offer: "catch",
      wave: d.wave,
      party: Object.entries(party as Record<string, number>).map(([sp, level]) => ({ species: speciesKey(sp), level })),
      newcomer: { species: speciesKey(name), level: Number(foe[1]), types },
      recorded: { verdict, replaces: replaced, team: team.filter(t => !t.startsWith("party full:")), account: reasons("account") },
    });
  });
}
console.log(JSON.stringify(cases, null, 1));
