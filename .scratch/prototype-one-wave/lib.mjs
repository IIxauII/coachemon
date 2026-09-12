// PROTOTYPE — throwaway. Answers pokerogue-mcp issue #6 ("One wave, driven by a raw script").
// Not the server. No abstractions worth keeping, no tests, no error handling beyond "it runs".
import { appendFileSync } from 'node:fs';

// ---------------------------------------------------------------- CDP client
export class Cdp {
  constructor() { this.calls = 0; this.bytesIn = 0; this.bytesOut = 0; this.times = []; }

  async connect() {
    const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
    const page = targets.find(t => t.type === 'page' && t.url.includes('pokerogue.net'));
    if (!page) throw new Error('no pokerogue tab');
    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    this.id = 0; this.pending = new Map();
    this.ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (p) { this.pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); }
    });
    await new Promise(r => this.ws.addEventListener('open', r));
    return this;
  }

  send(method, params = {}) {
    return new Promise((res, rej) => {
      const n = ++this.id;
      this.pending.set(n, { res, rej });
      const payload = JSON.stringify({ id: n, method, params });
      this.bytesOut += payload.length;
      this.ws.send(payload);
    });
  }

  // Every round-trip goes through here, so the counters answer
  // "how many round-trips and how much text does one wave cost".
  async evalIn(body) {
    const expression = `(function(){${PRELUDE}\n${body}\n})()`;
    const t0 = process.hrtime.bigint();
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, generatePreview: false });
    this.times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    this.calls++;
    if (r.exceptionDetails) {
      const e = { __throw: r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text };
      this.bytesIn += JSON.stringify(e).length;
      return e;
    }
    const v = r.result.value;
    this.bytesIn += JSON.stringify(v ?? null).length;
    return v;
  }

  async key(type, code, keyCode) {
    this.calls++;
    return this.send('Input.dispatchKeyEvent', { type, code, key: code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  }

  stats() {
    const s = [...this.times].sort((a, b) => a - b);
    const pct = p => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
    return { calls: this.calls, bytesIn: this.bytesIn, bytesOut: this.bytesOut,
             p50: +pct(0.5).toFixed(2), p90: +pct(0.9).toFixed(2), max: +(s.at(-1) ?? 0).toFixed(2) };
  }
}

// ------------------------------------------------------- scene locator (#9)
export const PRELUDE = `
var __locate = function(){
  var P = globalThis.Phaser;
  if (!P || !P.Display || !P.Display.Canvas || !P.Display.Canvas.CanvasPool) return {ready:false, why:'no-phaser'};
  var pool = P.Display.Canvas.CanvasPool.pool;
  if (!Array.isArray(pool) || pool.length === 0) return {ready:false, why:'empty-pool'};
  var game = null, i, p;
  for (i=0;i<pool.length;i++){ p = pool[i] && pool[i].parent; if (p && p.game && p.game.scene){ game = p.game; break; } }
  if (!game) for (i=0;i<pool.length;i++){ p = pool[i] && pool[i].parent; if (p && p.scene && p.scene.sys && p.scene.sys.game){ game = p.scene.sys.game; break; } }
  if (!game) return {ready:false, why:'no-game-in-pool'};
  if (!game.isBooted || !game.isRunning) return {ready:false, why:'not-booted'};
  var scene = game.scene.getScene('battle');
  if (!scene || !scene.ui) return {ready:false, why:'no-battle-scene'};
  return {ready:true, game:game, scene:scene};
};
var __txt = function(o){ return o && typeof o.text === 'string' ? o.text : null; };
var __kids = function(c){ return (c && c.list) ? c.list : []; };
var __texts = function(c){ var out=[]; __kids(c).forEach(function(k){ if (typeof k.text === 'string') out.push(k.text); }); return out; };
var __named = function(c, n){ var f=null; __kids(c).forEach(function(k){ if (k.name === n) f = k; }); return f; };
// Several handlers render option labels as BBCode: "[shadow]Apply[/shadow]".
var __strip = function(s){ return typeof s === 'string' ? s.replace(/\\[\\/?[^\\]]*\\]/g, '').trim() : s; };
`;

export const B = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, SUBMIT: 4, ACTION: 5, CANCEL: 6, MENU: 7, STATS: 8 };

export const M = {
  MESSAGE: 0, TITLE: 1, COMMAND: 2, FIGHT: 3, BALL: 4, TARGET_SELECT: 5, MODIFIER_SELECT: 6,
  SAVE_SLOT: 7, PARTY: 8, SUMMARY: 9, STARTER_SELECT: 10, EVOLUTION_SCENE: 11, EGG_HATCH_SCENE: 12,
  EGG_HATCH_SUMMARY: 13, CONFIRM: 14, OPTION_SELECT: 15, MENU: 16, MENU_OPTION_SELECT: 17,
  SETTINGS_GENERAL: 18, ACHIEVEMENTS: 25, GAME_STATS: 26, EGG_LIST: 27, EGG_GACHA: 28,
  POKEDEX: 29, LOGIN_OR_REGISTER: 32, LOGIN_FORM: 33, LOADING: 35, UNAVAILABLE: 36,
  CHALLENGE_SELECT: 37, RENAME_POKEMON: 38, RUN_HISTORY: 40, RUN_INFO: 41,
  MYSTERY_ENCOUNTER: 45, ALERT_MODAL: 47,
};
export const MODE_NAME = Object.fromEntries(Object.entries(M).map(([k, v]) => [v, k]));
export const nameOf = m => MODE_NAME[m] ?? `UNKNOWN_${m}`;

export function log(file, obj) { appendFileSync(file, JSON.stringify(obj) + '\n'); }
