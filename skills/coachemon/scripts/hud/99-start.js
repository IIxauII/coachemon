// The watch's builds, its fallback clock and the card stream (extension-distribution.md §11.1, §9.1, §9.5).
import { sandboxBreachCount } from "./01-core.js";
import { meterFacts, meterStats, onFrame, refresh, stage } from "./01-meter.js";
import { watchBuilt, watchForget, watchFrame, watchOpen, watchSentIn } from "./02-decision.js";
import { dropChunkHandoff } from "./04-game-tables.js";
import { previewStats } from "./48-preview.js";
import { rerollStats } from "./50-reroll.js";
import { journalCheck, journalClear, journalEntries, journalStats } from "./55-journal.js";
import { EVENT_KINDS, cardEvent, cardSummary, roadLanded } from "./60-card.js";
import { battleScene, el, setRedraw, spriteMisses, wireCard } from "./90-render.js";
import { fail, hideCard, lastFailure, redraw, roadNow, roadOwed, sentIn, shownCard, shownGroups, tick } from "./98-tick.js";

// By hand from the relay's `extension/src/relay/channel.ts`; `scripts/test/cardeventtest.mjs` fails when they drift.
const CARD_EVENT = "coachemon:card", COACH_ERROR_EVENT = "coachemon:coach-error";
const hudBuild = typeof COACHEMON_BUILD === "string" ? COACHEMON_BUILD : null;
let sentCard = null, sentRoad = false, sentError = null;

const push = (type, detail) => {
  if (hudBuild === null) return;
  try {
    document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify({ build: hudBuild, ...detail }) }));
  } catch {}
};

const eventNow = () => { try { return cardEvent(shownCard()); } catch { return null; } };
// The one body the `card` read answers with and the stream pushes.
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
  const failed = lastFailure();
  if (failed !== sentError) {
    sentError = failed;
    if (failed) push(COACH_ERROR_EVENT, { message: String(failed) });
  }
  if (failed) return;
  const ev = eventNow();
  // An unstreamable card leaves `sentCard` standing, so coming back to the last one is not a second event.
  if (!ev || EVENT_KINDS.indexOf(ev.kind) < 0 || typeof ev.wave !== "number" || typeof ev.key !== "string" || typeof ev.verdict !== "string") return;
  // The kind rides in the signature because two kinds share a key on one wave: a biome choice and its battle are both
  // keyed on the wave alone.
  const sig = `${ev.kind}|${ev.key}|${ev.verdict}`;
  const road = roadLanded(shownCard());
  // The road group lands after its card, so a card sent without it goes again once it has it (#542).
  if (sig === sentCard && (sentRoad || !road)) return;
  const body = bodyOf(ev);
  if (typeof body?.text !== "string") return;
  sentCard = sig;
  sentRoad = road;
  push(CARD_EVENT, body);
};

const scene = () => { try { return battleScene(); } catch { return null; } };
// A look that throws is no decision, and the fallback's next tick reports it: with frames, nothing else would.
let lookFailed = null;
const look = s => {
  try { const fresh = watchFrame(s); lookFailed = null; return fresh; } catch (e) { lookFailed = e; return false; }
};
const lookSentIn = s => { try { return watchSentIn(s); } catch (e) { lookFailed = e; return false; } };
const gone = s => !s?.ui || (!watchOpen() && s.phaseManager?.getCurrentPhase?.()?.phaseName === "TitlePhase");

// Every card build takes a new generation, so a press between the card and its road task leaves the road group to the
// next decision (#487).
let roadTimer = 0, cardGen = 0;
const roadLater = () => {
  const id = cardGen;
  roadTimer = setTimeout(() => {
    if (id === cardGen && watchBuilt()) refresh("road", () => { roadNow(); stage("stream", stream); });
  }, 0);
};

// A frame since the last fallback tick: the watch is looking, so the fallback builds nothing.
let framed = false;
onFrame(() => {
  framed = true;
  const s = scene();
  if (look(s)) {
    cardGen++;
    refresh("watch", () => { tick(false); stage("stream", stream); });
    if (roadOwed()) roadLater();
  } else if (lookSentIn(s)) {
    cardGen++;
    refresh("send-in", () => { sentIn(); stage("stream", stream); });
  }
});

const fallback = () => refresh("fallback", () => {
  const quiet = !framed;
  framed = false;
  let s, fresh = false, away = false;
  try { s = battleScene(); fresh = quiet && look(s); away = gone(s); } catch (e) { lookFailed = e; }
  if (lookFailed) {
    fail(lookFailed);
    lookFailed = null;
    watchForget();
  } else if (fresh) {
    cardGen++;
    tick(true);
  } else {
    if (s?.ui) stage("journal", () => journalCheck(s, shownCard()));
    if (away) { hideCard(); watchForget(); }
  }
  stage("stream", stream);
});
const timer = setInterval(fallback, 1000);

// The screen the overlay lands on, drawn whole; the decision it lands on counts as built.
refresh("start", () => { look(scene()); tick(true); stage("stream", stream); });
setRedraw(() => refresh("click", () => { cardGen++; redraw(); stage("stream", stream); }));
meterFacts(() => {
  const loop = battleScene()?.game?.loop;
  // game-code.md §22.
  let lang = null;
  try { lang = localStorage.getItem("prLang"); } catch {}
  return { fps: loop ? Math.round(loop.actualFps) : null, setTimeoutLoop: loop?.raf?.isSetTimeOut ?? null, lang, sprites: spriteMisses() };
});
// Called from outside the bundle — probe.js, src/page/card.ts, 00-prelude.js's re-inject and the skill's docs — so no
// method here is renamed alone.
window.__coachHud = {
  stop: () => { clearInterval(timer); clearTimeout(roadTimer); onFrame(null); el.remove(); dropChunkHandoff(); delete window.__coachHud; },
  stats: () => ({ breaches: sandboxBreachCount(), ...meterStats() }),
  last: () => shownCard(),
  summary: () => cardSummary(shownCard()),
  card: () => cardNow(),
  preview: () => previewStats(),
  reroll: () => rerollStats(),
  journal: () => journalEntries(),
  journalStats: () => journalStats(),
  journalClear: () => journalClear(),
};
document.documentElement.dataset.mcpOut = JSON.stringify({ hud: "on" });
