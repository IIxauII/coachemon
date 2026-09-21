// One refresh: read the card, draw it. Above every renderer, so card dispatch is the only thing that knows which
// draw goes with which kind. It decides nothing about the card itself — 60-card does that — and formats nothing.
import { readCard } from "./60-card.js";
import { previewArm, previewCheck } from "./48-preview.js";
import { gameEvents, gameTables } from "./04-game-tables.js";
import { rerollArm, rerollCheck } from "./50-reroll.js";
import { journalCheck } from "./55-journal.js";
import { battleScene, clearMissed, collapsedCard, disclaimer, dropGame, el, missedSprite, setDraw, setRedraw, setShownCardWave, view } from "./90-render.js";
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

// What the last refresh died on, or null: the panel shows it, and 99-start pushes it once per distinct message (§11.1).
let failure = null;
export const lastFailure = () => failure;

// The render layer draws a card as text through this, so `cardText` never has to know which draw goes with which kind
// — that stays here (§11.1). The disclaimer is not in it: that is the panel's footer, not a card's.
setDraw(card => (DRAW[card.kind] ? DRAW[card.kind](card) : null));

// The **account read**: what the run has caught and unlocked, plus the party it would join and the event's shiny
// multiplier. It is not turn state — the catch card weighs a throw by it, and the Mystery Encounter card weighs a
// mon it is handed by the same numbers — so it is read once here and passed down, rather than each card reaching
// into `gameData` for itself. Plain reads only: no game call, no sandbox.
// @only tests: accountRead
export const accountRead = s => {
  const gd = s.gameData ?? {};
  let shinyCatchMultiplier = 2;
  try { shinyCatchMultiplier = gameEvents()?.getShinyCatchMultiplier() ?? 2; } catch {}
  // The species registry, once the chunk scan has it: the only way to reach a species nothing on the field is. The
  // catch card needs the root of a caught line — not its dex entry, which is keyed by id, but the species itself,
  // whose unlock mask decides whether a Daily run pays candy for the throw.
  let species = null;
  try { species = gameTables()?.species ?? null; } catch {}
  return {
    dex: gd.dexData ?? {},
    starter: gd.starterData ?? {},
    species,
    party: (s.getPlayerParty?.() ?? []).filter(Boolean),
    // A Daily run pays candy only for a catch that adds a dex attribute, so what the dex is worth depends on it.
    daily: !!s.gameMode?.isDaily,
    shinyCatchMultiplier,
  };
};

export const tick = () => {
  try {
    failure = null;
    const s = battleScene();
    // Mid-reload or on the title screen: nothing to coach, and the scene isn't wired up yet.
    if (!s?.ui) { el.style.display = "none"; shown = null; return; }
    // Score a reroll the player just made, and the last wave preview against the wave that actually arrived, before
    // the card reads the next ones. Both are reads of the scene, and both are the tick's business, not a card's.
    rerollCheck(s);
    previewCheck(s);
    const card = readCard(s, accountRead(s));
    // Arm the preview tally with the wave the player is about to walk into — the card's own preview, and only when
    // it is the next wave's. A read arms nothing; the tick does, so a look-ahead can't take the prediction's place.
    if (card?.preview && card.preview.wave === card.wave + 1) previewArm(card.preview);
    if (card?.kind === "rewards") rerollArm(s, card.rerollAhead);
    // Write a Mystery Encounter down as it happens, card and all, for the live check on the encounter judgments. It
    // runs on every refresh rather than only on the encounter card, because the half worth recording — what the game
    // did with the pick — lands on the waves after the option screen is gone.
    journalCheck(s, card);
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
      // The full view carries the disclaimer as its footer line (§3); it is the panel's, so no card draws it.
      el.replaceChildren(...DRAW[card.kind](card), ...(view() === "full" && !collapsed ? [disclaimer()] : []));
      // Icon atlases load lazily; redraw next tick until every sprite is in.
      last = missedSprite() ? "" : sig;
    }
  } catch (e) {
    dropGame();
    failure = e.message;
    el.style.display = "block";
    el.textContent = `coach: ${e.message}`;
    last = "";
  }
};

// A view button redraws from the card already read, rather than waiting for the next refresh.
setRedraw(() => { last = ""; tick(); });
