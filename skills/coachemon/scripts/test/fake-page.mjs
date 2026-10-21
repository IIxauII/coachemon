import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const OPTIONS = ["scene", "rnd", "stored", "expose"];
const compiled = new Map();
let mounts = 0;
const hud = expose => {
  if (!compiled.has(expose)) compiled.set(expose, new Function(`"use strict";${bundle("hud", { expose })}`));
  return compiled.get(expose);
};
// No `tagName`: `90-render.js`'s `rowText` reads an `IMG` node as its title, so a tagged node would change the wire text.
const node = () => {
  const n = { style: {}, dataset: {}, children: [], addEventListener(ev, fn) { if (ev === "click") n.onclick = fn; }, remove() {},
    append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } };
  return n;
};
const seeded = () => ({ _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } });

// `plain` copies `90-render.js`'s `rowText`, and `clean` and `headingOf` its `clean` and `headingText`. `card()`
// asserts all three against the wire, so a change there fails here instead of drifting.
const walk = n => {
  if (n == null) return { plain: "", titled: "" };
  if (typeof n !== "object") return { plain: String(n), titled: String(n) };
  if (String(n.tagName ?? "").toUpperCase() === "IMG") return { plain: String(n.title ?? ""), titled: String(n.title ?? "") };
  const kids = (n.childNodes ? Array.prototype.slice.call(n.childNodes) : n.children ?? []).map(walk);
  const leaf = String(n.textContent ?? "");
  const join = half => (kids.length ? kids.map(k => k[half]).filter(Boolean).join(" ") : leaf);
  const titled = join("titled");
  return { plain: join("plain"), titled: n.title ? `${titled} {${n.title}}` : titled };
};
const clean = l => l.replace(/\s+/g, " ").trim();
const headingOf = g => (g.id === "act" ? g.summary
  : g.summary && g.label ? `${g.label}: ${g.summary}` : g.label || g.summary) || null;

// The card as `__coachHud.card()` sends it, each row with its hover titles inline as `{…}`, under one line for the
// event and one for the strip's head (#894).
const cardText = el => {
  const ev = globalThis.__coachHud.card();
  const failed = el.textContent ? [`TEXT ${el.textContent}`] : [];
  if (!ev) return ["card none", ...failed].join("\n");
  const drawn = [...(globalThis.__hud["98-watch"].watchShown()?.groups ?? [])];
  const head = (el.kids?.length ?? 0) >= 2 ? el.kids[1].children?.[0] : null;
  const out = [`card ${ev.kind} W${ev.wave ?? "-"} ${ev.verdict ?? "-"}${ev.randomized ? " randomized" : ""}${ev.oracleLine
    ? ` line ${ev.oracleLine.state} ${ev.oracleLine.turn}/${ev.oracleLine.of}` : ""}`];
  if (head) out.push(`strip ${clean(walk(head).titled)}`);
  const plain = [];
  for (const wire of ev.groups) {
    const index = drawn.findIndex(d => d.id === wire.id);
    assert.ok(index >= 0, `card(): the wire has a ${wire.id} group the panel never drew`);
    const rows = drawn.splice(index, 1)[0].rows.map(walk)
      .map(w => ({ plain: clean(w.plain), titled: clean(w.titled) })).filter(r => r.plain);
    assert.deepEqual(rows.map(r => r.plain), wire.rows, `card(): ${wire.id}'s rows walk differently from the wire`);
    plain.push([headingOf(wire), ...wire.rows].filter(Boolean).join("\n"));
    out.push(...[headingOf(wire), ...rows.map(r => r.titled)].filter(Boolean));
  }
  assert.deepEqual(drawn.map(g => g.id), [], "card(): the panel drew groups the wire does not carry");
  assert.equal(plain.filter(Boolean).join("\n") || null, ev.text, "card(): the groups rebuild a different text from the wire's");
  return [...out, ...failed].join("\n");
};

/**
 * Each call is a fresh page load: `__coachHud` is deleted, not stopped, and the bundle's module state starts over. The
 * first card is drawn during the call, so the scene must already answer. The page globals stay installed until the
 * next call. `scene` left out is a page with no game; an object or `null` is what `getScene` answers; a function is
 * called on every `getScene`. The bundle runs as a strict function body in global scope, so a name a module never
 * imported is a ReferenceError.
 */
export const mountHud = (opts = {}) => {
  const unknown = Object.keys(opts).filter(k => !OPTIONS.includes(k));
  if (unknown.length) throw new TypeError(`mountHud: unknown option ${unknown.join(", ")} (it takes ${OPTIONS.join(", ")})`);
  if ("scene" in opts && opts.scene === undefined) throw new TypeError("mountHud: scene is undefined; leave the key out for a page with no game");
  const { scene, rnd = seeded(), stored = {}, expose = true } = opts;
  const store = new Map(Object.entries(stored));
  let el = null;
  const getScene = typeof scene === "function" ? () => scene() : () => scene;
  globalThis.window = globalThis;
  delete globalThis.__coachHud;
  globalThis.Phaser = { Math: { RND: rnd }, Display: { Canvas: { CanvasPool: { pool: "scene" in opts
    ? [{ parent: { game: { scene: { getScene }, textures: { exists: () => false } } } }] : [] } } } };
  globalThis.document = { documentElement: { dataset: {}, appendChild(n) { return n; } }, body: { appendChild: e => (el = e) }, createElement: node };
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const at = ++mounts;
  hud(expose)();
  const card = () => {
    if (at !== mounts) throw new Error("mountHud: card() read after a later mount replaced this page");
    if (!expose) throw new TypeError("mountHud: card() reads the drawn groups, so it needs the default expose");
    return cardText(el);
  };
  return { el, store, card };
};
