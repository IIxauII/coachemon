import assert from "node:assert/strict";
import { createServer as createSocketServer } from "node:net";
import { after, test } from "node:test";
import { cardLine, feedLine, runWatch } from "./watch.ts";
import { fakeClient, readyTab, type Peer } from "./fake-ext.ts";
import { startHub, type Hub } from "./hub.ts";
import type { HubProcess } from "./client.ts";
import type { FromExtension, HubState, ToExtension } from "../protocol/wire.ts";

const shut: (() => void)[] = [];

after(() => {
  for (const s of shut) s();
});

/** A port nothing is listening on right now: the hub's ports are fixed, so the tests pick their own. */
function freePort(): Promise<number> {
  return new Promise(resolve => {
    const s = createSocketServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

async function hub(port = 0): Promise<Hub> {
  const h = await startHub({ port, version: "1.0.0", timeoutMs: 400 });
  shut.push(() => h.close());
  return h;
}

/** A hub start that never comes up: nothing here may spawn a real detached process. */
const deadSpawn = (): HubProcess => ({ pid: null, stderr: () => "no hub here", exited: Promise.resolve(1), release: () => {} });

/** The CLI against a hub, with a fast retry, collecting its lines; `stop` ends the loop. */
function watching(port: number, retryMs = 20): { lines: string[]; stop: () => void; done: Promise<void> } {
  const lines: string[] = [];
  const ac = new AbortController();
  const done = runWatch({
    port,
    version: "1.0.0",
    retryMs,
    print: l => lines.push(l),
    signal: ac.signal,
    spawnHub: deadSpawn,
    portHolder: () => ({ process: null, pid: null }),
  });
  shut.push(() => ac.abort());
  return { lines, stop: () => ac.abort(), done };
}

/** Waits for a condition, so no test sleeps a fixed time for the loop's next tick. */
async function until(have: () => boolean, ms = 3_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (have()) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error("condition never held");
}

/** Answers the CLI's `card` read with one card. */
async function answerCard(ext: Peer<ToExtension, FromExtension>, result: Record<string, unknown>): Promise<void> {
  const cmd = await ext.take<{ t: "cmd"; id: number }>(f => f.t === "cmd" && f.name === "card");
  ext.send({ t: "reply", id: cmd.id, ok: true, result });
}

const CARD = { ok: true, kind: "battle", key: "12", wave: 12, verdict: "danger", text: "Gyarados L34 will KO Pikachu\nswitch to Blissey", summary: null };
const BATTLE_LINE = "BATTLE w12 · danger | Gyarados L34 will KO Pikachu";
/** A card of nulls: the late join has nothing to print, so the test's first line is the one it is about. */
const NO_CARD = { ok: true, kind: null, key: null, wave: null, verdict: null, text: null, summary: null };

// ------------------------------------------------------------------ the lines (§11.2)

test("each streamed card kind is one summary line, with the first line of its text (§11.2)", () => {
  assert.equal(cardLine({ kind: "battle", wave: 12, verdict: "danger", text: "Gyarados will KO Pikachu\nswitch" }), "BATTLE w12 · danger | Gyarados will KO Pikachu");
  assert.equal(cardLine({ kind: "learn", wave: 14, verdict: "your call", text: "Pikachu wants Thunder" }), "LEARN w14 · your call | Pikachu wants Thunder");
  assert.equal(cardLine({ kind: "reward", wave: 15, verdict: "buy first", text: "free: Ultra Ball" }), "REWARDS w15 · buy first | free: Ultra Ball");
  assert.equal(cardLine({ kind: "biome", wave: 20, verdict: "Swamp", text: "Swamp 72 pick" }), "BIOME w20 · Swamp | Swamp 72 pick");
  assert.equal(cardLine({ kind: "encounter", wave: 23, verdict: "not judged", text: "Mysterious Chest" }), "ENCOUNTER w23 · not judged | Mysterious Chest");
});

test("the panel's own `rewards` kind reads as REWARDS, and a kind that never streams says nothing (§11.1)", () => {
  assert.equal(cardLine({ kind: "rewards", wave: 15, verdict: "buy first", text: "free: Ultra Ball" }), "REWARDS w15 · buy first | free: Ultra Ball");
  assert.equal(cardLine({ kind: "starters", wave: 1, verdict: "pick Bulbasaur", text: "…" }), null);
  assert.equal(cardLine({ kind: null, wave: null, verdict: null, text: null }), null);
  assert.equal(cardLine({}), null);
});

test("the first line of the text is cut at 300 characters (§11.2)", () => {
  assert.equal(cardLine({ kind: "battle", wave: 1, verdict: "fight", text: `${"x".repeat(400)}\nsecond` }), `BATTLE w1 · fight | ${"x".repeat(300)}`);
});

test("a card missing a wave, a verdict or a text drops just that part of the line", () => {
  assert.equal(cardLine({ kind: "battle", wave: null, verdict: "easy", text: "a" }), "BATTLE · easy | a");
  assert.equal(cardLine({ kind: "battle", wave: 3, verdict: null, text: "a" }), "BATTLE w3 | a");
  assert.equal(cardLine({ kind: "battle", wave: 3, verdict: "easy", text: null }), "BATTLE w3 · easy");
  assert.equal(cardLine({ kind: "battle", wave: 3, verdict: "easy", text: "   \nb" }), "BATTLE w3 · easy");
});

test("a HUD failure, a tab split and a return are their own lines (§11.2)", () => {
  assert.equal(feedLine({ t: "event", kind: "coach-error", body: { message: "refresh threw" } }), "COACH ERROR refresh threw");
  assert.equal(feedLine({ t: "notice", kind: "resume", tabs: [] }), "RESUMED");
  assert.equal(
    feedLine({
      t: "notice",
      kind: "tabs",
      tabs: [
        { conn: 1, tab: 1, target: "chrome", title: "PokéRogue", state: "ready" },
        { conn: 2, tab: 4, target: "firefox", title: "PokéRogue (2)", state: "ready" },
      ],
    }),
    "TABS 2 pokerogue.net tabs are open (Chrome: PokéRogue; Firefox: PokéRogue (2)). Close all but one.",
  );
});

// ------------------------------------------------------------------ the loop (§11.2)

test("while the game is unreachable the ladder line prints once, and again only when it changes (§11.2)", async () => {
  const port = await freePort();
  const w = watching(port);
  await until(() => w.lines.length > 0);
  assert.equal(w.lines[0], "The Coachemon hub would not start: no hub here.");
  // Several retries later it has not said the same thing twice.
  await new Promise(r => setTimeout(r, 150));
  assert.deepEqual(w.lines, ["The Coachemon hub would not start: no hub here."]);

  // A hub comes up on the port with no browser on it: rung 3 is a different line, so it prints.
  await hub(port);
  await until(() => w.lines.length > 1);
  assert.match(w.lines[1], /^No browser has Coachemon connected\./);
  w.stop();
  await w.done;
});

test("once a tab is ready the CLI subscribes and prints the card it joined on (§11.2)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port);
  const w = watching(h.port);
  await answerCard(ext, CARD);
  await until(() => w.lines.length > 0);
  assert.deepEqual(w.lines, [BATTLE_LINE]);
  w.stop();
  await w.done;
});

test("a card event on the stream is one line, and the watch role never claims the grant (§11.2)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port);
  const w = watching(h.port);
  await answerCard(ext, NO_CARD);

  ext.send({ t: "event", tab: 1, kind: "card", body: { kind: "reward", key: "15|Ultra Ball", wave: 15, verdict: "buy first", text: "free: Ultra Ball · shop: Rare Candy" } });
  await until(() => w.lines.length > 0);
  assert.deepEqual(w.lines, ["REWARDS w15 · buy first | free: Ultra Ball · shop: Rare Candy"]);

  const other = await fakeClient(h.port);
  other.send({ t: "state" });
  assert.equal((await other.take<HubState>(f => f.t === "state")).driver, null);
  other.close();
  w.stop();
  await w.done;
});

test("a HUD failure on the stream is COACH ERROR (§11.2)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port);
  const w = watching(h.port);
  await answerCard(ext, NO_CARD);

  ext.send({ t: "event", tab: 1, kind: "coach-error", body: { message: "refresh threw: no scene" } });
  await until(() => w.lines.length > 0);
  assert.deepEqual(w.lines, ["COACH ERROR refresh threw: no scene"]);
  w.stop();
  await w.done;
});

test("a second tab prints TABS, and closing it prints RESUMED then a fresh card read (§11.2)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 1);
  const w = watching(h.port);
  await answerCard(ext, NO_CARD);

  ext.send({ t: "tab", tab: 2, state: "ready", title: "PokéRogue" });
  await until(() => w.lines.some(l => l.startsWith("TABS ")));
  assert.match(w.lines.find(l => l.startsWith("TABS "))!, /^TABS 2 pokerogue\.net tabs are open \(/);

  ext.send({ t: "tab", tab: 2, state: "gone", title: "PokéRogue" });
  await until(() => w.lines.includes("RESUMED"));
  await answerCard(ext, CARD);
  await until(() => w.lines.includes(BATTLE_LINE));
  assert.deepEqual(w.lines.slice(w.lines.indexOf("RESUMED")), ["RESUMED", BATTLE_LINE]);
  w.stop();
  await w.done;
});
