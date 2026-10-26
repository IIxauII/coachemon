import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BUDGET } from "../../src/solver/solver.ts";
import { searchSettings } from "./settings.ts";

test("no search flags solve on the default budget and leave the discrepancy search and the beam list to the search (#935)", () => {
  assert.deepEqual(searchSettings({}), { ok: true, settings: { budget: DEFAULT_BUDGET } });
});

test("--budget sets each beam's budget and --turns its turn limit, either one keeping the other's default (#935)", () => {
  assert.deepEqual(searchSettings({ budget: "20000", turns: "25" }), { ok: true, settings: { budget: { expansions: 20000, turns: 25 } } });
  assert.deepEqual(searchSettings({ budget: "20000" }), { ok: true, settings: { budget: { expansions: 20000, turns: 40 } } });
  assert.deepEqual(searchSettings({ turns: "25" }), { ok: true, settings: { budget: { expansions: 3000, turns: 25 } } });
});

test("a budget or turn limit that isn't a whole count above 0 is refused, naming the flag and the value (#935)", () => {
  for (const bad of ["0", "-5", "2.5", "lots", ""]) {
    assert.deepEqual(searchSettings({ budget: bad }), { ok: false, why: `--budget ${bad} is not a count` });
    assert.deepEqual(searchSettings({ turns: bad }), { ok: false, why: `--turns ${bad} is not a count` });
  }
});

test("--lds sets the discrepancy search's budget, keeping the rest of its settings, and --lds none skips it (#935)", () => {
  assert.deepEqual(searchSettings({ lds: "5000" }), {
    ok: true,
    settings: { budget: DEFAULT_BUDGET, lds: { ours: 1, alternatives: 2, discrepancies: 2, expansions: 5000 } },
  });
  assert.deepEqual(searchSettings({ lds: "none" }), { ok: true, settings: { budget: DEFAULT_BUDGET, lds: null } });
});

test("an --lds that is neither a count nor none is refused (#935)", () => {
  for (const bad of ["0", "off", "1e3.5"]) assert.deepEqual(searchSettings({ lds: bad }), { ok: false, why: `--lds ${bad} is not a count or none` });
});

test("--beams sets the beam list, each beam its width and the weight it gives our HP, in the order given (#935)", () => {
  assert.deepEqual(searchSettings({ beams: "16:0.5,8:1" }), {
    ok: true,
    settings: {
      budget: DEFAULT_BUDGET,
      portfolio: [
        { width: 16, ours: 0.5 },
        { width: 8, ours: 1 },
      ],
    },
  });
  assert.deepEqual(searchSettings({ beams: "4:0" }), { ok: true, settings: { budget: DEFAULT_BUDGET, portfolio: [{ width: 4, ours: 0 }] } });
});

test("a --beams that isn't a list of width:weight, a width a count and a weight 0 or more, is refused (#935)", () => {
  for (const bad of ["", "8", "8:", ":1", "8:x", "0:1", "2.5:1", "8:-1", "8:Infinity", "8:1,", "8:1:2"]) {
    assert.deepEqual(searchSettings({ beams: bad }), { ok: false, why: `--beams ${bad} is not a list of width:weight` });
  }
});
