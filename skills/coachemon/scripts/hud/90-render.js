// The panel itself: its element, the sprites and text helpers every card is drawn from, and what it remembers of the
// view the player left it in. It draws no card and decides nothing.
// State another file needs is read and written through functions, never exported as a binding.
// @only tests: LAW_INK, MARKS, GUTTER_INK, GROUP_IDS, pane, flatGroups
let game = null;
const sprites = new Map();
let missed = false; // a wanted sprite wasn't loaded yet during the last draw

export const battleScene = () => {
  game ??= Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game;
  return game.scene.getScene("battle");
};
// After a failed refresh: the page may have reloaded under us.
export const dropGame = () => { game = null; };
// Icon atlases load lazily, so a draw that wanted a sprite it didn't get is drawn again next refresh.
export const missedSprite = () => missed;
export const clearMissed = () => { missed = false; };

const sprite = (key, frame) => {
  const id = `${key}/${frame}`;
  if (!sprites.has(id)) {
    try {
      const t = game.textures;
      // Never cache a miss: the atlas may have loaded by the next refresh.
      if (t.exists(key) && t.get(key).has(frame)) sprites.set(id, t.getBase64(key, frame));
    } catch {}
  }
  return sprites.get(id) ?? "";
};

const SKIN = { fill: "#362d3e", body: "#f8f8f8", rule: "#f8b050", shadow: "#181818" };

// The canvas's drawn width (game-code.md §27). Inlined into every length rather than set as a CSS custom property:
// the only API that sets one on an element is the one the no-motion guard bans, and it scans comments too.
const GAME_W = "min(100vw, 177.78vh)";
// `round(game-w / 240, 8px)` is the same number as `8 × round(game-w / 1920)`, which is what CSS can say without
// dividing a length by a length.
const ROWS = `clamp(10px, round(${GAME_W} / 240, 8px), 24px)`;
// `round(…, 1px)` here and in `rung`: both faces and every sprite are pixel designs, and a fractional size softens
// them.
const CHROME = `round(1.6 * ${ROWS}, 1px)`;
export const rung = n => `round(calc(${n} * ${ROWS}), 1px)`;

// `REF_W` is derived from `SHARE`, so the clamp multipliers and `SHARE` move together: raising the share alone drags
// the width floor up with it.
const SHARE = 0.234;
const REF_W = SHARE * 1920;
// Rounded because the products are binary floats: `0.5 * 0.234 * 1920` is `224.64000000000001`, and the whole of it
// would ship into the style attribute.
const pxRound = n => `${Math.round(n * 100) / 100}px`;
export const PANEL_W = `clamp(${pxRound(0.5 * REF_W)}, calc(${SHARE} * ${GAME_W}), ${pxRound(1.5 * REF_W)})`;
// The game's message window starts `11/15 ÷ (16/9) = 0.4125 × game-w` down (game-code.md §27), so 0.40 stays above
// it. It bounds the pane, not the panel.
const INSET = "8px";
const MAX_H = `calc(0.40 * ${GAME_W} - ${INSET})`;

// A register has one size, and nothing below a row sets a size of its own.
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
// Sprite heights in rungs, by job: `big` the foe card's portrait, `mon` the mon a row is about, `ref` a mon it merely
// refers to, `mark` a type, category, status or ball.
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
export const LAW_INK = { ours: "#40c8f8", theirs: "#f88880", later: "#e331c5", none: "#a0a0a0" };
export const ink = { ours: { color: LAW_INK.ours }, theirs: { color: LAW_INK.theirs }, later: { color: LAW_INK.later } };
export const dim = { color: LAW_INK.none };
const GROUP_LAW = { act: "ours", foes: "theirs", catch: "ours", plan: "later", options: "ours", audit: "later", road: "later", notes: "none" };
// The frame's `theirs` is the game's Fire-type red, too dark on the panel's fill to use for text.
const FRAME = { ...LAW_INK, theirs: "#f75231" };

// Only for the text standing in for a type sprite that has not loaded, never beside a drawn one.
const TYPE_INK = {
  normal: "#a8a878", fighting: "#c03028", flying: "#a890f0", poison: "#a040a0", ground: "#e0c068", rock: "#b8a038",
  bug: "#a8b820", ghost: "#705898", steel: "#b8b8d0", fire: "#f08030", water: "#6890f0", grass: "#78c850",
  electric: "#f8d030", psychic: "#f85888", ice: "#98d8d8", dragon: "#7038f8", dark: "#705848", fairy: "#e888c8",
  stellar: "#ffffff",
};
// Only with `eff`: a count of foes weak to a type is written `×4` too, and matching the string would ink that count as
// super effective.
const EFFECT_INK = { "×4": "#4AA500", "×¼": "#FE8E00", "×0": "#929292" };
export const badge = (type, suffix = "", eff = false) => {
  const drawn = img("types", type.toLowerCase(), type, ICON.mark);
  const mult = eff ? EFFECT_INK[suffix] : null;
  return h("span", { whiteSpace: "nowrap", marginRight: "3px" },
    typeof drawn === "string" ? h("span", { color: TYPE_INK[type.toLowerCase()] }, drawn) : drawn,
    suffix && h("b", mult ? { color: mult } : {}, suffix));
};
const GUTTER = rung(1.75);
// Good news and bad news are told apart by the mark's **shape**, never by its colour alone, so a new mark has to
// differ from the rest by shape.
export const MARKS = [..."⚔➜★✓▲↯✗✦⚠▼⇄⤵≈↺·", "💀", "👑", "🎲", "🔒"];
// The gutter's ink is the mark's and not the caller's; an emoji keeps its own colour.
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

export const GROUP_IDS = ["act", "foes", "catch", "plan", "options", "audit", "road", "notes"];
const inOrder = groups => GROUP_IDS.flatMap(id => (groups ?? []).filter(g => g.id === id));
// `rows` are nodes, each flattened to one line of text.
export const group = (id, label, summary, rows) => {
  if (!GROUP_IDS.includes(id)) throw new Error(`unknown group ${id}`);
  if (!label) throw new Error(`group ${id} has no label`);
  return { id, label, summary: summary || null, rows: (rows ?? []).filter(Boolean) };
};
export const some = (id, label, summary, rows) => {
  const g = group(id, label, summary, rows);
  return g.summary || g.rows.length ? g : null;
};

// The plain text's heading, which differs from `paneHeading`'s: text has no tab to carry the group's name.
const headingText = g => (g.id === "act" ? g.summary
  : g.summary && g.label ? `${g.label}: ${g.summary}` : g.label || g.summary) || null;
// The cut is the browser's and lands on the drawn node alone: `groups[].summary` and the card's text are never cut.
const ONE_LINE = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const paneHeading = g => {
  // The strip directly above is `act`'s heading.
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

// Never wraps and never scrolls: the vocabulary, not this layout, holds a card to five tabs.
const BAR = { display: "flex", flexWrap: "nowrap", gap: rung(1), overflow: "hidden", margin: "3px 0", minWidth: "0" };
const TAB = { flex: "0 1 auto", minWidth: "0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" };
const tab = (g, open) => {
  const n = h("span", { ...TAB, color: open ? SKIN.body : dim.color, fontWeight: open ? "bold" : "normal" }, g.label);
  n.addEventListener("click", e => { e.stopPropagation(); if (!open) { setOpen(g.id); redrawFn(); } });
  return n;
};

// **The dismissal is stored as a flag over the view rather than as a third value of it**, because reopening restores
// the view it covered.
const PANEL_KEY = "coach-hud-panel";
const VIEWS = ["drawer", "strip"];
// Read only while `PANEL_KEY` is empty, then written forward and removed.
const OLD_KEY = "coach-hud-view";
const MIGRATE = { full: ["drawer", false], mini: ["strip", false], closed: ["drawer", true] };

let view = "drawer";
let dismissed = false;
// By group id and not by position, so it survives the card changing under it; the fallback to `act` is written back.
let openId = "act";

const save = () => {
  try { localStorage.setItem(PANEL_KEY, JSON.stringify({ view, closed: dismissed, group: openId })); } catch {}
};
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

export const panelState = () => (dismissed ? "closed" : view);
export const openGroup = () => openId;
// **A state change redraws and a group move does not**: a group also moves *during* a draw, so the tab asks for its
// own redraw.
const setView = next => { if (next !== view) { view = next; save(); redrawFn(); } };
const setDismissed = next => { if (next !== dismissed) { dismissed = next; save(); redrawFn(); } };
const setOpen = id => { if (id !== openId) { openId = id; save(); } };

const PANE = { maxHeight: MAX_H, overflowY: "auto", padding: `${rung(0.5)} ${rung(0.75)}` };
export const drawer = groups => {
  const list = inOrder(groups);
  const open = list.find(g => g.id === openId) ?? list.find(g => g.id === "act") ?? list[0];
  if (!open) return [];
  setOpen(open.id);
  return [h("div", BAR, ...list.map(g => tab(g, g === open))),
    h("div", { ...PANE, border: `1px solid ${frameInk(open.id)}` }, ...pane(open))];
};

// What goes on the wire. **The plain text never dispatches on a kind**: which draw goes with which kind is 98-tick's
// one table. A second copy here, for the tests alone, let the panel change under a suite still drawing the old shape
// (#388).
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
// A sprite reads as the title `img` gives it. Two losses: an optional sprite adds its title only once it has loaded,
// so one card can flatten two ways (the stream deduplicates on kind, key and verdict, never on the text); and a title
// on anything but an `IMG` never reaches the text.
const rowText = n => {
  if (n == null) return "";
  if (typeof n !== "object") return String(n);
  if (tagOf(n) === "IMG") return String(n.title ?? "");
  const kids = kidsOf(n);
  if (!kids.length) return String(n.textContent ?? "");
  return kids.map(rowText).filter(Boolean).join(" ");
};
const clean = l => l.replace(/\s+/g, " ").trim();

// 98-tick registers the refresh here, so a control can redraw without this file knowing what a card is.
let redrawFn = () => {};
export const setRedraw = fn => { redrawFn = fn; };

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
// The controls float over the panel's first line, which leaves room for them or the caption runs under the ×.
const reserveForControl = node => {
  if (node) node.style.paddingRight = rung(4.25);
  return node;
};
// **Dismissed means silent**: one fixed mark, the same on every wave, carrying nothing the card knows.
const GLYPH = "🎯";
export const glyph = () => {
  const n = h("span", { cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }, GLYPH);
  n.title = "Open coach";
  n.addEventListener("click", e => { e.stopPropagation(); setDismissed(false); });
  return n;
};

// Built by each kind's renderer and drawn in the strip. Its arrow-separated list is **our** actives, never the enemy
// roster.
export const caption = (emoji, title, ...rest) => h("div",
  { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", minWidth: "0", fontWeight: "bold", color: SKIN.rule },
  emoji, title, ...rest);

// Trainer and fight share the gold on purpose: the word spelled out beside the dot is what tells them apart.
const VERDICT = { easy: "#78c850", trainer: "#f8b050", danger: "#e13d3d", catch: "#40c8f8", fight: "#f8b050" };
const dot = ink => h("span", { width: rung(1), height: rung(1), flex: "none", borderRadius: "50%", background: ink });

// **A card with no verdict ink draws no dot and no word** — every card but a battle's, and an `unavailable` battle,
// whose call already says why.
export const strip = (card, captionNode, groups) => {
  const ink = VERDICT[card?.verdict];
  const head = reserveForControl(h("div", { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" },
    ink ? dot(ink) : null, ink ? h("span", { fontWeight: "bold" }, card.verdict) : null, captionNode));
  // `overflowWrap` keeps the two-line clamp true of a run with no space in it, which would otherwise push past the
  // panel's edge rather than clip.
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
  border: `1px solid ${SKIN.rule}`, boxShadow: `1px 1px 0 ${SKIN.shadow}`,
  // Longhands: a `calc()` size ahead of the `font` shorthand's `/` line-height is a parse not worth betting on.
  fontFamily: REGISTER.chrome.face, fontSize: REGISTER.chrome.size, lineHeight: REGISTER.chrome.line,
  userSelect: "none", display: "none",
});
for (const ev of ["click", "mousedown", "pointerdown", "touchstart"]) el.addEventListener(ev, e => e.stopPropagation());
document.body.appendChild(el);
