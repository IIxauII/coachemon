/**
 * The JavaScript the server injects into the PokéRogue tab. Every body is
 * wrapped by `inGame()` so it runs after the scene locator; every read is a
 * pure `Runtime.evaluate` returning a plain JSON value.
 *
 * The locator is #9's: scan Phaser's module-level `CanvasPool` for the entry
 * whose parent carries a live `Game`, take `scene.getScene('battle')`. Never
 * `pool[0]`, never `scenes[0]`, never cached — rediscovered on every evaluate.
 */

const PRELUDE = `
const __locate = () => {
  const P = globalThis.Phaser;
  if (!P || !P.Display || !P.Display.Canvas || !P.Display.Canvas.CanvasPool) return { ready: false, why: 'no-phaser' };
  const pool = P.Display.Canvas.CanvasPool.pool;
  if (!Array.isArray(pool) || pool.length === 0) return { ready: false, why: 'empty-pool' };
  let game = null;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i] && pool[i].parent;
    if (p && p.game && p.game.scene) { game = p.game; break; }
  }
  if (!game) return { ready: false, why: 'no-game-in-pool' };
  if (!game.isBooted || !game.isRunning) return { ready: false, why: 'not-booted' };
  const scene = game.scene.getScene('battle');
  if (!scene || !scene.ui) return { ready: false, why: 'no-battle-scene' };
  return { ready: true, game, scene, ui: scene.ui };
};
const __txt = o => (o && typeof o.text === 'string') ? o.text : null;
const __kids = c => (c && Array.isArray(c.list)) ? c.list : [];
const __texts = c => __kids(c).map(__txt).filter(t => t !== null);
const __strip = s => typeof s === 'string' ? s.replace(/\\[\\/?[^\\]]*\\]/g, '').trim() : s;
const __try = f => { try { return f(); } catch (e) { return null; } };
const __domMode = () => { const el = document.getElementById('touchControls'); return el ? (el.dataset.uiMode || null) : null; };
`;

export function inGame(body: string): string {
  return `(() => {${PRELUDE}\n${body}\n})()`;
}

/**
 * The settle predicate (#3, with #9's and #11's corrections) plus everything
 * the settle loop, the screen id and the progress fingerprint need, in one
 * read. Every field is guarded; a missing path yields null, never a throw.
 */
export const PREDICATE = inGame(`
const L = __locate();
if (!L.ready) return { ready: false, why: L.why, frame: null, domMode: __domMode() };
const { game, scene, ui } = L;
const pm = scene.phaseManager;
const mode = ui.mode;
const h = ui.handlers[mode] || null;
const mh = ui.handlers[0] || null;
const MESSAGE = 0, MODIFIER_SELECT = 6, SAVE_SLOT = 7, EVOLUTION_SCENE = 11, EGG_HATCH_SCENE = 12, LOADING = 35, UNAVAILABLE = 36, ALERT_MODAL = 47;

const cur = pm ? (pm.currentPhase || null) : null;
const phaseName = cur ? (cur.phaseName || null) : null;
const awaiting = x => !!x && x.awaitingActionInput === true && x.onActionInput != null;
const typing = x => !!x && !!x.textTimer && x.textTimer.hasDispatched !== true;

let settled = false, reason;
if (!pm)                                   { reason = 'no-phase-manager'; }
else if (ui.overlayActive === true)        { reason = 'ui-transition'; }
else if (!h || h.active !== true)          { reason = 'handler-inactive'; }
else if (h.blockInput === true)            { reason = 'block-input'; }
else if (h.blockInputOverlay === true)     { reason = 'block-input-overlay'; }
else if (h.transitioning === true)         { reason = 'transitioning'; }
else if (h.blockExit === true)             { reason = 'block-exit'; }
else if (h.pendingPrompt === true)         { reason = 'pending-prompt'; }
else if (typing(h) || typing(mh))          { reason = 'text-animating'; }
else if (mode === LOADING || mode === UNAVAILABLE) { reason = 'modal-blocking'; }
// An alert shown with a closeDelay is unclosable until it elapses; one shown without stays so forever (#15).
// Busy, not a screen: a closable alert settles as ALERT_MODAL/CLOSABLE, a permanent one times out with its text.
else if (mode === ALERT_MODAL && h.allowClosing !== true) { reason = 'alert-unclosable'; }
// Save slots resolve from the server one by one; until every hasData is a boolean the screen cannot be acted on.
else if (mode === SAVE_SLOT && Array.isArray(h.sessionSlots) && h.sessionSlots.some(s => typeof s.hasData !== 'boolean')) { reason = 'slots-loading'; }
else if (mode === MESSAGE || mode === EVOLUTION_SCENE || mode === MODIFIER_SELECT) {
  settled = awaiting(h); reason = settled ? 'awaiting-action' : 'resolving';
}
else if (mode === EGG_HATCH_SCENE) { settled = awaiting(mh); reason = settled ? 'awaiting-action' : 'hatching'; }
else { settled = true; reason = 'menu-open'; }

const battle = scene.currentBattle || null;
const modeChain = Array.isArray(ui.modeChain) ? ui.modeChain.slice() : [];
const messageText = __try(() => (mh && mh.message && typeof mh.message.text === 'string') ? mh.message.text : null)
  || (mode === ALERT_MODAL ? __try(() => __txt(h.label)) : null);
const cursor = h && typeof h.cursor === 'number' ? h.cursor : null;

// Fine fingerprint: the settle loop's "has the game stopped moving" (#14: within-press, timing axis).
const fine = [
  phaseName, mode, modeChain.join('.'), cursor,
  h && typeof h.optionsCursor === 'number' ? h.optionsCursor : '',
  h && typeof h.rowCursor === 'number' ? h.rowCursor : '',
  h && typeof h.scrollCursor === 'number' ? h.scrollCursor : '',
  h && typeof h.fullCursor === 'number' ? h.fullCursor : '',
  // SUMMARY's move-list row: without it a row press reads as unmoved (#32).
  h && typeof h.moveCursor === 'number' ? h.moveCursor : '',
  messageText,
  ui.overlayActive === true ? 1 : 0, h && h.active === true ? 1 : 0,
  awaiting(h) ? 1 : 0, typing(h) || typing(mh) ? 1 : 0,
  battle ? battle.waveIndex : '', battle ? battle.turn : '',
].join('|');

return {
  ready: true, settled, reason, mode, phaseName,
  wave: battle ? battle.waveIndex : null,
  turn: battle ? battle.turn : null,
  money: __try(() => typeof scene.money === 'number' ? scene.money : null),
  runLive: battle != null,
  tutorialActive: h ? h.tutorialActive === true : false,
  handler: h ? h.constructor.name : null,
  cursor, modeChain, messageText,
  onActionInput: h ? h.onActionInput != null : false,
  awaitingActionInput: h ? h.awaitingActionInput === true : false,
  fine,
  frame: game.loop ? game.loop.frame : null,
  domMode: __domMode(),
  gameVersion: game.config ? (game.config.gameVersion || null) : null,
  disc: {
    partyUiMode: h && typeof h.partyUiMode === 'number' ? h.partyUiMode : null,
    optionsMode: h ? h.optionsMode === true : false,
    saveSlotUiMode: h && typeof h.uiMode === 'number' ? h.uiMode : null,
    summaryUiMode: h && typeof h.summaryUiMode === 'number' ? h.summaryUiMode : null,
    alertClosable: h ? h.allowClosing === true : false,
    filterMode: h ? h.filterMode === true : false,
    transferMode: h ? h.transferMode === true : false,
  },
};
`);

/** Cheapest liveness read for the frame-delta check before a press (#23). */
export const FRAME = inGame(`
const L = __locate();
return { ready: L.ready, frame: L.ready && L.game.loop ? L.game.loop.frame : null };
`);

/**
 * The generic menu reader (#4's families, corrected by #6 and #7 §7).
 * `config.options` first; scene geometry only where no option array exists.
 */
export const READER = inGame(`
const L = __locate();
if (!L.ready) return { readable: false, why: L.why };
const { scene, ui } = L;
const mode = ui.mode;
const h = ui.handlers[mode];
if (!h) return { readable: false, why: 'no-handler', mode };
const out = { mode, handler: h.constructor.name, family: null, options: [], cursor: null, readable: false, text: null, extra: {} };
const mh = ui.handlers[0];
out.text = __try(() => (mh && mh.message && typeof mh.message.text === 'string') ? mh.message.text : null);
const opt = (i, label, more) => Object.assign({ i, label }, more || {});

try {
  if (h.config && Array.isArray(h.config.options)) {
    // TITLE, CONFIRM, OPTION_SELECT, MENU_OPTION_SELECT, AUTO_COMPLETE
    out.family = 'option_select';
    out.options = h.config.options.map((o, i) => opt(i, __strip(o.label), { skip: o.skip === true }));
    out.cursor = typeof h.fullCursor === 'number' ? h.fullCursor : h.cursor;
    out.extra.unskippedIndices = Array.isArray(h.unskippedIndices) ? h.unskippedIndices.slice() : null;
    out.extra.selectedIndex = out.extra.unskippedIndices && typeof out.extra.unskippedIndices[out.cursor] === 'number' ? out.extra.unskippedIndices[out.cursor] : out.cursor;
    out.readable = out.options.length > 0;
  } else if (mode === 2) {
    out.family = 'command';
    out.options = __texts(h.commandsContainer).map((t, i) => opt(i, t));
    out.cursor = h.getCursor ? h.getCursor() : h.cursor;
    out.extra.fieldIndex = h.fieldIndex || 0;
    out.readable = out.options.length > 0;
  } else if (mode === 3) {
    out.family = 'fight';
    out.options = __texts(h.movesContainer).map((t, i) => opt(i, t));
    out.cursor = h.getCursor ? h.getCursor() : h.cursor;
    out.extra.fieldIndex = h.fieldIndex || 0;
    const pk = __try(() => scene.getPlayerField()[h.fieldIndex || 0]);
    const ms = __try(() => pk.getMoveset());
    if (ms) out.extra.moves = ms.map(m => m ? __try(() => {
      const mv = m.getMove ? m.getMove() : null;
      return { name: m.getName(), pp: m.getMovePp() - m.ppUsed, maxPp: m.getMovePp(), power: mv ? mv.power : null, category: mv ? mv.category : null, type: mv ? mv.type : null };
    }) : null);
    out.readable = out.options.length > 0;
  } else if (mode === 4) {
    out.family = 'ball';
    const bc = h.pokeballSelectContainer;
    let joined = null;
    __kids(bc).forEach(k => { if (typeof k.text === 'string' && k.text.indexOf('\\n') > -1) joined = k.text; });
    out.options = (joined ? joined.split('\\n') : __texts(bc)).map((t, i) => opt(i, t));
    out.cursor = h.cursor;
    out.readable = out.options.length > 0;
  } else if (mode === 5) {
    out.family = 'target_select';
    const field = __try(() => scene.getField()) || [];
    out.options = (h.targets || []).map(bi => {
      const p = field[bi];
      return opt(bi, p ? p.name : ('slot ' + bi), { battlerIndex: bi, hp: p ? p.hp : null, maxHp: p ? __try(() => p.getMaxHp()) : null, level: p ? p.level : null });
    });
    out.cursor = h.cursor;
    out.extra.isMultipleTargets = h.isMultipleTargets === true;
    out.readable = out.options.length > 0;
  } else if (mode === 6) {
    out.family = 'modifier_select';
    const rows = [];
    // Row 0 is the button bar, in the handler's own cursor order: reroll, manage items, check team, lock rarities.
    // Labels come from each container's text object, which the game filled from its i18n keys — never hardcoded.
    const btn = (c, col) => ({ col, label: __strip(__texts(c)[0]) || null, visible: !!(c && c.visible) });
    const buttons = [btn(h.rerollButtonContainer, 0), btn(h.transferButtonContainer, 1), btn(h.checkButtonContainer, 2), btn(h.lockRarityButtonContainer, 3)];
    if (h.continueButtonContainer && h.continueButtonContainer.visible) buttons.push(btn(h.continueButtonContainer, 4));
    rows.push({ row: 0, kind: 'buttons', items: buttons.filter(b => b.visible && b.label) });
    const item = (o, col) => ({ col, label: __try(() => o.modifierTypeOption.type.name), cost: __try(() => o.modifierTypeOption.cost) });
    rows.push({ row: 1, kind: 'reward', items: (h.options || []).map(item) });
    const shop = h.shopOptionsRows || [];
    for (let r = 0; r < shop.length; r++) {
      // Shop rows are indexed backwards: row n >= 2 is shopOptionsRows.at(-(n-1)) (#7 §7).
      rows.push({ row: 2 + r, kind: 'shop', items: (shop[shop.length - 1 - r] || []).map(item) });
    }
    out.extra.rows = rows;
    out.options = rows.flatMap(r => r.items.map(it => opt(r.row + ':' + it.col, it.label, { row: r.row, col: it.col, cost: it.cost === undefined ? null : it.cost, kind: r.kind })));
    out.cursor = h.rowCursor + ':' + h.cursor;
    out.extra.rowCursor = h.rowCursor; out.extra.colCursor = h.cursor;
    out.extra.money = scene.money;
    out.extra.rerollCost = __try(() => h.rerollCost);
    out.readable = true;
  } else if (mode === 7) {
    out.family = 'save_slot';
    // hasData is undefined until the slot's server fetch resolves; the handler refuses ACTION on such a slot.
    out.options = (h.sessionSlots || []).map((s, i) => opt(i, 'Slot ' + (i + 1), { hasData: s.hasData === true ? true : s.hasData === false ? false : null, wave: __try(() => s.saveData ? s.saveData.waveIndex : null), gameMode: __try(() => s.saveData ? s.saveData.gameMode : null) }));
    out.cursor = (h.cursor || 0) + (h.scrollCursor || 0);
    out.extra.uiMode = h.uiMode;
    out.readable = out.options.length > 0;
  } else if (mode === 8) {
    out.family = 'party';
    out.extra.optionsMode = h.optionsMode === true;
    out.extra.partyUiMode = h.partyUiMode;
    out.extra.optionsScroll = h.optionsScroll === true;
    out.extra.transferMode = h.transferMode === true;
    if (h.optionsMode === true) {
      // Sort by y ASCENDING: verb first, Cancel last (#6 corrected #4). Labels are BBCode.
      const kids = __kids(h.optionsContainer).filter(k => typeof k.text === 'string');
      kids.sort((a, b) => a.y - b.y);
      out.options = kids.map((k, i) => opt(i, __strip(k.text)));
      out.cursor = h.optionsCursor;
    } else {
      // Slot cursors are 0..n-1; Cancel is the fixed cursor 6, and item-manage modes add the transfer/discard toggle at 7.
      // DOWN walks 0..n-1 → 6 → 0 (PartyUiHandler.processInput), so the driver navigates this list as a DOWN-cycle.
      const party = __try(() => scene.getPlayerParty()) || [];
      out.options = party.map((p, i) => opt(i, p.name, { level: p.level, hp: p.hp, maxHp: __try(() => p.getMaxHp()), fainted: __try(() => p.isFainted()), active: __try(() => p.isActive(true)) }));
      out.options.push(opt(6, 'Cancel', { synthetic: true }));
      if (__try(() => h.isItemManageMode()) === true) out.options.push(opt(7, __try(() => __texts(h.partyDiscardModeButton || h.partyTransferModeButton)[0]) || 'Toggle', { synthetic: true }));
      out.cursor = h.cursor;
    }
    out.readable = out.options.length > 0;
  } else if (mode === 10) {
    out.family = 'starter_select';
    const gd = scene.gameData;
    const grid = h.filteredStarterContainers || [];
    out.options = grid.map((c, i) => opt(i, __try(() => c.species.name), { cost: __try(() => gd.getSpeciesStarterValue(c.species.speciesId)) }));
    out.cursor = h.cursor;
    out.extra.scrollCursor = h.scrollCursor;
    out.extra.filterMode = h.filterMode === true;
    out.extra.party = (h.starterSpecies || []).map(s => ({ name: s.name, cost: __try(() => gd.getSpeciesStarterValue(s.speciesId)) }));
    out.extra.partyValue = out.extra.party.reduce((t, s) => t + (s.cost || 0), 0);
    out.extra.valueLimit = __try(() => h.getValueLimit());
    out.extra.partyValid = __try(() => h.isPartyValid());
    out.readable = out.options.length > 0;
  } else if (mode === 0 || mode === 11 || mode === 12 || mode === 13 || mode === 35 || mode === 36 || mode === 47) {
    out.family = 'acknowledge';
    out.options = [];
    out.extra.awaitingActionInput = h.awaitingActionInput === true && h.onActionInput != null;
    if (mode === 47) { out.text = __try(() => __txt(h.label)) || out.text; out.extra.closable = h.allowClosing === true; }
    out.readable = true;
  } else if (mode === 9 && h.summaryUiMode === 1) {
    // SUMMARY/LEARN_MOVE: rows 0..3 are the moveset, row 4 the new move (ACTION there declines, via CANCEL). The row
    // cursor is moveCursor; cursor is the page. Labels are read live from the moveset and newMove, never the text rows.
    out.family = 'learn_move';
    const pk = h.pokemon;
    const ms = __try(() => pk.getMoveset()) || [];
    const pp = m => __try(() => ({ pp: m.getMovePp() - m.ppUsed, maxPp: m.getMovePp() })) || {};
    out.options = ms.map((m, i) => opt(i, __try(() => m.getName()), Object.assign({ forget: true }, pp(m))));
    const nm = h.newMove;
    if (nm) out.options.push(opt(4, __try(() => nm.name), { forget: false, new: true, pp: nm.pp, maxPp: nm.pp }));
    out.cursor = h.moveSelect === true ? h.moveCursor : null;
    out.extra.moveSelect = h.moveSelect === true;
    out.extra.page = h.cursor;
    out.extra.pokemon = __try(() => pk.name);
    out.extra.newMove = __try(() => nm.name);
    // Off the move list (LEFT to another page) the rows take no cursor: nothing to select until RIGHT returns to it.
    if (h.moveSelect !== true) out.options = [];
    out.readable = true;
  } else if (mode === 9 || mode === 26 || mode === 31 || mode === 41) {
    out.family = 'paged_viewer';
    out.cursor = h.cursor;
    out.extra.page = h.cursor;
    out.readable = true;
  } else if (Array.isArray(h.buttonLabels)) {
    out.family = 'modal';
    out.options = h.buttonLabels.map((b, i) => opt(i, __strip(__txt(b))));
    out.text = __try(() => __txt(h.titleText)) || out.text;
    out.extra.formLabels = (h.formLabels || []).map(__txt);
    out.extra.inputs = (h.inputs || []).map(x => x ? x.text : null);
    out.cursor = null;
    out.readable = out.options.length > 0;
  } else if (mode === 16) {
    out.family = 'menu';
    out.options = (__txt(h.optionSelectText) || '').split('\\n').map((t, i) => opt(i, t));
    out.cursor = h.cursor;
    out.readable = out.options.length > 0;
  } else if (mode === 45) {
    out.family = 'mystery_encounter';
    out.options = __texts(h.optionsContainer).map((t, i) => opt(i, __strip(t)));
    out.cursor = h.cursor;
    out.readable = out.options.length > 0;
  } else {
    out.family = 'unmapped';
    out.cursor = typeof h.cursor === 'number' ? h.cursor : null;
    out.readable = false;
    out.extra.ownKeys = Object.keys(h).slice(0, 40);
    out.extra.texts = __try(() => __texts(h.getUi ? h.getUi() : null)).slice(0, 20);
  }
} catch (e) {
  out.readable = false;
  out.extra.error = String(e && e.message || e);
}
return out;
`);

/** `get_state` (#7 §6.2). Every field inside its own guard; `detail` widens it. */
export function snapshot(detail: "lean" | "party" | "items" | "full"): string {
  const withParty = detail === "party" || detail === "full";
  const withItems = detail === "items" || detail === "full";
  return inGame(`
const L = __locate();
if (!L.ready) return { ready: false, why: L.why };
const { scene, ui } = L;
const b = scene.currentBattle || null;
const move = m => m ? __try(() => {
  const mv = m.getMove ? m.getMove() : null;
  return { name: m.getName(), pp: m.getMovePp() - m.ppUsed, maxPp: m.getMovePp(), power: mv ? mv.power : null, category: mv ? mv.category : null, type: mv ? mv.type : null };
}) : null;
const mon = (p, full) => p ? {
  name: __try(() => p.name), species: __try(() => p.species.name), level: __try(() => p.level),
  hp: __try(() => p.hp), maxHp: __try(() => p.getMaxHp()),
  status: __try(() => p.status ? p.status.effect : 0),
  fainted: __try(() => p.isFainted()),
  active: __try(() => p.isActive(true)),
  moves: full ? __try(() => p.getMoveset().map(move)) : undefined,
  types: full ? __try(() => p.getTypes().slice()) : undefined,
  ability: full ? __try(() => p.getAbility().name) : undefined,
  nature: full ? __try(() => p.nature) : undefined,
  ivs: full ? __try(() => p.ivs.slice()) : undefined,
  stats: full ? __try(() => p.stats.slice()) : undefined,
} : null;
const h = ui.handlers[ui.mode];
const fieldIndex = h && typeof h.fieldIndex === 'number' ? h.fieldIndex : 0;
const out = {
  ready: true,
  wave: b ? b.waveIndex : null,
  turn: b ? b.turn : null,
  double: b ? b.double === true : null,
  battleType: b ? __try(() => b.battleType) : null,
  money: __try(() => scene.money),
  biome: __try(() => scene.arena.biomeId ?? scene.arena.biomeType ?? null),
  active: __try(() => { const a = scene.getPlayerField()[fieldIndex]; const m = mon(a, false); if (m) m.moves = __try(() => a.getMoveset().map(move)); return m; }),
  enemy: __try(() => (b ? b.enemyParty : []).map(p => mon(p, false))),
  party: __try(() => scene.getPlayerParty().map(p => mon(p, ${withParty}))),
  mode: ui.mode,
};
${withItems ? `
out.items = __try(() => (scene.modifiers || []).map(m => ({
  name: __try(() => m.type.name), type: __try(() => m.type.id || m.type.identifier || null),
  stack: __try(() => m.stackCount), max: __try(() => m.getMaxStackCount ? m.getMaxStackCount() : null),
  pokemonId: __try(() => m.pokemonId === undefined ? null : m.pokemonId),
  held: __try(() => typeof m.pokemonId === 'number'),
})));
out.enemyItems = __try(() => (scene.enemyModifiers || []).map(m => ({ name: __try(() => m.type.name), stack: __try(() => m.stackCount) })));
out.partyIds = __try(() => scene.getPlayerParty().map(p => p.id));
` : ""}
return out;
`);
}

/** Deliver one button through the game's own input path. The return value is deliberately not read (#7 Principle 4). */
export function press(button: number): string {
  return inGame(`
const L = __locate();
if (!L.ready) return { ok: false, why: L.why };
L.ui.processInput(${button});
return { ok: true, mode: L.ui.mode };
`);
}

/** Option-select family: position the cursor over the unskipped list, then read back what the handler thinks. */
export function optionSelectSetCursor(unskippedIndex: number): string {
  return inGame(`
const L = __locate();
if (!L.ready) return { ok: false, why: L.why };
const h = L.ui.handlers[L.ui.mode];
h.setCursor(${unskippedIndex});
return { ok: true, fullCursor: h.fullCursor, cursor: h.cursor };
`);
}

/**
 * Learn-move rows: `setCursor` writes `moveCursor` only while `moveSelect` is on; off it, the same call would turn the
 * page, so it refuses instead.
 */
export function learnMoveSetCursor(row: number): string {
  return inGame(`
const L = __locate();
if (!L.ready) return { ok: false, why: L.why };
const h = L.ui.handlers[9];
if (h.moveSelect !== true) return { ok: false, why: 'move-select-off' };
h.setCursor(${row});
return { ok: true, moveCursor: h.moveCursor };
`);
}

/** Shop: `setRowCursor` then `setCursor`; order is load-bearing (#7 §7). */
export function shopSetCursor(row: number, col: number): string {
  return inGame(`
const L = __locate();
if (!L.ready) return { ok: false, why: L.why };
const h = L.ui.handlers[6];
h.setRowCursor(${row});
h.setCursor(${col});
return { ok: true, rowCursor: h.rowCursor, cursor: h.cursor };
`);
}

/**
 * Starter grid: keep the window in sync first (`setCursor` never calls
 * `updateScroll`, #8), then `setCursor`. Refuses in filter mode, where
 * `setCursor(n)` writes `filterBarCursor` instead.
 */
export function starterSetCursor(index: number): string {
  return inGame(`
const L = __locate();
if (!L.ready) return { ok: false, why: L.why };
const h = L.ui.handlers[10];
if (h.filterMode === true) return { ok: false, why: 'filter-mode' };
const n = (h.filteredStarterContainers || []).length;
const rows = Math.ceil(n / 9);
const row = Math.floor(${index} / 9);
if (row < h.scrollCursor || row > h.scrollCursor + 8) {
  h.scrollCursor = Math.max(0, Math.min(row - 4, rows - 9));
  h.updateScroll();
}
h.setCursor(${index});
return { ok: true, cursor: h.cursor, scrollCursor: h.scrollCursor, species: __try(() => h.filteredStarterContainers[h.cursor].species.name) };
`);
}

/** Modal family: the handler's own button action, mouse-only by construction (#13). */
export function modalButton(index: number): string {
  return inGame(`
const L = __locate();
if (!L.ready) return { ok: false, why: L.why };
const h = L.ui.handlers[L.ui.mode];
const fn = h.config && Array.isArray(h.config.buttonActions) ? h.config.buttonActions[${index}] : null;
if (typeof fn !== 'function') return { ok: false, why: 'no-button-action' };
fn();
return { ok: true, mode: L.ui.mode };
`);
}

/** Starter-select facts `start_run` needs before it presses anything. */
export const STARTER_INFO = inGame(`
const L = __locate();
if (!L.ready) return { ok: false, why: L.why };
const h = L.ui.handlers[10];
const gd = L.scene.gameData;
const grid = (h.filteredStarterContainers || []).map((c, i) => ({ i, name: __try(() => c.species.name), id: __try(() => c.species.speciesId), cost: __try(() => gd.getSpeciesStarterValue(c.species.speciesId)) }));
return {
  ok: true, filterMode: h.filterMode === true, cursor: h.cursor, scrollCursor: h.scrollCursor,
  grid, party: (h.starterSpecies || []).map(s => s.name),
  valueLimit: __try(() => h.getValueLimit()), partyValid: __try(() => h.isPartyValid()),
};
`);
