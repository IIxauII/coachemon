import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { loadable, SHIPPED } from "./plugin-skills.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The repo's plugin surface alone: its manifests and `skills/`, copied so a case can add to it. */
const copy = (t: TestContext): string => {
  const root = mkdtempSync(path.join(tmpdir(), "coach-plugin-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(path.join(REPO, ".claude-plugin"), path.join(root, ".claude-plugin"), { recursive: true });
  for (const skill of SHIPPED) {
    mkdirSync(path.join(root, skill), { recursive: true });
    writeFileSync(path.join(root, skill, "SKILL.md"), "---\nname: x\n---\n");
  }
  return root;
};

const skill = (root: string, dir: string) => {
  mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, dir, "SKILL.md"), "---\nname: x\n---\n");
};

const manifest = (root: string, file: "plugin.json" | "marketplace.json", edit: (json: any) => void) => {
  const at = path.join(root, ".claude-plugin", file);
  const json = JSON.parse(readFileSync(at, "utf8"));
  edit(json);
  writeFileSync(at, JSON.stringify(json));
};

test("the plugin loads only the shipped skills, never .claude/skills/pin-bump (#711)", () => {
  assert.deepEqual(loadable(REPO), [...SHIPPED]);
});

test("a skill directory added under skills/ is loadable", t => {
  const root = copy(t);
  skill(root, "skills/pin-bump");
  assert.deepEqual(loadable(root), [...SHIPPED, "skills/pin-bump"].sort());
});

test("plugin.json's skills key adds a directory of skills, or one skill, to skills/", t => {
  const root = copy(t);
  skill(root, ".claude/skills/pin-bump");
  skill(root, "extra/one");
  manifest(root, "plugin.json", json => (json.skills = ["./.claude/skills/", "./extra/one"]));
  assert.deepEqual(loadable(root), [".claude/skills/pin-bump", "extra/one", ...SHIPPED].sort());
});

test("plugin.json's skills key as one string", t => {
  const root = copy(t);
  skill(root, ".claude/skills/pin-bump");
  manifest(root, "plugin.json", json => (json.skills = "./.claude/skills/pin-bump"));
  assert.deepEqual(loadable(root), [".claude/skills/pin-bump", ...SHIPPED].sort());
});

test("a marketplace entry's skills key is loadable too", t => {
  const root = copy(t);
  skill(root, ".claude/skills/pin-bump");
  manifest(root, "marketplace.json", json => (json.plugins[0].skills = ["./.claude/skills/"]));
  assert.ok(loadable(root).includes(".claude/skills/pin-bump"));
});

test("a command loads as a skill does, from commands/ or the commands key", t => {
  const root = copy(t);
  mkdirSync(path.join(root, "commands"));
  writeFileSync(path.join(root, "commands/pin-bump.md"), "bump");
  assert.ok(loadable(root).includes("commands/pin-bump.md"));
  manifest(root, "plugin.json", json => (json.commands = { bump: { source: "./other/bump.md" }, about: { content: "hi" } }));
  assert.deepEqual(
    loadable(root).filter(s => !SHIPPED.includes(s)),
    ["commands: about", "other/bump.md"],
  );
});

test("a SKILL.md at the plugin root loads as one skill when nothing else names skills", t => {
  const root = mkdtempSync(path.join(tmpdir(), "coach-plugin-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "SKILL.md"), "x");
  assert.deepEqual(loadable(root), ["."]);
});
