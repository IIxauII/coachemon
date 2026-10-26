import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readStatistics } from "./read.ts";

const GORDIE = "Zu5cgKRQ0vigLcOhpJxYMUa0-w180-gordie";
const ETERNATUS = "Zu5cgKRQ0vigLcOhpJxYMUa0-w200-eternatus";

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "coachemon-tally-"));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const line = (turn: number) => JSON.stringify({ schema: 1, turn, ended: { kind: "oracle_line" } }) + "\n";

test("every statistics file under a home, waiting and imported alike, is read with the fight folder it sits in (#948)", () => {
  const home = tree({
    [`fights/${GORDIE}/statistics.jsonl`]: line(1) + line(4),
    [`fights/${GORDIE}/turn-1.json`]: "{}",
    [`fights-imported/2026-10-20T10-00-00.000Z/${ETERNATUS}/statistics.jsonl`]: line(1),
  });
  const { entries, unread } = readStatistics(home);
  assert.deepEqual(
    entries.map(e => [e.fight, e.statistics.turn]),
    [
      [GORDIE, 1],
      [GORDIE, 4],
      [ETERNATUS, 1],
    ],
  );
  assert.deepEqual(unread, []);
});

test("a line that doesn't read as an entry is named and skipped, and the rest of its file still counts (#948)", () => {
  const library = tree({ [`${GORDIE}/statistics.jsonl`]: line(1) + '{"schema":1,"tur\n' + "\n" + line(3) });
  const { entries, unread } = readStatistics(library);
  assert.deepEqual(
    entries.map(e => e.statistics.turn),
    [1, 3],
  );
  assert.deepEqual(unread, [`${GORDIE}/statistics.jsonl line 2`]);
});
