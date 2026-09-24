// The panel itself: its element, the sprites and text helpers every card is drawn from, and what it remembers of the
// view the player left it in. It draws no card and decides nothing - 60-card works out what is on screen, the
// renderers above turn one card into groups, and 98-tick puts the two together.
// State another file needs is read and written through functions, never exported as a binding.
let game = null;
const sprites = new Map();
let missed = false; // a wanted sprite wasn't loaded yet during the last draw

// The battle scene, through the Phaser game the page holds. `dropGame` forgets it after a failed refresh, so the
// next one looks it up again (the page may have reloaded under us).
export const battleScene = () => {
  game ??= Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game;
  return game.scene.getScene("battle");
};
export const dropGame = () => { game = null; };
// Icon atlases load lazily, so a draw that wanted a sprite it didn't get is drawn again next refresh.
export const missedSprite = () => missed;
export const clearMissed = () => { missed = false; };

const sprite = (key, frame) => {
  const id = `${key}/${frame}`;
  if (!sprites.has(id)) {
    try {
      const t = game.textures;
      // Icon atlases load lazily; don't cache a miss, retry next refresh.
      if (t.exists(key) && t.get(key).has(frame)) sprites.set(id, t.getBase64(key, frame));
    } catch {}
  }
  return sprites.get(id) ?? "";
};

// ---- The skin (#349 §8, §9)
// The panel quotes the game's window instead of inventing a box: the game's window interior as the fill, its outline
// as one shadow at 1px offset for the whole object, its message white for body text. **The fill is opaque**, and the
// cost is named: an opaque panel occludes strictly more. It is taken because a translucent fill made the effective
// background whatever the battle happened to be doing, which is why contrast had three answers and why the shadow
// inverted on the commonest one.
// Authorship is the one treatment the game never draws: a 1px flat gold rule around the whole object — whatever is
// showing, since the panel is one object that changes height. The ink is quoted and the treatment is not, because
// the game's own windows are a beveled nine-slice. So the panel never draws the game's window texture at all, pins
// this one interior, and does not follow the player's chosen skin — which is what holds §8's palette shut.
// It never names itself either: no mark, no wordmark, nowhere.
export const SKIN = { fill: "#362d3e", body: "#f8f8f8", rule: "#f8b050", shadow: "#181818" };

// ---- The footprint and the type ladder (#349 §4)
// The panel is a constant fraction of the game rather than a pixel width against a canvas that scales, so it covers
// the same share of the field at every window shape. The canvas is a fitted 1920×1080, so the game's drawn width is
// reproducible in pure CSS — no canvas rect read, no resize observer, neither of which the repo has or gains.
// Position stays the viewport's top-left: off 16:9 that corner *is* the game's own letterbox bar, so the panel
// occludes nothing there for free and does not relocate when the player resizes.
// The knob is a JS constant inlined into every length rather than a CSS custom property: the only API that puts a
// custom property on an element is the very one §10's no-motion guard bans, and the panel injects no stylesheet.
const GAME_W = "min(100vw, 177.78vh)";
// The **row rung**: the game's own dense face at 8px on its own 1920 canvas, doubling where the rounding flips — game
// width 2880 and 4800 — and held between 8px and 24px, so every ordinary window sits on the game's own rung.
// `8 × round(game-w / 1920)` is the same number as `round(game-w / 240, 8px)`, which is what CSS can say without
// dividing a length by a length.
const ROWS = `clamp(8px, round(${GAME_W} / 240, 8px), 24px)`;
// Chrome is twice the rows — the game's own density rule, taken off the window rather than invented here.
const CHROME = `calc(2 * ${ROWS})`;
// n rungs of that ladder, as a CSS length. **One knob now scales the panel, not its text**: every width and sprite
// height below is a rung count, so a size change is one edit rather than a dozen independent literals. Exported,
// because a row's own columns are on the same ladder and a renderer must be able to say so.
export const rung = n => `calc(${n} * ${ROWS})`;

// The panel's **width**: 0.156 of the game — 300px at a 1920 game — clamped to 0.75×–1.5× of that reference. Below
// the floor legibility stops paying for proportion; above the ceiling, which binds at game width 2880, a crisp panel
// stops reading as part of upscaled pixel art. Past 2880 the ladder and this clamp deliberately part company: the
// type keeps climbing in a box that has stopped growing, so a pane's capacity roughly halves and a tall pane scrolls.
const SHARE = 0.156;
const REF_W = SHARE * 1920;
export const PANEL_W = `clamp(${0.75 * REF_W}px, calc(${SHARE} * ${GAME_W}), ${1.5 * REF_W}px)`;
// The inset from the viewport corner, and the height the panel may not exceed. The inset is the one length here that
// stays off the ladder: it is a gap from the viewport's edge rather than a share of the game, and 8px off a
// letterboxed corner covers no game pixel at any window shape.
// The game's message box owns the bottom 27%, so its top edge sits at `0.73 ÷ (16/9) = 0.4106 × game-w`, and the
// budget is 0.40 of the game width, less the inset. **It is the drawer's pane that carries it** (§4), which is where
// §4 puts it: the strip and the bar are always on screen and are never what a card makes tall, so the thing that has
// to stop growing is the pane.
// So the *panel* may stand taller than the budget by the strip, the bar, the footer and the padding — it is the pane
// that is bounded, not the object. Named here rather than discovered: against everything the model draws today the
// threshold never fires at all (the tallest pane is about 187px against a 713px budget at a 1920 game), so the
// arithmetic only matters for content that does not exist yet, and the guard it needs then is the pane's.
const INSET = "8px";
const MAX_H = `calc(0.40 * ${GAME_W} - ${INSET})`;

// The panel's two **register**s, split by the game's own rule for its own dense lists: its default face for
// **chrome** — the shell's own lines and every group heading — and its dense face at **half the size** for **rows**.
// The game draws `emerald` at 96px and switches to `pkmnems` at 48px for its party lists, move labels and
// instructions (`src/ui/text.ts`); the panel is a dense list, so it blends in by adopting the rule rather than by
// picking a font. Both faces are the page's own — the game declares them — so the fallback only serves a page that
// has neither.
// Face, size and line box travel together, because they are one decision: the rung is the one the game itself wears
// on its own 1920 canvas, which is where #355's ladder lands for every ordinary window, and the line box is an
// integer at that rung because both faces are pixel designs and a fractional one softens them.
// A register has one size. The old three-value knob was three independent literals, and what a row emphasises it
// emphasises with ink (§8) — so nothing below a row sets a size of its own, and the drawn-panel golden says so.
export const REGISTER = {
  chrome: { face: "emerald, ui-monospace, Menlo, monospace", size: CHROME, line: "1.25" },
  rows: { face: "pkmnems, ui-monospace, Menlo, monospace", size: ROWS, line: "1.5" },
};
export const h = (tag, style, ...kids) => {
  const n = document.createElement(tag);
  Object.assign(n.style, style);
  n.append(...kids.flat().filter(k => k != null && k !== ""));
  return n;
};
// Sprite heights are rungs of the same ladder rather than literals of their own, so the icons wear the game's type
// ladder along with the text. Four steps, named for the job a sprite does on a row and not for a size: the foe
// card's portrait, the mon a row is about, a mon the row merely refers to, and the small marks — type, category,
// status, ball.
export const ICON = { big: 3.5, mon: 2.5, ref: 2.25, mark: 1.5 };
export const img = (key, frame, title, rungs, fallback = title) => {
  const url = sprite(key, frame);
  if (!url) {
    // Optional sprites (fallback null) may simply not exist; don't retry those.
    if (fallback !== null) missed = true;
    return fallback;
  }
  const i = document.createElement("img");
  i.src = url;
  i.title = title;
  Object.assign(i.style, { height: rung(rungs), imageRendering: "pixelated", verticalAlign: "middle", margin: "0 1px" });
  return i;
};
export const mon = (icon, name, rungs = ICON.mon) => (icon ? img(icon[0], icon[1], name, rungs, name) : name);
export const badge = (type, suffix = "") => h("span", { whiteSpace: "nowrap", marginRight: "3px" },
  img("types", type.toLowerCase(), type, ICON.mark), suffix && h("b", {}, suffix));
export const dim = { color: "#9aa" };
// The gutter: one mark's column, a rung and three quarters wide, rather than a width of its own. Exported because a
// row with a column ahead of the gutter — the fight plan's `now:` / `next:` steps — has to line up with one without.
export const GUTTER = rung(1.75);
export const line = (label, color, ...kids) => h("div", { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "1px" },
  h("span", { color, width: GUTTER, flex: "none" }, label), ...kids);
export const hpColor = hp => (hp > 50 ? "#6d6" : hp > 20 ? "#ec4" : "#e55");
export const itemImg = (icon, name) => img("items", icon, name, ICON.ref, null);
export const sep = { borderTop: "1px solid rgba(255,255,255,.12)", margin: "3px 0" };

// ---- Groups (#349 §1)
// A renderer's product is an ordered list of **group**s, not a list of nodes: `{ id, label, summary, rows }`. The
// shell decides how to shell them, so separation between groups is the shell's business and no renderer draws a
// divider of its own.
//
// The ids are closed at eight and semantic — a group means the same thing wherever it appears, which is what lets
// one be remembered as the cards change under it. A ninth means retiring or merging one, not adding one here.
//
// One list, in the fixed order the plain text walks and the tab bar sits in, whatever the drawer is showing
// (§5): a renderer cannot lead with what matters most on its own kind, so a tab sits in the same place always.
// `act` leads it, which is what makes the first line of a card's text its call.
export const GROUP_IDS = ["act", "foes", "catch", "plan", "options", "audit", "road", "notes"];
// The card's groups in that order, whatever order the renderer returned them in: **the tab bar and the plain text
// walk the same list**, so a tab sits in the same place always and the text never depends on what is on screen.
const inOrder = groups => GROUP_IDS.flatMap(id => (groups ?? []).filter(g => g.id === id));
// `label` is the group's name on the tab, and is required for that reason: **a tab carries its group's name**, so a
// group with no label would put an id in front of the player. `summary` is what it concluded, and may be absent.
// `rows` are nodes: a row is two inline columns, the gutter and the body, so it flattens to `mark body`.
export const group = (id, label, summary, rows) => {
  if (!GROUP_IDS.includes(id)) throw new Error(`unknown group ${id}`);
  if (!label) throw new Error(`group ${id} has no label`);
  return { id, label, summary: summary || null, rows: (rows ?? []).filter(Boolean) };
};
// The same group, or nothing at all when it has neither summary nor rows: an empty tab is filler, and the options
// themselves say it one glance lower (§6). The label-alone rule is for a group with rows and nothing to conclude,
// not for one with nothing. Every renderer that builds more than one group wants this, so it lives here.
export const some = (id, label, summary, rows) => {
  const g = group(id, label, summary, rows);
  return g.summary || g.rows.length ? g : null;
};

// What heads a group's block **in the plain text**. The pane's own heading is a second rule below, because the two
// readers differ: a pane has the group's name on the tab above it and text has no tabs at all.
// `act` is headed by its summary alone: the strip above it is its label (§6), which is also what makes the first
// line of the card's text the call and not a heading. A group with no summary is headed by its label alone — and an
// `act` with none is therefore headed by nothing, since its label is the strip's.
// The name and what it concluded are held apart by a colon, or the heading reads as one sentence: `Foes: we're weak
// to Fire ×2`. A colon rather than the ` — ` the repo usually spends on claim→detail, because the summaries already
// spend one inside themselves.
const headingText = g => (g.id === "act" ? g.summary
  : g.summary && g.label ? `${g.label}: ${g.summary}` : g.label || g.summary) || null;
// **Other group headings are one line in the pane, then an ellipsis** — about 55 characters at reference width.
// Nothing is budgeted there, because nothing there is the call: the one line the player always needs is the strip's,
// and the strip is above whatever the drawer is showing. The cut is the browser's and lands on the drawn node alone;
// `groups[].summary` and the card's text are never cut by the panel (§5, §6).
const ONE_LINE = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
// **The open group's `summary` heads its pane, or its `label` alone where the summary is absent** (§2). The name is
// on the tab directly above it, so a pane that carried the label too would spend its first line telling the player
// what they just clicked. This is where the pane's heading and the text's part company: the text has no tabs, so it
// keeps the label, which is what lets a reader tell `foes` from `audit` from `road` (§5).
// It is drawn in chrome at full strength and **not bold**, which is the whole distance between it and the strip's
// call: the call is the one line the player always needs (§6) and carries the weight, the heading is the answer the
// pane's own rows support (story 6) and carries none. It is not dimmed — the conclusion would then be the quietest
// thing in a pane whose rows it is supposed to lead.
const paneHeading = g => {
  // `act` is not headed in the pane at all: **the act group's pane does not repeat the call**, because the strip
  // directly above it is its heading (§6). The heading is still `act`'s in the plain *text*, which has no strip —
  // which is what keeps the first line of a card's text its call.
  if (g.id === "act") return null;
  const text = g.summary || g.label;
  return text ? h("div", ONE_LINE, text) : null;
};

// Which register a node is drawn in is the **shell's**, never a renderer's: the shell heads a group in chrome and
// puts its rows in the dense face at half the size (§9). A renderer returns rows and never says what face it wanted,
// the same way it never says what view it is in.
// The longhands and not the `font` shorthand: the shorthand resets every font longhand it does not name, so it would
// un-bold a row that is already bold — the card's own header line, for one.
const inRows = node => {
  const r = REGISTER.rows;
  if (node?.style) Object.assign(node.style, { fontFamily: r.face, fontSize: r.size, lineHeight: r.line });
  return node;
};

// The **pane**: the open group's block — its heading, then its rows in the dense register. The shell's own rule
// between groups went with the stack that needed it: one group is on screen at a time, so there is nothing to
// hold it apart from.
export const pane = g => [paneHeading(g), ...g.rows.map(inRows)].filter(Boolean);

// The **tab bar**: one tab per group the card has, in the fixed global order, **labels only** so the bar stays
// legible at reference width. It never wraps, never scrolls and has no overflow menu — **the cap is five tabs,
// enforced by the vocabulary and not by this layout** (§1), so the bar is free to be one unwrapped line. A label
// that overruns its share is cut by the browser rather than pushing the bar onto a second line.
// **No tab carries an unread mark, a count or any state of its own** (§2, §10): every wave brings a new card, so a
// *new* mark would light every tab every wave and mean nothing, and a mark for a finding new *within* a card would
// need an event the model does not define. Which tab is open is told by weight and ink — never by gold, which is the
// authorship rule's and is inert.
// The gap between tabs is a rung, like every other length the ladder scales; the bar's own margin is the 3px the
// shell already spends on the rule between blocks, because it is that same gap and not a share of the game.
const BAR = { display: "flex", flexWrap: "nowrap", gap: rung(1), overflow: "hidden", margin: "3px 0", minWidth: "0" };
const TAB = { flex: "0 1 auto", minWidth: "0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" };
const tab = (g, open) => {
  const n = h("span", { ...TAB, color: open ? SKIN.body : dim.color, fontWeight: open ? "bold" : "normal" }, g.label);
  // The one thing a tab does, and the only control the drawer has. It asks for a redraw through the same hook the
  // close control uses, so the pane changes under the click rather than on the next refresh.
  n.addEventListener("click", e => { e.stopPropagation(); if (!open) { setOpen(g.id); redrawFn(); } });
  return n;
};

// ---- What the panel remembers (#349 §3, #358)
// **One key holds the view and the last group id**, replacing the key that held the view alone. The panel the player
// left is the panel they come back to, so reloading to escape a stuck menu does not also reset the coach.
//
// The three states, and the third is a dismissal rather than a size (§2):
//   `drawer` — the strip over the drawer, the default and what a first run opens on;
//   `strip`  — the strip alone, so a whole run can be watched on one line;
//   `closed` — the panel gone, a bare glyph left.
// **The panel never switches between them by itself**: no card collapses itself and no group opens itself. Every one
// of them is the shell's — a renderer returns the card's groups and never asks which one is up.
const PANEL_KEY = "coach-hud-panel";
const VIEWS = ["drawer", "strip", "closed"];
// The key it replaces and the three values it held. It is read once, on the first load that finds the new key empty,
// and then written forward and dropped: two keys that can disagree would be a state the panel has to arbitrate on
// every read. The old key never held a group, so a migrated panel opens on `act` whatever it was showing.
const OLD_KEY = "coach-hud-view";
const MIGRATE = { full: "drawer", mini: "strip", closed: "closed" };

// **First run, with nothing stored, opens the drawer on `act`** (§2): a player who has never opened the panel
// discovers what the coach does without hunting for it. So the defaults are the first-run state, and a stored value
// only ever moves off them — a key holding something this build does not know is a key it ignores.
let view = "drawer";
// Which group is open, remembered **by identity** and not by position, which is what lets it survive the card
// changing under it. A card with no such group falls back to `act`, and the fallback is **written back** rather than
// held as a detour: it is a move, with no jump back when the group reappears (§3). Since the ids are semantic, a
// player sitting on `foes` lands on `act` for a learn card, whose kept moves are `options`.
let openId = "act";

const save = () => { try { localStorage.setItem(PANEL_KEY, JSON.stringify({ view, group: openId })); } catch {} };
// Storage is the page's and can refuse or hold anything at all, so every field is checked against what this build
// knows rather than trusted: a panel that cannot read its key draws the first-run state, which is the one state that
// is always safe to draw.
const load = () => {
  let raw = null;
  try { raw = localStorage.getItem(PANEL_KEY); } catch { return; }
  if (raw != null) {
    let saved = null;
    try { saved = JSON.parse(raw); } catch {}
    if (VIEWS.includes(saved?.view)) view = saved.view;
    if (GROUP_IDS.includes(saved?.group)) openId = saved.group;
    return;
  }
  let old = null;
  try { old = localStorage.getItem(OLD_KEY); } catch { return; }
  view = MIGRATE[old] ?? view;
  save();
  try { localStorage.removeItem(OLD_KEY); } catch {}
};
load();

export const closed = () => view === "closed";
// Whether the drawer is showing, which is the one thing the shell needs to know to shell the panel.
export const drawerOpen = () => view === "drawer";
export const openGroup = () => openId;
// Every move the player makes is written as it is made, so the panel survives a reload the player never planned —
// which is the whole point of the key. The redraw is here rather than at each control, because every one of these
// changes what is on screen.
const setView = next => { if (next !== view) { view = next; save(); redrawFn(); } };
const setOpen = id => { if (id !== openId) { openId = id; save(); } };

// The drawer: the tab bar, then the open group's pane. Both are the shell's — a renderer returns groups and never
// asks which one is up. **A card with one group draws a bar with one tab**, which is no branch here: the
// whole-card replacement is an ordinary card that happens to have only `act`.
// **The pane is what scrolls**, past the budget the game's message box leaves (§4). The panel's height is the
// strip, the bar, and a pane that stops growing, which is what makes it something the player can rely on. Against
// everything the model draws today the threshold never fires — the tallest pane any card produces is about 187px
// against a 713px budget at a 1920 game — so it ships as a guard for content that does not exist yet.
const PANE = { maxHeight: MAX_H, overflowY: "auto" };
export const drawer = groups => {
  const list = inOrder(groups);
  const open = list.find(g => g.id === openId) ?? list.find(g => g.id === "act") ?? list[0];
  if (!open) return [];
  setOpen(open.id);
  return [h("div", BAR, ...list.map(g => tab(g, g === open))), h("div", PANE, ...pane(open))];
};

// ---- The card as plain text (§11.1, §5)
// The stream's `text` is derived from the group list rather than read back off the drawn card, so the two cannot
// disagree by construction. It is always the whole card and always in the fixed group order, whatever the drawer is
// showing — and it needs no view forced on a renderer to be so, because no renderer knows what a view is.
// 98-tick registers the draw for a kind here, the way it registers the redraw: dispatch stays its business.
let drawFn = () => null;
export const setDraw = fn => { drawFn = fn; };
// A card's groups, dispatched by its kind — what the text below walks. Exported because the drawer shows one group
// at a time (#357), so a golden about what a card *says* asks for the card's groups rather than reading back the one
// pane a click happens to have open.
export const groupsOf = card => (card ? drawFn(card) : null);


// The group list as plain data: the same groups in the fixed order, with their rows flattened to one string each.
// This is the seam the content half of the card is tested at, and what #361 puts on the wire.
export const groupsText = groups => inOrder(groups)
  .map(g => ({ id: g.id, label: g.label, summary: g.summary, rows: g.rows.map(rowText).map(clean).filter(Boolean) }));

export const cardText = card => {
  const groups = groupsOf(card);
  if (!groups?.length) return null;
  const text = groupsText(groups)
    .map(g => [headingText(g), ...g.rows].filter(Boolean).join("\n")).filter(Boolean).join("\n");
  return text || null;
};

const tagOf = n => String(n.tagName ?? "").toUpperCase();
const kidsOf = n => (n.childNodes ? Array.prototype.slice.call(n.childNodes) : n.children ?? []);
// **A row flattens to one line**, and that is the whole constraint a future layout has to meet (§5): a row is two
// inline columns — the gutter and the body — so it reads as `mark body`. The walker never decides where a line ends
// and never has to know what a control is, because a row never holds one.
// A sprite reads as what it stands for: `img` titles every icon with the name it drew.
const rowText = n => {
  if (n == null) return "";
  if (typeof n !== "object") return String(n);
  if (tagOf(n) === "IMG") return String(n.title ?? "");
  const kids = kidsOf(n);
  if (!kids.length) return String(n.textContent ?? "");
  return kids.map(rowText).filter(Boolean).join(" ");
};
const clean = l => l.replace(/\s+/g, " ").trim();

// ---- The disclaimer (§3)
// Fixed wording, on every listing and inside the extension. The panel has no About page, so it carries it as a footer.
const DISCLAIMER = "Unofficial. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.";
// A footnote, so it is in the dense register rather than in chrome — the panel's chrome is what the player reads, and
// this is what they read once. #362 takes the footer off the panel altogether.
export const disclaimer = () => inRows(h("div", { ...dim, marginTop: "4px" }, DISCLAIMER));

// The refresh itself lives in 98-tick, above every renderer; it registers itself here so the close control can ask
// for a redraw without this file knowing what a card is.
let redrawFn = () => {};
export const setRedraw = fn => { redrawFn = fn; };

// The dismissal: shut the panel, and the glyph that brings it back. One of the shell's three controls, the others
// being the tab and the strip. **Controls are the shell's, never a row's** (§5) — a control inside a row is a
// control inside the card's text, which is what the flattener used to have to drop by its mouse cursor. It sits in
// the panel's own corner rather than on a line of its own, so it costs no height.
export const closeButton = () => {
  // No fill and no radius of its own: the panel's fill is the game's window interior and the panel invents no second
  // one (§8, §9).
  const n = h("span", { position: "absolute", top: "4px", right: "4px", cursor: "pointer", padding: "0 4px", fontWeight: "bold" }, "×");
  n.title = "Close";
  n.addEventListener("click", e => { e.stopPropagation(); setView("closed"); });
  return n;
};
// The control floats in the panel's corner rather than sitting on a line, so whatever the panel draws first has to
// leave room for it — the caption otherwise runs under the ×. The shell applies this to its own first line, which
// is now the strip's head: no renderer knows the control is there.
const reserveForControl = node => {
  // The control's own column, in rungs like everything else, so the room it is left grows with it.
  if (node) node.style.paddingRight = rung(2.25);
  return node;
};
// What a dismissed panel leaves behind, and the only way back. Named for what it is rather than for a tab, because
// the drawer's tab bar owns that word.
// **Dismissed means silent** (§10): one fixed mark, the same on every wave, carrying no verdict colour and nothing
// else the card knows. A glyph that changed with the kind would be the panel signalling from a state the player
// entered to stop it saying anything, and a dismissed panel that reports the wave is not dismissed. It is chrome and
// not a row's mark, so it stands outside §7's closed alphabet, and it names the panel no more than the panel names
// itself (§9).
const GLYPH = "🧭";
// **Reopening restores the drawer that was there** — the group the player left it on, which is the thing a dismissal
// must not reset. It reopens onto the drawer rather than the strip because the key holds one view and the dismissal
// is what that view now says: what survives a dismissal is the group, not a second view behind it.
export const glyph = () => {
  const n = h("span", { cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }, GLYPH);
  n.title = "Open coach";
  n.addEventListener("click", e => { e.stopPropagation(); setView("drawer"); });
  return n;
};

// ---- The strip (#349 §2, §6)
// **The one line the player always needs**, in front of them whatever is open or shut, in one fixed order: the
// verdict dot, the verdict word, the caption, and the call. It sits above everything else the panel shows, so the
// thing to do now is never a click away — including while the player reads another group.
//
// The **caption** is the kind's emoji and what the card is about. It is built by the kind's own renderer, because
// only that file knows what its card is about, and drawn here, because the strip is the shell's — the same split
// the groups already live by. Its arrow-separated list is **our** actives, never the enemy roster: it is who we are
// sending, which on a double is the pair on the field.
// It is chrome, in the game's label gold, and inert: gold never changes state (§8, §10). It wraps rather than
// clipping, which past game width 2880 is what it actually does — the point where the ladder and the width clamp
// part company (§4). The panel never writes its own name here or anywhere (§9).
export const caption = (emoji, title, ...rest) => h("div",
  { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", minWidth: "0", fontWeight: "bold", color: SKIN.rule },
  emoji, title, ...rest);

// **The dot's five colours sit outside the colour law** (§8): they answer *what kind of wave is this*, which is
// neither of the law's two questions — not *is this good news* and not *who is acting*. Quoted game colours all the
// same, since nothing in the palette is invented. Trainer and fight share the gold on purpose: the word spelled out
// beside the dot is what tells them apart, and a reader who cannot see the ink reads the word.
const VERDICT = { easy: "#78c850", trainer: "#f8b050", danger: "#e13d3d", catch: "#40c8f8", fight: "#f8b050" };
// One fixed position, a rung of the ladder square and round: the dot is the one thing on the strip that is only
// colour, so it carries no text of its own and the word carries all of it.
const dot = ink => h("span", { width: rung(1), height: rung(1), flex: "none", borderRadius: "50%", background: ink });

// The strip itself. `groups` is the card's own list, so the call is `act.summary` and nothing beside it — **the
// strip, the verdict and the watch line all come from one string and cannot disagree** (§6).
// **A card with no verdict draws no dot and no word**; the caption and the call still draw. The verdict is a battle
// card's one-word call, and a battle whose enemy move could not be read has none either — its call already says so.
export const strip = (card, captionNode, groups) => {
  const ink = VERDICT[card?.verdict];
  const head = reserveForControl(h("div", { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" },
    ink ? dot(ink) : null, ink ? h("span", { fontWeight: "bold" }, card.verdict) : null, captionNode));
  // **Two lines, then an ellipsis** — about 115 characters at reference width. The leading clause must fit; what
  // follows the first ` · ` may clip, because it is reasoning and not the call. The cut is the browser's and lands
  // on this node alone: the panel never cuts a string, so `groups[].summary` and the card's text are whole (§5).
  // Since the clamp only ever eats the *end*, the leading clause is what survives by construction — what the budget
  // then decides is how much of the reasoning goes with it, and that is a measurement, not a rule CI can hold.
  // `overflowWrap` is what keeps that true of a run with no space in it: an unbroken token would otherwise push past
  // the panel's own edge rather than clip, and the clause that must fit is the one it would push out.
  const call = (groups ?? []).find(g => g.id === "act")?.summary;
  // **The strip is the drawer's handle**: clicking it shuts the drawer and keeps the strip, and clicking it again
  // brings the drawer back on the group it was left on. The drawer's own tabs cannot carry this — a shut drawer has
  // no tab bar to click — and the alternative, a second chrome mark beside the ×, spends a glyph and a column of a
  // small panel on a state the line above the drawer can already speak for. Nothing about it is live: it is the
  // player's control and never changes what the strip says.
  const n = h("div", { cursor: "pointer" }, head, call
    ? h("div", { fontWeight: "bold", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: "2",
        overflow: "hidden", overflowWrap: "anywhere", minWidth: "0" }, call)
    : null);
  n.title = "Show or hide the drawer";
  n.addEventListener("click", e => { e.stopPropagation(); setView(drawerOpen() ? "strip" : "drawer"); });
  return n;
};

export const el = document.createElement("div");
el.id = "coach-hud";
Object.assign(el.style, {
  position: "fixed", top: INSET, left: INSET, zIndex: "2147483647",
  // The width is the footprint and not the text column, so the rule, the shadow and the padding are inside it: the
  // panel covers the share of the game the ladder says it does. Padding is a rung too — 6px by 8px at the game's own
  // rung — so the one knob scales the box along with what is in it.
  boxSizing: "border-box", width: PANEL_W, padding: `${rung(0.75)} ${ROWS}`,
  background: SKIN.fill, color: SKIN.body,
  // One rule and one shadow for the whole object, so they hold whatever the panel is showing — the strip alone, the
  // strip over the drawer, or the one line a failed refresh leaves (§11). Square corners: the rule is flat.
  border: `1px solid ${SKIN.rule}`, boxShadow: `1px 1px 0 ${SKIN.shadow}`,
  // The longhands and not the `font` shorthand: the size is a `calc()` now, and a calculation ahead of the
  // shorthand's `/` line-height is a parse a panel should not be betting on.
  fontFamily: REGISTER.chrome.face, fontSize: REGISTER.chrome.size, lineHeight: REGISTER.chrome.line,
  userSelect: "none", display: "none",
});
// Keep clicks on the panel from reaching the game underneath.
for (const ev of ["click", "mousedown", "pointerdown", "touchstart"]) el.addEventListener(ev, e => e.stopPropagation());
document.body.appendChild(el);
