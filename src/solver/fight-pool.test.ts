import assert from "node:assert/strict";
import { test } from "node:test";
import type { PredicateRead } from "../game/port.ts";
import { type Fight, fightEnded, FightPool } from "./fight-pool.ts";
import type { WorkerPool } from "./pool.ts";
import type { NotStarted } from "./worker.ts";

const GORDIE: Fight = { seed: "s33d", wave: 180 };
const NEXT: Fight = { seed: "s33d", wave: 181 };

/** Pools that count their starts and their closes. */
function pools() {
  const started: { closed: boolean }[] = [];
  const start = async (): Promise<WorkerPool | NotStarted> => {
    const fake = { closed: false };
    started.push(fake);
    return {
      size: 2,
      root: { sig: "root", hp: { ours: [1], foes: [1] }, legal: [], forkPoint: "root" },
      expand: async () => [],
      rootAt: async () => assert.fail("the holder roots nothing"),
      stats: () => ({ size: 2, died: 0, lastDeath: null, peakHeapMb: null, heapLimitMb: null, slowPoll: null, realClock: null }),
      async close() {
        fake.closed = true;
      },
    };
  };
  return { start, started };
}

/** A fight that ends when `end` is called, for each fight the holder asks about. */
function endings() {
  const asked: Fight[] = [];
  let end = () => {};
  const ended = (fight: Fight) => {
    asked.push(fight);
    return new Promise<void>(resolve => (end = resolve));
  };
  return { ended, asked, end: () => end() };
}

const settled = () => new Promise(r => setImmediate(r));

test("a fight's first solve starts its pool, and its later solves take that pool warm, starting no workers (#677)", async () => {
  const { start, started } = pools();
  const holder = new FightPool(endings().ended);

  const first = await holder.take(GORDIE, start);
  assert.ok("pool" in first);
  await first.done(false);
  const later = await holder.take(GORDIE, start);
  assert.ok("pool" in later);

  assert.equal(first.warm, false, "a pool started for the solve has its root already");
  assert.equal(later.warm, true);
  assert.equal(later.pool, first.pool);
  assert.equal(started.length, 1);
  assert.equal(started[0].closed, false, "kept up between the fight's solves");
});

test("a solve that takes the fight's pool while it is still starting waits for it rather than starting a second (#677)", async () => {
  const { start, started } = pools();
  const holder = new FightPool(endings().ended);

  const [first, second] = await Promise.all([holder.take(GORDIE, start), holder.take(GORDIE, start)]);

  assert.ok("pool" in first && "pool" in second);
  assert.equal(second.pool, first.pool);
  assert.equal(second.warm, true, "its root is the first solve's, so the second roots its own");
  assert.equal(started.length, 1);
});

test("a solve for another fight closes the last fight's pool and starts its own (#677)", async () => {
  const { start, started } = pools();
  const holder = new FightPool(endings().ended);

  await holder.take(GORDIE, start);
  const next = await holder.take(NEXT, start);

  assert.ok("pool" in next);
  assert.equal(next.warm, false);
  assert.deepEqual(started.map(p => p.closed), [true, false]);
});

test("the fight's pool is closed once the fight ends (#677)", async () => {
  const { start, started } = pools();
  const ending = endings();
  const holder = new FightPool(ending.ended);

  await holder.take(GORDIE, start);
  await holder.take(GORDIE, start);
  assert.deepEqual(ending.asked, [GORDIE], "one watch on the fight, however many solves it has");
  ending.end();
  await settled();

  assert.equal(started[0].closed, true);
  const after = await holder.take(GORDIE, start);
  assert.ok("pool" in after);
  assert.equal(after.warm, false, "the next solve starts a pool of its own");
});

test("a pool a solve broke is closed, and the fight's next solve starts a fresh one (#677)", async () => {
  const { start, started } = pools();
  const holder = new FightPool(endings().ended);

  const broken = await holder.take(GORDIE, start);
  assert.ok("pool" in broken);
  await broken.done(true);
  const next = await holder.take(GORDIE, start);

  assert.ok("pool" in next);
  assert.equal(next.warm, false);
  assert.deepEqual(started.map(p => p.closed), [true, false]);
});

test("a pool that never started is not kept: the fight's next solve tries again (#677)", async () => {
  const holder = new FightPool(endings().ended);
  const missing: NotStarted = { missing: "the clone is gone" };
  const { start, started } = pools();

  assert.deepEqual(await holder.take(GORDIE, async () => missing), missing);
  const next = await holder.take(GORDIE, start);

  assert.ok("pool" in next);
  assert.equal(next.warm, false);
  assert.equal(started.length, 1);
});

/** The tab's reads, one a look, and a clock whose sleeps pass at once. */
function tab(reads: readonly Partial<Extract<PredicateRead, { ready: true }>>[] | ((n: number) => PredicateRead)) {
  let t = 0;
  let n = 0;
  const clock: Parameters<typeof fightEnded>[1] = { now: () => t, sleep: async ms => void (t += ms) };
  const read = async (): Promise<PredicateRead> => {
    const i = n++;
    if (typeof reads === "function") return reads(i);
    return { ready: true, wave: 180, turn: 3, ...reads[Math.min(i, reads.length - 1)] } as PredicateRead;
  };
  return { game: { read }, clock, now: () => t, looks: () => n };
}

test("a fight ends once the tab's wave has moved on, looking every half minute (#677)", async () => {
  const t = tab([{ turn: 3 }, { turn: 7 }, { wave: 181, turn: 1 }]);
  await fightEnded(t.game, t.clock, GORDIE);
  assert.equal(t.looks(), 3);
  assert.equal(t.now(), 90_000);
});

test("a fight ends once no battle is left on the tab: a lost run back at the title (#677)", async () => {
  const t = tab([{ turn: 9 }, { wave: null, turn: null }]);
  await fightEnded(t.game, t.clock, GORDIE);
  assert.equal(t.looks(), 2);
});

test("a tab out of reach for ten minutes ends the fight, and one back in reach sooner keeps it (#677)", async () => {
  const away = (n: number): PredicateRead =>
    n === 5 ? ({ ready: true, wave: 180, turn: 4 } as PredicateRead) : n === 30 ? ({ ready: true, wave: 181, turn: 1 } as PredicateRead) : { ready: false, why: "no-tab", frame: null, domMode: null };
  const t = tab(away);
  await fightEnded(t.game, t.clock, GORDIE);
  assert.equal(t.looks(), 27, "back in reach at the 6th look, out of it from the 7th, and ten minutes on from there");
});
