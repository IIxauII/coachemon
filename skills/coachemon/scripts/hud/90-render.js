// The panel itself: its element, the sprites and text helpers every card is drawn from, and the view the user has
// picked. It draws no card and decides nothing - 60-card works out what is on screen, the renderers above turn one
// card into nodes, and 98-tick puts the two together.
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

// Panel views: "full" (everything), "mini" (one line per foe), "closed" (tab).
// An easy wild wave collapses to one line in either view; a view button pressed during a wave holds for the rest
// of it (`hold` is that wave's key), so the panel doesn't collapse again under the user.
const VIEW_KEY = "coach-hud-view";
let current = "full";
try { current = localStorage.getItem(VIEW_KEY) || current; } catch {}
let shownWave = null, hold = null;
export const view = () => current;
export const shownCardWave = () => shownWave;
export const setShownCardWave = w => { shownWave = w; };
export const heldWave = () => hold;
// An easy wild wave is one line, until the user picks a view for this wave. Never while rendering for text: the card
// event carries the whole card, whatever the user has the panel collapsed to (§11.1).
export const collapsedCard = card => !asText && current !== "closed" && hold !== shownWave && card?.verdict === "easy";

// ---- The card as plain text (§11.1)
// The stream's `text` is the card the panel draws, read back as lines: one source, so the two can never disagree. It
// is always the full, uncollapsed card — the user's own view is theirs, and a subscriber asked for the whole thing.
// 98-tick registers the draw for a kind here, the way it registers the redraw: dispatch stays its business.
let asText = false;
let drawFn = () => null;
export const setDraw = fn => { drawFn = fn; };
export const cardText = card => {
  if (!card) return null;
  const nodes = renderText(() => drawFn(card));
  return nodes && nodes.length ? nodesText(nodes) : null;
};
const renderText = draw => {
  const wasView = current, wasText = asText;
  current = "full";
  asText = true;
  try { return draw(); } finally { current = wasView; asText = wasText; }
};

const tagOf = n => String(n.tagName ?? "").toUpperCase();
// A div is the panel's only block: everything else sits on the line it was appended to.
const isBlock = n => n != null && typeof n === "object" && tagOf(n) === "DIV";
const kidsOf = n => (n.childNodes ? Array.prototype.slice.call(n.childNodes) : n.children ?? []);
// A sprite reads as what it stands for: `img` titles every icon with the name it drew.
const nodeLines = n => {
  if (n == null) return [];
  if (typeof n !== "object") return [String(n)];
  // A control the panel draws for the mouse — a view button, the tab — is not part of what the card says.
  if (n.style && n.style.cursor === "pointer") return [];
  if (tagOf(n) === "IMG") return [String(n.title ?? "")];
  const kids = kidsOf(n);
  if (!kids.length) return [String(n.textContent ?? "")];
  const out = [];
  let inline = "";
  for (const k of kids) {
    const lines = nodeLines(k).filter(Boolean);
    if (!lines.length) continue;
    if (isBlock(k)) {
      if (inline) { out.push(inline); inline = ""; }
      out.push(...lines);
    } else inline = inline ? `${inline} ${lines.join(" ")}` : lines.join(" ");
  }
  if (inline) out.push(inline);
  return out;
};
const nodesText = nodes => nodes.flatMap(nodeLines).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

// ---- The disclaimer (§3)
// Fixed wording, on every listing and inside the extension. The panel has no About page, so the full view carries it.
const DISCLAIMER = "Unofficial. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.";
export const disclaimer = () => h("div", { ...dim, fontSize: FS.tiny, marginTop: "4px" }, DISCLAIMER);

// The refresh itself lives in 98-tick, above every renderer; it registers itself here so a view button can ask for
// a redraw without this file knowing what a card is.
let redrawFn = () => {};
export const setRedraw = fn => { redrawFn = fn; };
export const redraw = () => redrawFn();
export const setView = v => {
  current = v;
  hold = shownWave;
  try { localStorage.setItem(VIEW_KEY, v); } catch {}
  redraw();
};
// `next`: the view to switch to, or a function to run.
export const button = (label, title, next) => {
  const n = h("span", { cursor: "pointer", padding: "0 4px", borderRadius: "3px", background: "rgba(255,255,255,.1)", fontWeight: "bold" }, label);
  n.title = title;
  n.addEventListener("click", e => { e.stopPropagation(); typeof next === "function" ? next() : setView(next); });
  return n;
};

export const tab = (emoji, icon) => {
  const n = h("span", { cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }, emoji, icon);
  n.title = "Open coach";
  n.addEventListener("click", e => { e.stopPropagation(); setView("mini"); });
  return n;
};
export const bar = (emoji, title, ...right) => h("div", { display: "flex", alignItems: "center", gap: "4px", fontWeight: "bold" },
  emoji, title, h("span", { flex: "1" }), ...right,
  h("span", { width: "4px" }),
  current === "full" ? button("−", "Minimal overview", "mini") : button("+", "Expand", "full"),
  button("×", "Close", "closed"));

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
