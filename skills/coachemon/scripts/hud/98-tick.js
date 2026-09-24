// One refresh: read the card, draw it. Above every renderer, so card dispatch is the only thing that knows which
// draw goes with which kind. It decides nothing about the card itself — 60-card does that — and formats nothing.
import { readCard } from "./60-card.js";
import { previewArm, previewCheck } from "./48-preview.js";
import { gameEvents, gameTables } from "./04-game-tables.js";
import { rerollArm, rerollCheck } from "./50-reroll.js";
import { journalCheck } from "./55-journal.js";
import { battleScene, clearMissed, controls, disclaimer, drawer, dropGame, el, glyph, missedSprite, openGroup, PANEL_W, panelState, setDraw, setRedraw, strip } from "./90-render.js";
import { captionBattle, drawBattle } from "./96-render-battle.js";
import { captionEncounter, drawEncounter } from "./96-render-encounter.js";
import { captionFusion, drawFusion } from "./96-render-fusion.js";
import { captionLearn, drawLearn } from "./96-render-learn.js";
import { captionRewards, drawRewards } from "./96-render-rewards.js";
import { captionStarters, drawStarters } from "./96-render-starters.js";
import { captionBiome, drawBiome } from "./97-render-biome.js";

// What the shell needs per kind: the renderer that turns one card into groups (#349 §1) — every kind's, now that
// the last four have followed, so the adapter that presented a node tree as one whole-card group is gone and with
// it everything it kept alive — and the caption its strip wears. The strip is the shell's and not a card's: a
// renderer returns groups and a caption, and knows nothing about what a view is (#349 §2), so no card draws its own
// strip or its own way back. The glyph a dismissal leaves behind has left this table with the kind's emoji it used
// to carry: **dismissed means silent**, so it is one mark that is the same every wave (#349 §10) and the shell owns
// it outright. One table, so a new kind is one entry.
const KIND = {
  battle: { draw: drawBattle, caption: captionBattle },
  rewards: { draw: drawRewards, caption: captionRewards },
  learn: { draw: drawLearn, caption: captionLearn },
  encounter: { draw: drawEncounter, caption: captionEncounter },
  starters: { draw: drawStarters, caption: captionStarters },
  fusion: { draw: drawFusion, caption: captionFusion },
  biome: { draw: drawBiome, caption: captionBiome },
};

// The panel as the shell shells it: its own control, the **strip**, the **drawer** — the tab bar and the open
// group's pane — and the disclaimer footer. **Strip and drawer are both visible, strip above drawer** (#349 §2):
// the call is never a click away, including while the player reads another group, and the cost — the act summary
// appearing on the strip while `act` is the group on show — is accepted. The controls float in the panel's corner,
// so the shell leaves them room on the first line it draws, which is the strip's head; no renderer knows they are
// there.
// **Shutting the drawer keeps the strip** (#349 §2, §3): the bar and the pane go and the one line the player always
// needs stays, so a whole run can be watched on one line. The card is still drawn in full — the groups are what the
// text is derived from — so what the drawer costs when it is shut is the shelling and nothing the coach computed.
const open = (card, groups) => {
  const kind = KIND[card.kind];
  return [controls(), strip(card, kind.caption(card), groups), ...(panelState() === "drawer" ? drawer(groups) : []), disclaimer()];
};

let last = ""; // the change signature of what is on screen: the DOM is only rebuilt when it moves
const sigOf = card => JSON.stringify([panelState(), openGroup(), card]);
let shown = null; // the card last drawn: `window.__coachHud.last()` / `summary()`
export const shownCard = () => shown;
// **The shown card's groups, drawn once per refresh and shared** (#361 §5): the shell shells them and the stream
// puts them on the wire with the text derived from them, where the stream used to draw the card a second time to
// say what it said. Lazy, so a refresh that neither redraws nor pushes draws nothing at all, and dropped with the
// card it belongs to, so nothing here can hand out last refresh's groups.
// `undefined` is "not drawn yet" and `null` is "drawn, and there was nothing": a card whose renderer yields nothing
// is drawn once too, rather than again on every call.
let groups;
export const shownGroups = () => {
  if (!shown) return null;
  if (groups === undefined) groups = KIND[shown.kind]?.draw(shown) ?? null;
  return groups;
};
const setShown = card => { shown = card; groups = undefined; };

// What the last refresh died on, or null: the panel shows it, and 99-start pushes it once per distinct message (§11.1).
let failure = null;
export const lastFailure = () => failure;

// The render layer derives a card's text from its groups through this, so `cardText` never has to know which draw
// goes with which kind — that stays here (§11.1). The disclaimer is not in it: that is the panel's footer, not a
// card's.
setDraw(card => (KIND[card.kind] ? KIND[card.kind].draw(card) : null));

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
    if (!s?.ui) { el.style.display = "none"; setShown(null); return; }
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
    if (!card) { el.style.display = "none"; setShown(null); return; }
    setShown(card);
    // What is on screen, so a tab click or a dismissal rebuilds and a refresh that changed nothing does not. The
    // open group is in it because the drawer draws one group of the card, not all of them.
    const sig = sigOf(card);
    el.style.display = "block";
    // The panel's width is the ladder's, not a literal: a dismissal shrinks to the glyph, and nothing else here
    // knows a number (#349 §4).
    el.style.width = panelState() === "closed" ? "auto" : PANEL_W;
    if (sig !== last) {
      clearMissed();
      // The disclaimer, the panel's two controls and the glyph that brings it back are all the panel's own, so no
      // card draws any of them — controls are the shell's, never a row's (§5).
      el.replaceChildren(...(panelState() === "closed" ? [glyph()] : open(card, shownGroups())));
      // Icon atlases load lazily; redraw next tick until every sprite is in. The signature is taken again rather
      // than reused: a card with no group the player was on moves the drawer to `act` as it draws (#349 §3), and
      // that move belongs in what was drawn.
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

// The close control redraws from the card already read, rather than waiting for the next refresh.
setRedraw(() => { last = ""; tick(); });
