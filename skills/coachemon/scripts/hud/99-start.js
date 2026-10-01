// The refresh loop and the card stream (extension-distribution.md §11.1, §9.1, §9.5).
import { sandboxBreachCount } from "./01-core.js";
import { meterFacts, meterStats, note, onFrame, refresh, stage } from "./01-meter.js";
import { watchBuilt, watchFrame, watchOpen } from "./02-watch.js";
import { dropChunkHandoff } from "./04-game-tables.js";
import { previewStats } from "./48-preview.js";
import { rerollStats } from "./50-reroll.js";
import { journalCheck, journalClear, journalEntries, journalStats } from "./55-journal.js";
import { EVENT_KINDS, cardEvent, cardSummary, hasRoad } from "./60-card.js";
import { battleScene, el, spriteMisses, wireCard } from "./90-render.js";
import { hideCard, lastFailure, roadNow, shownCard, shownGroups, tick, tickNoRoad } from "./98-tick.js";

// By hand from the relay's `extension/src/relay/channel.ts`; `scripts/test/cardeventtest.mjs` fails when they drift.
const CARD_EVENT = "coachemon:card", COACH_ERROR_EVENT = "coachemon:coach-error";
const hudBuild = typeof COACHEMON_BUILD === "string" ? COACHEMON_BUILD : null;
let sentCard = null, sentError = null;

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
  if (sig === sentCard) return;
  const body = bodyOf(ev);
  if (typeof body?.text !== "string") return;
  sentCard = sig;
  push(CARD_EVENT, body);
};

// The prototype's switch between the two refresh models (#519), read once at start.
const REFRESH_KEY = "coachemon:refresh";
let model = "clock";
try { if (localStorage.getItem(REFRESH_KEY) === "watch") model = "watch"; } catch {}

const scene = () => { try { return battleScene(); } catch { return null; } };

const clockTick = () => refresh("clock", () => { tick(); stage("stream", stream); });

// Never builds: the card stays held until the next decision, and only a game that has gone takes it down.
const fallback = () => refresh("fallback", () => {
  const s = scene();
  const phase = s?.phaseManager?.getCurrentPhase?.()?.phaseName ?? null;
  note({ kind: shownCard()?.kind ?? null, wave: s?.currentBattle?.waveIndex ?? null, phase });
  if (!s?.ui || (!watchOpen() && phase === "TitlePhase")) { hideCard(); return; }
  stage("journal", () => journalCheck(s, shownCard()));
});

// Gotcha: the road task runs after the frame the card paints in, and only while the decision that built it is still
// open; a press in between leaves the road group stale until the next decision (#487).
const roadLater = () => setTimeout(() => { if (watchBuilt()) refresh("road", roadNow); }, 0);
const watchTick = () => {
  const s = scene();
  if (!s?.ui || !watchFrame(s)) return;
  refresh("watch", () => { tickNoRoad(); stage("stream", stream); });
  if (hasRoad(shownCard())) roadLater();
};

let timer;
if (model === "watch") {
  onFrame(watchTick);
  timer = setInterval(fallback, 2000);
} else {
  onFrame(() => { const s = scene(); if (s?.ui) watchFrame(s); });
  timer = setInterval(clockTick, 1000);
  clockTick();
}
meterFacts(() => {
  const loop = battleScene()?.game?.loop;
  // game-code.md §22.
  let lang = null;
  try { lang = localStorage.getItem("prLang"); } catch {}
  return { fps: loop ? Math.round(loop.actualFps) : null, setTimeoutLoop: loop?.raf?.isSetTimeOut ?? null, lang, sprites: spriteMisses(), refresh: model };
});
// Called from outside the bundle — probe.js, src/page/card.ts, 00-prelude.js's re-inject and the skill's docs — so no
// method here is renamed alone.
window.__coachHud = {
  stop: () => { clearInterval(timer); onFrame(null); el.remove(); dropChunkHandoff(); delete window.__coachHud; },
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
