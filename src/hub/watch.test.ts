import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cardLine, feedLine, offLine, runWatch } from "./watch.ts";
import { deadPort, deadSpawn, fakeClient, readyTab, type Peer } from "./fake-ext.ts";
import { startHub, type Hub } from "./hub.ts";
import { EVENT_KINDS } from "../../extension/src/relay/channel.ts";
import type { ExtensionCmd, FromExtension, HubState, ToExtension } from "../protocol/wire.ts";

const shut: (() => void)[] = [];

after(() => {
  for (const s of shut) s();
});

async function hub(port = 0): Promise<Hub> {
  const h = await startHub({ port, version: "1.0.0", timeoutMs: 400 });
  shut.push(() => h.close());
  return h;
}

function watching(port: number, retryMs = 20): { lines: string[]; stop: () => void; done: Promise<void> } {
  const lines: string[] = [];
  const ac = new AbortController();
  const done = runWatch({
    port,
    version: "1.0.0",
    retryMs,
    print: l => lines.push(l),
    signal: ac.signal,
    spawnHub: () => deadSpawn(),
    portHolder: () => ({ process: null, pid: null }),
  });
  shut.push(() => ac.abort());
  return { lines, stop: () => ac.abort(), done };
}

async function until(have: () => boolean, ms = 3_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (have()) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error("condition never held");
}

async function answerCard(ext: Peer<ToExtension, FromExtension>, result: Record<string, unknown>): Promise<void> {
  const cmd = await ext.take<{ t: "cmd"; id: number }>(f => f.t === "cmd" && f.name === "card");
  ext.send({ t: "reply", id: cmd.id, ok: true, result });
}

/** A read the CLI should not have made shows up as a line rather than as silence. */
function autoCard(ext: Peer<ToExtension, FromExtension>, result: Record<string, unknown>): void {
  ext.answering(
    (f): f is ExtensionCmd => f.t === "cmd" && f.name === "card",
    f => ({ t: "reply", id: f.id, ok: true, result }),
  );
}

const CARD = { ok: true, kind: "battle", key: "12", wave: 12, verdict: "danger", text: "Gyarados L34 will KO Pikachu\nswitch to Blissey", summary: null };
const BATTLE_LINE = "BATTLE w12 · danger | Gyarados L34 will KO Pikachu";
/** A card of nulls: the late join has nothing to print, so the test's first line is the one it is about. */
const NO_CARD = { ok: true, kind: null, key: null, wave: null, verdict: null, text: null, summary: null };

test("each streamed card kind is one summary line, with the first line of its text (extension-distribution.md §11.2)", () => {
  assert.equal(cardLine({ kind: "battle", wave: 12, verdict: "danger", text: "Gyarados will KO Pikachu\nswitch" }), "BATTLE w12 · danger | Gyarados will KO Pikachu");
  assert.equal(cardLine({ kind: "learn", wave: 14, verdict: "your call", text: "Pikachu wants Thunder" }), "LEARN w14 · your call | Pikachu wants Thunder");
  assert.equal(cardLine({ kind: "reward", wave: 15, verdict: "buy first", text: "free: Ultra Ball" }), "REWARDS w15 · buy first | free: Ultra Ball");
  assert.equal(cardLine({ kind: "biome", wave: 20, verdict: "Swamp", text: "Swamp 72 pick" }), "BIOME w20 · Swamp | Swamp 72 pick");
  assert.equal(cardLine({ kind: "encounter", wave: 23, verdict: "not judged", text: "Mysterious Chest" }), "ENCOUNTER w23 · not judged | Mysterious Chest");
});

test("the panel's own `rewards` kind reads as REWARDS, and a kind that never streams says nothing (extension-distribution.md §11.1)", () => {
  assert.equal(cardLine({ kind: "rewards", wave: 15, verdict: "buy first", text: "free: Ultra Ball" }), "REWARDS w15 · buy first | free: Ultra Ball");
  assert.equal(cardLine({ kind: "starters", wave: 1, verdict: "pick Bulbasaur", text: "…" }), null);
  assert.equal(cardLine({ kind: null, wave: null, verdict: null, text: null }), null);
  assert.equal(cardLine({}), null);
});

test("every kind the relay streams prints a card line (extension-distribution.md §11.2, #889)", () => {
  assert.deepEqual(EVENT_KINDS.filter(kind => cardLine({ kind }) === null), [], "streamed kinds the feed drops");
});

test("a randomized run's card line says so after the verdict (extension-distribution.md §11.2, #723)", () => {
  assert.equal(cardLine({ kind: "battle", wave: 12, verdict: "danger", text: "Gyarados will KO Pikachu", randomized: true }),
    "BATTLE w12 · danger · randomized | Gyarados will KO Pikachu");
  assert.equal(cardLine({ kind: "battle", wave: 12, verdict: "danger", text: "Gyarados will KO Pikachu", randomized: false }),
    "BATTLE w12 · danger | Gyarados will KO Pikachu");
});

test("the first line of the text is cut at 300 characters (extension-distribution.md §11.2)", () => {
  assert.equal(cardLine({ kind: "battle", wave: 1, verdict: "fight", text: `${"x".repeat(400)}\nsecond` }), `BATTLE w1 · fight | ${"x".repeat(300)}`);
});

test("a card missing a wave, a verdict or a text drops just that part of the line", () => {
  assert.equal(cardLine({ kind: "battle", wave: null, verdict: "easy", text: "a" }), "BATTLE · easy | a");
  assert.equal(cardLine({ kind: "battle", wave: 3, verdict: null, text: "a" }), "BATTLE w3 | a");
  assert.equal(cardLine({ kind: "battle", wave: 3, verdict: "easy", text: null }), "BATTLE w3 · easy");
  assert.equal(cardLine({ kind: "battle", wave: 3, verdict: "easy", text: "   \nb" }), "BATTLE w3 · easy");
});

test("a HUD failure, a tab split and a return are their own lines (extension-distribution.md §11.2)", () => {
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

test("while the game is unreachable the ladder line prints once, and again only when it changes (extension-distribution.md §11.2)", async () => {
  // A dead port, not merely a free one: the loop dials it every retry, so another test file's hub that took it would
  // answer, and the ladder would read that hub's rungs (#327).
  const port = await deadPort();
  const w = watching(port);
  await until(() => w.lines.length > 0);
  assert.equal(w.lines[0], "The Coachemon hub would not start: no hub here.");
  await new Promise(r => setTimeout(r, 150));
  assert.deepEqual(w.lines, ["The Coachemon hub would not start: no hub here."]);

  await hub(port);
  await until(() => w.lines.length > 1);
  assert.match(w.lines[1], /^No browser has Coachemon connected\./);
  w.stop();
  await w.done;
});

test("once a tab is ready the CLI subscribes and prints the card it joined on (extension-distribution.md §11.2)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port);
  const w = watching(h.port);
  await answerCard(ext, CARD);
  await until(() => w.lines.length > 0);
  assert.deepEqual(w.lines, [BATTLE_LINE]);
  w.stop();
  await w.done;
});

test("a card event on the stream is one line, and the watch role never claims the grant (extension-distribution.md §11.2)", async () => {
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

test("a card off the oracle line adds an OFF LINE line naming the turn it left on (extension-distribution.md §11.2)", () => {
  const card = (oracleLine: unknown) => ({ kind: "battle", wave: 180, verdict: "trainer", text: "t", oracleLine });
  assert.deepEqual(offLine(card({ state: "off", turn: 13, of: 19 }))?.line, "OFF LINE w180 · T13/19");
  assert.equal(offLine(card({ state: "on", turn: 13, of: 19 })), null);
  assert.equal(offLine(card(null)), null);
  assert.equal(offLine(card(undefined)), null, "a build before the oracle line sends no state at all");
  assert.equal(offLine(card("off")), null);
});

test("OFF LINE prints once per oracle line, not on every card after it (extension-distribution.md §11.2, #675)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port);
  const w = watching(h.port);
  await answerCard(ext, NO_CARD);

  const battle = (verdict: string, oracleLine: unknown, text: string) =>
    ext.send({ t: "event", tab: 1, kind: "card", body: { kind: "battle", key: "180", wave: 180, verdict, text, oracleLine } });
  battle("trainer", { state: "on", turn: 13, of: 19 }, "⚔ ~ T13/19 · Leavanny Bug Bite");
  battle("trainer", { state: "off", turn: 13, of: 19 }, "off the line · ~ re-solving… · Golbat Venoshock");
  battle("danger", { state: "off", turn: 13, of: 19 }, "off the line · ~ re-solving… · Golbat Toxic");
  ext.send({ t: "event", tab: 1, kind: "card", body: { kind: "learn", key: "180|Golbat|Cross Poison", wave: 180, verdict: "your call", text: "Golbat wants Cross Poison", oracleLine: null } });
  battle("danger", { state: "off", turn: 13, of: 19 }, "off the line · ~ re-solving… · Golbat Venoshock");
  // A re-solve's oracle line leads, then misses too: that is a second line, and a second OFF LINE.
  battle("trainer", { state: "on", turn: 15, of: 19 }, "⚔ ~ T15/19 · Golbat Venoshock");
  battle("trainer", { state: "off", turn: 15, of: 19 }, "off the line · ! re-solving… · Golbat Venoshock");
  await until(() => w.lines.length >= 9);
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(w.lines, [
    "BATTLE w180 · trainer | ⚔ ~ T13/19 · Leavanny Bug Bite",
    "BATTLE w180 · trainer | off the line · ~ re-solving… · Golbat Venoshock",
    "OFF LINE w180 · T13/19",
    "BATTLE w180 · danger | off the line · ~ re-solving… · Golbat Toxic",
    "LEARN w180 · your call | Golbat wants Cross Poison",
    "BATTLE w180 · danger | off the line · ~ re-solving… · Golbat Venoshock",
    "BATTLE w180 · trainer | ⚔ ~ T15/19 · Golbat Venoshock",
    "BATTLE w180 · trainer | off the line · ! re-solving… · Golbat Venoshock",
    "OFF LINE w180 · T15/19",
  ]);
  w.stop();
  await w.done;
});

test("a CLI that joins a fight already off the line says so once (extension-distribution.md §11.2, #675)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port);
  const w = watching(h.port);
  const off = { ...CARD, wave: 180, verdict: "trainer", text: "off the line · ~ re-solving…", oracleLine: { state: "off", turn: 13, of: 19 } };
  await answerCard(ext, off);
  await until(() => w.lines.length >= 2);
  ext.send({ t: "event", tab: 1, kind: "card", body: { ...off, verdict: "danger" } });
  await until(() => w.lines.length >= 3);
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(w.lines, [
    "BATTLE w180 · trainer | off the line · ~ re-solving…",
    "OFF LINE w180 · T13/19",
    "BATTLE w180 · danger | off the line · ~ re-solving…",
  ]);
  w.stop();
  await w.done;
});

test("a HUD failure on the stream is COACH ERROR (extension-distribution.md §11.2)", async () => {
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

test("a second tab prints TABS, and closing it prints RESUMED then a fresh card read (extension-distribution.md §11.2)", async () => {
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

test("a CLI that joins an already-split tab count reads the card once, not twice (extension-distribution.md §11.2)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 1);
  ext.send({ t: "tab", tab: 2, state: "ready", title: "PokéRogue" });
  autoCard(ext, CARD);
  const w = watching(h.port);
  // The hub tells a subscriber about a split it joined into, so the split is reported without the loop's help (extension-distribution.md §7.5).
  await until(() => w.lines.some(l => l.startsWith("TABS ")));

  ext.send({ t: "tab", tab: 2, state: "gone", title: "PokéRogue" });
  await until(() => w.lines.includes("RESUMED"));
  await until(() => w.lines.includes(BATTLE_LINE));
  await new Promise(r => setTimeout(r, 150));
  assert.deepEqual(w.lines.filter(l => l === BATTLE_LINE), [BATTLE_LINE]);
  w.stop();
  await w.done;
});

test("a rung the TABS line replaced is printed again when it comes back (extension-distribution.md §11.2)", async () => {
  const h = await hub();
  const ext = await readyTab(h.port, 1);
  const w = watching(h.port);
  await answerCard(ext, NO_CARD);

  // No ready tab: rung 7, once.
  ext.send({ t: "tab", tab: 1, state: "gone", title: "PokéRogue" });
  await until(() => w.lines.some(l => l.startsWith("Coachemon is connected")));

  // Two tabs, then none: the player is left on a TABS line that no longer applies, so rung 7 has to say itself again.
  ext.send({ t: "tab", tab: 1, state: "ready", title: "PokéRogue" });
  ext.send({ t: "tab", tab: 2, state: "ready", title: "PokéRogue" });
  await until(() => w.lines.some(l => l.startsWith("TABS ")));
  ext.send({ t: "tab", tab: 1, state: "gone", title: "PokéRogue" });
  ext.send({ t: "tab", tab: 2, state: "gone", title: "PokéRogue" });
  await until(() => w.lines.filter(l => l.startsWith("Coachemon is connected")).length === 2);
  w.stop();
  await w.done;
});
