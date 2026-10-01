import assert from "node:assert/strict";
import test from "node:test";
import { byKind, decisionsOf, watchCost, type Decision } from "./decisions.ts";

const d = (id: number, o: Partial<Decision>): Decision => ({
  id, kind: "command", card: "battle", wave: 1, at: 1000 * id, ready: 0, input: 0, drawn: 40, refreshes: 1, ms: 40, late: 0, end: 500, ...o,
});

test("a decision drained while open is counted once, from its last copy (#519)", () => {
  const open = d(1, { end: null, drawn: null });
  const ds = decisionsOf([{ stats: { decisions: [open] } }, { stats: { decisions: [d(1, {}), d(2, {})] } }]);
  assert.deepEqual(ds.map(x => [x.id, x.end, x.drawn]), [[1, 500, 40], [2, 500, 40]]);
});

test("a new overlay's ids start again, and its decisions are not merged with the last one's (#519)", () => {
  const ds = decisionsOf([{ stats: { decisions: [d(1, { at: 5000 })] } }, { stats: { decisions: [d(1, { at: 120 })] } }]);
  assert.equal(ds.length, 2);
});

test("per kind: when input opened, when the card came, how far after input, and the late block (#519)", () => {
  const [shop] = byKind([
    d(1, { kind: "reward", card: "rewards", input: 700, drawn: 40, late: 0 }),
    d(2, { kind: "reward", card: "rewards", input: 650, drawn: 900, late: 35 }),
    d(3, { kind: "reward", card: "rewards", input: null, drawn: null, late: 0 }),
  ]);
  assert.deepEqual([shop.n, shop.notDrawn, shop.lateInput, shop.drawn?.max, shop.afterInput?.max, shop.late], [3, 1, 1, 900, 250, { ms: 35, n: 1, max: 35 }]);
});

test("the watch's read is reported per frame, in µs (#519)", () => {
  assert.deepEqual(watchCost([{ stats: { watch: { frames: 3000, ms: 6 } } }, { stats: {} }]), { frames: 3000, usPerFrame: 2 });
});
