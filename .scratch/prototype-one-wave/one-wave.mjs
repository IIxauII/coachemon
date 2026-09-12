// PROTOTYPE — throwaway. Drives PokéRogue through exactly one wave over CDP.
// Answers pokerogue-mcp issue #6. Run: node one-wave.mjs [--waves N] [--max-actions N]
//
// Everything it learns goes to ./run.jsonl (one JSON object per line) and a summary on stdout.
import { Cdp, B, nameOf, log } from './lib.mjs';
import { PREDICATE, READER, SNAPSHOT, press } from './game.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? Number(process.argv[i + 1]) : d; };
const WAVES = arg('--waves', 1);
const MAX_ACTIONS = arg('--max-actions', 300);
const HARD_MS = arg('--hard-ms', 900_000);
const LOGFILE = process.env.LOGFILE || './run.jsonl';

const POLL_MS = 100;
const AGREE = 2;
const NO_PROGRESS_MS = 20_000;
const SETTLE_HARD_MS = 90_000;

const cdp = await new Cdp().connect();
const t0 = Date.now();
const ms = () => Date.now() - t0;

// ---- instrumentation -------------------------------------------------------
const modesSeen = new Map();       // mode -> { name, hits, readable, families:Set, sampleOptions }
const settleEvents = [];           // one per settle: { after, ms, polls, maxGapMs, reasons }
const actions = [];                // one per press
const reasonsSeen = new Map();
let settleTimeouts = 0;

function note(mode, rd) {
  const e = modesSeen.get(mode) ?? { name: nameOf(mode), hits: 0, readableHits: 0, unreadableHits: 0, families: new Set(), sample: null };
  e.hits++;
  if (rd) {
    rd.readable ? e.readableHits++ : e.unreadableHits++;
    if (rd.family) e.families.add(rd.family);
    if (!e.sample && rd.options?.length) e.sample = rd.options.slice(0, 6).map(o => o.label);
    if (!e.sample && rd.extra?.ownKeys) e.sample = ['(unmapped) keys: ' + rd.extra.ownKeys.slice(0, 8).join(',')];
  }
  modesSeen.set(mode, e);
}

const sleep = n => new Promise(r => setTimeout(r, n));

// ---- settle loop, straight from #3 §7 --------------------------------------
async function settle(label) {
  const start = Date.now();
  let deadline = start + SETTLE_HARD_MS;
  let progressUntil = start + NO_PROGRESS_MS;
  let lastFp = null, agree = 0, polls = 0, lastChange = start, maxGap = 0;
  const reasons = new Map();
  for (;;) {
    const r = await cdp.evalIn(PREDICATE);
    polls++;
    reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
    reasonsSeen.set(r.reason, (reasonsSeen.get(r.reason) ?? 0) + 1);
    if (r.fp !== lastFp) {
      maxGap = Math.max(maxGap, Date.now() - lastChange);
      lastChange = Date.now();
      lastFp = r.fp; progressUntil = Date.now() + NO_PROGRESS_MS; agree = 0;
    }
    agree = r.settled ? agree + 1 : 0;
    if (agree >= AGREE) {
      maxGap = Math.max(maxGap, Date.now() - lastChange);
      const ev = { after: label, ms: Date.now() - start, polls, maxGapMs: maxGap, reasons: Object.fromEntries(reasons) };
      settleEvents.push(ev);
      log(LOGFILE, { t: ms(), kind: 'settled', ...ev, state: r });
      return r;
    }
    if (Date.now() > progressUntil) { settleTimeouts++; log(LOGFILE, { t: ms(), kind: 'settle-timeout', which: 'no-progress', label, r }); return r; }
    if (Date.now() > deadline)      { settleTimeouts++; log(LOGFILE, { t: ms(), kind: 'settle-timeout', which: 'hard', label, r }); return r; }
    await sleep(POLL_MS);
  }
}

let rawFallbacks = 0;
async function doPress(btn, why) {
  const name = Object.keys(B).find(k => B[k] === btn);
  const res = await cdp.evalIn(press(btn));
  actions.push({ t: ms(), btn: name, why, accepted: res.accepted });
  log(LOGFILE, { t: ms(), kind: 'press', btn: name, why, res });
  // "Is processInput alone sufficient?" — if it refuses, try the raw keyboard and record it.
  if (res.accepted === false && KEYMAP[name]) {
    rawFallbacks++;
    log(LOGFILE, { t: ms(), kind: 'processInput-REFUSED', btn: name, why, mode: res.mode });
    await rawKey(name, why);
  }
  return res;
}

// raw-keyboard fallback (#9: Phaser binds to window, so dispatchKeyEvent bubbles fine)
const KEYMAP = { UP: ['ArrowUp', 38], DOWN: ['ArrowDown', 40], LEFT: ['ArrowLeft', 37], RIGHT: ['ArrowRight', 39], ACTION: ['Enter', 13], CANCEL: ['Backspace', 8] };
async function rawKey(btnName, why) {
  const [code, kc] = KEYMAP[btnName];
  await cdp.key('keyDown', code, kc);
  await cdp.key('keyUp', code, kc);
  actions.push({ t: ms(), btn: btnName, why: why + ' (RAW KEY)', accepted: 'n/a' });
  log(LOGFILE, { t: ms(), kind: 'rawkey', btn: btnName, why });
}

// ---- cursor navigation, press-driven (the #4 default) ----------------------
// Grid rule per family; returns the press sequence to get from `from` to `to`.
function pathFor(family, mode, from, to, count) {
  if (from === to) return [];
  const seq = [];
  if (family === 'F3' && (mode === 2 || mode === 3)) {   // 2x2 grid: UP/DOWN +-2, LEFT/RIGHT +-1
    let cur = from, guard = 0;
    while (cur !== to && guard++ < 8) {
      if (Math.floor(cur / 2) !== Math.floor(to / 2)) { seq.push(cur < to ? B.DOWN : B.UP); cur += cur < to ? 2 : -2; }
      else { seq.push(cur < to ? B.RIGHT : B.LEFT); cur += cur < to ? 1 : -1; }
    }
    return seq;
  }
  // linear lists (F1/F2/F4-slot/F9): step with wrap-free UP/DOWN
  const n = Math.abs(to - from);
  for (let i = 0; i < n && i < 20; i++) seq.push(to > from ? B.DOWN : B.UP);
  return seq;
}

async function moveTo(rd, target) {
  const path = pathFor(rd.family, rd.mode, rd.cursor ?? 0, target, rd.options.length);
  for (const b of path) { await doPress(b, `nav ${nameOf(rd.mode)} ${rd.cursor}->${target}`); await sleep(40); }
  return path.length;
}

// ---- the policy ------------------------------------------------------------
// Dumbest thing that clears a wave. Not strategy — just enough to exercise every screen.
const YES = l => /^(yes|ja|oui)/i.test(l ?? '');
const NO  = l => /^(no|nein|non)/i.test(l ?? '');

async function decide(st, rd) {
  const mode = st.mode;
  const labels = (rd.options ?? []).map(o => o.label);

  // #3 §6 case 1: while tutorialActive, ui.processInput diverts to processTutorialInput,
  // which accepts ONLY ACTION and CANCEL. Moving the cursor first would silently no-op.
  if (st.tutorialActive) {
    log(LOGFILE, { t: ms(), kind: 'tutorial-active', mode, name: nameOf(mode) });
    return doPress(B.ACTION, `tutorial-active ${nameOf(mode)}: ACTION only`);
  }

  switch (mode) {
    case 1: { // TITLE — resume the existing run
      const i = labels.findIndex(l => /continue/i.test(l ?? ''));
      if (i >= 0) { await moveTo(rd, rd.options[i].i); }
      return doPress(B.ACTION, 'title:continue');
    }
    case 0:  // MESSAGE
    case 11: // EVOLUTION_SCENE
    case 12: // EGG_HATCH_SCENE
    case 13: // EGG_HATCH_SUMMARY
    case 47: // ALERT_MODAL
      return doPress(B.ACTION, `ack ${nameOf(mode)}`);

    case 2: { // COMMAND — always Fight
      const i = labels.findIndex(l => /fight|kampf/i.test(l ?? ''));
      await moveTo(rd, i >= 0 ? i : 0);
      return doPress(B.ACTION, 'command:fight');
    }
    case 3: { // FIGHT — strongest damaging move with PP left. Not strategy; just not suicide.
      const mv = rd.extra?.moves ?? [];
      let pick = -1, best = -1;
      for (let i = 0; i < labels.length; i++) {
        const m = mv[i];
        if (!labels[i] || labels[i] === '-' || !m || m.ppLeft <= 0) continue;
        const power = m.power > 0 ? m.power : 0;
        if (power > best) { best = power; pick = i; }
      }
      if (pick < 0) pick = labels.findIndex(l => l && l !== '-');   // all out of PP: Struggle via any slot
      if (pick < 0) pick = 0;
      await moveTo(rd, pick);
      return doPress(B.ACTION, `fight:move[${pick}] ${labels[pick]} (power ${best})`);
    }
    case 5: // TARGET_SELECT — whatever is under the cursor
      return doPress(B.ACTION, 'target:current');

    case 6: { // MODIFIER_SELECT — take the first free reward. F5 fast path (#4: setRowCursor then setCursor)
      await cdp.evalIn(`var L=__locate(); var h=L.scene.ui.handlers[6]; h.setRowCursor(1); h.setCursor(0); return {row:h.rowCursor, col:h.cursor};`);
      actions.push({ t: ms(), btn: 'setRowCursor(1)+setCursor(0)', why: 'shop fast path', accepted: true });
      return doPress(B.ACTION, 'shop:first-free-reward');
    }
    case 14: { // CONFIRM — decline switches, accept everything else
      const noIdx = labels.findIndex(NO);
      if (noIdx >= 0) { await moveTo(rd, noIdx); return doPress(B.ACTION, 'confirm:No'); }
      const yesIdx = labels.findIndex(YES);
      if (yesIdx >= 0) { await moveTo(rd, yesIdx); return doPress(B.ACTION, 'confirm:Yes'); }
      return doPress(B.ACTION, 'confirm:first');
    }
    case 15: case 17: // OPTION_SELECT / MENU_OPTION_SELECT — take the first option
      return doPress(B.ACTION, 'option-select:first');

    case 8: { // PARTY — forced switch (FAINT_SWITCH === 1) must be answered; otherwise back out
      const forced = rd.extra?.partyUiMode === 1;
      if (rd.extra?.optionsMode) {
        const i = labels.findIndex(l => /send out|switch/i.test(l ?? ''));
        if (i >= 0) { await moveTo(rd, i); return doPress(B.ACTION, 'party:send-out'); }
        return doPress(B.CANCEL, 'party:options-cancel');
      }
      if (!forced) return doPress(B.CANCEL, 'party:cancel');
      // pick the first slot that is neither fainted nor the (fainted) active one
      const slot = rd.options.findIndex(o => o.label && !/FNT/.test(o.label) && !/Cancel/i.test(o.label));
      await moveTo(rd, slot >= 0 ? slot : 0);
      return doPress(B.ACTION, `party:forced-switch slot ${slot}`);
    }
    case 9: case 26: case 41: // paged viewers
      return doPress(B.CANCEL, `leave ${nameOf(mode)}`);

    default:
      log(LOGFILE, { t: ms(), kind: 'UNHANDLED-MODE', mode, name: nameOf(mode), rd });
      return doPress(B.ACTION, `unhandled ${nameOf(mode)} -> blind ACTION`);
  }
}

// ---- main loop -------------------------------------------------------------
log(LOGFILE, { t: 0, kind: 'start', waves: WAVES, pid: process.pid });
let startWave = null, targetWave = null, stop = null, n = 0;
let lastMode = null, sameModeStreak = 0;

for (; n < MAX_ACTIONS; n++) {
  if (Date.now() - t0 > HARD_MS) { stop = 'wall-clock'; break; }

  const st = await settle(`action#${n}`);
  if (st.reason?.startsWith('no-scene')) { stop = 'lost-scene:' + st.reason; break; }

  const rd = await cdp.evalIn(READER);
  note(st.mode, rd);
  log(LOGFILE, { t: ms(), kind: 'screen', mode: st.mode, name: nameOf(st.mode), reason: st.reason,
                 wave: st.wave, turn: st.turn, family: rd.family, readable: rd.readable,
                 cursor: rd.cursor, options: (rd.options ?? []).map(o => o.label), text: rd.text });

  // wave bookkeeping — the run is "resumed" once currentBattle exists
  if (startWave === null && st.wave != null) { startWave = st.wave; targetWave = st.wave + WAVES; log(LOGFILE, { t: ms(), kind: 'wave-start', startWave, targetWave }); }
  if (targetWave != null && st.wave >= targetWave && st.mode === 2) { stop = 'wave-cleared'; break; }

  // a run lost to a failed save comes back as TITLE mid-run (#3 §6 case 2)
  if (st.mode === 1 && startWave !== null) { stop = 'dropped-to-title'; break; }

  // STARTER_SELECT belongs to ticket #8, not this one. Never drive it.
  if (st.mode === 10) { stop = 'starter-select-not-my-ticket'; break; }

  sameModeStreak = st.mode === lastMode ? sameModeStreak + 1 : 0;
  lastMode = st.mode;
  if (sameModeStreak > 25) { stop = 'stuck:' + nameOf(st.mode); break; }

  await decide(st, rd);
  await sleep(60);
}
if (!stop) stop = 'max-actions';

const final = await cdp.evalIn(SNAPSHOT);
const summary = {
  stop, actions: actions.length, startWave, targetWave, finalWave: final.wave,
  wallMs: ms(),
  cdp: cdp.stats(),
  settles: settleEvents.length,
  settleMsTotal: settleEvents.reduce((a, e) => a + e.ms, 0),
  settleMsMax: Math.max(0, ...settleEvents.map(e => e.ms)),
  maxNoProgressGapMs: Math.max(0, ...settleEvents.map(e => e.maxGapMs)),
  settleTimeouts,
  reasons: Object.fromEntries([...reasonsSeen].sort((a, b) => b[1] - a[1])),
  modes: [...modesSeen].sort((a, b) => a[0] - b[0]).map(([m, e]) => ({
    mode: m, name: e.name, hits: e.hits, readable: e.readableHits, unreadable: e.unreadableHits,
    families: [...e.families], sample: e.sample })),
  presses: actions.reduce((a, x) => { a[x.btn] = (a[x.btn] ?? 0) + 1; return a; }, {}),
  rejectedPresses: actions.filter(a => a.accepted === false).length,
  rawKeyboardFallbacks: rawFallbacks,
};
log(LOGFILE, { t: ms(), kind: 'summary', ...summary, final });
console.log(JSON.stringify(summary, null, 1));
cdp.ws.close();
