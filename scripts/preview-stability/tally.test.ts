import assert from "node:assert/strict";
import test from "node:test";
import { FAR, type Graded, missRates, NEAR, pool, report } from "./tally.ts";

const read = (
  from: number,
  wave: number,
  right: Graded["right"],
  wrong: Graded["wrong"],
  kind: string | null = null,
  rebuilt = false,
): Graded => ({ seed: "s", from, wave, kind, rebuilt, right, wrong });

test("a read counts toward its distance, and a field it never checked counts nowhere (#590)", () => {
  const rates = missRates([
    read(10, 12, ["type", "double", "levels"], ["foes"]),
    read(13, 15, ["type", "foes", "double", "levels"], []),
    read(11, 12, ["type", "foes", "double", "levels"], []),
    read(10, 17, ["type", "trainer", "foes"], ["double", "levels"]),
  ]);
  assert.deepEqual(rates[2].foes, { checked: 2, missed: 1 });
  assert.deepEqual(rates[2].trainer, { checked: 0, missed: 0 });
  assert.deepEqual(rates[1].foes, { checked: 1, missed: 0 });
  assert.deepEqual(rates[7].levels, { checked: 1, missed: 1 });
});

test("the near and far bands pool their distances, and a distance beyond either is left out (#590)", () => {
  const rates = missRates([
    read(10, 15, ["type"], []),
    read(10, 11, [], ["type"]),
    read(10, 16, [], ["type"]),
    read(10, 20, ["type"], []),
    read(10, 21, [], ["type"]),
  ]);
  assert.deepEqual(pool(rates, NEAR).type, { checked: 2, missed: 1 });
  assert.deepEqual(pool(rates, FAR).type, { checked: 2, missed: 1 });
});

test("the report tables every wave and then only the big fights, and says where a walk stopped early (#590)", () => {
  const out = report([
    read(12, 20, ["type", "foes", "double"], ["levels"], "boss"),
    read(18, 20, ["type", "foes", "double", "levels"], [], "boss"),
    read(12, 19, [], ["type", "foes", "double", "levels"]),
    { seed: "s", stopped: null, reached: 30 },
    { seed: "t", stopped: "wave 14: timed out", reached: 14 },
  ]);
  const [all, big] = out.split("### Big fights");
  assert.match(all, /^\| 7 \| 1\/1 \(100%\) \| — \| 1\/1 \(100%\) \| 1\/1 \(100%\) \| 1\/1 \(100%\) \|$/m);
  assert.match(big, /^\| 8 \| 0\/1 \(0%\) \| — \| 0\/1 \(0%\) \| 0\/1 \(0%\) \| 1\/1 \(100%\) \|$/m);
  assert.match(big, /^\| 6–10 \| 0\/1 \(0%\) \| — \| 0\/1 \(0%\) \| 0\/1 \(0%\) \| 1\/1 \(100%\) \|$/m);
  assert.doesNotMatch(big, /^\| 7 \| 1/m, "a wave that is no big fight is left out");
  assert.match(out, /2 seeds, 1 stopped early: t at wave 14 \(wave 14: timed out\)/);
});

test("a field the read already marked estimate is left out of the table of claimed fields (#590)", () => {
  const boss = { ...read(31, 40, ["type", "double", "levels"], ["foes"], "boss"), confidence: { foes: "estimate" } };
  const gym = { ...read(20, 30, ["type", "foes", "double", "levels"], ["trainer"], "gym", true), confidence: {} };
  const claimed = report([boss, gym]).split("### Big fights, fields claimed replay or exact")[1].split("###")[0];
  assert.match(claimed, /^\| 9 \| 0\/1 \(0%\) \| — \| — \| 0\/1 \(0%\) \| 0\/1 \(0%\) \|$/m);
  assert.match(claimed, /^\| 10 \| 0\/1 \(0%\) \| 1\/1 \(100%\) \| 0\/1 \(0%\) \|/m);
});

test("a big fight read across a biome change is tabled apart from one read in its own biome (#590)", () => {
  const out = report([
    read(20, 30, ["type", "foes", "double", "levels"], ["trainer"], "gym", true),
    read(21, 30, ["type", "trainer", "foes", "double", "levels"], [], "gym"),
  ]);
  const same = out.split("### Big fights, read in the fight's biome")[1].split("###")[0];
  const across = out.split("### Big fights, read across a biome change")[1];
  assert.match(same, /^\| 9 \| 0\/1 \(0%\) \| 0\/1 \(0%\) \|/m);
  assert.match(same, /^\| 10 \| — \|/m);
  assert.match(across, /^\| 10 \| 0\/1 \(0%\) \| 1\/1 \(100%\) \|/m);
  assert.match(across, /^\| 9 \| — \|/m);
});
