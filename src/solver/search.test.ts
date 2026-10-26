import assert from "node:assert/strict";
import { test } from "node:test";
import { noAnswer } from "./no-answer.ts";
import type { Beam, Input, Outcome, ReplayResult } from "./oracle-line.ts";
import { type Action, type Child, type Lds, type Pool, type Position, type Progress, type SearchStatistics, search } from "./search.ts";

/**
 * What a move does from a path: our side's HP fraction and the foe's total HP lost so far, each side's stat stages if
 * any, or how the fight ends.
 */
type Play = (
  path: readonly string[],
  move: string,
) => { foeLost: number; ours: number; stages?: { ours: number; foes: number } } | "won" | "lost";

const move = (name: string): Input => ({ kind: "move", move: name as Input extends { move: infer M } ? M : never, tera: false });
const named = (action: Action) => (action?.kind === "move" ? action.move : "wait");

/** A one-on-one fight played by a table; every path is its own position, so nothing merges. */
function fight(moves: readonly string[], play: Play) {
  const position = (path: readonly string[], foeLost: number, ours: number, stages = { ours: 0, foes: 0 }): Position => ({
    sig: path.join(" "),
    hp: { foes: [1 - foeLost], ours: [ours] },
    stages: { foes: [[stages.foes]], ours: [[stages.ours]] },
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
        return { input, end: "on", at: position([...from, named(input)], played.foeLost, played.ours, played.stages) };
      });
    },
  };
  return { root: position([], 0, 1), pool, expanded };
}

/**
 * A fight played by a tree: each path names its moves' results, as the foe's HP lost, ours left and, where given, our
 * and the foe's stat stages; a move it doesn't name loses.
 */
type Result = [number, number] | [number, number, number, number];
const tree = (moves: readonly string[], table: Record<string, Record<string, Result | "won" | "lost">>) =>
  fight(moves, (path, name) => {
    const played = table[path.join(" ")]?.[name] ?? "lost";
    if (typeof played === "string") return played;
    const [foeLost, ours, oursStages = 0, foesStages = 0] = played;
    return { foeLost, ours, stages: { ours: oursStages, foes: foesStages } };
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

/**
 * A one-worker pool that holds each job until the last one dispatched was let go and the search has done all it would
 * with it, so the order jobs are dispatched in is the search's choice alone. `dispatched` names each as `from: move`.
 */
function held(inner: Pool) {
  const dispatched: string[] = [];
  const waiting: (() => void)[] = [];
  const pool: Pool = {
    size: 1,
    expand(forkPoint, inputs) {
      dispatched.push(`${JSON.parse(forkPoint).join(" ")}: ${inputs.map(named).join(" ")}`);
      return new Promise(resolve => waiting.push(() => resolve(inner.expand(forkPoint, inputs))));
    },
  };
  const drain = async <T>(searching: Promise<T>): Promise<T> => {
    let over = false;
    searching.then(() => (over = true));
    while (!over) {
      waiting.shift()?.();
      await new Promise(resolve => setImmediate(resolve));
    }
    return searching;
  };
  return { pool, dispatched, drain };
}

const BUDGET = { expansions: 3000, turns: 40 };
const DISCREPANT: Lds = { ours: 1, alternatives: 2, discrepancies: 2, expansions: 3000 };
const NARROW: Beam[] = [
  { width: 1, ours: 0.5 },
  { width: 1, ours: 1 },
];
const OURS_WEIGHED_FIRST = NARROW.toReversed();

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

  const result = await search({ root, pool, validate, budget: BUDGET, lds: null, portfolio: [{ width: 1, ours: 0.5 }] });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["TACKLE", "EMBER", "EMBER"]);
  assert.deepEqual(asked[0], ["TACKLE", "TACKLE"]);
});

test("a win that hits an illegal step on replay is passed over like one that lost (#662)", async () => {
  const { root, pool } = tree(["TACKLE"], { "": { TACKLE: "won" } });
  const validate = async () =>
    noAnswer({ code: "illegal_step", index: 0, turn: 1, why: "isn't offered", tried: move("TACKLE"), legal: [] });

  const result = await search({ root, pool, validate, budget: BUDGET, lds: null, portfolio: [{ width: 1, ours: 0.5 }] });

  assert.equal(result.kind, "no_answer");
  assert.equal(result.kind === "no_answer" && result.reason.code, "no_win");
  assert.match(result.kind === "no_answer" ? result.message : "", /1 win .* didn't replay/);
});

test("a replay the harness fails on is never a win, and the no answer says why it failed (#662)", async () => {
  const { root, pool } = tree(["TACKLE"], { "": { TACKLE: "won" } });
  const broken = noAnswer({ code: "harness_failed", why: "the replay timed out after 540 s" });

  const result = await search({ root, pool, validate: async () => broken, budget: BUDGET, lds: null, portfolio: [NARROW[0]] });

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

  const result = await search({ root, pool, validate, budget: { expansions: 1, turns: 40 }, lds: null, portfolio: [NARROW[0]] });

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

  const result = await search({ root, pool, validate, budget: BUDGET, lds: null, portfolio: NARROW });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["PECK", "PECK", "PECK"]);
});

test("no answer comes only once every beam has ended, and says how each one did (#662)", async () => {
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: [0.2, 1] },
  });
  const { validate } = replaysAll();

  const result = await search({ root, pool, validate, budget: BUDGET, lds: null, portfolio: NARROW });

  assert.equal(result.kind, "no_answer");
  const reason = result.kind === "no_answer" ? result.reason : assert.fail();
  assert.deepEqual(reason.code === "no_win" && reason.beams.map(b => [b.width, b.ours, b.ended, b.turn]), [
    [1, 0.5, "emptied", 2],
    [1, 1, "emptied", 3],
  ]);
  assert.match(result.message, /width 1 at our-HP weight 0\.5 lost every path by turn 2/);
});

test("a setup move's stat stages count toward its score, so a beam keeps it over a weaker hit (#813)", async () => {
  // SWORDS_DANCE deals nothing and raises our stages by 2; only it leads to a win.
  const { root, pool } = tree(["TACKLE", "SWORDS_DANCE"], {
    "": { TACKLE: [0.02, 1], SWORDS_DANCE: [0, 1, 2, 0] },
    SWORDS_DANCE: { TACKLE: "won" },
  });

  const result = await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: null, portfolio: [{ width: 1, ours: 1 }] });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["SWORDS_DANCE", "TACKLE"]);
});

test("a foe's stat drops count for us, so a beam keeps a stage drop on the foe over a weaker hit (#813)", async () => {
  // SNARL deals nothing and lowers the foe's stages by 1; only it leads to a win.
  const { root, pool } = tree(["TACKLE", "SNARL"], {
    "": { TACKLE: [0.02, 1], SNARL: [0, 1, 0, -1] },
    SNARL: { TACKLE: "won" },
  });

  const result = await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: null, portfolio: [{ width: 1, ours: 1 }] });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["SNARL", "TACKLE"]);
});

test("a foe's stat raises count for nothing, so a hit that breaks a boss's bar outscores a weaker one (#813)", async () => {
  // The bar HIT breaks raises the boss's stages by 2; only HIT leads to a win.
  const { root, pool } = tree(["HIT", "TACKLE"], {
    "": { HIT: [0.1, 1, 0, 2], TACKLE: [0.05, 1] },
    HIT: { HIT: "won" },
  });

  const result = await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: null, portfolio: [{ width: 1, ours: 1 }] });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["HIT", "HIT"]);
});

/** One move per child: each names the HP and stat stages it leaves, and `wins` the move a win follows from. */
function staged(root: Pick<Position, "hp" | "stages">, children: Record<string, Pick<Position, "hp" | "stages">>, wins: string) {
  const at = (sig: string, s: Pick<Position, "hp" | "stages">): Position => ({ sig, ...s, legal: Object.keys(children).map(move), forkPoint: sig });
  const pool: Pool = {
    size: 1,
    async expand(forkPoint, inputs) {
      return inputs.map((input): Child => {
        if (forkPoint === "root") return { input, end: "on", at: at(named(input), children[named(input)]) };
        return { input, end: forkPoint === wins ? "won" : "lost", hp: { foes: [0, 0], ours: [1] } };
      });
    },
  };
  return { root: at("root", root), pool };
}

test("a foe's drops go with it when it faints, but never outweigh the HP of the KO (#813)", async () => {
  // Foe 0 is at a tenth of its HP and -3; FINISH knocks it out, CHIP takes less off foe 1.
  const { root, pool } = staged(
    { hp: { foes: [0.1, 1], ours: [1] }, stages: { foes: [[-3], []], ours: [[]] } },
    {
      FINISH: { hp: { foes: [0, 1], ours: [1] }, stages: { foes: [[], []], ours: [[]] } },
      CHIP: { hp: { foes: [0.1, 0.98], ours: [1] }, stages: { foes: [[-3], []], ours: [[]] } },
    },
    "FINISH",
  );

  const result = await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: null, portfolio: [{ width: 1, ours: 1 }] });

  assert.equal(result.kind === "found" && named(result.inputs[0]), "FINISH");
});

test("our mon's drops go with it when it faints, but never make its faint score better than its HP kept (#813)", async () => {
  // Our mon is at -2 on a sliver of HP; FALL lets it faint, HOLD keeps it, and only HOLD wins.
  const { root, pool } = staged(
    { hp: { foes: [1, 1], ours: [0.08] }, stages: { foes: [[], []], ours: [[-2]] } },
    {
      FALL: { hp: { foes: [1, 1], ours: [0] }, stages: { foes: [[], []], ours: [[]] } },
      HOLD: { hp: { foes: [1, 1], ours: [0.08] }, stages: { foes: [[], []], ours: [[-2]] } },
    },
    "HOLD",
  );

  const result = await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: null, portfolio: [{ width: 1, ours: 1 }] });

  assert.equal(result.kind === "found" && named(result.inputs[0]), "HOLD");
});

test("a beam whose foes lose no HP for 6 turns stalls (#662)", async () => {
  const { root, pool } = fight(["SPLASH"], () => ({ foeLost: 0.1, ours: 1 }));

  const result = await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: null, portfolio: [NARROW[0]] });

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
    lds: null,
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
    lds: null,
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

test("a later beam is dispatched only when no earlier beam has a job queued (#760)", async () => {
  // Weighing our HP at 1 keeps PECK and wins on the third; at 0.5 it keeps SLAM. Two moves a turn make two jobs a turn.
  const { root, pool: inner } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { SLAM: [0.15, 0.9], PECK: [0.2, 1] },
    "PECK PECK": { PECK: "won" },
  });
  const { pool, dispatched, drain } = held(inner);

  const result = await drain(search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: null, portfolio: OURS_WEIGHED_FIRST }));

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["PECK", "PECK", "PECK"]);
  assert.deepEqual(dispatched, [
    ": SLAM",
    ": PECK",
    // Between the first beam's turns, while it has nothing queued, the second fills the worker.
    ": SLAM",
    "PECK: SLAM",
    "PECK: PECK",
    ": PECK",
    "PECK PECK: SLAM",
    "PECK PECK: PECK",
    // And while the first beam's win replays.
    "SLAM: SLAM",
  ]);
});

test("the first beam spending its budget leaves a later beam searching, and the later beam's win comes back (#760)", async () => {
  // Weighing our HP at 1 keeps PECK, which never ends; at 0.5 it keeps SLAM, which wins on the second.
  const { root, pool: inner } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { SLAM: [0.15, 0.9], PECK: [0.2, 1] },
    SLAM: { SLAM: "won" },
  });
  const { pool, dispatched, drain } = held(inner);

  const result = await drain(
    search({ root, pool, validate: replaysAll().validate, budget: { expansions: 4, turns: 40 }, lds: null, portfolio: OURS_WEIGHED_FIRST }),
  );

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["SLAM", "SLAM"]);
  // The first beam's four, its budget, all go before the second beam's second turn.
  assert.deepEqual(dispatched, [": SLAM", ": PECK", ": SLAM", "PECK: SLAM", "PECK: PECK", ": PECK", "SLAM: SLAM", "SLAM: PECK"]);
});

test("the discrepancy search goes first, following the best-scored child each turn to a win (#761)", async () => {
  // PECK outscores SLAM at any weight on our HP, and PECK's own SLAM loses.
  const { root, pool, expanded } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.6, 1] },
    PECK: { PECK: [0.7, 1] },
    "PECK PECK": { PECK: "won" },
  });
  const { asked, validate } = replaysAll();

  const result = await search({ root, pool, validate, budget: BUDGET });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["PECK", "PECK", "PECK"]);
  assert.deepEqual(asked, [["PECK", "PECK", "PECK"]]);
  assert.deepEqual(
    expanded.map(e => e.from.join(" ")),
    ["", "PECK", "PECK PECK"],
  );
});

test("where the best-scored child never wins, the discrepancy search's next pass deviates once (#761)", async () => {
  // PECK scores best at the root and loses on; SLAM, the second best, wins on the next turn.
  const { root, pool, expanded } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    SLAM: { SLAM: "won" },
  });
  const { asked, validate } = replaysAll();

  const result = await search({ root, pool, validate, budget: BUDGET, lds: DISCREPANT });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["SLAM", "SLAM"]);
  assert.deepEqual(asked, [["SLAM", "SLAM"]]);
  // With no turn cache, the second pass plays the first's turns again.
  assert.deepEqual(
    expanded.map(e => e.from.join(" ")),
    ["", "PECK", "", "PECK", "SLAM"],
  );
});

test("a discrepancy search that runs out of discrepancies hands over to the beams, and their win comes back (#761)", async () => {
  // Only the third-best move at the root wins.
  const { root, pool } = tree(["SLAM", "PECK", "GROWL"], {
    "": { SLAM: [0.5, 1], PECK: [0.4, 1], GROWL: [0.1, 1] },
    GROWL: { SLAM: "won" },
  });
  const { asked, validate } = replaysAll();

  const result = await search({ root, pool, validate, budget: BUDGET, lds: DISCREPANT, portfolio: [{ width: 8, ours: 1 }] });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["GROWL", "SLAM"]);
  assert.deepEqual(asked, [["GROWL", "SLAM"]]);
});

test("a discrepancy search that spends its own budget hands over to the beams with theirs untouched (#761)", async () => {
  // Every turn takes a little more foe HP, so nothing stalls or ends before a budget does.
  const { root, pool } = fight(["TACKLE", "EMBER"], (path, name) => ({
    foeLost: (path.length + 1) / 100,
    ours: name === "TACKLE" ? 1 : 0.9,
  }));

  const result = await search({
    root,
    pool,
    validate: replaysAll().validate,
    budget: { expansions: 6, turns: 40 },
    lds: { ...DISCREPANT, expansions: 4 },
    portfolio: [{ width: 1, ours: 0.5 }],
  });

  const reason = result.kind === "no_answer" ? result.reason : assert.fail();
  assert.deepEqual(reason.code === "no_win" && [reason.lds, reason.beams.map(b => [b.ended, b.expansions])], [
    { ended: "budget", discrepancies: 0, expansions: 4 },
    [["budget", 6]],
  ]);
});

test("only the beams say no answer, and it names how the discrepancy search ended before them (#761)", async () => {
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: [0.2, 1] },
  });

  const result = await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: DISCREPANT, portfolio: NARROW });

  const answer = result.kind === "no_answer" ? result : assert.fail();
  // Two moves from each of the root, PECK and PECK PECK at k = 0; and SLAM besides at k = 1 and k = 2.
  assert.deepEqual(answer.reason.code === "no_win" && [answer.reason.lds, answer.reason.beams.map(b => b.ended)], [
    { ended: "exhausted", discrepancies: 2, expansions: 6 + 8 + 8 },
    ["emptied", "emptied"],
  ]);
  assert.match(
    answer.message,
    /^no winning path turned up: the discrepancy search tried every path within 2 discrepancies, 22 turns played; width 1/,
  );
});

test("a win the discrepancy search found that doesn't replay is passed over, and is not replayed again in its next pass (#761)", async () => {
  // PECK PECK wins at k = 0 but loses on replay; the second pass finds it again, then deviates to SLAM's win.
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: "won" },
    SLAM: { SLAM: "won" },
  });
  const asked: string[][] = [];
  const validate = async (inputs: readonly Input[]) => {
    asked.push(inputs.map(named));
    return replayed(inputs[0]?.kind === "move" && inputs[0].move === "PECK" ? "lost" : "won");
  };

  const result = await search({ root, pool, validate, budget: BUDGET, lds: DISCREPANT });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["SLAM", "SLAM"]);
  assert.deepEqual(asked, [
    ["PECK", "PECK"],
    ["SLAM", "SLAM"],
  ]);
});

test("a win whose replay the discrepancy search saw fail is never replayed by the beams (#761)", async () => {
  // PECK PECK wins but loses on replay; with no discrepancy to spend, the beams take over and reach it too.
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: "won" },
    SLAM: { SLAM: "won" },
  });
  const asked: string[][] = [];
  const validate = async (inputs: readonly Input[]) => {
    asked.push(inputs.map(named));
    return replayed(inputs[0]?.kind === "move" && inputs[0].move === "PECK" ? "lost" : "won");
  };

  const result = await search({
    root,
    pool,
    validate,
    budget: BUDGET,
    lds: { ...DISCREPANT, discrepancies: 0 },
    portfolio: [{ width: 8, ours: 1 }],
  });

  assert.deepEqual(result.kind === "found" && result.inputs.map(named), ["SLAM", "SLAM"]);
  assert.deepEqual(asked, [
    ["PECK", "PECK"],
    ["SLAM", "SLAM"],
  ]);
});

test("two beams that reach a win while its replay still runs replay it once between them (#761)", async () => {
  // Both beams reach PECK PECK, the only win, on turn 2; its replay loses, and is still running when the second gets there.
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: "won" },
  });
  const asked: string[][] = [];
  const validate = async (inputs: readonly Input[]) => {
    asked.push(inputs.map(named));
    await new Promise(resolve => setTimeout(resolve, 20));
    return replayed("lost");
  };

  const result = await search({
    root,
    pool,
    validate,
    budget: BUDGET,
    lds: null,
    portfolio: [
      { width: 8, ours: 1 },
      { width: 8, ours: 0.5 },
    ],
  });

  assert.equal(result.kind, "no_answer");
  assert.deepEqual(asked, [["PECK", "PECK"]]);
});

test("progress reports the expansions spent out of the whole budget (#662)", async () => {
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: [0.2, 1] },
    "PECK PECK": { PECK: "won" },
  });
  const seen: Progress[] = [];

  await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: null, portfolio: NARROW, progress: p => seen.push(p) });

  assert.ok(seen.length > 0);
  assert.ok(seen.every(p => p.budget === 2 * BUDGET.expansions));
  assert.deepEqual(
    seen.map(p => p.spent),
    [...seen.map(p => p.spent)].sort((a, b) => a - b),
  );
  // The SLAM beam's two turns, and the PECK beam's three.
  assert.equal(seen.at(-1)?.spent, 2 * 2 + 3 * 2);
});

test("progress counts the discrepancy search's budget, then goes on from what it spent (#761)", async () => {
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: [0.2, 1] },
    "PECK PECK": { PECK: "won" },
  });
  const seen: Progress[] = [];

  await search({
    root,
    pool,
    validate: replaysAll().validate,
    budget: BUDGET,
    lds: { ...DISCREPANT, ours: 0.5, discrepancies: 0 },
    portfolio: NARROW,
    progress: p => seen.push(p),
  });

  assert.ok(seen.every(p => p.budget === DISCREPANT.expansions + 2 * BUDGET.expansions));
  const spent = seen.map(p => p.spent);
  assert.deepEqual(spent, spent.toSorted((a, b) => a - b));
  // Weighing our HP at 0.5, the discrepancy search follows SLAM and loses on turn 2; the beams then play their 10.
  assert.deepEqual(spent.slice(0, 2), [2, 4]);
  assert.equal(spent.at(-1), 4 + 10);
});

test("a turn the game plays for us is a step with no input, and stays out of the inputs replayed (#662)", async () => {
  const wait: Position = { sig: "charging", hp: { foes: [0.5], ours: [1] }, stages: { foes: [[]], ours: [[]] }, legal: [null], forkPoint: "charging" };
  const pool: Pool = {
    size: 1,
    async expand(forkPoint, inputs) {
      if (forkPoint === "root") return inputs.map(input => ({ input, end: "on", at: wait }));
      return inputs.map(input => ({ input, end: "won", hp: { foes: [0], ours: [1] } }));
    },
  };
  const root: Position = { sig: "root", hp: { foes: [1], ours: [1] }, stages: { foes: [[]], ours: [[]] }, legal: [move("BOUNCE")], forkPoint: "root" };
  const { asked, validate } = replaysAll();

  const result = await search({ root, pool, validate, budget: BUDGET });

  assert.equal(result.kind, "found");
  assert.deepEqual(asked, [["BOUNCE"]]);
});

test("each faint replacement a turn the game plays for us could take is a path of its own, replayed as an input (#702)", async () => {
  const toGolbat: Input = { kind: "queued", replacement: { slot: 4, species: "GOLBAT" } };
  const toSnorlax: Input = { kind: "queued", replacement: { slot: 2, species: "SNORLAX" } };
  const wait: Position = { sig: "charging", hp: { foes: [0.5], ours: [1, 1, 1] }, stages: { foes: [[]], ours: [[], [], []] }, legal: [null], forkPoint: "charging" };
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
  const root: Position = { sig: "root", hp: { foes: [1], ours: [1, 1, 1] }, stages: { foes: [[]], ours: [[], [], []] }, legal: [move("BOUNCE")], forkPoint: "root" };
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
    stages: { foes: [[]], ours: [[], []] },
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
  const root: Position = { sig: "root", hp: { foes: [1], ours: [1] }, stages: { foes: [[]], ours: [[]] }, legal: [move("TACKLE")], forkPoint: "root" };
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

/** What one field slot's move does: the share of the foe's HP it takes, or that and our own HP lost and stages gained. */
type Command = number | { foeLost: number; oursLost: number; stages: number };
const effect = (c: Command) => (typeof c === "number" ? { foeLost: c, oursLost: 0, stages: 0 } : c);

/**
 * A double whose two field slots' moves each have their own effect; every turn's position is its own. `apart` names the
 * pairs the game refuses, as it does two Teras.
 */
function pairs(slot0: Record<string, Command>, slot1: Record<string, Command>, win?: [string, string], apart: string[] = []) {
  const pair = (a: string, b: string): Input => ({ kind: "double", commands: [move(a) as FieldMove, move(b) as FieldMove] });
  const legal = Object.keys(slot0).flatMap(a => Object.keys(slot1).flatMap(b => (apart.includes(`${a}+${b}`) ? [] : [pair(a, b)])));
  const names = (action: Action) =>
    action?.kind === "double" ? action.commands.map(c => (c?.kind === "move" ? c.move : "-")).join("+") : "?";
  const played: string[] = [];
  const pool: Pool = {
    size: 2,
    async expand(forkPoint, inputs) {
      return inputs.map((input): Child => {
        const [a, b] = names(input).split("+");
        played.push(`${forkPoint}: ${a}+${b}`);
        if (win && a === win[0] && b === win[1]) return { input, end: "won", hp: { foes: [0], ours: [1] } };
        const [x, y] = [effect(slot0[a]), effect(slot1[b])];
        const hp = { foes: [1 - x.foeLost - y.foeLost], ours: [1 - x.oursLost - y.oursLost] };
        const stages = { foes: [[]], ours: [[x.stages + y.stages]] };
        return { input, end: "on", at: { sig: `${forkPoint} ${a}+${b}`, hp, stages, legal, forkPoint: `${a}+${b}` } };
      });
    },
  };
  return { root: { sig: "root", hp: { foes: [1], ours: [1] }, stages: { foes: [[]], ours: [[]] }, legal, forkPoint: "root" } satisfies Position, pool, played };
}
type FieldMove = Extract<Input, { kind: "double" }>["commands"][number];

const ONE_TURN = { expansions: 3000, turns: 1 };
const ONE_BEAM: Beam[] = [{ width: 1, ours: 1 }];

test("a double plays each slot's commands beside one fixed command of the other's, then pairs only each one's best (#792)", async () => {
  const slot0 = { A1: 0.01, A2: 0.05, A3: 0.04, A4: 0.03, A5: 0.02 };
  const slot1 = { B1: 0.01, B2: 0.02, B3: 0.06, B4: 0.05, B5: 0.04 };
  const { root, pool, played } = pairs(slot0, slot1);

  await search({ root, pool, validate: replaysAll().validate, budget: ONE_TURN, lds: null, portfolio: ONE_BEAM, paired: 3 });

  const fromRoot = played.filter(p => p.startsWith("root: ")).map(p => p.slice(6));
  const probed = [...Object.keys(slot0).map(a => `${a}+B1`), ...Object.keys(slot1).slice(1).map(b => `A1+${b}`)];
  const paired = ["A2", "A3", "A4"].flatMap(a => ["B3", "B4", "B5"].map(b => `${a}+${b}`));
  assert.deepEqual(new Set(fromRoot), new Set([...probed, ...paired]));
  assert.equal(fromRoot.length, probed.length + paired.length, "no pair is played twice");
  assert.ok(!fromRoot.includes("A5+B2"), "two slots' lesser commands are never paired");
});

test("a double whose slots each have no more than the pairing's share plays every pair; a win in the first round counts as best (#792)", async () => {
  const small = pairs({ A1: 0.01, A2: 0.02 }, { B1: 0.01, B2: 0.02, B3: 0.03 });
  await search({ root: small.root, pool: small.pool, validate: replaysAll().validate, budget: ONE_TURN, lds: null, portfolio: ONE_BEAM, paired: 3 });
  assert.equal(small.played.length, 6);

  const won = pairs({ A1: 0.01, A2: 0.02, A3: 0.03, A4: 0.04 }, { B1: 0.01, B2: 0.02, B3: 0.03, B4: 0.04 }, ["A1", "B1"]);
  const result = await search({ root: won.root, pool: won.pool, validate: replaysAll().validate, budget: ONE_TURN, lds: null, portfolio: ONE_BEAM, paired: 1 });
  assert.equal(result.kind, "found");
});

test("a double's fixed command is one that pairs with every command of the other slot, so none goes unscored (#792)", async () => {
  const slot0 = { A1: 0.01, A2: 0.02, A3: 0.03, A4: 0.04 };
  const slot1 = { B1: 0.01, B2: 0.02, B3: 0.03, B4: 0.09 };
  const { root, pool, played } = pairs(slot0, slot1, undefined, ["A1+B4"]);

  await search({ root, pool, validate: replaysAll().validate, budget: ONE_TURN, lds: null, portfolio: ONE_BEAM, paired: 3 });

  const fromRoot = played.filter(p => p.startsWith("root: ")).map(p => p.slice(6));
  assert.ok(fromRoot.includes("A4+B4"), "the best pair is played, though the first legal command can't pair with B4");
});

test("a double pairs up a move that costs our partner HP for stat stages, as Beat Up on a Justified partner does (#813)", async () => {
  const slot0 = { DRAGON_PULSE: 0.05, HYPER_VOICE: 0.06, FLAMETHROWER: 0.04, BEAT_UP: { foeLost: 0, oursLost: 0.1, stages: 5 } };
  const slot1 = { B1: 0.01, B2: 0.02, B3: 0.03, B4: 0.04 };
  const { root, pool, played } = pairs(slot0, slot1);

  await search({ root, pool, validate: replaysAll().validate, budget: ONE_TURN, lds: null, portfolio: ONE_BEAM, paired: 1 });

  const fromRoot = played.filter(p => p.startsWith("root: ")).map(p => p.slice(6));
  assert.ok(fromRoot.includes("BEAT_UP+B4"), "Beat Up is the slot's one command paired with the other's best");
  assert.ok(!fromRoot.includes("HYPER_VOICE+B4"), "the best hit on the foe is not");
});

/** Wall time that moves only when a test moves it. */
function fakeClock() {
  let at = 0;
  return { now: () => at, advance: (ms: number) => void (at += ms) };
}

function reported() {
  const got: SearchStatistics[] = [];
  return { got, statistics: (s: SearchStatistics) => void got.push(s) };
}

test("a search whose discrepancy search runs out and whose second beam wins on turn 5 reports that, with each stage's turns, end and time (#940)", async () => {
  // Weighing our HP at 0.5 prefers SLAM, whose every next move loses; at 1 it prefers PECK, which wins on the fifth.
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: [0.2, 1] },
    "PECK PECK": { PECK: [0.3, 1] },
    "PECK PECK PECK": { PECK: [0.4, 1] },
    "PECK PECK PECK PECK": { PECK: "won" },
  });
  const clock = fakeClock();
  const validate = async () => {
    clock.advance(250);
    return replayed("won");
  };
  const { got, statistics } = reported();

  const result = await search({
    root,
    pool,
    validate,
    budget: BUDGET,
    lds: { ours: 1, alternatives: 1, discrepancies: 0, expansions: 2 },
    portfolio: NARROW,
    now: clock.now,
    statistics,
  });

  assert.equal(result.kind, "found");
  assert.deepEqual(got, [
    {
      found: { stage: "beam", index: 1, turn: 5, spent: 2 + 4 + 10 },
      stages: [
        { stage: "lds", spent: 2, ended: "budget", ms: 0 },
        { stage: "beam", index: 0, spent: 4, ended: "emptied", ms: 0 },
        { stage: "beam", index: 1, spent: 10, ended: "won", ms: 250 },
      ],
    },
  ]);
});

/** Each turn the pool plays takes 1 ms on `clock`. */
const ticking = (inner: Pool, clock: ReturnType<typeof fakeClock>): Pool => ({
  size: inner.size,
  async expand(forkPoint, inputs) {
    clock.advance(inputs.length);
    return inner.expand(forkPoint, inputs);
  },
});

test("a no answer's statistics carry each stage's turns, end and wall time, and no win (#940)", async () => {
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    PECK: { PECK: [0.2, 1] },
  });
  const clock = fakeClock();
  const { got, statistics } = reported();

  const result = await search({
    root,
    pool: ticking(pool, clock),
    validate: replaysAll().validate,
    budget: BUDGET,
    lds: DISCREPANT,
    portfolio: [{ width: 1, ours: 1 }],
    now: clock.now,
    statistics,
  });

  assert.equal(result.kind, "no_answer");
  // The discrepancy search plays 22 turns; the beam plays the root, PECK and PECK PECK, where every move loses.
  assert.deepEqual(got, [
    {
      found: null,
      stages: [
        { stage: "lds", spent: 22, ended: "exhausted", ms: 22 },
        { stage: "beam", index: 0, spent: 6, ended: "emptied", ms: 6 },
      ],
    },
  ]);
});

test("a win the discrepancy search found names the pass it was found on and the turns played by then (#940)", async () => {
  // PECK scores best at the root and loses on; SLAM, the second best, wins on the next turn.
  const { root, pool } = tree(["SLAM", "PECK"], {
    "": { SLAM: [0.5, 0.4], PECK: [0.1, 1] },
    SLAM: { SLAM: "won" },
  });
  const clock = fakeClock();
  const { got, statistics } = reported();

  await search({ root, pool: ticking(pool, clock), validate: replaysAll().validate, budget: BUDGET, lds: DISCREPANT, now: clock.now, statistics });

  // Two moves from each of the root and PECK on pass 0, then from the root, PECK and SLAM on pass 1.
  assert.deepEqual(got, [{ found: { stage: "lds", pass: 1, spent: 10 }, stages: [{ stage: "lds", spent: 10, ended: "won", ms: 10 }] }]);
});

test("a beam still searching when another beam's win replays is stopped, with the turns it played by then (#940)", async () => {
  // At our-HP weight 0.5 the first beam follows SLAM, which never ends; at 1 the second follows PECK to a win on turn 3.
  const { root, pool } = fight(["SLAM", "PECK"], (path, move) => {
    if (path.every(m => m === "SLAM")) return move === "SLAM" ? { foeLost: 0.5 + 0.01 * path.length, ours: 0.4 } : path.length === 0 ? { foeLost: 0.1, ours: 1 } : "lost";
    if (move === "SLAM") return "lost";
    return path.length === 2 ? "won" : { foeLost: 0.1 * (path.length + 1), ours: 1 };
  });
  const { got, statistics } = reported();

  await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: null, portfolio: NARROW, now: fakeClock().now, statistics });

  const [stats] = got;
  assert.deepEqual(stats.found && [stats.found.stage, stats.found.stage === "beam" && [stats.found.index, stats.found.turn]], ["beam", [1, 3]]);
  assert.deepEqual(stats.stages.map(s => [s.stage === "beam" && s.index, s.ended, s.ms]), [
    [0, "stopped", 0],
    [1, "won", 0],
  ]);
  assert.ok(stats.stages[0].spent > 0, "the stopped beam counts the turns it played");
});

test("a search a worker's failure ends still reports, every stage running then stopped (#940)", async () => {
  const root: Position = { sig: "root", hp: { foes: [1], ours: [1] }, stages: { foes: [[]], ours: [[]] }, legal: [move("TACKLE")], forkPoint: "root" };
  const pool: Pool = {
    size: 1,
    expand: async () => {
      throw new Error("the worker exited");
    },
  };
  const { got, statistics } = reported();

  await search({ root, pool, validate: replaysAll().validate, budget: BUDGET, lds: null, portfolio: NARROW, now: fakeClock().now, statistics });

  assert.deepEqual(got, [
    {
      found: null,
      stages: [
        { stage: "beam", index: 0, spent: 0, ended: "stopped", ms: 0 },
        { stage: "beam", index: 1, spent: 0, ended: "stopped", ms: 0 },
      ],
    },
  ]);
});
