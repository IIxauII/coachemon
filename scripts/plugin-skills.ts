/**
 * What the plugin at `root` lets Claude load as a skill, commands included, by the loader's rules
 * (https://code.claude.com/docs/en/plugins/manifest-reference.md). Paths are relative to `root`; an inline command is
 * `commands: <name>`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The repo-only skills under `.claude/skills/` must never join these (#711). */
export const SHIPPED: readonly string[] = ["skills/coachemon", "skills/play-pokerogue"];

type Paths = string | string[] | undefined;
type Commands = Paths | Record<string, { source?: string; content?: string }>;
type Components = { skills?: Paths; commands?: Commands };

export function loadable(root: string): string[] {
  const read = (file: string) => {
    const at = path.join(root, ".claude-plugin", file);
    return existsSync(at) ? JSON.parse(readFileSync(at, "utf8")) : undefined;
  };
  const plugin: Components = read("plugin.json") ?? {};
  const entries: Components[] = read("marketplace.json")?.plugins ?? [];
  const found = new Set<string>();
  const rel = (p: string) => path.relative(root, path.resolve(root, p)).split(path.sep).join("/") || ".";
  const isDir = (p: string) => existsSync(path.join(root, p)) && statSync(path.join(root, p)).isDirectory();

  const skillsIn = (dir: string) => {
    if (!isDir(dir)) return;
    if (existsSync(path.join(root, dir, "SKILL.md"))) return void found.add(rel(dir));
    for (const name of readdirSync(path.join(root, dir))) {
      if (existsSync(path.join(root, dir, name, "SKILL.md"))) found.add(rel(path.join(dir, name)));
    }
  };
  const list = (p: Paths) => (p === undefined ? [] : Array.isArray(p) ? p : [p]);
  const skillKeys = [plugin, ...entries].flatMap(c => list(c.skills));
  const rootSkill = !isDir("skills") && skillKeys.length === 0 && existsSync(path.join(root, "SKILL.md"));
  if (rootSkill) found.add(".");
  skillsIn("skills");
  for (const dir of skillKeys) skillsIn(dir);

  const commandsAt = (p: string) => {
    if (!isDir(p)) return void (existsSync(path.join(root, p)) && found.add(rel(p)));
    for (const entry of readdirSync(path.join(root, p), { recursive: true, encoding: "utf8" })) {
      if (entry.endsWith(".md")) found.add(rel(path.join(p, entry)));
    }
  };
  const commands = (c: Commands) => {
    if (c === undefined || typeof c === "string" || Array.isArray(c)) return list(c).forEach(commandsAt);
    for (const [name, { source }] of Object.entries(c)) found.add(source === undefined ? `commands: ${name}` : rel(source));
  };
  // A `commands` key replaces the default `commands/` scan; an entry's is appended to the manifest's.
  if (plugin.commands === undefined) commandsAt("commands");
  for (const c of [plugin, ...entries]) commands(c.commands);

  return [...found].sort();
}
