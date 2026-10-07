// The watch (CONTEXT.md, `Watch`): a decision's card from its first ready frame to the next decision, built once and
// held, and asked of the game again only by a mon sent in. Nothing here decides what a card says.
import { decisionAt, decisionBegin, decisionEnd, note, refresh, stage } from "./01-meter.js";
import { detect } from "./02-decision.js";
import { gameEvents, gameTables } from "./04-game-tables.js";
import { previewArm, previewCheck } from "./48-preview.js";
import { rerollArm, rerollCheck } from "./50-reroll.js";
import { journalCheck } from "./55-journal.js";
import { hasRoad, keepRoad, readCard, readRoad } from "./60-card.js";
import { battleScene, clearMissed, controls, drawer, dropGame, el, glyph, missedSprite, openGroup, PANEL_W, panelState, setRedraw, strip } from "./90-render.js";
import { captionBattle, drawBattle } from "./96-render-battle.js";
import { captionEncounter, drawEncounter } from "./96-render-encounter.js";
import { captionFusion, drawFusion } from "./96-render-fusion.js";
import { captionLearn, drawLearn } from "./96-render-learn.js";
import { captionRewards, drawRewards } from "./96-render-rewards.js";
import { captionStarters, drawStarters } from "./96-render-starters.js";
import { captionBiome, drawBiome } from "./97-render-biome.js";

// The one place a kind meets its draw (#388).
const KIND = {
  battle: { draw: drawBattle, caption: captionBattle },
  rewards: { draw: drawRewards, caption: captionRewards },
  learn: { draw: drawLearn, caption: captionLearn },
  encounter: { draw: drawEncounter, caption: captionEncounter },
  starters: { draw: drawStarters, caption: captionStarters },
  fusion: { draw: drawFusion, caption: captionFusion },
  biome: { draw: drawBiome, caption: captionBiome },
};

// The lifecycle, in order, for the watch's test: `built`, `cached`, `redrawn`, `road landed`, `hidden`, `failed`.
const LOG = 64;
const log = [];
const logged = what => { log.push(what); if (log.length > LOG) log.shift(); };
// @only tests: watchLog, accountRead, rebuild
export const watchLog = () => log.splice(0);

// `cur` is the decision the game is on and `built` the one whose card is built; a key is compared field by field.
const NONE = { kind: null, k1: null, k2: null, k3: null, k4: null };
const cur = { ...NONE }, built = { ...NONE };
const same = (x, y) => x.kind === y.kind && x.k1 === y.k1 && x.k2 === y.k2 && x.k3 === y.k3 && x.k4 === y.k4;
const copy = (to, from) => { to.kind = from.kind; to.k1 = from.k1; to.k2 = from.k2; to.k3 = from.k3; to.k4 = from.k4; };
const isBuilt = () => built.kind !== null && same(cur, built);
const open = () => cur.kind !== null;

// True on the first ready frame of a decision whose card is not built yet, and writes the meter's decision record.
const look = s => {
  const d = detect(s);
  if (!same(d, cur)) {
    copy(cur, d);
    if (d.kind) decisionBegin(d.kind, d.card, s.currentBattle?.waveIndex ?? null);
    else decisionEnd();
  }
  if (!d.ready) return false;
  decisionAt("ready");
  if (d.input) decisionAt("input");
  if (same(d, built)) return false;
  copy(built, d);
  return true;
};

// What the panel shows: `{ card, key, road, version, failure, groups }`. `road` is `none`, `owed` or `landed`;
// `version` is bumped on every change and is unique across records, so the draw keys on it. A failure is a record
// with no card.
let versions = 0;
let shown = null;
export const watchShown = () => shown;
const record = (card, landed) => ({
  card, key: { ...built }, road: !hasRoad(card) ? "none" : landed ? "landed" : "owed",
  version: ++versions, failure: null, groups: undefined,
});
const changed = rec => { rec.version = ++versions; rec.groups = undefined; };

// The records of the last few decisions built, so returning to one shows its card as it was, road and all (#544).
const CACHED = 8;
const cache = [];
const remember = rec => {
  if (!isBuilt()) return;
  const i = cache.findIndex(e => same(e.key, built));
  if (i >= 0) cache.splice(i, 1);
  cache.push(rec);
  if (cache.length > CACHED) cache.shift();
};
const cached = () => cache.find(e => same(e.key, built)) ?? null;

// The front of each party as of the last battle card built, which a learn card held since does not replace: a send-in
// after the learn still redraws, from that battle card (#537). A send-in swaps party entries, so a faint, which swaps
// none, is no send-in (game-code.md §7).
const field = { from: null, battle: null, p0: null, p1: null, e0: null, e1: null };
const fronts = s => {
  const b = s.currentBattle, p = s.getPlayerParty(), e = s.getEnemyParty();
  field.p0 = p[0]; field.e0 = e[0];
  field.p1 = b.double ? p[1] : null; field.e1 = b.double ? e[1] : null;
};
const takeField = (s, rec) => {
  if (rec?.card?.kind === "learn") return;
  field.from = rec?.card?.kind === "battle" ? rec : null;
  field.battle = field.from ? s.currentBattle ?? null : null;
  if (field.battle) fronts(s);
};
// True on the first frame between decisions that the battle the card was built for has a mon in front it wasn't built
// for. A new wave is a new battle, and sends nothing in.
const sentIn = s => {
  const b = s?.currentBattle;
  if (open() || !b || b !== field.battle) return false;
  const p = s.getPlayerParty(), e = s.getEnemyParty();
  if (p[0] === field.p0 && e[0] === field.e0 && (!b.double || (p[1] === field.p1 && e[1] === field.e1))) return false;
  fronts(s);
  return true;
};
const forget = () => { copy(built, NONE); field.from = null; field.battle = null; cache.length = 0; };

// Drawn once per record version, for the shell and the stream alike (extension-distribution.md §11.1). `undefined` is
// not drawn yet and `null` is drawn with nothing, so a renderer that yields nothing is not run again on every call.
const groupsOf = rec => {
  if (rec.groups === undefined) rec.groups = stage("groups", () => KIND[rec.card.kind]?.draw(rec.card) ?? null);
  return rec.groups;
};
const openPanel = (card, groups) => {
  const kind = KIND[card.kind];
  return [controls(), strip(card, kind.caption(card), groups), ...(panelState() === "drawer" ? drawer(groups) : [])];
};
let last = "";
const sigOf = rec => JSON.stringify([panelState(), openGroup(), rec.version]);
// A draw that wanted a sprite it didn't get banks neither its signature nor its groups, so the next draw tries again.
let retry = false;
const draw = rec => {
  shown = rec;
  const sig = sigOf(rec);
  el.style.display = "block";
  el.style.width = panelState() === "closed" ? "auto" : PANEL_W;
  if (sig !== last) {
    note({ drew: true });
    stage("dom", () => {
      clearMissed();
      if (retry) rec.groups = undefined;
      const groups = groupsOf(rec);
      el.replaceChildren(...(panelState() === "closed" ? [glyph()] : openPanel(rec.card, groups)));
    });
    retry = missedSprite();
    // Taken again, not `sig`: drawing a card that lacks the open group moves the drawer to `act` (#349).
    last = retry ? "" : sigOf(rec);
  }
};
const hide = () => {
  el.style.display = "none";
  if (shown) logged("hidden");
  shown = null;
};
const fail = e => {
  dropGame();
  shown = { ...record(null, false), failure: e.message };
  note({ failed: true });
  el.style.display = "block";
  el.textContent = `coach: ${e.message}`;
  last = "";
  logged("failed");
};

// Runs outside `sandbox`, so nothing here may write game state or draw from its RNG.
export const accountRead = s => {
  const gd = s.gameData ?? {};
  let shinyCatchMultiplier = 2;
  try { shinyCatchMultiplier = gameEvents()?.getShinyCatchMultiplier() ?? 2; } catch {}
  let species = null;
  try { species = gameTables()?.species ?? null; } catch {}
  return {
    dex: gd.dexData ?? {},
    starter: gd.starterData ?? {},
    species,
    party: (s.getPlayerParty?.() ?? []).filter(Boolean),
    daily: !!s.gameMode?.isDaily,
    shinyCatchMultiplier,
  };
};

const screenNote = (s, card) => note({ kind: card?.kind ?? null, wave: card?.wave ?? s.currentBattle?.waveIndex ?? null,
  mode: s.ui.getMode?.() ?? null, phase: s.phaseManager?.getCurrentPhase?.()?.phaseName ?? null });
// Only a card's own build arms, so a look-ahead read can't take the prediction's place.
const armPreview = card => { if (card?.preview && card.preview.wave === card.wave + 1) previewArm(card.preview); };

// `road: false` leaves the road group to `land`. A send-in reads the turn without the game and takes the road group of
// the battle card it redraws, stale until the next decision (CONTEXT.md, `Turn read`).
const build = (road, sendIn = false) => {
  try {
    const s = battleScene();
    if (!s?.ui) { hide(); return; }
    // Before `readCard`: `previewArm` and `rerollArm` overwrite the prediction these two score.
    stage("check", () => { rerollCheck(s); previewCheck(s); });
    const card = stage("read", () => readCard(s, accountRead(s), { road, estimate: sendIn }));
    screenNote(s, card);
    stage("arm", () => {
      armPreview(card);
      if (card?.kind === "rewards") rerollArm(s, card.rerollAhead);
    });
    // Every build, whatever the card: the journal traces the fight and the rewards an encounter starts.
    stage("journal", () => journalCheck(s, card));
    if (!card) { takeField(s, null); hide(); return; }
    let landed = road && hasRoad(card);
    if (sendIn && field.from?.road === "landed" && hasRoad(card)) { keepRoad(field.from.card, card); landed = true; }
    const rec = record(card, landed);
    takeField(s, rec);
    if (sendIn) logged("redrawn");
    else { remember(rec); logged("built"); if (landed) logged("road landed"); }
    draw(rec);
  } catch (e) { fail(e); }
};

// A card built for this decision before, drawn without reading the game.
const show = rec => {
  try {
    const s = battleScene();
    if (!s?.ui) { hide(); return; }
    screenNote(s, rec.card);
    takeField(s, rec);
    logged("cached");
    draw(rec);
  } catch (e) { fail(e); }
};
// A decision built before shows the card it was built with. `road: false` leaves the road group to `landLater`.
const decide = road => {
  const rec = cached();
  if (!rec) { build(road); return; }
  show(rec);
  if (road) land();
};

let after = () => {};
// Every refresh the watch opens ends with `after`: the stream, which 99-start wires in.
const run = (why, fn) => refresh(why, () => { fn(); after(); });

const land = () => {
  const rec = shown;
  if (rec?.road !== "owed") return;
  try {
    const s = battleScene();
    if (!s?.ui) return;
    screenNote(s, rec.card);
    stage("road", () => readRoad(s, rec.card));
    rec.road = "landed";
    changed(rec);
    stage("arm", () => armPreview(rec.card));
    logged("road landed");
    draw(rec);
  } catch (e) { fail(e); }
};
// The road group lands in its own task, so a press between the card and the task leaves it to the next decision (#487).
// A re-inject's `stop()` removes the panel, and a task queued before it then lands nothing.
const landLater = () => {
  const rec = shown;
  setTimeout(() => {
    if (shown === rec && rec.road === "owed" && isBuilt() && el.isConnected !== false) run("road", land);
  }, 0);
};

// A look that throws is no decision, and the fallback's next tick reports it: with frames, nothing else would.
let lookFailed = null;
const scene = () => { try { return battleScene(); } catch { return null; } };
const tryLook = s => { try { const fresh = look(s); lookFailed = null; return fresh; } catch (e) { lookFailed = e; return false; } };
const trySentIn = s => { try { return sentIn(s); } catch (e) { lookFailed = e; return false; } };
const gone = s => !s?.ui || (!open() && s.phaseManager?.getCurrentPhase?.()?.phaseName === "TitlePhase");

// A frame since the last fallback tick: the watch is looking, so the fallback builds nothing.
let framed = false;
export const watchFrame = () => {
  framed = true;
  const s = scene();
  if (tryLook(s)) {
    run(cached() ? "cache" : "watch", () => decide(false));
    if (shown?.road === "owed") landLater();
  } else if (trySentIn(s)) {
    run("send-in", () => build(false, true));
  }
};

export const watchFallback = () => run("fallback", () => {
  const quiet = !framed;
  framed = false;
  let s, fresh = false, away = false;
  try { s = battleScene(); fresh = quiet && tryLook(s); away = gone(s); } catch (e) { lookFailed = e; }
  if (lookFailed) {
    fail(lookFailed);
    lookFailed = null;
    forget();
  } else if (fresh) {
    decide(true);
  } else {
    if (s?.ui) stage("journal", () => journalCheck(s, shown?.card ?? null));
    if (away) { hide(); forget(); }
  }
});

// The screen the overlay lands on, drawn whole; the decision it lands on counts as built.
export const watchStart = then => {
  after = then;
  run("start", () => { tryLook(scene()); build(true); });
};

// A tab, the caret or the ×: the shown card again in the new view, and nothing read from the game.
setRedraw(() => run("click", () => { last = ""; if (shown?.card) draw(shown); }));

export const rebuild = () => run("watch", () => build(true));
