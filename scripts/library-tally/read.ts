import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { STATISTICS } from "../../src/solver/capture.ts";
import type { Entry } from "./tally.ts";

/** `unread` names each line that isn't an entry, by its path under `folder`, as `<path> line <n>`. */
export function readStatistics(folder: string): { entries: Entry[]; unread: string[] } {
  const entries: Entry[] = [];
  const unread: string[] = [];
  for (const file of statisticsFiles(folder)) {
    const fight = path.basename(path.dirname(file));
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, i) => {
        if (text.trim() === "") return;
        const statistics = parsed(text);
        if (statistics) entries.push({ fight, statistics });
        else unread.push(`${path.relative(folder, file)} line ${i + 1}`);
      });
  }
  return { entries, unread };
}

function statisticsFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(e => {
      const at = path.join(folder, e.name);
      if (e.isDirectory()) return statisticsFiles(at);
      return e.isFile() && e.name === STATISTICS ? [at] : [];
    });
}

function parsed(text: string): Entry["statistics"] | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
