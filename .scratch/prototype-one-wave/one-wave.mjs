// PROTOTYPE — throwaway. Drives PokéRogue through exactly one wave over CDP.
// Answers pokerogue-mcp issue #6. Run: node one-wave.mjs [--waves N] [--max-actions N]
//
// Everything it learns goes to ./run.jsonl (one JSON object per line) and a summary on stdout.
//
// Three corrections folded in after the first attempt and session #8's handover:
//   - settle waits for the fingerprint to LEAVE its pre-press value (#3's 2-sample rule
//     can exit before an asynchronously-handled press has landed)
//   - processInput's return value is not trustworthy: PokéRogue has branches that act and
//     still return false, so a refusal is only believed when the state also fails to move
//   - SUMMARY (mode 9) rejects ACTION forever; only CANCEL leaves it
import { Cdp, B, nameOf, log } from './lib.mjs';
import { PREDICATE, READER, SNAPSHOT, press } from './game.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? Number(process.argv[i + 1]) : d; };
const WAVES = arg('--waves', 1);
const MAX_ACTIONS = arg('--max-actions', 300);
const HARD_MS = arg('--hard-ms', 900_000);
const LOGFILE = process.env.LOGFILE || './run.jsonl';

const POLL_MS = 100;
const AGREE = 3;                // #3 says 2; #8 measured 2 exiting before the press landed
const CHANGE_GRACE_MS = 3_000;  // how long to insist the fingerprint move off its pre-press value
const NO_PROGRESS_MS = 20_000;
const SETTLE_HARD_MS = 90_000;

const cdp = await new Cdp().connect();
const t0 = Date.now();
const ms = () => Date.now() - t0;
const sleep = n => new Promise(r => setTimeout(r, n));

// ---- instrumentation -------------------------------------------------------
const modesSeen = new Map();
const settleEvents = [];
const actions = [];
const reasonsSeen = new Map();
let settleTimeouts = 0, naiveEarlyExits = 0, rawFallbacks = 0, falseRefusals = 0, realRefusals = 0;

function note(mode, rd) {
  const e = modesSeen.get(mode) ?? { name: nameOf(mode), hits: 0, readableHits: 0, unreadableHits: 0, families: new Set(), sample: null };
  e.hits++;
  rd.readable ? e.readableHits++ : e.unreadableHits++;
  if (rd.family) e.families.add(rd.family);
  if (!e.sample && rd.options?.length) e.sample = rd.options.slice(0, 6).map(o => o.label);
  if (!e.sample && rd.extra?.ownKeys) e.sample = ['(unmapped) keys: ' + rd.extra.ownKeys.slice(0, 8).join(',')];
  modesSeen.set(mode, e);
}

// ---- settle loop -----------------------------------------------------------
async function settle(label, preFp) {
  const start = Date.now();
  const deadline = start + SETTLE_HARD_MS;
  let progressUntil = start + NO_PROGRESS_MS;
  let lastFp = null, agree = 0, polls = 0, lastChange = start, maxGap = 0;
  let naiveMs = null, naiveFp = null;
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
    if (naiveMs === null && agree >= 2) { naiveMs = Date.now() - start; naiveFp = r.fp; }

    const moved = preFp == null || r.fp !== preFp || (Date.now() - start) > CHANGE_GRACE_MS;
    if (agree >= AGREE && moved) {
      maxGap = Math.max(maxGap, Date.now() - lastChange);
      const ev = {
        after: label, ms: Date.now() - start, polls, maxGapMs: maxGap, naiveMs,
        naiveWasEarly: naiveMs !== null && preFp != null && naiveFp === preFp && r.fp !== preFp,
        fpMoved: preFp == null ? null : r.fp !== preFp,
        reasons: Object.fromEntries(reasons),
      };
      if (ev.naiveWasEarly) naiveEarlyExits++;
      settleEvents.push(ev);
      log(LOGFILE, { t: ms(), kind: 'settled', ...ev, state: r });
      return r;
    }
    if (Date.now() > progressUntil) { settleTimeouts++; log(LOGFILE, { t: ms(), kind: 'settle-timeout', which: 'no-progress', label, r }); return r; }
    if (Date.now() > deadline)      { settleTimeouts++; log(LOGFILE, { t: ms(), kind: 'settle-timeout', which: 'hard', label, r }); return r; }
    await sleep(POLL_MS);
  }
}

// ---- pressing --------------------------------------------------------------
// Phaser binds keyboard to window (#9), so dispatchKeyEvent bubbles to the game.
const KEYMAP = { UP: ['ArrowUp', 38], DOWN: ['ArrowDown', 40], LEFT: ['ArrowLeft', 37], RIGHT: ['ArrowRight', 39], ACTION: ['Enter', 13], CANCEL: ['Backspace', 8] };

let cur = null;   // latest settled predicate result

async function act(btn, why) {
  const name = Object.keys(B).find(k => B[k] === btn);
  const preFp = cur?.fp ?? null;
  const res = await cdp.evalIn(press(btn));
  actions.push({ t: ms(), btn: name, why, returned: res.accepted });
  log(LOGFILE, { t: ms(), kind: 'press', btn: name, why, returned: res.accepted, preFp });

  cur = await settle(`${name}/${why}`, preFp);

  // Only believe a refusal when the state also failed to move. #8 found branches that
  // act and still return false; the inverse (returns true, does nothing) is also possible.
  if (res.accepted === false) {
    if (cur.fp !== preFp) {
      falseRefusals++;
      log(LOGFILE, { t: ms(), kind: 'processInput-LIED', btn: name, why, note: 'returned false but state moved' });
    } else {
      realRefusals++;
      log(LOGFILE, { t: ms(), kind: 'processInput-REFUSED', btn: name, why, mode: cur.mode, name: nameOf(cur.mode) });
      if (KEYMAP[name]) {   // does the raw keyboard get further than processInput?
        const [code, kc] = KEYMAP[name];
        await cdp.key('keyDown', code, kc); await cdp.key('keyUp', code, kc);
        rawFallbacks++;
        const after = await settle(`RAWKEY ${name}`, preFp);
        log(LOGFILE, { t: ms(), kind: 'rawkey-result', btn: name, moved: after.fp !== preFp, mode: after.mode });
        cur = after;
      }
    }
  }
  return cur;
}

// ---- cursor navigation, press-driven (the #4 default) ----------------------
function pathFor(family, mode, from, to) {
  if (from === to) return [];
  const seq = [];
  if (family === 'F3' && (mode === 2 || mode === 3)) {   // 2x2 grid: UP/DOWN ±2, LEFT/RIGHT ±1
    let c = from, guard = 0;
    while (c !== to && guard++ < 8) {
      if (Math.floor(c / 2) !== Math.floor(to / 2)) { seq.push(c < to ? B.DOWN : B.UP); c += c < to ? 2 : -2; }
      else { seq.push(c < to ? B.RIGHT : B.LEFT); c += c < to ? 1 : -1; }
    }
    return seq;
  }
  for (let i = 0, n = Math.abs(to - from); i < n && i < 20; i++) seq.push(to > from ? B.DOWN : B.UP);
  return seq;
}

async function moveTo(rd, target) {
  const path = pathFor(rd.family, rd.mode, rd.cursor ?? 0, target);
  for (const b of path) await act(b, `nav ${nameOf(rd.mode)} ${rd.cursor}->${target}`);
  return path.length;
}

// ---- the policy ------------------------------------------------------------
const YES = l => /^(yes|ja|oui)/i.test(l ?? '');
const NO = l => /^(no|nein|non)/i.test(l ?? '');

async function decide(st, rd) {
  const mode = st.mode;
  const labels = (rd.options ?? []).map(o => o.label);

  // #3 §6 case 1: while tutorialActive, processInput diverts to processTutorialInput,
  // which accepts ONLY ACTION and CANCEL. Moving the cursor first silently no-ops.
  if (st.tutorialActive) {
    log(LOGFILE, { t: ms(), kind: 'tutorial-active', mode, name: nameOf(mode) });
    return act(B.ACTION, `tutorial ${nameOf(mode)}: ACTION only`);
  }

  switch (mode) {
    case 1: { // TITLE — resume rather than start anything
      const i = labels.findIndex(l => /continue/i.test(l ?? ''));
      if (i >= 0) await moveTo(rd, i);
      return act(B.ACTION, 'title:continue');
    }
    case 0: case 11: case 12: case 13: case 47:   // MESSAGE / EVOLUTION / EGG_HATCH / EGG_SUMMARY / ALERT
      return act(B.ACTION, `ack ${nameOf(mode)}`);

    case 2: { // COMMAND — always Fight
      const i = labels.findIndex(l => /fight|kampf/i.test(l ?? ''));
      await moveTo(rd, i >= 0 ? i : 0);
      return act(B.ACTION, 'command:fight');
    }
    case 3: { // FIGHT — strongest damaging move with PP. Not strategy; just not suicide.
      const mv = rd.extra?.moves ?? [];
      let pick = -1, best = -1;
      for (let i = 0; i < labels.length; i++) {
        const m = mv[i];
        if (!labels[i] || labels[i] === '-' || !m || m.ppLeft <= 0) continue;
        const power = m.power > 0 ? m.power : 0;
        if (power > best) { best = power; pick = i; }
      }
      if (pick < 0) pick = labels.findIndex(l => l && l !== '-');
      if (pick < 0) pick = 0;
      await moveTo(rd, pick);
      return act(B.ACTION, `fight:move[${pick}] ${labels[pick]} (power ${best})`);
    }
    case 5:  // TARGET_SELECT — whatever is under the cursor
      return act(B.ACTION, 'target:current');

    case 6: { // MODIFIER_SELECT — take the first free reward. #4's sanctioned F5 fast path.
      await cdp.evalIn(`var L=__locate(); var h=L.scene.ui.handlers[6]; h.setRowCursor(1); h.setCursor(0); return {row:h.rowCursor, col:h.cursor};`);
      actions.push({ t: ms(), btn: 'setRowCursor(1)+setCursor(0)', why: 'shop fast path', returned: true });
      return act(B.ACTION, 'shop:first-free-reward');
    }
    case 14: { // CONFIRM — decline switches, accept everything else
      const noIdx = labels.findIndex(NO);
      if (noIdx >= 0) { await moveTo(rd, noIdx); return act(B.ACTION, 'confirm:No'); }
      const yesIdx = labels.findIndex(YES);
      if (yesIdx >= 0) { await moveTo(rd, yesIdx); return act(B.ACTION, 'confirm:Yes'); }
      return act(B.ACTION, 'confirm:first');
    }
    case 15: case 17:   // OPTION_SELECT / MENU_OPTION_SELECT (biome choice etc.)
      return act(B.ACTION, 'option-select:first');

    case 8: { // PARTY — two different situations behind one UiMode, told apart by partyUiMode.
      // PartyUiMode: 0 SWITCH, 1 FAINT_SWITCH, 2 POST_BATTLE_SWITCH, 3 REVIVAL_BLESSING,
      // 4 MODIFIER, 5 MOVE_MODIFIER, 6 TM_MODIFIER, 7 REMEMBER_MOVE_MODIFIER,
      // 8 MODIFIER_TRANSFER, 9 SPLICE, 10 RELEASE, 11 CHECK, 12 SELECT.
      // The MUST_ANSWER set re-opens the party screen if you CANCEL out, so cancelling
      // there is an infinite loop (observed: shop -> party -> shop, 147 times).
      const MUST_ANSWER = new Set([1, 3, 4, 5, 6, 7, 12]);
      const pum = rd.extra?.partyUiMode;
      if (rd.extra?.optionsMode) {
        // Prefer the option that actually does the thing; "Summary" is a trap (paged
        // viewer, ACTION rejected) and the rest are cosmetic.
        let i = labels.findIndex(l => /^(apply|use|send out|switch|give|take|learn)/i.test(l ?? ''));
        if (i < 0) i = labels.findIndex(l => l && !/cancel|summary|pokédex|pokedex|rename|pause evolution/i.test(l));
        if (i >= 0) { await moveTo(rd, i); return act(B.ACTION, `party:option "${labels[i]}"`); }
        return act(B.CANCEL, 'party:options-cancel');
      }
      if (!MUST_ANSWER.has(pum)) return act(B.CANCEL, `party:cancel (partyUiMode ${pum} is dismissible)`);
      const slot = rd.options.findIndex(o => o.label && !/FNT/.test(o.label) && !/Cancel/i.test(o.label));
      await moveTo(rd, slot >= 0 ? slot : 0);
      return act(B.ACTION, `party:must-answer (partyUiMode ${pum}) slot ${slot}`);
    }
    // #8's trap: SUMMARY rejects ACTION forever. CANCEL is the only way out.
    case 9: case 26: case 41:
      return act(B.CANCEL, `leave ${nameOf(mode)} (ACTION is rejected here)`);

    default:
      log(LOGFILE, { t: ms(), kind: 'UNHANDLED-MODE', mode, name: nameOf(mode), rd });
      return act(B.ACTION, `unhandled ${nameOf(mode)} -> blind ACTION`);
  }
}

// ---- main loop -------------------------------------------------------------
log(LOGFILE, { t: 0, kind: 'start', waves: WAVES, pid: process.pid });
let startWave = null, targetWave = null, stop = null, n = 0;
let lastMode = null, sameModeStreak = 0;
let sawShop = false;
const recent = [];

cur = await settle('initial', null);

for (; n < MAX_ACTIONS; n++) {
  if (Date.now() - t0 > HARD_MS) { stop = 'wall-clock'; break; }
  const st = cur;
  if (st.reason?.startsWith('no-scene')) { stop = 'lost-scene:' + st.reason; break; }

  const rd = await cdp.evalIn(READER);
  note(st.mode, rd);
  log(LOGFILE, { t: ms(), kind: 'screen', mode: st.mode, name: nameOf(st.mode), reason: st.reason,
                 wave: st.wave, turn: st.turn, phase: st.phaseCtor, family: rd.family, readable: rd.readable,
                 cursor: rd.cursor, options: (rd.options ?? []).map(o => o.label), text: rd.text,
                 tutorialActive: st.tutorialActive, extra: rd.extra });

  if (st.mode === 6) sawShop = true;
  if (startWave === null && st.wave != null) {
    startWave = st.wave; targetWave = st.wave + WAVES;
    log(LOGFILE, { t: ms(), kind: 'wave-start', startWave, targetWave });
  }
  // one wave = through the between-wave shop and back to a command prompt
  if (targetWave != null && st.wave >= targetWave && st.mode === 2) { stop = 'wave-cleared'; break; }
  if (st.mode === 1 && startWave !== null) { stop = 'dropped-to-title'; break; }
  if (st.mode === 10) { stop = 'starter-select-not-my-ticket'; break; }

  sameModeStreak = st.mode === lastMode ? sameModeStreak + 1 : 0;
  lastMode = st.mode;
  if (sameModeStreak > 25) { stop = 'stuck:' + nameOf(st.mode); break; }

  // A two-screen cycle (shop -> party -> shop -> ...) never trips a same-mode streak,
  // so detect a repeating fingerprint directly.
  recent.push(st.fp);
  if (recent.length > 12) recent.shift();
  const repeats = recent.filter(f => f === st.fp).length;
  if (repeats >= 5) { stop = 'oscillating:' + nameOf(st.mode); log(LOGFILE, { t: ms(), kind: 'oscillating', fp: st.fp, recent }); break; }

  await decide(st, rd);
}
if (!stop) stop = 'max-actions';

const final = await cdp.evalIn(SNAPSHOT);
const summary = {
  stop, actions: actions.length, startWave, targetWave, finalWave: final.wave, sawShop,
  wallMs: ms(),
  cdp: cdp.stats(),
  settles: settleEvents.length,
  settleMsTotal: settleEvents.reduce((a, e) => a + e.ms, 0),
  settleMsMax: Math.max(0, ...settleEvents.map(e => e.ms)),
  maxNoProgressGapMs: Math.max(0, ...settleEvents.map(e => e.maxGapMs)),
  settleTimeouts,
  naiveEarlyExits,                      // where #3's 2-sample rule would have exited early
  naiveEarlyPct: settleEvents.length ? +(100 * naiveEarlyExits / settleEvents.length).toFixed(1) : 0,
  processInput: { returnedFalseButStateMoved: falseRefusals, genuinelyRefused: realRefusals, rawKeyboardFallbacks: rawFallbacks },
  reasons: Object.fromEntries([...reasonsSeen].sort((a, b) => b[1] - a[1])),
  modes: [...modesSeen].sort((a, b) => a[0] - b[0]).map(([m, e]) => ({
    mode: m, name: e.name, hits: e.hits, readable: e.readableHits, unreadable: e.unreadableHits,
    families: [...e.families], sample: e.sample })),
  presses: actions.reduce((a, x) => { a[x.btn] = (a[x.btn] ?? 0) + 1; return a; }, {}),
};
log(LOGFILE, { t: ms(), kind: 'summary', ...summary, final });
console.log(JSON.stringify(summary, null, 1));
cdp.ws.close();
