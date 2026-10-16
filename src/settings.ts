import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Settings = { solving: boolean };

const file = (home: string) => path.join(home, "settings.json");

export function readSettings(home: string): Settings {
  try {
    const stored = JSON.parse(readFileSync(file(home), "utf8")) as Partial<Settings>;
    return { solving: stored.solving === true };
  } catch {
    return { solving: false };
  }
}

export function writeSettings(home: string, settings: Settings): void {
  mkdirSync(home, { recursive: true });
  writeFileSync(file(home), JSON.stringify(settings) + "\n");
}
