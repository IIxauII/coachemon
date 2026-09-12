// PROTOTYPE — throwaway. Answers pokerogue-mcp issue #19 ("The party-overlay stall, with input withheld").
//
// Plays a Classic run with #6's dumb policy, and at every shop runs *trials* on the
// PARTY(8)-from-MODIFIER_SELECT path. After a trial press it presses NOTHING until the
// game settles by itself (or WATCH_MS passes, in which case the whole script halts
// without pressing — the dev ruled out spending input on the stall).
//
//   trial kind "cancel-list": shop -> party-targeted reward -> PARTY list -> CANCEL   (run2's path)
//   trial kind "apply":       ... -> party slot -> options -> Apply                    (run4's path)
//
// Every watch poll records the stall predicate plus what *should* be moving it:
// ui.fadeOut sets overlayActive synchronously and only fadeIn clears it, and fadeIn is
// reached through a 250 ms tween onComplete + a 100 ms scene.time.delayedCall. So the
// probe logs loop frame, tween / timer counts, overlay alpha, and page visibility.
//
//   node stall.mjs [--waves N] [--cancel-trials-per-shop N] [--watch-ms N]
import { Cdp, B, nameOf, log } from './lib.mjs';
import { PREDICATE, READER } from './game.mjs';
import { PROBE } from './probe.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? Number(process.argv[i + 1]) : d; };
const WAVES = arg('--waves', 12);
const CANCEL_TRIALS = arg('--cancel-trials-per-shop', 20);
const WATCH_MS = arg('--watch-ms', 180_000);   // 9x the 20 s censor point, ~3x the longest (contaminated) stall
const HARD_MS = arg('--hard-ms', 5_400_000);
const LOGFILE = process.env.LOGFILE || './stall.jsonl';

const POLL_MS = 100;
const AGREE = 3;
const CHANGE_GRACE_MS = 3_000;
const SETTLE_LIMIT_MS = 120_000;   // non-trial settles: log and stop, never re-press on timeout

const cdp = await new Cdp().connect();
await cdp.send('Runtime.enable');
const t0 = Date.now();
const ms = () => Date.now() - t0;
const sleep = n => new Promise(r => setTimeout(r, n));


// unhandled rejections are one way a continuation dies silently (#11's verify hang)
const exceptions = [];
cdp.ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    const e = { t: ms(), kind: 'page-exception', text: d.text, desc: d.exception?.description?.split('\n').slice(0, 4).join(' | ') };
    exceptions.push(e); log(LOGFILE, e);
  }
});

// ---- settle (non-trial) -----------------------------------------------------
let cur = null;
async function settle(label, preFp) {
  const start = Date.now();
  let lastFp = null, agree = 0;
  for (;;) {
    const r = await cdp.evalIn(PREDICATE);
    if (r.fp !== lastFp) { lastFp = r.fp; agree = 0; }
    agree = r.settled ? agree + 1 : 0;
    const moved = preFp == null || r.fp !== preFp || (Date.now() - start) > CHANGE_GRACE_MS;
    if (agree >= AGREE && moved) return r;
    if (Date.now() - start > SETTLE_LIMIT_MS) {
      log(LOGFILE, { t: ms(), kind: 'settle-limit', label, r });
      throw new Error(`non-trial settle exceeded ${SETTLE_LIMIT_MS} ms after ${label} — halting, no further input`);
    }
    await sleep(POLL_MS);
  }
}

async function act(btn, why) {
  const name = Object.keys(B).find(k => B[k] === btn);
  const preFp = cur?.fp ?? null;
  const res = await cdp.evalIn(`var L=__locate(); return { accepted: L.scene.ui.processInput(${btn}) === true };`);
  log(LOGFILE, { t: ms(), kind: 'press', btn: name, why, returned: res.accepted, preFp });
  cur = await settle(`${name}/${why}`, preFp);
  return cur;
}

// ---- the trial: one press, then hands off ------------------------------------
const trials = [];
async function trial(kind, btn, why) {
  const name = Object.keys(B).find(k => B[k] === btn);
  const pre = await cdp.evalIn(PROBE);
  const preFp = pre.base.fp;
  const tPress = Date.now();
  const res = await cdp.evalIn(`var L=__locate(); return { accepted: L.scene.ui.processInput(${btn}) === true };`);
  log(LOGFILE, { t: ms(), kind: 'trial-press', trialKind: kind, n: trials.length, btn: name, why, returned: res.accepted, pre });

  let last = null, agree = 0, polls = 0, oaSince = null, maxOaMs = 0, lastHeartbeat = 0;
  let firstFrame = null, framesDuringOa = 0, frameAtOa = null;
  const reasons = {};
  for (;;) {
    const p = await cdp.evalIn(PROBE);
    polls++;
    const now = Date.now(), el = now - tPress;
    if (firstFrame == null) firstFrame = p.frame;
    reasons[p.base.reason] = (reasons[p.base.reason] ?? 0) + 1;

    if (p.oa === true) {
      if (oaSince == null) { oaSince = now; frameAtOa = p.frame; }
      maxOaMs = Math.max(maxOaMs, now - oaSince);
      framesDuringOa = p.frame - frameAtOa;
    } else oaSince = null;

    // log every change of the interesting fields, plus a 1 Hz heartbeat while not settled
    const sig = [p.base.reason, p.base.fp, p.oa, p.ovAlpha, JSON.stringify(p.twOv), p.timers, p.vis, p.focus, p.loopRunning].join('~');
    if (sig !== last || (!p.base.settled && now - lastHeartbeat >= 1000)) {
      log(LOGFILE, { t: ms(), kind: 'watch', n: trials.length, el, p });
      last = sig; lastHeartbeat = now;
    }

    agree = p.base.settled ? agree + 1 : 0;
    const moved = p.base.fp !== preFp || el > CHANGE_GRACE_MS;
    if (agree >= AGREE && moved) {
      const tr = { n: trials.length, kind, why, returned: res.accepted, settleMs: el, polls, maxOverlayMs: maxOaMs,
                   fpMoved: p.base.fp !== preFp, reasons, framesAdvanced: p.frame - firstFrame, exceptionsSoFar: exceptions.length };
      trials.push(tr);
      log(LOGFILE, { t: ms(), kind: 'trial-done', ...tr, post: p });
      console.log(`trial ${tr.n} ${kind.padEnd(11)} ${String(el).padStart(6)} ms  overlay ${maxOaMs} ms  ${p.base.fp}`);
      cur = p.base;
      return tr;
    }
    if (el > WATCH_MS) {
      const tr = { n: trials.length, kind, why, returned: res.accepted, settleMs: null, censoredAtMs: el, polls, maxOverlayMs: maxOaMs,
                   framesDuringOverlay: framesDuringOa, reasons, exceptionsSoFar: exceptions.length };
      trials.push(tr);
      log(LOGFILE, { t: ms(), kind: 'trial-censored', ...tr, post: p });
      throw new Error(`STALL NOT RECOVERED after ${el} ms with no input — halting without pressing (trial ${tr.n})`);
    }
    await sleep(POLL_MS);
  }
}

// ---- shop helpers ------------------------------------------------------------
// A reward that sends you to PARTY(8): its ModifierType class chain contains "Pokemon".
const SHOP_OPTIONS = `
var L=__locate(); var h=L.scene.ui.handlers[6];
function chain(o){ var n=[], p=o && Object.getPrototypeOf(o); while(p && p.constructor && p.constructor.name !== 'Object'){ n.push(p.constructor.name); p=Object.getPrototypeOf(p); } return n; }
return (h.options||[]).map(function(o,i){ var t=o&&o.modifierTypeOption&&o.modifierTypeOption.type; return { i:i, name: t?t.name:null, chain: chain(t) }; });`;
const partyTargeted = o => o.chain.some(c => /^Pokemon/.test(c) && !/Held|Form|Fusion|Evolution/.test(c));

async function pickReward(col, why) {
  await cdp.evalIn(`var L=__locate(); var h=L.scene.ui.handlers[6]; h.setRowCursor(1); h.setCursor(${col}); return 1;`);
  return act(B.ACTION, why);
}

let shopsSeen = 0;
async function runShop() {
  shopsSeen++;
  const opts = await cdp.evalIn(SHOP_OPTIONS);
  log(LOGFILE, { t: ms(), kind: 'shop', wave: cur.wave, opts });
  const candy = opts.find(o => /rare candy/i.test(o.name ?? ''));
  const target = candy ?? opts.find(partyTargeted);
  if (!target) {
    log(LOGFILE, { t: ms(), kind: 'shop-no-party-reward', wave: cur.wave });
    return pickReward(0, 'shop:first (no party-targeted reward)');
  }

  // trials B: open the party list, CANCEL out, repeat. Each press justified by the state just read.
  for (let k = 0; k < CANCEL_TRIALS; k++) {
    if (cur.mode !== 6) break;
    await pickReward(target.i, `shop:${target.name} (open party for cancel trial)`);
    if (cur.mode !== 8) { log(LOGFILE, { t: ms(), kind: 'unexpected', after: 'pickReward', mode: cur.mode }); return; }
    await trial('cancel-list', B.CANCEL, `party list CANCEL after ${target.name}`);
    if (cur.mode !== 6) { log(LOGFILE, { t: ms(), kind: 'unexpected', after: 'cancel-trial', mode: cur.mode }); return; }
  }

  // trial A: actually apply it.
  await pickReward(target.i, `shop:${target.name} (apply trial)`);
  if (cur.mode !== 8) return;
  let rd = await cdp.evalIn(READER);
  const slot = rd.options.findIndex(o => o.label && !/FNT|Cancel/.test(o.label));
  await cdp.evalIn(`var L=__locate(); L.scene.ui.handlers[8].setCursor(${Math.max(0, slot)}); return 1;`);
  cur = await settle('party setCursor', null);
  await act(B.ACTION, `party slot ${slot}`);
  rd = await cdp.evalIn(READER);
  if (cur.mode !== 8 || !rd.extra?.optionsMode) { log(LOGFILE, { t: ms(), kind: 'unexpected', after: 'slot', mode: cur.mode, rd }); return; }
  const ai = rd.options.findIndex(o => /^(apply|use|learn|teach)/i.test(o.label ?? ''));
  if (ai < 0) { log(LOGFILE, { t: ms(), kind: 'no-apply-option', rd }); return act(B.CANCEL, 'no apply option'); }
  for (let c = rd.cursor ?? 0; c < ai; c++) await act(B.DOWN, 'nav to Apply');
  return trial('apply', B.ACTION, `Apply ${target.name} to slot ${slot}`);
}

// ---- policy: start a run, then #6's dumb loop ---------------------------------
const YES = l => /^(yes|ja|oui)/i.test(l ?? '');
const NO = l => /^(no|nein|non)/i.test(l ?? '');

async function selectLabel(rd, re, why) {
  const match = typeof re === 'function' ? re : l => re.test(l);
  const i = rd.options.findIndex(o => match(o.label ?? ''));
  if (i < 0) throw new Error(`no option ${re} in ${JSON.stringify(rd.options.map(o => o.label))}`);
  const from = rd.cursor ?? 0;
  for (let c = from; c < i; c++) await act(B.DOWN, `nav ${why}`);
  for (let c = from; c > i; c--) await act(B.UP, `nav ${why}`);
  return act(B.ACTION, why);
}

async function decide(st, rd) {
  const labels = (rd.options ?? []).map(o => o.label);
  if (st.tutorialActive) return act(B.ACTION, 'tutorial');

  switch (st.mode) {
    case 1: {
      if (labels.some(l => /continue/i.test(l))) throw new Error('TITLE offers Continue — a run exists; not my call to resume or overwrite it');
      return selectLabel(rd, /^new game/i, 'title:new game');
    }
    case 15: case 17:
      if (st.phaseName === 'TitlePhase') return selectLabel(rd, /^classic/i, 'mode:classic');
      if (st.phaseName === 'SelectStarterPhase') return selectLabel(rd, /^add to party/i, 'starter:add');
      return act(B.ACTION, 'option-select:first');
    case 10: {
      const s = await cdp.evalIn(`var h=__locate().scene.ui.handlers[10]; return { n: (h.starterSpecies||[]).length, has: Array.isArray(h.starterSpecies), filter: h.filterMode===true, grid: h.filteredStarterContainers.length };`);
      log(LOGFILE, { t: ms(), kind: 'starter', ...s });
      if (!s.has || s.filter) throw new Error('starter select not in expected shape: ' + JSON.stringify(s));
      if (s.n < 3) {
        await cdp.evalIn(`var h=__locate().scene.ui.handlers[10]; h.setCursor(${s.n}); return 1;`);
        cur = await settle('starter setCursor', null);
        return act(B.ACTION, `starter:open #${s.n}`);
      }
      return act(B.SUBMIT, 'starter:start');
    }
    case 7: {
      const sl = await cdp.evalIn(`var h=__locate().scene.ui.handlers[7]; return { cursor: h.cursor, scroll: h.scrollCursor, slots: (h.sessionSlots||[]).map(function(x){ return x.hasData === true; }) };`);
      log(LOGFILE, { t: ms(), kind: 'save-slot', ...sl });
      const idx = (sl.cursor ?? 0) + (sl.scroll ?? 0);
      if (sl.slots[idx] !== false) throw new Error('save slot under cursor is occupied or unreadable — refusing: ' + JSON.stringify(sl));
      return act(B.ACTION, `save-slot:${idx} (empty)`);
    }
    case 14: {
      if (st.phaseName === 'SelectStarterPhase') return selectLabel(rd, YES, 'confirm:start run');
      const noIdx = labels.findIndex(NO);
      if (noIdx >= 0) return selectLabel(rd, NO, 'confirm:No');
      return act(B.ACTION, 'confirm:first');
    }
    case 0: case 11: case 12: case 13: case 47:
      return act(B.ACTION, `ack ${nameOf(st.mode)}`);
    case 2: return selectLabel(rd, /fight/i, 'command:fight');
    case 3: {
      const mv = rd.extra?.moves ?? [];
      let pick = -1, best = -1;
      for (let i = 0; i < labels.length; i++) {
        const m = mv[i];
        if (!labels[i] || labels[i] === '-' || !m || m.ppLeft <= 0) continue;
        const power = m.power > 0 ? m.power : 0;
        if (power > best) { best = power; pick = i; }
      }
      if (pick < 0) pick = 0;
      for (let c = rd.cursor ?? 0, g = 0; c !== pick && g < 4; g++) {
        if (Math.floor(c / 2) !== Math.floor(pick / 2)) { await act(c < pick ? B.DOWN : B.UP, 'nav move'); c += c < pick ? 2 : -2; }
        else { await act(c < pick ? B.RIGHT : B.LEFT, 'nav move'); c += c < pick ? 1 : -1; }
      }
      return act(B.ACTION, `fight:${labels[pick]}`);
    }
    case 5: return act(B.ACTION, 'target:current');
    case 6: return runShop();
    case 8: {
      const pum = rd.extra?.partyUiMode;
      if (rd.extra?.optionsMode) {
        const i = labels.findIndex(l => /^(apply|use|send out|switch|give|take|learn|teach)/i.test(l ?? ''));
        if (i >= 0) return selectLabel(rd, new RegExp('^' + labels[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `party:option ${labels[i]}`);
        return act(B.CANCEL, 'party:options-cancel');
      }
      const MUST = new Set([1, 3, 4, 5, 6, 7, 12]);
      if (!MUST.has(pum)) return act(B.CANCEL, `party:cancel (pum ${pum})`);
      const slot = rd.options.findIndex(o => o.label && !/FNT|Cancel/.test(o.label));
      await cdp.evalIn(`__locate().scene.ui.handlers[8].setCursor(${Math.max(0, slot)}); return 1;`);
      cur = await settle('party setCursor', null);
      return act(B.ACTION, `party:must-answer pum ${pum} slot ${slot}`);
    }
    case 9: case 26: case 41: return act(B.CANCEL, `leave ${nameOf(st.mode)}`);
    default:
      log(LOGFILE, { t: ms(), kind: 'UNHANDLED-MODE', mode: st.mode, rd });
      throw new Error('unhandled mode ' + nameOf(st.mode) + ' — halting');
  }
}

// ---- main ----------------------------------------------------------------------
log(LOGFILE, { t: 0, kind: 'start', argv: process.argv.slice(2), pid: process.pid });
let stop = null, startWave = null, lastWaveLogged = null;
const recent = [];
try {
  cur = await settle('initial', null);
  for (let n = 0; ; n++) {
    if (Date.now() - t0 > HARD_MS) { stop = 'wall-clock'; break; }
    const st = cur;
    if (st.phaseName === 'GameOverPhase') { stop = 'wipe'; break; }
    if (st.wave != null && startWave == null && st.mode === 2) startWave = st.wave;
    if (startWave != null && st.mode === 1) { stop = 'dropped-to-title'; break; }
    if (startWave != null && st.wave >= startWave + WAVES && st.mode === 2) { stop = 'waves-done'; break; }
    if (st.wave !== lastWaveLogged) { console.log(`wave ${st.wave} (${nameOf(st.mode)})`); lastWaveLogged = st.wave; }

    const rd = await cdp.evalIn(READER);
    log(LOGFILE, { t: ms(), kind: 'screen', mode: st.mode, name: nameOf(st.mode), phase: st.phaseName, wave: st.wave, turn: st.turn,
                   cursor: rd.cursor, options: (rd.options ?? []).map(o => o.label), text: rd.text, extra: rd.extra });

    if (st.mode !== 6) {   // shop trials legitimately repeat fingerprints; everything else must not
      recent.push(st.fp); if (recent.length > 12) recent.shift();
      if (recent.filter(f => f === st.fp).length >= 6) { stop = 'oscillating:' + st.fp; break; }
    } else recent.length = 0;

    await decide(st, rd);
  }
} catch (e) {
  stop = 'error: ' + e.message;
}

const byKind = k => trials.filter(t => t.kind === k);
const stat = arr => {
  const s = arr.map(t => t.settleMs).filter(x => x != null).sort((a, b) => a - b);
  const pct = p => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null;
  return { n: arr.length, censored: arr.filter(t => t.settleMs == null).length, p50: pct(0.5), p95: pct(0.95), max: s.at(-1) ?? null,
           overlayMax: Math.max(0, ...arr.map(t => t.maxOverlayMs)), over6s: s.filter(x => x > 6000).length, over20s: s.filter(x => x > 20000).length };
};
const summary = { stop, wallMs: ms(), shopsSeen, trials: trials.length,
                  cancelList: stat(byKind('cancel-list')), apply: stat(byKind('apply')),
                  slowest: [...trials].sort((a, b) => (b.settleMs ?? 1e12) - (a.settleMs ?? 1e12)).slice(0, 5),
                  pageExceptions: exceptions.length, cdp: cdp.stats() };
log(LOGFILE, { t: ms(), kind: 'summary', ...summary });
console.log(JSON.stringify(summary, null, 1));
cdp.ws.close();
