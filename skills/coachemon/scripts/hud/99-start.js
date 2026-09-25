// Starts the refresh loop and pushes the card stream. Last in the bundle, so every module it calls is built before the
// first tick. `stats()` exposes the sandbox restore-mismatch count and refresh cost for live checks; `last()` the card
// last drawn, `summary()` its plain-text verdict, which probe.js passes through to the battle read, and `card()` the
// very payload the `coachemon:card` events carry, which the `card` command reads for a subscriber's late join (§11.1).

// The stream (§11.1): one event per new decision or changed verdict, and one per distinct HUD failure. The detail is a
// JSON string carrying this build's id, which is what the relay pairs with and forwards (§9.1, §9.5); a panel injected
// without the extension has no id and nobody listening, so it pushes nothing.
// The event names are the relay's (`extension/src/relay/channel.ts`), kept here by hand because the panel is one
// source the extension bundles rather than imports; test/cardeventtest.mjs runs what ships past the relay's own
// validators, so a detail the extension would drop fails the tests instead of a live tab. The kinds are not kept by
// hand: `EVENT_KINDS` is derived from the card table 60-card already has, so the gate here and the name a kind
// streams under cannot drift apart (#388).
import { sandboxBreachCount } from "./01-core.js";
import { dropChunkHandoff } from "./04-game-tables.js";
import { previewStats } from "./48-preview.js";
import { rerollStats } from "./50-reroll.js";
import { journalClear, journalEntries, journalStats } from "./55-journal.js";
import { EVENT_KINDS, cardEvent, cardSummary } from "./60-card.js";
import { el, wireCard } from "./90-render.js";
import { lastFailure, shownCard, shownGroups, tick } from "./98-tick.js";

const CARD_EVENT = "coachemon:card", COACH_ERROR_EVENT = "coachemon:coach-error";
const hudBuild = typeof COACHEMON_BUILD === "string" ? COACHEMON_BUILD : null;
let sentCard = null, sentError = null;

const push = (type, detail) => {
  if (hudBuild === null) return;
  try {
    document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify({ build: hudBuild, ...detail }) }));
  } catch {}
};

// The card the panel is showing, as an event body. Null when there is nothing to coach, or when the refresh threw.
const eventNow = () => { try { return cardEvent(shownCard()); } catch { return null; } };
// **`groups` and `text` are one product, off the groups the refresh already drew** (§11.1, #361 §5): the wire's
// group carries its rows already flattened, because nodes cannot cross a wire, and the text is the projection of
// exactly that — so the two cannot disagree, and neither costs a second draw of the card.
// One assembly site for the body the read answers with and the stream pushes, so a field cannot land on one and
// not the other — and so what the relay's gate judges is the shape both carry.
const bodyOf = ev => {
  let wire = null;
  try { wire = wireCard(shownGroups()); } catch { return null; }
  return wire ? { ...ev, groups: wire.groups, text: wire.text } : null;
};
const cardNow = () => {
  const ev = eventNow();
  return ev ? bodyOf(ev) : null;
};

const stream = () => {
  // One line per distinct message, the rule the watcher has always read errors by: the same failure repeating is one
  // event, and a failure that comes back after a good refresh is news again.
  const failed = lastFailure();
  if (failed !== sentError) {
    sentError = failed;
    if (failed) push(COACH_ERROR_EVENT, { message: String(failed) });
  }
  if (failed) return;
  const ev = eventNow();
  // Only the five streamed kinds, and only a card the subscriber can act on: the relay drops anything else anyway.
  // A card that cannot be streamed leaves the last signature standing, so coming back to it is not a second event.
  if (!ev || EVENT_KINDS.indexOf(ev.kind) < 0 || typeof ev.wave !== "number" || typeof ev.key !== "string" || typeof ev.verdict !== "string") return;
  // The kind rides in the signature because two kinds share a key on one wave: a biome choice and its battle are both
  // keyed on the wave alone.
  const sig = `${ev.kind}|${ev.key}|${ev.verdict}`;
  if (sig === sentCard) return;
  const body = bodyOf(ev);
  if (typeof body?.text !== "string") return;
  sentCard = sig;
  push(CARD_EVENT, body);
};

// `stats()` is what a live check reads the refresh cost off, so the stream is inside the measurement: what a push
// costs on top of a draw is part of what a refresh costs. It is the flattening alone now — the groups the stream
// ships and derives its text from are the ones the refresh above it already drew (#361 §5).
let lastTickMs = 0, maxTickMs = 0;
const timedTick = () => {
  const t0 = performance.now();
  tick();
  stream();
  lastTickMs = performance.now() - t0;
  maxTickMs = Math.max(maxTickMs, lastTickMs);
};
const timer = setInterval(timedTick, 1000);
timedTick();
window.__coachHud = {
  stop: () => { clearInterval(timer); el.remove(); dropChunkHandoff(); delete window.__coachHud; },
  stats: () => ({ breaches: sandboxBreachCount(), lastTickMs, maxTickMs }),
  last: () => shownCard(),
  summary: () => cardSummary(shownCard()),
  card: () => cardNow(),
  // How the next-wave preview has actually scored this run: hits and misses per field, and the last wave it got
  // wrong. A field with a miss is drawn `!` on the card from then on.
  preview: () => previewStats(),
  // How the reroll preview has scored: every reroll made against the offers previewed for it.
  reroll: () => rerollStats(),
  // Every Mystery Encounter met on this browser, with the card shown, the option the game recorded and what the run
  // looked like at each step of it. It outlives the run: `journalStats()` is the tally, `journalClear()` empties it
  // once it has been harvested.
  journal: () => journalEntries(),
  journalStats: () => journalStats(),
  journalClear: () => journalClear(),
};
document.documentElement.dataset.mcpOut = JSON.stringify({ hud: "on" });
