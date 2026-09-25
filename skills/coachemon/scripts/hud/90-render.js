// The panel itself: its element, the sprites and text helpers every card is drawn from, and what it remembers of the
// view the player left it in. It draws no card and decides nothing.
// State another file needs is read and written through functions, never exported as a binding.
// Six names are exported for the tests and for nothing else: the laws a test pins rather than restates — the two
// palettes, the closed alphabet and the closed group ids — and the two projections a golden reads a drawn card by.
// Declaring them says so, so the panel's interface is what the panel offers its callers and a name reached only
// from `test/` never passes for one (#388).
// @only tests: LAW_INK, MARKS, GUTTER_INK, GROUP_IDS, pane, flatGroups
let game = null;
const sprites = new Map();
let missed = false; // a wanted sprite wasn't loaded yet during the last draw

// `dropGame` forgets the game after a failed refresh, so the next one looks it up again: the page may have reloaded
// under us.
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

// ---- The skin
const SKIN = { fill: "#362d3e", body: "#f8f8f8", rule: "#f8b050", shadow: "#181818" };

// ---- The footprint and the type ladder
// The game's canvas is a fitted 1920×1080, so its drawn width is reproducible in pure CSS — no canvas rect read, no
// resize observer. The knob is a JS constant inlined into every length and not a CSS custom property: the only API
// that sets one on an element is the very API the no-motion guard bans, and the panel injects no stylesheet.
const GAME_W = "min(100vw, 177.78vh)";
// `round(game-w / 240, 8px)` is the same number as `8 × round(game-w / 1920)`, which is what CSS can say without
// dividing a length by a length.
const ROWS = `clamp(10px, round(${GAME_W} / 240, 8px), 24px)`;
// `round(…, 1px)` here and in `rung`: both faces and every sprite are pixel designs, and a fractional size softens
// them — 1.6× the upper rungs is 25.6px and 38.4px, and `mark` at 1.35 rungs is 13.5px.
const CHROME = `round(1.6 * ${ROWS}, 1px)`;
// n rungs of that ladder, as a CSS length.
export const rung = n => `round(calc(${n} * ${ROWS}), 1px)`;

// `REF_W` is derived from `SHARE`, so the clamp multipliers and `SHARE` move together: raising the share alone drags
// the width floor up with it.
const SHARE = 0.234;
const REF_W = SHARE * 1920;
// Rounded because the products are binary floats: `0.5 * 0.234 * 1920` is `224.64000000000001`, and the whole of it
// would ship into the style attribute.
const pxRound = n => `${Math.round(n * 100) / 100}px`;
export const PANEL_W = `clamp(${pxRound(0.5 * REF_W)}, calc(${SHARE} * ${GAME_W}), ${pxRound(1.5 * REF_W)})`;
// The game's message box owns the bottom 27% of the game, so its top edge is at `0.73 ÷ (16/9) = 0.4106 × game-w`,
// and the budget is 0.40 of that width less the inset. It bounds the pane, not the panel.
const INSET = "8px";
const MAX_H = `calc(0.40 * ${GAME_W} - ${INSET})`;

// The panel's two registers. Both faces are the page's own — the game declares them — so the fallback only serves a
// page that has neither. A register has one size, and nothing below a row sets a size of its own.
const REGISTER = {
  chrome: { face: "emerald, ui-monospace, Menlo, monospace", size: CHROME, line: "1.25" },
  rows: { face: "pkmnems, ui-monospace, Menlo, monospace", size: ROWS, line: "1.5" },
};
export const h = (tag, style, ...kids) => {
  const n = document.createElement(tag);
  Object.assign(n.style, style);
  n.append(...kids.flat().filter(k => k != null && k !== ""));
  return n;
};
// Sprite heights in rungs, named for the job a sprite does on a row: the foe card's portrait, the mon a row is about,
// a mon it merely refers to, and the small marks — type, category, status, ball.
export const ICON = { big: 3.1, mon: 2.2, ref: 2.0, mark: 1.35 };
export const img = (key, frame, title, rungs, fallback = title) => {
  const url = sprite(key, frame);
  if (!url) {
    // Optional sprites (fallback null) may simply not exist; don't retry those.
    if (fallback !== null) missed = true;
    // **The fallback is an element, not a bare string**: the rows and the caption that hold a sprite are flex
    // containers spaced by a `gap`, and contiguous text collapses into one anonymous flex item — so a string fallback
    // landing beside a neighbouring string is spaced by neither the gap nor a space of its own, and `Youngster` and
    // `Charizard` drew as `YoungsterCharizard` (#378).
    return typeof fallback === "string" && fallback !== "" ? h("span", { margin: "0 2px" }, fallback) : fallback;
  }
  const i = document.createElement("img");
  i.src = url;
  i.title = title;
  Object.assign(i.style, { height: rung(rungs), imageRendering: "pixelated", verticalAlign: "middle", margin: "0 1px" });
  return i;
};
export const mon = (icon, name, rungs = ICON.mon) => (icon ? img(icon[0], icon[1], name, rungs, name) : name);
// ---- The colour law
export const LAW_INK = { ours: "#40c8f8", theirs: "#f88880", later: "#e331c5", none: "#a0a0a0" };
export const ink = { ours: { color: LAW_INK.ours }, theirs: { color: LAW_INK.theirs }, later: { color: LAW_INK.later } };
export const dim = { color: LAW_INK.none };
const GROUP_LAW = { act: "ours", foes: "theirs", catch: "ours", plan: "later", options: "ours", audit: "later", road: "later", notes: "none" };
// `theirs` is one ink in two weights rather than two colours: the frame takes the game's Fire-type red, which as text
// sits too dark on the panel's fill.
const FRAME = { ...LAW_INK, theirs: "#f75231" };

// A type badge is the game's atlas sprite; the game's type ink serves only as the text fallback for a page whose
// atlas has not loaded.
const TYPE_INK = {
  normal: "#a8a878", fighting: "#c03028", flying: "#a890f0", poison: "#a040a0", ground: "#e0c068", rock: "#b8a038",
  bug: "#a8b820", ghost: "#705898", steel: "#b8b8d0", fire: "#f08030", water: "#6890f0", grass: "#78c850",
  electric: "#f8d030", psychic: "#f85888", ice: "#98d8d8", dragon: "#7038f8", dark: "#705848", fairy: "#e888c8",
  stellar: "#ffffff",
};
// Only the three multipliers the game's own damage table has an opinion about.
// **Whether a suffix is an effectiveness is the caller's to say, never this file's to guess**: the count of foes weak
// to a type is written `×3`, and with four foes `×4` — matching the rendered string would ink that count as *super
// effective*. So the caller passes `eff`, and a badge that was not told takes no colour whatever its suffix says.
const EFFECT_INK = { "×4": "#4AA500", "×¼": "#FE8E00", "×0": "#929292" };
export const badge = (type, suffix = "", eff = false) => {
  // The type's own ink is spent only on the text standing in for a missing sprite, never beside a drawn one.
  const drawn = img("types", type.toLowerCase(), type, ICON.mark);
  const mult = eff ? EFFECT_INK[suffix] : null;
  return h("span", { whiteSpace: "nowrap", marginRight: "3px" },
    typeof drawn === "string" ? h("span", { color: TYPE_INK[type.toLowerCase()] }, drawn) : drawn,
    suffix && h("b", mult ? { color: mult } : {}, suffix));
};
const GUTTER = rung(1.75);
// ---- The closed alphabet
// Good news and bad news are told apart by the mark's **shape**, never by its colour, so the column still works for a
// colour-blind player: a seventeenth mark has to be distinct from the sixteen by shape alone.
export const MARKS = [..."⚔➜★✓▲↯✗✦⚠▼⇄⤵≈↺·", "💀", "👑", "🎲", "🔒"];
// The gutter's ink is the mark's and not the caller's. An **emoji forfeits it and keeps its own colour**, which is the
// `codePointAt` test below; a blank gutter takes none either.
export const GUTTER_INK = { good: "#78c850", bad: "#e13d3d", flat: LAW_INK.none };
const GOOD = "⚔➜★✓▲", BAD = "↯✗✦⚠▼";
// **immune** is the sixteenth mark and not a sixteenth shape: it is drawn with `▼`'s glyph and told apart by the grey
// the law gives it and the `×0` beside it.
export const IMMUNE = "immune";
const gutterInk = mark => (!mark || (mark !== IMMUNE && mark.codePointAt(0) > 0xffff) ? null
  : GOOD.includes(mark) ? GUTTER_INK.good : BAD.includes(mark) ? GUTTER_INK.bad : GUTTER_INK.flat);
export const ROW = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "1px" };
export const gutterMark = mark => h("span",
  { color: gutterInk(mark) ?? "", width: GUTTER, flex: "none" }, mark === IMMUNE ? "▼" : mark);
export const line = (mark, ...kids) => h("div", ROW, gutterMark(mark), ...kids);
const HP_INK = hp => (hp > 50 ? "#39ff7b" : hp > 20 ? "#f3b200" : "#fb3041");
export const hpBar = hp => h("span", { display: "inline-flex", alignItems: "center", gap: "3px" },
  h("span", { width: rung(2.5), height: rung(0.5), flex: "none", background: "rgba(255,255,255,.18)" },
    h("span", { display: "block", width: `${Math.max(0, Math.min(100, hp))}%`, height: "100%", background: HP_INK(hp) })),
  h("span", {}, `${hp}%`));
export const itemImg = (icon, name) => img("items", icon, name, ICON.ref, null);
export const sep = { borderTop: "1px solid rgba(255,255,255,.12)", margin: "3px 0" };

// ---- Groups
export const GROUP_IDS = ["act", "foes", "catch", "plan", "options", "audit", "road", "notes"];
// The card's groups in the fixed order, whatever order the renderer returned them in.
const inOrder = groups => GROUP_IDS.flatMap(id => (groups ?? []).filter(g => g.id === id));
// `label` is the group's name on the tab and is required for that reason: a group with no label would put an id in
// front of the player. `rows` are nodes; a row flattens to `mark body`.
export const group = (id, label, summary, rows) => {
  if (!GROUP_IDS.includes(id)) throw new Error(`unknown group ${id}`);
  if (!label) throw new Error(`group ${id} has no label`);
  return { id, label, summary: summary || null, rows: (rows ?? []).filter(Boolean) };
};
// The same group, or nothing at all when it has neither summary nor rows.
export const some = (id, label, summary, rows) => {
  const g = group(id, label, summary, rows);
  return g.summary || g.rows.length ? g : null;
};

// What heads a group's block **in the plain text**. `paneHeading` below is the pane's own rule, because a pane has the
// group's name on the tab above it and text has no tabs at all.
const headingText = g => (g.id === "act" ? g.summary
  : g.summary && g.label ? `${g.label}: ${g.summary}` : g.label || g.summary) || null;
// The cut is the browser's and lands on the drawn node alone: `groups[].summary` and the card's text are never cut.
const ONE_LINE = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const paneHeading = g => {
  // `act` is not headed in the pane: the strip directly above it is its heading. It keeps a heading in the plain text.
  if (g.id === "act") return null;
  const text = g.summary || g.label;
  return text ? h("div", ONE_LINE, text) : null;
};

// The longhands and not the `font` shorthand: the shorthand resets every font longhand it does not name, so it would
// un-bold a row that is already bold (#354).
const inRows = node => {
  const r = REGISTER.rows;
  if (node?.style) Object.assign(node.style, { fontFamily: r.face, fontSize: r.size, lineHeight: r.line });
  return node;
};

export const pane = g => [paneHeading(g), ...g.rows.map(inRows)].filter(Boolean);
const frameInk = id => FRAME[GROUP_LAW[id]] ?? LAW_INK.none;

// The tab bar never wraps, never scrolls and has no overflow menu: the cap is five tabs, enforced by the vocabulary
// and not by this layout. A label that overruns its share is cut by the browser.
const BAR = { display: "flex", flexWrap: "nowrap", gap: rung(1), overflow: "hidden", margin: "3px 0", minWidth: "0" };
const TAB = { flex: "0 1 auto", minWidth: "0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" };
const tab = (g, open) => {
  const n = h("span", { ...TAB, color: open ? SKIN.body : dim.color, fontWeight: open ? "bold" : "normal" }, g.label);
  // It asks for a redraw through the same hook the close control uses, so the pane changes under the click rather
  // than on the next refresh.
  n.addEventListener("click", e => { e.stopPropagation(); if (!open) { setOpen(g.id); redrawFn(); } });
  return n;
};

// ---- What the panel remembers
// **The dismissal is stored as a flag over the view rather than as a third value of it**, because reopening restores
// the view it covered.
const PANEL_KEY = "coach-hud-panel";
const VIEWS = ["drawer", "strip"];
// The key this one replaces, and the three values it held. It is read once, on the first load that finds the new key
// empty, then written forward and dropped: two keys that can disagree would be a state to arbitrate on every read.
const OLD_KEY = "coach-hud-view";
const MIGRATE = { full: ["drawer", false], mini: ["strip", false], closed: ["drawer", true] };

// **First run, with nothing stored, opens the drawer on `act`**, so the defaults are the first-run state. A key
// holding something this build does not know is a key it ignores.
let view = "drawer";
let dismissed = false;
// Which group is open, remembered **by identity** and not by position, so it survives the card changing under it. A
// card with no such group falls back to `act`, and the fallback is written back rather than held as a detour.
let openId = "act";

const save = () => {
  try { localStorage.setItem(PANEL_KEY, JSON.stringify({ view, closed: dismissed, group: openId })); } catch {}
};
// Storage is the page's and can refuse or hold anything at all, so every field is checked against what this build
// knows rather than trusted.
const load = () => {
  let raw = null;
  try { raw = localStorage.getItem(PANEL_KEY); } catch { return; }
  if (raw != null) {
    let saved = null;
    try { saved = JSON.parse(raw); } catch {}
    if (VIEWS.includes(saved?.view)) view = saved.view;
    if (typeof saved?.closed === "boolean") dismissed = saved.closed;
    if (GROUP_IDS.includes(saved?.group)) openId = saved.group;
    return;
  }
  let old = null;
  try { old = localStorage.getItem(OLD_KEY); } catch { return; }
  [view, dismissed] = MIGRATE[old] ?? [view, dismissed];
  save();
  try { localStorage.removeItem(OLD_KEY); } catch {}
};
load();

// **State and view are not the same word**: the view is one of `VIEWS`, and the state is that view or the `closed` a
// dismissal covers it with. Only the state leaves this file, which is why the export is not named for the view.
export const panelState = () => (dismissed ? "closed" : view);
export const openGroup = () => openId;
// **A state change redraws and a group move does not**: a group also moves *during* a draw, when a card has no group
// of the id the player was on — so the tab, the one control that moves a group, asks for the redraw itself.
const setView = next => { if (next !== view) { view = next; save(); redrawFn(); } };
const setDismissed = next => { if (next !== dismissed) { dismissed = next; save(); redrawFn(); } };
const setOpen = id => { if (id !== openId) { openId = id; save(); } };

// The drawer: the tab bar, then the open group's pane. **The pane is what scrolls**, past the budget above.
const PANE = { maxHeight: MAX_H, overflowY: "auto", padding: `${rung(0.5)} ${rung(0.75)}` };
export const drawer = groups => {
  const list = inOrder(groups);
  const open = list.find(g => g.id === openId) ?? list.find(g => g.id === "act") ?? list[0];
  if (!open) return [];
  setOpen(open.id);
  return [h("div", BAR, ...list.map(g => tab(g, g === open))),
    h("div", { ...PANE, border: `1px solid ${frameInk(open.id)}` }, ...pane(open))];
};

// ---- The card as plain text
// **This layer never dispatches on a kind** (#388): it is handed groups and projects them, and which draw goes with
// which kind stays 98-tick's one table. A second, late-bound copy of that dispatch lived here for the tests to walk
// the card by; nothing that shipped ever called it, so the panel could change under a suite still drawing the old
// shape — and a test's draw re-armed the missed-sprite latch the refresh reads.

// The group list as plain data: the same groups in the fixed order, with their rows flattened to one string each.
// This is what goes on the wire.
export const flatGroups = groups => inOrder(groups)
  .map(g => ({ id: g.id, label: g.label, summary: g.summary, rows: g.rows.map(rowText).map(clean).filter(Boolean) }));

// The text, walked off the **flattened** groups and nothing else, so the wire and the text cannot disagree.
const textOfGroups = wire => wire
  .map(g => [headingText(g), ...g.rows].filter(Boolean).join("\n")).filter(Boolean).join("\n") || null;

export const wireCard = groups => {
  if (!groups?.length) return { groups: [], text: null };
  const wire = flatGroups(groups);
  return { groups: wire, text: textOfGroups(wire) };
};

const tagOf = n => String(n.tagName ?? "").toUpperCase();
const kidsOf = n => (n.childNodes ? Array.prototype.slice.call(n.childNodes) : n.children ?? []);
// **A row flattens to one line**: a row is two inline columns — the gutter and the body — so it reads as `mark body`.
// A sprite reads as what it stands for, because `img` titles every icon with the name it drew.
//
// **Two losses are kept rather than closed.** An optional sprite that has not loaded contributes nothing where a
// loaded one contributes its title, so the same card can flatten to two different strings — tolerable only because
// the stream deduplicates on kind, key and verdict, so a changed text never re-fires. And only `IMG` is read for a
// title, so what a row says in a tooltip alone never reaches the text.
const rowText = n => {
  if (n == null) return "";
  if (typeof n !== "object") return String(n);
  if (tagOf(n) === "IMG") return String(n.title ?? "");
  const kids = kidsOf(n);
  if (!kids.length) return String(n.textContent ?? "");
  return kids.map(rowText).filter(Boolean).join(" ");
};
const clean = l => l.replace(/\s+/g, " ").trim();

// The refresh itself lives in 98-tick and registers itself here, so the close control can ask for a redraw without
// this file knowing what a card is.
let redrawFn = () => {};
export const setRedraw = fn => { redrawFn = fn; };

// The panel's own two controls, in its corner: the **caret**, which shuts the drawer and keeps the strip, and the
// **×**, which dismisses the panel altogether. They float in the corner rather than sitting on a line of their own,
// so they cost no height.
const CONTROLS = { position: "absolute", top: "4px", right: "4px", display: "flex", alignItems: "center", gap: rung(0.25) };
const control = (mark, title, onClick) => {
  const n = h("span", { cursor: "pointer", padding: "0 4px", fontWeight: "bold" }, mark);
  n.title = title;
  n.addEventListener("click", e => { e.stopPropagation(); onClick(); });
  return n;
};
export const controls = () => h("div", CONTROLS,
  view === "drawer"
    ? control("⌃", "Hide the drawer", () => setView("strip"))
    : control("⌄", "Show the drawer", () => setView("drawer")),
  control("×", "Close", () => setDismissed(true)));
// The controls float in the panel's corner, so whatever the panel draws first has to leave room for them — the
// caption otherwise runs under the ×. The shell applies this to its own first line; no renderer knows they are there.
const reserveForControl = node => {
  if (node) node.style.paddingRight = rung(4.25);
  return node;
};
// What a dismissed panel leaves behind, and the only way back. **Dismissed means silent**: one fixed mark, the same
// on every wave, carrying no verdict colour and nothing else the card knows.
const GLYPH = "🎯";
// **Reopening restores the drawer that was there** — the view the player was in and the group it was left on.
export const glyph = () => {
  const n = h("span", { cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }, GLYPH);
  n.title = "Open coach";
  n.addEventListener("click", e => { e.stopPropagation(); setDismissed(false); });
  return n;
};

// ---- The strip
// **The one line the player always needs**, in front of them whatever is open or shut, in one fixed order: the
// verdict dot, the verdict word, the caption, and the call.
// The **caption** is built by the kind's own renderer, because only that file knows what its card is about, and drawn
// here, because the strip is the shell's. Its arrow-separated list is **our** actives, never the enemy roster.
export const caption = (emoji, title, ...rest) => h("div",
  { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", minWidth: "0", fontWeight: "bold", color: SKIN.rule },
  emoji, title, ...rest);

// Trainer and fight share the gold on purpose: the word spelled out beside the dot is what tells them apart.
const VERDICT = { easy: "#78c850", trainer: "#f8b050", danger: "#e13d3d", catch: "#40c8f8", fight: "#f8b050" };
const dot = ink => h("span", { width: rung(1), height: rung(1), flex: "none", borderRadius: "50%", background: ink });

// **A card with no verdict draws no dot and no word**; the caption and the call still draw. A battle whose enemy move
// could not be read has none either — its call already says so.
export const strip = (card, captionNode, groups) => {
  const ink = VERDICT[card?.verdict];
  const head = reserveForControl(h("div", { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" },
    ink ? dot(ink) : null, ink ? h("span", { fontWeight: "bold" }, card.verdict) : null, captionNode));
  // **Two lines, then an ellipsis.** The cut is the browser's and lands on this node alone. `overflowWrap` is what
  // keeps that true of a run with no space in it: an unbroken token would otherwise push past the panel's own edge
  // rather than clip.
  const call = (groups ?? []).find(g => g.id === "act")?.summary;
  return h("div", {}, head, call
    ? h("div", { fontWeight: "bold", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: "2",
        overflow: "hidden", overflowWrap: "anywhere", minWidth: "0" }, call)
    : null);
};

export const el = document.createElement("div");
el.id = "coach-hud";
Object.assign(el.style, {
  position: "fixed", top: INSET, left: INSET, zIndex: "2147483647",
  // The width is the footprint and not the text column, so the rule, the shadow and the padding are inside it.
  boxSizing: "border-box", width: PANEL_W, padding: `${rung(0.75)} ${ROWS}`,
  background: SKIN.fill, color: SKIN.body,
  // One rule and one shadow for the whole object, so they hold whatever the panel is showing. Square corners.
  border: `1px solid ${SKIN.rule}`, boxShadow: `1px 1px 0 ${SKIN.shadow}`,
  // The longhands and not the `font` shorthand: the size is a `calc()`, and a calculation ahead of the shorthand's
  // `/` line-height is a parse a panel should not be betting on.
  fontFamily: REGISTER.chrome.face, fontSize: REGISTER.chrome.size, lineHeight: REGISTER.chrome.line,
  userSelect: "none", display: "none",
});
// Keep clicks on the panel from reaching the game underneath.
for (const ev of ["click", "mousedown", "pointerdown", "touchstart"]) el.addEventListener(ev, e => e.stopPropagation());
document.body.appendChild(el);
