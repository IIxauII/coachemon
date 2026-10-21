import { bundle } from "../hud-bundle.mjs";

const OPTIONS = ["scene", "rnd", "stored", "expose"];
const compiled = new Map();
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
  hud(expose)();
  return { el, store };
};
