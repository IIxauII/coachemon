// `KIND` is the one place a kind meets its draw (#388). This file decides nothing about the card and formats nothing.
import { note, refresh, stage } from "./01-meter.js";
import { watchField, watchKeep } from "./02-decision.js";
import { hasRoad, keepRoad, readCard, readRoad, roadLanded } from "./60-card.js";
import { previewArm, previewCheck } from "./48-preview.js";
import { gameEvents, gameTables } from "./04-game-tables.js";
import { rerollArm, rerollCheck } from "./50-reroll.js";
import { journalCheck } from "./55-journal.js";
import { battleScene, clearMissed, controls, drawer, dropGame, el, glyph, missedSprite, openGroup, PANEL_W, panelState, strip } from "./90-render.js";
import { captionBattle, drawBattle } from "./96-render-battle.js";
import { captionEncounter, drawEncounter } from "./96-render-encounter.js";
import { captionFusion, drawFusion } from "./96-render-fusion.js";
import { captionLearn, drawLearn } from "./96-render-learn.js";
import { captionRewards, drawRewards } from "./96-render-rewards.js";
import { captionStarters, drawStarters } from "./96-render-starters.js";
import { captionBiome, drawBiome } from "./97-render-biome.js";

const KIND = {
  battle: { draw: drawBattle, caption: captionBattle },
  rewards: { draw: drawRewards, caption: captionRewards },
  learn: { draw: drawLearn, caption: captionLearn },
  encounter: { draw: drawEncounter, caption: captionEncounter },
  starters: { draw: drawStarters, caption: captionStarters },
  fusion: { draw: drawFusion, caption: captionFusion },
  biome: { draw: drawBiome, caption: captionBiome },
};

const open = (card, groups) => {
  const kind = KIND[card.kind];
  return [controls(), strip(card, kind.caption(card), groups), ...(panelState() === "drawer" ? drawer(groups) : [])];
};

let last = "";
const sigOf = card => JSON.stringify([panelState(), openGroup(), card]);
let shown = null;
export const shownCard = () => shown;
// Drawn once per shown card, for the shell and the stream alike (extension-distribution.md §11.1). `undefined` is not
// drawn yet and `null` is drawn with nothing, so a renderer that yields nothing is not run again on every call.
let groups;
export const shownGroups = () => {
  if (!shown) return null;
  if (groups === undefined) groups = stage("groups", () => KIND[shown.kind]?.draw(shown) ?? null);
  return groups;
};
const setShown = card => { shown = card; groups = undefined; };

let failure = null;
export const lastFailure = () => failure;

// Runs outside `sandbox`, so nothing here may write game state or draw from its RNG.
// @only tests: accountRead
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

export const hideCard = () => { el.style.display = "none"; setShown(null); };

const draw = card => {
  setShown(card);
  const sig = sigOf(card);
  el.style.display = "block";
  el.style.width = panelState() === "closed" ? "auto" : PANEL_W;
  if (sig !== last) {
    note({ drew: true });
    stage("dom", () => {
      clearMissed();
      el.replaceChildren(...(panelState() === "closed" ? [glyph()] : open(card, shownGroups())));
    });
    // Taken again, not `sig`: drawing a card that lacks the open group moves the drawer to `act` (#349).
    last = missedSprite() ? "" : sigOf(card);
  }
};

export const fail = e => {
  dropGame();
  failure = e.message;
  note({ failed: true });
  el.style.display = "block";
  el.textContent = `coach: ${e.message}`;
  last = "";
};

const screenNote = (s, card) => note({ kind: card?.kind ?? null, wave: card?.wave ?? s.currentBattle?.waveIndex ?? null,
  mode: s.ui.getMode?.() ?? null, phase: s.phaseManager?.getCurrentPhase?.()?.phaseName ?? null });
// Only a card's own build arms, so a look-ahead read can't take the prediction's place.
const armPreview = card => { if (card?.preview && card.preview.wave === card.wave + 1) previewArm(card.preview); };

// The battle card the watch's field was taken from, which a learn card held since does not replace.
let fieldCard = null;
// A learn card keeps the field of the battle card before it, so a send-in after the learn still redraws (#537).
const takeField = (s, card) => {
  if (card?.kind === "learn") return;
  fieldCard = card?.kind === "battle" ? card : null;
  watchField(fieldCard && s);
};
const body = (road, sendIn = false) => {
  try {
    failure = null;
    const s = battleScene();
    if (!s?.ui) { hideCard(); return; }
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
    const replaced = fieldCard;
    takeField(s, card);
    if (!card) { hideCard(); return; }
    // After the arm: only a card's own build arms the preview.
    if (sendIn) keepRoad(replaced, card);
    else watchKeep(card);
    draw(card);
  } catch (e) { fail(e); }
};

// `road: false` builds the card alone, its road group left to `roadNow`.
export const tick = (road = true) => refresh("tick", () => body(road));
// Never asks the game (CONTEXT.md, `Turn read`).
export const sentIn = () => refresh("tick", () => body(false, true));
// A card already built for this decision, drawn without reading the game.
export const showKept = card => refresh("tick", () => {
  try {
    failure = null;
    const s = battleScene();
    if (!s?.ui) { hideCard(); return; }
    screenNote(s, card);
    takeField(s, card);
    draw(card);
  } catch (e) { fail(e); }
});

export const roadOwed = () => hasRoad(shown) && !roadLanded(shown);
export const roadNow = () => {
  const card = shown;
  if (!roadOwed()) return;
  try {
    const s = battleScene();
    if (!s?.ui) return;
    screenNote(s, card);
    stage("road", () => readRoad(s, card));
    stage("arm", () => armPreview(card));
    draw(card);
  } catch (e) { fail(e); }
};

export const redraw = () => { last = ""; body(true); };
