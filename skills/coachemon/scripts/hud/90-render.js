// The panel itself: its element, the sprites and text helpers every card is drawn from, and whether the user has it
// closed. It draws no card and decides nothing - 60-card works out what is on screen, the renderers above turn one
// card into groups, and 98-tick puts the two together.
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

// HUD font sizes: one knob scales every view.
export const FS = { base: "12px", small: "11px", tiny: "10px" };
export const h = (tag, style, ...kids) => {
  const n = document.createElement(tag);
  Object.assign(n.style, style);
  n.append(...kids.flat().filter(k => k != null && k !== ""));
  return n;
};
export const img = (key, frame, title, height, fallback = title) => {
  const url = sprite(key, frame);
  if (!url) {
    // Optional sprites (fallback null) may simply not exist; don't retry those.
    if (fallback !== null) missed = true;
    return fallback;
  }
  const i = document.createElement("img");
  i.src = url;
  i.title = title;
  Object.assign(i.style, { height: `${height}px`, imageRendering: "pixelated", verticalAlign: "middle", margin: "0 1px" });
  return i;
};
export const mon = (icon, name, height = 24) => (icon ? img(icon[0], icon[1], name, height, name) : name);
export const badge = (type, suffix = "") => h("span", { whiteSpace: "nowrap", marginRight: "3px" },
  img("types", type.toLowerCase(), type, 13), suffix && h("b", { fontSize: FS.small }, suffix));
export const dim = { color: "#9aa" };
export const line = (label, color, ...kids) => h("div", { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "1px" },
  h("span", { color, width: "14px", flex: "none" }, label), ...kids);
export const hpColor = hp => (hp > 50 ? "#6d6" : hp > 20 ? "#ec4" : "#e55");
export const itemImg = (icon, name) => img("items", icon, name, 18, null);
export const sep = { borderTop: "1px solid rgba(255,255,255,.12)", margin: "3px 0" };

// The panel has one fidelity, so there are two states: the panel, and the glyph a dismissal leaves behind (#349 §2).
// Nothing switches between them but the user — no card collapses itself, and no section opens itself. Both states
// are the shell's: a renderer returns the card's groups and never asks which one is up, which is why the card's text
// no longer has to force a view on a draw to read it.
// The stored value is still the old three-valued one, and nothing migrates it: anything that isn't "closed" reads as
// the panel, so a stored middle view draws as the panel. Closing or reopening writes the key as it always did, so
// the middle value survives only until the user next touches the control; #349 §15 moves it to a key of its own.
const VIEW_KEY = "coach-hud-view";
let isClosed = false;
try { isClosed = localStorage.getItem(VIEW_KEY) === "closed"; } catch {}
export const closed = () => isClosed;

// ---- Groups (#349 §1)
// A renderer's product is an ordered list of **group**s, not a list of nodes: `{ id, label, summary, rows }`. The
// shell decides how to shell them, so separation between groups is the shell's business and no renderer draws a
// divider of its own.
//
// The ids are closed at eight and semantic — a group means the same thing wherever it appears, which is what lets
// one be remembered as the cards change under it. A ninth means retiring or merging one, not adding one here.
//
// One list, in the fixed order the plain text walks and the tab bar will sit in, whatever the drawer is showing
// (§5): a renderer cannot lead with what matters most on its own kind, so a tab sits in the same place always.
// `act` leads it, which is what makes the first line of a card's text its call.
export const GROUP_IDS = ["act", "foes", "catch", "plan", "options", "audit", "road", "notes"];
// `label` is the group's name on the tab; `summary` is what it concluded, and may be absent. `rows` are nodes: a row
// is two inline columns, the gutter and the body, so it flattens to `mark body`.
export const group = (id, label, summary, rows) => {
  if (!GROUP_IDS.includes(id)) throw new Error(`unknown group ${id}`);
  return { id, label: label ?? "", summary: summary || null, rows: (rows ?? []).filter(Boolean) };
};
// The same group, or nothing at all when it has neither summary nor rows: an empty tab is filler, and the options
// themselves say it one glance lower (§6). The label-alone rule is for a group with rows and nothing to conclude,
// not for one with nothing. Every renderer that builds more than one group wants this, so it lives here.
export const some = (id, label, summary, rows) => {
  const g = group(id, label, summary, rows);
  return g.summary || g.rows.length ? g : null;
};

// What heads a group's pane, and its block in the plain text — one rule, so the two cannot disagree.
// `act` is headed by its summary alone: the strip above it is its label (§6), which is also what makes the first
// line of the card's text the call and not a heading. A group with no summary is headed by its label alone — and an
// `act` with none is therefore headed by nothing, since its label is the strip's.
// The name and what it concluded are held apart by a colon, or the heading reads as one sentence: `Foes: we're weak
// to Fire ×2`, where the pane has bold against dim to do the same work. A colon rather than the ` — ` the repo
// usually spends on claim→detail, because the summaries already spend one inside themselves.
const headingText = g => (g.id === "act" ? g.summary
  : g.summary && g.label ? `${g.label}: ${g.summary}` : g.label || g.summary) || null;
const headingNode = g => {
  if (!headingText(g)) return null;
  return g.id === "act"
    ? h("div", { fontWeight: "bold" }, g.summary)
    : h("div", {}, h("span", { fontWeight: "bold", marginRight: "4px" }, g.label), g.summary ? h("span", dim, g.summary) : null);
};

// The drawer, for now a plain stack: every group, headed, with the shell's own rule between them. The tab bar and
// the pane arrive in #357; nothing here knows what a view is.
export const drawGroups = groups => (groups ?? []).flatMap((g, i) =>
  [i ? h("div", sep) : null, headingNode(g), ...g.rows].filter(Boolean));

// ---- The card as plain text (§11.1, §5)
// The stream's `text` is derived from the group list rather than read back off the drawn card, so the two cannot
// disagree by construction. It is always the whole card and always in the fixed group order, whatever the drawer is
// showing — and it needs no view forced on a renderer to be so, because no renderer knows what a view is.
// 98-tick registers the draw for a kind here, the way it registers the redraw: dispatch stays its business.
let drawFn = () => null;
export const setDraw = fn => { drawFn = fn; };

// The group list as plain data: the same groups in the fixed order, with their rows flattened to one string each.
// This is the seam the content half of the card is tested at, and what #361 puts on the wire.
export const groupsText = groups => GROUP_IDS.flatMap(id => (groups ?? []).filter(g => g.id === id))
  .map(g => ({ id: g.id, label: g.label, summary: g.summary, rows: g.rows.map(rowText).map(clean).filter(Boolean) }));

export const cardText = card => {
  if (!card) return null;
  const groups = drawFn(card);
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
export const disclaimer = () => h("div", { ...dim, fontSize: FS.tiny, marginTop: "4px" }, DISCLAIMER);

// The refresh itself lives in 98-tick, above every renderer; it registers itself here so the close control can ask
// for a redraw without this file knowing what a card is.
let redrawFn = () => {};
export const setRedraw = fn => { redrawFn = fn; };
const setClosed = next => {
  isClosed = next;
  try { localStorage.setItem(VIEW_KEY, next ? "closed" : "full"); } catch {}
  redrawFn();
};

// The panel's one control: shut it, and the glyph that brings it back. **Controls are the shell's, never a row's**
// (§5) — a control inside a row is a control inside the card's text, which is what the flattener used to have to
// drop by its mouse cursor. It sits in the panel's own corner rather than on a line of its own, so it costs no
// height while the strip is still to come (#356).
export const closeButton = () => {
  const n = h("span", { position: "absolute", top: "4px", right: "4px", cursor: "pointer", padding: "0 4px", borderRadius: "3px", background: "rgba(255,255,255,.1)", fontWeight: "bold" }, "×");
  n.title = "Close";
  n.addEventListener("click", e => { e.stopPropagation(); setClosed(true); });
  return n;
};
// What a dismissed panel leaves behind, and the only way back. Named for what it is rather than for a tab, because
// the drawer's tab bar takes that word in #357.
export const glyph = (emoji, icon) => {
  const n = h("span", { cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }, emoji, icon);
  n.title = "Open coach";
  n.addEventListener("click", e => { e.stopPropagation(); setClosed(false); });
  return n;
};
// The card's own header line: what the card is about, and whatever the kind puts on the right of it. It is a row
// like any other — the panel's control is the shell's and sits in the panel's corner, so the line reserves room for
// it and nothing else. The strip takes this line in #356.
export const bar = (emoji, title, ...right) => h("div", { display: "flex", alignItems: "center", gap: "4px", fontWeight: "bold", paddingRight: "18px" },
  emoji, title, h("span", { flex: "1" }), ...right);

export const el = document.createElement("div");
el.id = "coach-hud";
Object.assign(el.style, {
  position: "fixed", top: "8px", left: "8px", zIndex: "2147483647",
  maxWidth: "min(320px, calc(100vw - 16px))", padding: "6px 8px", borderRadius: "6px",
  background: "rgba(12,12,24,.88)", color: "#eee",
  font: `${FS.base}/1.4 ui-monospace, Menlo, monospace`,
  userSelect: "none", display: "none",
});
// Keep clicks on the panel from reaching the game underneath.
for (const ev of ["click", "mousedown", "pointerdown", "touchstart"]) el.addEventListener(ev, e => e.stopPropagation());
document.body.appendChild(el);
