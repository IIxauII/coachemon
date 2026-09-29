// `KIND` is the one place a kind meets its draw (#388). This file decides nothing about the card and formats nothing.
import { readCard } from "./60-card.js";
import { previewArm, previewCheck } from "./48-preview.js";
import { gameEvents, gameTables } from "./04-game-tables.js";
import { rerollArm, rerollCheck } from "./50-reroll.js";
import { journalCheck } from "./55-journal.js";
import { battleScene, clearMissed, controls, drawer, dropGame, el, glyph, missedSprite, openGroup, PANEL_W, panelState, setRedraw, strip } from "./90-render.js";
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
  if (groups === undefined) groups = KIND[shown.kind]?.draw(shown) ?? null;
  return groups;
};
const setShown = card => { shown = card; groups = undefined; };

let failure = null;
export const lastFailure = () => failure;

// Runs outside `sandbox`: plain reads only.
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

export const tick = () => {
  try {
    failure = null;
    const s = battleScene();
    if (!s?.ui) { el.style.display = "none"; setShown(null); return; }
    rerollCheck(s);
    previewCheck(s);
    const card = readCard(s, accountRead(s));
    // Only the tick arms, so a look-ahead read can't take the prediction's place.
    if (card?.preview && card.preview.wave === card.wave + 1) previewArm(card.preview);
    if (card?.kind === "rewards") rerollArm(s, card.rerollAhead);
    // Every refresh, not only on the encounter card: what the game did with the pick lands on the waves after it.
    journalCheck(s, card);
    if (!card) { el.style.display = "none"; setShown(null); return; }
    setShown(card);
    const sig = sigOf(card);
    el.style.display = "block";
    el.style.width = panelState() === "closed" ? "auto" : PANEL_W;
    if (sig !== last) {
      clearMissed();
      el.replaceChildren(...(panelState() === "closed" ? [glyph()] : open(card, shownGroups())));
      // Taken again, not `sig`: drawing a card that lacks the open group moves the drawer to `act` (#349).
      last = missedSprite() ? "" : sigOf(card);
    }
  } catch (e) {
    dropGame();
    failure = e.message;
    el.style.display = "block";
    el.textContent = `coach: ${e.message}`;
    last = "";
  }
};

setRedraw(() => { last = ""; tick(); });
