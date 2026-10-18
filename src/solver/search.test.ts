import assert from "node:assert/strict";
import { test } from "node:test";
import { noAnswer } from "./no-answer.ts";
import type { Beam, Input, Outcome, ReplayResult } from "./oracle-line.ts";
import { type Action, type Child, type Pool, type Position, type Progress, search } from "./search.ts";

/** What a move does from a path: our side's HP fraction and the foe's total HP lost so far, or how the fight ends. */
type Play = (path: readonly string[], move: string) => { foeLost: number; ours: number } | "won" | "lost";

const move = (name: string): Input => ({ kind: "move", move: name as Input extends { move: infer M } ? M : never, tera: false });
const named = (action: Action) => (action?.kind === "move" ? action.move : "wait");

/** A one-on-one fight played by a table; every path is its own position, so nothing merges. */
function fight(moves: readonly string[], play: Play) {
  const position = (path: readonly string[], foeLost: number, ours: number): Position => ({
    sig: path.join(" "),
    hp: { foes: [1 - foeLost], ours: [ours] },
    legal: moves.map(move),
    forkPoint: JSON.stringify(path),
  });
  const expanded: { from: string[]; inputs: string[] }[] = [];
  const pool: Pool = {
    size: 1,
    async expand(forkPoint, inputs) {
      const from: string[] = JSON.parse(forkPoint);
      expanded.push({ from, inputs: inputs.map(named) });
      return inputs.map((input): Child => {
        const played = play(from, named(input));
        if (played === "won" || played === "lost") return { input, end: played, hp: { foes: [0], ours: [0.5] } };
        return { input, end: "on", at: position([...from, named(input)], played.foeLost, played.ours) };
      });
    },
  };
  return { root: position([], 0, 1), pool, expanded };
}

/** A fight played by a tree: each path names its moves' results, and a move it doesn't name loses. */
const tree = (moves: readonly string[], table: Record<string, Record<string, [number, number] | "won" | "lost">>) =>
  fight(moves, (path, name) => {
    const played = table[path.join(" ")]?.[name] ?? "lost";
    return typeof played === "string" ? played : { foeLost: played[0], ours: played[1] };
  });

const replayed = (outcome: Outcome): ReplayResult => ({
  kind: "replayed",
  replay: { confidence: "replay", outcome, steps: [], receipt: [], luck: [] },
});

const replaysAll = () => {
  const asked: string[][] = [];
  return {
    asked,
    validate: async (inputs: readonly Input[]) => {
      asked.push(inputs.map(named));
      return replayed("won");
    },
  };
};

const BUDGET = { expansions: 3000, turns: 40 };
const NARROW: Beam[] = [
  { width: 1, ours: 0.5 },
  { width: 1, ours: 1 },
];

test("a solve stops at the first win that replays, and expands nothing after it (#662)", async () => {
  const { root, pool, expanded } = tree(["TACKLE", "GROWL"], {
    "": { TACKLE: [0.5, 1], GROWL: [0, 1] },
    TACKLE: { TACKLE: "won", GROWL: [0.5, 1] },
  });
  const { asked, validate } = replaysAll();

  const result = await search({ root, pool, validate, budget: BUDGET });
  const expandedThen = expanded.length;
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(result.kind, "found");
  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["TACKLE", "TACKLE"]);
  assert.deepEqual(asked, [["TACKLE", "TACKLE"]]);
  assert.equal(expanded.length, expandedThen);
});

test("a win that doesn't replay is never returned, and the search goes on to one that does (#662)", async () => {
  const { root, pool } = tree(["TACKLE", "EMBER"], {
    "": { TACKLE: [0.5, 1], EMBER: [0.4, 1] },
    TACKLE: { TACKLE: "won", EMBER: [0.6, 1] },
    EMBER: { TACKLE: [0.6, 1], EMBER: [0.6, 1] },
    "TACKLE EMBER": { EMBER: "won" },
  });
  const asked: string[][] = [];
  const validate = async (inputs: readonly Input[]) => {
    asked.push(inputs.map(named));
    return replayed(inputs.length === 2 ? "lost" : "won");
  };

  const result = await search({ root, pool, validate, budget: BUDGET, portfolio: [{ width: 1, ours: 0.5 }] });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["TACKLE", "EMBER", "EMBER"]);
  assert.deepEqual(asked[0], ["TACKLE", "TACKLE"]);
});

test("a win that hits an illegal step on replay is passed over like one that lost (#662)", async () => {
  const { root, pool } = tree(["TACKLE"], { "": { TACKLE: "won" } });
  const validate = async () =>
    noAnswer({ code: "illegal_step", index: 0, turn: 1, why: "isn't offered", tried: move("TACKLE"), legal: [] });

  const result = await search({ root, pool, validate, budget: BUDGET, portfolio: [{ width: 1, ours: 0.5 }] });

  assert.equal(result.kind, "no_answer");
  assert.equal(result.kind === "no_answer" && result.reason.code, "no_win");
  assert.match(result.kind === "no_answer" ? result.message : "", /1 win .* didn't replay/);
});

test("a replay the harness fails on is never a win, and the no answer says why it failed (#662)", async () => {
  const { root, pool } = tree(["TACKLE"], { "": { TACKLE: "won" } });
  const broken = noAnswer({ code: "harness_failed", why: "the replay timed out after 540 s" });

  const result = await search({ root, pool, validate: async () => broken, budget: BUDGET, portfolio: [NARROW[0]] });

  assert.equal(result.kind === "no_answer" && result.reason.code, "no_win");
  assert.match(result.kind === "no_answer" ? result.message : "", /the last because the oracle's harness failed: the replay timed out/);
});

test("a clone gone mid-search ends the solve with its own reason, since no replay could pass (#662)", async () => {
  const { root, pool } = tree(["TACKLE"], { "": { TACKLE: "won" } });
  const gone = noAnswer({ code: "no_clone", version: "1.12.0.11", cause: "No pinned clone" });

  const result = await search({ root, pool, validate: async () => gone, budget: BUDGET });

  assert.deepEqual(result, gone);
});

test("a win found in the turn a beam's budget ran out is still replayed (#662)", async () => {
  // Two jobs of one move each: the first wins, and the second finds the budget spent.
  const { root, pool } = tree(["TACKLE", "GROWL"], { "": { TACKLE: "won", GROWL: [0, 1] } });
  const { asked, validate } = replaysAll();

  const result = await search({ root, pool, validate, budget: { expansions: 1, turns: 40 }, portfolio: [NARROW[0]] });

  assert.equal(result.kind, "found");
  assert.deepEqual(asked, [["TACKLE"]]);
});

test("one beam emptying is no answer while another still searches, and the other's win comes back (#662)", async () => {
  // Weighing our HP at 0.5 prefers SLAM, whose every next move loses; at 1 it prefers PECK, which wins on the third.
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: [0.2, 1] },
    "PECK PECK": { PECK: "won" },
  });
  const { validate } = replaysAll();

  const result = await search({ root, pool, validate, budget: BUDGET, portfolio: NARROW });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["PECK", "PECK", "PECK"]);
});

test("no answer comes only once every beam has ended, and says how each one did (#662)", async () => {
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: [0.2, 1] },
  });
  const { validate } = replaysAll();

  const result = await search({ root, pool, validate, budget: BUDGET, portfolio: NARROW });

  assert.equal(result.kind, "no_answer");
  const reason = result.kind === "no_answer" ? result.reason : assert.fail();
  assert.deepEqual(reason.code === "no_win" && reason.beams.map(b => [b.width, b.ours, b.ended, b.turn]), [
    [1, 0.5, "emptied", 2],
    [1, 1, "emptied", 3],
  ]);
  assert.match(result.message, /width 1 at our-HP weight 0\.5 lost every path by turn 2/);
});

test("a beam whose foes lose no HP for 6 turns stalls (#662)", async () => {
  const { root, pool } = fight(["SPLASH"], () => ({ foeLost: 0.1, ours: 1 }));

  const result = await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, portfolio: [NARROW[0]] });

  const reason = result.kind === "no_answer" ? result.reason : assert.fail();
  assert.deepEqual(reason.code === "no_win" && reason.beams.map(b => [b.ended, b.turn]), [["stalled", 7]]);
});

test("a beam stops at the turn limit from where the solve starts (#662)", async () => {
  const { root, pool } = fight(["TACKLE"], path => ({ foeLost: (path.length + 1) / 100, ours: 1 }));

  const result = await search({
    root,
    pool,
    validate: replaysAll().validate,
    budget: { expansions: 3000, turns: 5 },
    portfolio: [NARROW[0]],
  });

  const reason = result.kind === "no_answer" ? result.reason : assert.fail();
  assert.deepEqual(reason.code === "no_win" && reason.beams.map(b => [b.ended, b.turn]), [["turns", 5]]);
});

test("each beam stops at a budget of its own, so a beam that spends it leaves the others searching (#662)", async () => {
  // Two moves a turn: a beam of width 1 plays 2 a turn, one of width 2 plays 4 once it has two positions.
  const { root, pool, expanded } = fight(["TACKLE", "EMBER"], (path, name) => ({
    foeLost: (path.length + 1) / 100,
    ours: name === "TACKLE" ? 1 : 0.9,
  }));

  const result = await search({
    root,
    pool,
    validate: replaysAll().validate,
    budget: { expansions: 6, turns: 40 },
    portfolio: [
      { width: 1, ours: 0.5 },
      { width: 2, ours: 0.5 },
    ],
  });

  const reason = result.kind === "no_answer" ? result.reason : assert.fail();
  assert.deepEqual(reason.code === "no_win" && reason.beams.map(b => [b.ended, b.expansions]), [
    ["budget", 6],
    ["budget", 6],
  ]);
  assert.equal(expanded.flatMap(e => e.inputs).length, 12);
});

test("progress reports the expansions spent out of the whole budget (#662)", async () => {
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: [0.2, 1] },
    "PECK PECK": { PECK: "won" },
  });
  const seen: Progress[] = [];

  await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, portfolio: NARROW, progress: p => seen.push(p) });

  assert.ok(seen.length > 0);
  assert.ok(seen.every(p => p.budget === 2 * BUDGET.expansions));
  assert.deepEqual(
    seen.map(p => p.spent),
    [...seen.map(p => p.spent)].sort((a, b) => a - b),
  );
  // The SLAM beam's two turns, and the PECK beam's three.
  assert.equal(seen.at(-1)?.spent, 2 * 2 + 3 * 2);
});

test("a turn the game plays for us is a step with no input, and stays out of the inputs replayed (#662)", async () => {
  const wait: Position = { sig: "charging", hp: { foes: [0.5], ours: [1] }, legal: [null], forkPoint: "charging" };
  const pool: Pool = {
    size: 1,
    async expand(forkPoint, inputs) {
      if (forkPoint === "root") return inputs.map(input => ({ input, end: "on", at: wait }));
      return inputs.map(input => ({ input, end: "won", hp: { foes: [0], ours: [1] } }));
    },
  };
  const root: Position = { sig: "root", hp: { foes: [1], ours: [1] }, legal: [move("BOUNCE")], forkPoint: "root" };
  const { asked, validate } = replaysAll();

  const result = await search({ root, pool, validate, budget: BUDGET });

  assert.equal(result.kind, "found");
  assert.deepEqual(asked, [["BOUNCE"]]);
});

test("each faint replacement a turn the game plays for us could take is a path of its own, replayed as an input (#702)", async () => {
  const toGolbat: Input = { kind: "queued", replacement: { slot: 4, species: "GOLBAT" } };
  const toSnorlax: Input = { kind: "queued", replacement: { slot: 2, species: "SNORLAX" } };
  const wait: Position = { sig: "charging", hp: { foes: [0.5], ours: [1, 1, 1] }, legal: [null], forkPoint: "charging" };
  const pool: Pool = {
    size: 1,
    async expand(forkPoint, inputs) {
      if (forkPoint === "root") return inputs.map(input => ({ input, end: "on", at: wait }));
      return [
        { input: toGolbat, end: "lost", hp: { foes: [0.5], ours: [0, 0, 0] } },
        { input: toSnorlax, end: "won", hp: { foes: [0], ours: [0, 1, 1] } },
      ];
    },
  };
  const root: Position = { sig: "root", hp: { foes: [1], ours: [1, 1, 1] }, legal: [move("BOUNCE")], forkPoint: "root" };
  const asked: (readonly Input[])[] = [];
  const validate = async (inputs: readonly Input[]) => (asked.push(inputs), replayed("won"));

  const result = await search({ root, pool, validate, budget: BUDGET });

  assert.deepEqual(result.kind === "found" && result.inputs, [move("BOUNCE"), toSnorlax]);
  assert.deepEqual(asked, [[move("BOUNCE"), toSnorlax]]);
});

test("each learn pick a turn could take is a path of its own, replayed with the pick it took (#673)", async () => {
  // As the harness answers a turn whose level-up asks: a child per pick, and the picks are told apart by the moves kept.
  const learns = (forget: "TACKLE" | null) => [{ slot: 1, species: "BULBASAUR", move: "LEECH_SEED", forget } as const];
  const scratch = (forget: "TACKLE" | null): Input => ({ ...move("SCRATCH"), learns: learns(forget) });
  const queued = (forget: "TACKLE" | null): Input => ({ kind: "queued", learns: learns(forget) });
  const at = (sig: string, foes: number, legal: readonly Action[]): Position => ({
    sig,
    hp: { foes: [foes], ours: [1, 1] },
    legal,
    forkPoint: sig,
  });
  const pool: Pool = {
    size: 1,
    async expand(forkPoint) {
      if (forkPoint === "root") {
        return [
          { input: scratch(null), end: "on", at: at("declined", 0.5, [move("TACKLE")]) },
          { input: scratch("TACKLE"), end: "on", at: at("forgot", 0.5, [null]) },
        ];
      }
      if (forkPoint === "declined") return [{ input: move("TACKLE"), end: "lost", hp: { foes: [0.5], ours: [0, 0] } }];
      return [
        { input: queued(null), end: "on", at: at("rampaging", 0.2, [null]) },
        { input: queued("TACKLE"), end: "won", hp: { foes: [0], ours: [1, 1] } },
      ];
    },
  };
  const root: Position = at("root", 1, [move("SCRATCH")]);
  const asked: (readonly Input[])[] = [];
  const validate = async (inputs: readonly Input[]) => (asked.push(inputs), replayed("won"));

  const result = await search({ root, pool, validate, budget: BUDGET });

  assert.deepEqual(result.kind === "found" && result.inputs, [scratch("TACKLE"), queued("TACKLE")]);
  assert.deepEqual(asked, [[scratch("TACKLE"), queued("TACKLE")]]);
});

test("a worker that fails ends the solve in no answer naming it (#662)", async () => {
  const root: Position = { sig: "root", hp: { foes: [1], ours: [1] }, legal: [move("TACKLE")], forkPoint: "root" };
  const pool: Pool = {
    size: 1,
    expand: async () => {
      throw new Error("the worker exited");
    },
  };

  const result = await search({ root, pool, validate: replaysAll().validate, budget: BUDGET });

  assert.equal(result.kind === "no_answer" && result.reason.code, "harness_failed");
  assert.match(result.kind === "no_answer" ? result.message : "", /the worker exited/);
});
