// Starts the refresh loop and pushes the card stream. Last in the bundle, so every module it calls is built before the
// first tick. `stats()` exposes the sandbox restore-mismatch count and refresh cost for live checks; `last()` the card
// last drawn, `summary()` its plain-text verdict, which probe.js passes through to the battle read, and `card()` the
// very payload the `coachemon:card` events carry, which the `card` command reads for a subscriber's late join (§11.1).

// The stream (§11.1): one event per new decision or changed verdict, and one per distinct HUD failure. The detail is a
// JSON string carrying this build's id, which is what the relay pairs with and forwards (§9.1, §9.5); a panel injected
// without the extension has no id and nobody listening, so it pushes nothing.
// The names and the kinds are the relay's (`extension/src/relay/channel.ts`), kept here by hand because the panel is one
// source the extension bundles rather than imports; test/cardeventtest.mjs runs what ships past the relay's own
// validators, so a detail the extension would drop fails the tests instead of a live tab.
import { sandboxBreachCount } from "./01-core.js";
import { previewStats } from "./48-preview.js";
import { rerollStats } from "./50-reroll.js";
import { cardEvent, cardSummary } from "./60-card.js";
import { cardText, el } from "./90-render.js";
import { lastFailure, shownCard, tick } from "./98-tick.js";

const CARD_EVENT = "coachemon:card", COACH_ERROR_EVENT = "coachemon:coach-error";
const CARD_KINDS = ["battle", "learn", "reward", "biome", "encounter"];
const hudBuild = typeof COACHEMON_BUILD === "string" ? COACHEMON_BUILD : null;
let sentCard = null, sentError = null;

const push = (type, detail) => {
  if (hudBuild === null) return;
  try {
    document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify({ build: hudBuild, ...detail }) }));
  } catch {}
};

// The card the panel is showing, as an event body. Null when there is nothing to coach, or when the refresh threw.
// Drawing the card again is the expensive half, so the stream only asks for it once the key or the verdict has moved.
const eventNow = () => { try { return cardEvent(shownCard()); } catch { return null; } };
const cardNow = () => {
  const ev = eventNow();
  if (!ev) return null;
  try { return { ...ev, text: cardText(shownCard()) }; } catch { return null; }
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
  if (!ev || CARD_KINDS.indexOf(ev.kind) < 0 || typeof ev.wave !== "number" || typeof ev.key !== "string" || typeof ev.verdict !== "string") return;
  // The kind rides in the signature because two kinds share a key on one wave: a biome choice and its battle are both
  // keyed on the wave alone.
  const sig = `${ev.kind}|${ev.key}|${ev.verdict}`;
  if (sig === sentCard) return;
  let text = null;
  try { text = cardText(shownCard()); } catch {}
  if (typeof text !== "string") return;
  sentCard = sig;
  push(CARD_EVENT, { kind: ev.kind, key: ev.key, wave: ev.wave, verdict: ev.verdict, text });
};

// `stats()` is what a live check reads the refresh cost off, so the stream is inside the measurement: pushing a card
// draws it a second time, and that is part of what a refresh costs.
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
  stop: () => { clearInterval(timer); el.remove(); delete window.__coachHud; },
  stats: () => ({ breaches: sandboxBreachCount(), lastTickMs, maxTickMs }),
  last: () => shownCard(),
  summary: () => cardSummary(shownCard()),
  card: () => cardNow(),
  // How the next-wave preview has actually scored this run: hits and misses per field, and the last wave it got
  // wrong. A field with a miss is drawn `!` on the card from then on.
  preview: () => previewStats(),
  // How the reroll preview has scored: every reroll made against the offers previewed for it.
  reroll: () => rerollStats(),
};
document.documentElement.dataset.mcpOut = JSON.stringify({ hud: "on" });
