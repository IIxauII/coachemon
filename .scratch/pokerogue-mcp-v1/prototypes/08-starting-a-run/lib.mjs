// PROTOTYPE — throwaway. Ticket #8 "Starting a run".
// CDP driver for the live PokéRogue tab: locate the scene (per #9), read a
// STARTER_SELECT-aware snapshot, press buttons, wait for settle (per #3).

export const Button = {
  UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, SUBMIT: 4, ACTION: 5, CANCEL: 6, MENU: 7,
  STATS: 8, CYCLE_SHINY: 9, CYCLE_FORM: 10, CYCLE_GENDER: 11, CYCLE_ABILITY: 12,
  CYCLE_NATURE: 13, CYCLE_TERA: 14, SPEED_UP: 15, SLOW_DOWN: 16, DEV_CUSTOM: 17,
};
export const ButtonName = Object.fromEntries(Object.entries(Button).map(([k, v]) => [v, k]));

// ---------------------------------------------------------------- CDP plumbing

export async function connect() {
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find(t => t.type === 'page' && t.url.includes('pokerogue.net'));
  if (!page) throw new Error('no pokerogue tab on 9222');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error('page threw: ' + (r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text));
    }
    return r.result.value;
  };
  return { ws, send, evaluate, close: () => ws.close() };
}

// ------------------------------------------------------------- scene locator

// Verbatim from #9: scan Phaser's module-level CanvasPool, never index, never
// fall back to scenes[0]. Stateless — rediscovered on every evaluate.
const PRELUDE = `
  const isGame = g => !!g && typeof g === 'object'
    && 'isBooted' in g && g.scene && Array.isArray(g.scene.scenes) && g.textures && g.loop;
  let game = null;
  const P = globalThis.Phaser;
  if (!P || !P.Display || !P.Display.Canvas || !P.Display.Canvas.CanvasPool) return { ready: false, why: 'no-phaser' };
  const pool = P.Display.Canvas.CanvasPool.pool;
  if (!Array.isArray(pool) || pool.length === 0) return { ready: false, why: 'empty-pool' };
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i] && pool[i].parent;
    if (!p || typeof p !== 'object') continue;
    for (const cand of [p, p.game, p.scene && p.scene.game, p.manager && p.manager.game, p.renderer && p.renderer.game]) {
      if (isGame(cand)) { game = cand; break; }
    }
    if (game) break;
  }
  if (!game) return { ready: false, why: 'no-game-in-pool' };
  if (!game.isBooted || !game.isRunning) return { ready: false, why: 'not-booted' };
  const scene = game.scene.getScene('battle');
  if (!scene || !scene.ui) return { ready: false, why: 'no-battle-scene' };
  const ui = scene.ui;
  const handler = ui.getHandler();
`;

export const inGame = (body) => `(() => {${PRELUDE}\n${body}\n})()`;

// ------------------------------------------------------------------ snapshot

// One snapshot expression, mode-aware. Everything STARTER_SELECT-specific is
// guarded so it also works on TITLE / CONFIRM / COMMAND.
const SNAPSHOT = inGame(`
  const out = {
    ready: true,
    mode: ui.mode,
    domUiMode: document.getElementById('touchControls') ? document.getElementById('touchControls').dataset.uiMode : null,
    handler: handler.constructor.name,
    active: handler.active === true,
    overlayActive: !!ui.overlayActive,
    tutorialActive: handler.tutorialActive === true,
    awaitingActionInput: handler.awaitingActionInput === true,
    hasOnActionInput: handler.onActionInput != null,
    phase: scene.phaseManager && scene.phaseManager.currentPhase ? scene.phaseManager.currentPhase.constructor.name : null,
    wave: scene.currentBattle ? scene.currentBattle.waveIndex : null,
    hasCurrentBattle: scene.currentBattle != null,
    money: typeof scene.money === 'number' ? scene.money : null,
    partySize: scene.getPlayerParty ? scene.getPlayerParty().length : null,
    classicSessionsPlayed: scene.gameData && scene.gameData.gameStats ? scene.gameData.gameStats.classicSessionsPlayed : null,
    text: null,
  };

  // message text, where the handler has one
  if (handler.message && handler.message.text) out.text = handler.message.text;

  // F1 option-select family (TITLE, CONFIRM, OPTION_SELECT, COMMAND...)
  if (handler.config && Array.isArray(handler.config.options)) {
    out.options = handler.config.options.map(o => o.label);
    out.fullCursor = handler.fullCursor;
    out.cursor = handler.cursor;
  }

  // F8 STARTER_SELECT
  if (handler.constructor.name === 'StarterSelectUiHandler') {
    const h = handler;
    const filtered = h.filteredStarterContainers || [];
    const gd = scene.gameData;
    const partyValue = (h.starterSpecies || []).reduce((t, s) => t + gd.getSpeciesStarterValue(s.speciesId), 0);
    out.starter = {
      // --- which of the five cursor spaces is live ---
      filterMode: h.filterMode === true,
      statsMode: h.statsMode === true,
      gridCursorVisible: !!(h.cursorObj && h.cursorObj.visible),
      startCursorVisible: !!(h.startCursorObj && h.startCursorObj.visible),
      randomCursorVisible: !!(h.randomCursorObj && h.randomCursorObj.visible),
      partyCursorVisible: !!(h.starterIconsCursorObj && h.starterIconsCursorObj.visible),
      // --- the cursor values themselves ---
      cursor: h.cursor,
      scrollCursor: h.scrollCursor,
      filterBarCursor: h.filterBarCursor,
      partyCursorIndex: h.starterIconsCursorIndex,
      numFilters: h.filterBar ? h.filterBar.numFilters : null,
      filterDropDownOpen: h.filterBar ? !!h.filterBar.openDropDown : null,
      blockInput: h.blockInput === true,
      // --- the grid ---
      gridLength: filtered.length,
      gridRows: Math.ceil(filtered.length / 9),
      speciesAtCursor: filtered[h.cursor] && filtered[h.cursor].species
        ? { id: filtered[h.cursor].species.speciesId, name: filtered[h.cursor].species.name,
            cost: gd.getSpeciesStarterValue(filtered[h.cursor].species.speciesId) }
        : null,
      // --- the party being built ---
      party: (h.starterSpecies || []).map(s => ({ id: s.speciesId, name: s.name, cost: gd.getSpeciesStarterValue(s.speciesId) })),
      partyValue,
      valueLimit: h.getValueLimit ? h.getValueLimit() : null,
      partyValid: h.isPartyValid ? h.isPartyValid() : null,
    };
  }

  // storage keys, for #11
  out.storage = Object.keys(localStorage)
    .filter(k => /session|runHistory|^data_/i.test(k))
    .map(k => k + ':' + localStorage.getItem(k).length);

  return out;
`);

export const readState = (cdp) => cdp.evaluate(SNAPSHOT);

// ------------------------------------------------------------------- settling

// Per #3: poll a cheap fingerprint until two consecutive samples match.
// awaitingActionInput is never reset on consumption, so pair it with onActionInput.
const FINGERPRINT = inGame(`
  const h = handler;
  const waiting = h.awaitingActionInput === true && h.onActionInput != null;
  const textDone = !h.textTimer || h.textTimer.hasDispatched === true;
  return [
    ui.mode,
    h.constructor.name,
    h.active === true ? 1 : 0,
    !!ui.overlayActive ? 1 : 0,
    waiting ? 1 : 0,
    textDone ? 1 : 0,
    h.blockInput === true ? 1 : 0,
    scene.phaseManager && scene.phaseManager.currentPhase ? scene.phaseManager.currentPhase.constructor.name : '-',
    scene.currentBattle ? scene.currentBattle.waveIndex : -1,
    h.cursor === undefined ? -1 : h.cursor,
    h.scrollCursor === undefined ? -1 : h.scrollCursor,
    h.starterSpecies ? h.starterSpecies.length : -1,
  ].join('|');
`);

// #3 recommends "two identical consecutive samples". Measured here: that is not
// enough. A press is handled asynchronously, so the first two samples after it
// are both the *pre-change* state and the poll exits before the game has moved
// (press #1 on TITLE "settled" in 103ms while the mode was still 1; the real
// destination, OPTION_SELECT, arrived later). Require `stableSamples` identical
// samples AND a `minMs` floor below which we never declare settled.
export async function settle(cdp, { interval = 100, stableSamples = 3, minMs = 500, noProgressMs = 20000, hardMs = 90000 } = {}) {
  const t0 = Date.now();
  let prev = null;
  let same = 0;
  let stableSince = Date.now();
  for (;;) {
    const fp = await cdp.evaluate(FINGERPRINT);
    if (typeof fp !== 'string') {
      // locator returned { ready: false, ... }
      await new Promise(r => setTimeout(r, interval));
      continue;
    }
    if (fp === prev) {
      same++;
      if (same >= stableSamples && Date.now() - t0 >= minMs) {
        return { settled: true, ms: Date.now() - t0, fingerprint: fp };
      }
    } else { prev = fp; same = 1; stableSince = Date.now(); }
    if (Date.now() - stableSince > noProgressMs) return { settled: false, why: 'no-progress', ms: Date.now() - t0, fingerprint: fp };
    if (Date.now() - t0 > hardMs) return { settled: false, why: 'hard-timeout', ms: Date.now() - t0, fingerprint: fp };
    await new Promise(r => setTimeout(r, interval));
  }
}

// --------------------------------------------------------------------- input

// Semantic press: hand the Button int straight to ui.processInput, as #4/#6 did.
export async function press(cdp, button) {
  const accepted = await cdp.evaluate(inGame(`return ui.processInput(${button}) !== false;`));
  return accepted;
}

// Raw keyboard press, for comparison. Phaser binds to window, not document (#9).
const KEYS = {
  UP: ['ArrowUp', 38], DOWN: ['ArrowDown', 40], LEFT: ['ArrowLeft', 37], RIGHT: ['ArrowRight', 39],
  ACTION: ['z', 90], CANCEL: ['x', 88], SUBMIT: ['Enter', 13],
};
export async function rawPress(cdp, name) {
  const [key, code] = KEYS[name];
  for (const type of ['keyDown', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', {
      type, key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key,
      windowsVirtualKeyCode: code, nativeVirtualKeyCode: code,
      text: key.length === 1 ? key : undefined,
    });
  }
}

// ------------------------------------------------------------------- logging

export function fmt(s) {
  if (!s || !s.ready) return `  NOT READY (${s && s.why})`;
  const lines = [`  mode=${s.mode} dom=${s.domUiMode} handler=${s.handler} phase=${s.phase} wave=${s.wave}`];
  if (s.tutorialActive) lines.push(`  !! tutorialActive — only ACTION/CANCEL accepted`);
  if (s.options) lines.push(`  options=[${s.options.join(', ')}] fullCursor=${s.fullCursor}`);
  if (s.text) lines.push(`  text=${JSON.stringify(s.text.slice(0, 90))}`);
  if (s.starter) {
    const t = s.starter;
    const live = [t.filterMode && 'FILTER', t.statsMode && 'STATS', t.gridCursorVisible && 'grid',
      t.startCursorVisible && 'START', t.randomCursorVisible && 'RANDOM', t.partyCursorVisible && 'party']
      .filter(Boolean).join('+') || 'none';
    lines.push(`  live-cursor=${live}  cursor=${t.cursor} scroll=${t.scrollCursor} filterBar=${t.filterBarCursor} partyIdx=${t.partyCursorIndex}`);
    lines.push(`  grid=${t.gridLength} (${t.gridRows} rows)  at-cursor=${t.speciesAtCursor ? `${t.speciesAtCursor.name}#${t.speciesAtCursor.id} cost=${t.speciesAtCursor.cost}` : '-'}`);
    lines.push(`  party=[${t.party.map(p => `${p.name}(${p.cost})`).join(', ')}] value=${t.partyValue}/${t.valueLimit} valid=${t.partyValid}`);
  }
  lines.push(`  storage=[${s.storage.join(' ')}]  currentBattle=${s.hasCurrentBattle} party=${s.partySize} classicSessionsPlayed=${s.classicSessionsPlayed}`);
  return lines.join('\n');
}
