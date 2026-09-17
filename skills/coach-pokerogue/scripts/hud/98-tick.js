// One refresh: read the card, draw it. Above every renderer, so card dispatch is the only thing that knows which
// draw goes with which kind. It decides nothing about the card itself — 60-card does that — and formats nothing.
import { readCard } from "./60-card.js";
import { previewCheck } from "./48-preview.js";
import { rerollCheck } from "./50-reroll.js";
import { battleScene, clearMissed, collapsedCard, dropGame, el, missedSprite, setRedraw, setShownCardWave, view } from "./90-render.js";
import { drawBattle } from "./96-render-battle.js";
import { drawEncounter } from "./96-render-encounter.js";
import { drawFusion } from "./96-render-fusion.js";
import { drawLearn } from "./96-render-learn.js";
import { drawRewards } from "./96-render-rewards.js";
import { drawStarters } from "./96-render-starters.js";
import { drawBiome } from "./97-render-biome.js";

const DRAW = { learn: drawLearn, rewards: drawRewards, battle: drawBattle, biome: drawBiome, encounter: drawEncounter, starters: drawStarters, fusion: drawFusion };

let last = ""; // the change signature of what is on screen: the DOM is only rebuilt when it moves
let shown = null; // the card last drawn: `window.__coachHud.last()` / `summary()`
export const shownCard = () => shown;

export const tick = () => {
  try {
    const s = battleScene();
    // Mid-reload or on the title screen: nothing to coach, and the scene isn't wired up yet.
    if (!s?.ui) { el.style.display = "none"; shown = null; return; }
    // Score a reroll the player just made, and the last wave preview against the wave that actually arrived, before
    // the card reads the next ones. Both are reads of the scene, and both are the tick's business, not a card's.
    rerollCheck(s);
    previewCheck(s);
    const card = readCard(s);
    if (!card) { el.style.display = "none"; shown = null; return; }
    shown = card;
    // A view picked by a button holds until the card or wave changes.
    setShownCardWave(`${card.kind}:${card.wave}`);
    const collapsed = collapsedCard(card);
    const sig = JSON.stringify([view(), collapsed, card]);
    el.style.display = "block";
    el.style.width = view() === "full" && !collapsed ? "300px" : "auto";
    if (sig !== last) {
      clearMissed();
      el.replaceChildren(...DRAW[card.kind](card));
      // Icon atlases load lazily; redraw next tick until every sprite is in.
      last = missedSprite() ? "" : sig;
    }
  } catch (e) {
    dropGame();
    el.style.display = "block";
    el.textContent = `coach: ${e.message}`;
    last = "";
  }
};

// A view button redraws from the card already read, rather than waiting for the next refresh.
setRedraw(() => { last = ""; tick(); });
