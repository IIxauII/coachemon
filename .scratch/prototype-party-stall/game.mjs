// PROTOTYPE — throwaway. Injected-JS bodies: settle predicate (#3 + #9's corrections),
// generic menu reader (#4's family table), lean snapshot, and press.

// --------------------------------------------------------------- predicate
// #3's predicate, verbatim in structure, with #9's two corrections applied:
//   - scene comes from the scanning locator, never pool[0] / scenes[0]
//   - ui.overlayActive is declared-but-uninitialised, so `=== true` (already the case)
// Extra diagnostics this prototype adds so the unverified branches can be checked:
//   phaseCtor (PhaseTree-safe alternative to phaseName), queueDepth, awaiting/onAction raw flags.
export const PREDICATE = `
var L = __locate();
if (!L.ready) return { settled:false, reason:'no-scene:' + L.why };
var scene = L.scene, ui = scene.ui, pm = scene.phaseManager;
if (!pm) return { settled:false, reason:'no-phase-manager' };

var MESSAGE=0, MODIFIER_SELECT=6, EVOLUTION_SCENE=11, EGG_HATCH_SCENE=12, LOADING=35, UNAVAILABLE=36;

var mode = ui.mode;
var h  = ui.handlers[mode];
var mh = ui.handlers[MESSAGE];

// #9: phaseQueue is a PhaseTree, not an array. currentPhase.constructor.name always reads.
var cur = pm.currentPhase || null;
var phaseName = cur ? (cur.phaseName || null) : null;
var phaseCtor = cur ? cur.constructor.name : null;
var queueDepth = null;
try {
  var q = pm.phaseQueue;
  if (Array.isArray(q)) queueDepth = q.length;
  else if (q && Array.isArray(q.levels)) queueDepth = q.levels.reduce(function(a,l){ return a + (l ? l.length : 0); }, 0);
} catch (e) { queueDepth = 'err'; }

function awaiting(x){ return !!x && x.awaitingActionInput === true && x.onActionInput != null; }
function typing(x){ return !!x && !!x.textTimer && x.textTimer.hasDispatched !== true; }

var settled = false, reason;
if (ui.overlayActive === true)          { reason = 'ui-transition'; }
else if (!h || h.active !== true)       { reason = 'handler-inactive'; }
else if (h.blockInput === true)         { reason = 'block-input'; }
else if (h.blockInputOverlay === true)  { reason = 'block-input-overlay'; }
else if (h.transitioning === true)      { reason = 'transitioning'; }
else if (h.blockExit === true)          { reason = 'block-exit'; }
else if (h.pendingPrompt === true)      { reason = 'pending-prompt'; }
else if (typing(h) || typing(mh))       { reason = 'text-animating'; }
else if (mode === LOADING || mode === UNAVAILABLE) { reason = 'modal-blocking'; }
else if (mode === MESSAGE || mode === EVOLUTION_SCENE || mode === MODIFIER_SELECT) {
  settled = awaiting(h); reason = settled ? 'awaiting-action' : 'resolving';
}
else if (mode === EGG_HATCH_SCENE) {
  settled = awaiting(mh); reason = settled ? 'awaiting-action' : 'hatching';
}
else { settled = true; reason = 'menu-open'; }

var battle = scene.currentBattle || null;
return {
  settled: settled, reason: reason, mode: mode,
  phaseName: phaseName, phaseCtor: phaseCtor, queueDepth: queueDepth,
  wave: battle ? battle.waveIndex : null,
  turn: battle ? battle.turn : null,
  tutorialActive: h ? h.tutorialActive === true : false,
  hCtor: h ? h.constructor.name : null,
  aai: h ? (h.awaitingActionInput === true) : null,
  oai: h ? (h.onActionInput != null) : null,
  fp: [phaseName, mode, ui.modeChain.join('.'), h && h.cursor,
       mh && mh.message ? mh.message.text : ''].join('|')
};
`;

// ----------------------------------------------------------- generic reader
// One body covering the families from #4 that a wave can plausibly hit.
// Every branch reports {family, options[], cursor, readable} so an unreadable
// screen is a data point rather than a crash.
export const READER = `
var L = __locate();
if (!L.ready) return { readable:false, why:L.why };
var scene = L.scene, ui = scene.ui, mode = ui.mode, h = ui.handlers[mode];
if (!h) return { readable:false, why:'no-handler', mode:mode };

var out = { mode: mode, hCtor: h.constructor.name, family: null, options: [], cursor: null,
            readable: false, text: null, extra: {} };

var msgH = ui.handlers[0];
out.text = (msgH && msgH.message && typeof msgH.message.text === 'string') ? msgH.message.text : null;

try {
  // F1 config option-select: CONFIRM 14, OPTION_SELECT 15, MENU_OPTION_SELECT 17, TITLE 1, AUTO_COMPLETE 43
  if (h.config && Array.isArray(h.config.options)) {
    out.family = 'F1';
    out.options = h.config.options.map(function(o, i){ return { i:i, label:o.label, skip:o.skip === true }; });
    var ui_ = h.unskippedIndices;
    out.cursor = (typeof h.fullCursor === 'number') ? h.fullCursor : h.cursor;
    out.extra.selectedOptionIndex = (ui_ && typeof ui_[out.cursor] === 'number') ? ui_[out.cursor] : out.cursor;
    out.extra.screenCursor = h.cursor;
    out.readable = out.options.length > 0;
  }
  // F3 command grid (2)
  else if (mode === 2) {
    out.family = 'F3';
    out.options = __texts(h.commandsContainer).map(function(t,i){ return { i:i, label:t }; });
    out.cursor = h.getCursor ? h.getCursor() : h.cursor;
    out.readable = out.options.length > 0;
  }
  // F3 fight grid (3)
  else if (mode === 3) {
    out.family = 'F3';
    out.options = __texts(h.movesContainer).map(function(t,i){ return { i:i, label:t }; });
    out.cursor = h.getCursor ? h.getCursor() : h.cursor;
    var pk = scene.getPlayerField ? scene.getPlayerField()[h.fieldIndex || 0] : null;
    var ms = pk && pk.getMoveset ? pk.getMoveset() : null;
    if (ms) out.extra.moves = ms.map(function(m){
      if (!m) return null;
      var mv = m.getMove ? m.getMove() : null;
      return { name: m.getName(), ppLeft: m.getMovePp() - m.ppUsed,
               power: mv ? mv.power : null, category: mv ? mv.category : null };
    });
    out.readable = out.options.length > 0;
  }
  // F2 ball (4)
  else if (mode === 4) {
    out.family = 'F2';
    var bc = h.pokeballSelectContainer;
    var joined = null;
    __kids(bc).forEach(function(k){ if (typeof k.text === 'string' && k.text.indexOf('\\n') > -1) joined = k.text; });
    out.options = (joined ? joined.split('\\n') : __texts(bc)).map(function(t,i){ return { i:i, label:t }; });
    out.cursor = h.cursor;
    out.readable = out.options.length > 0;
  }
  // F9 target select (5)
  else if (mode === 5) {
    out.family = 'F9';
    var field = scene.getField ? scene.getField() : [];
    out.options = (h.targets || []).map(function(bi){
      var p = field[bi];
      return { i:bi, label: p ? (p.name + ' (HP ' + p.hp + '/' + p.getMaxHp() + ')') : ('slot ' + bi) };
    });
    out.cursor = h.cursor;
    out.extra.isMultipleTargets = h.isMultipleTargets === true;
    out.readable = out.options.length > 0;
  }
  // F5 shop (6)
  else if (mode === 6) {
    out.family = 'F5';
    var rows = [];
    var btnRow = ['Reroll', 'Manage Items', 'Check Team', 'Lock Rarities'];
    rows.push({ row: 0, kind: 'buttons', items: btnRow.map(function(l,i){ return { col:i, label:l }; }) });
    var free = (h.options || []).map(function(o, i){
      var t = o && o.modifierTypeOption && o.modifierTypeOption.type;
      return { col: i, label: t ? t.name : '?', cost: o && o.modifierTypeOption ? o.modifierTypeOption.cost : null };
    });
    rows.push({ row: 1, kind: 'reward', items: free });
    var shop = h.shopOptionsRows || [];
    for (var r = 0; r < shop.length; r++) {
      var srow = shop[shop.length - 1 - r];
      rows.push({ row: 2 + r, kind: 'shop', items: (srow || []).map(function(o, i){
        var t = o && o.modifierTypeOption && o.modifierTypeOption.type;
        return { col: i, label: t ? t.name : '?', cost: o && o.modifierTypeOption ? o.modifierTypeOption.cost : null };
      })});
    }
    out.extra.rows = rows;
    out.options = rows.reduce(function(a, r){
      return a.concat(r.items.map(function(it){ return { i: r.row + ':' + it.col, label: it.label, cost: it.cost }; }));
    }, []);
    out.cursor = h.rowCursor + ':' + h.cursor;
    out.extra.rowCursor = h.rowCursor; out.extra.colCursor = h.cursor;
    out.extra.money = scene.money;
    out.readable = true;
  }
  // F4 party (8)
  else if (mode === 8) {
    out.family = 'F4';
    out.extra.optionsMode = h.optionsMode === true;
    out.extra.partyUiMode = h.partyUiMode;        // 1 === FAINT_SWITCH, i.e. forced
    out.extra.optionsScroll = h.optionsScroll === true;   // #4: setCursor unsafe while true
    if (h.optionsMode === true) {
      // #4 says "sort by y DESCENDING". Measured live, that is backwards: with descending
      // order, optionsCursor 1 pointed at "Pause Evolution" but ACTION opened SUMMARY.
      // ASCENDING y matches the cursor ("Apply" first, "Cancel" last). Labels are BBCode.
      var kids = __kids(h.optionsContainer).filter(function(k){ return typeof k.text === 'string'; });
      kids.sort(function(a,b){ return a.y - b.y; });
      out.options = kids.map(function(k,i){ return { i:i, label:__strip(k.text), raw:k.text, y:k.y }; });
      out.cursor = h.optionsCursor;
    } else {
      var party = scene.getPlayerParty ? scene.getPlayerParty() : [];
      out.options = party.map(function(p,i){
        return { i:i, label: p.name + ' Lv.' + p.level + ' ' + p.hp + '/' + p.getMaxHp() + (p.isFainted && p.isFainted() ? ' FNT' : '') };
      });
      out.options.push({ i: party.length, label: 'Cancel' });
      out.cursor = h.cursor;
    }
    out.readable = out.options.length > 0;
  }
  // F11 acknowledge-only: MESSAGE 0, EVOLUTION_SCENE 11, EGG_HATCH_SCENE 12, LOADING 35, ALERT_MODAL 47
  else if (mode === 0 || mode === 11 || mode === 12 || mode === 35 || mode === 47) {
    out.family = 'F11';
    out.options = [];
    out.extra.awaitingActionInput = h.awaitingActionInput === true;
    out.readable = true;
  }
  // F10 paged viewers: SUMMARY 9, GAME_STATS 26, POKEDEX_PAGE 31, RUN_INFO 41.
  // cursor is a PAGE index, not an option. ACTION is rejected; CANCEL is the only exit.
  else if (mode === 9 || mode === 26 || mode === 31 || mode === 41) {
    out.family = 'F10';
    out.cursor = h.cursor;
    out.extra.page = h.cursor;
    out.extra.exitWith = 'CANCEL';
    out.readable = true;
  }
  // F12 modal / form
  else if (Array.isArray(h.buttonLabels)) {
    out.family = 'F12';
    out.options = h.buttonLabels.map(function(b,i){ return { i:i, label: __txt(b) }; });
    out.extra.formLabels = (h.formLabels || []).map(__txt);
    out.extra.inputs = (h.inputs || []).map(function(x){ return x ? x.text : null; });
    out.cursor = null;
    out.readable = out.options.length > 0;
    out.extra.keyboardDrivable = false;
  }
  // F2 menu (16) — one \\n-joined text block
  else if (mode === 16) {
    out.family = 'F2';
    out.options = (__txt(h.optionSelectText) || '').split('\\n').map(function(t,i){ return { i:i, label:t }; });
    out.cursor = h.cursor;
    out.readable = out.options.length > 0;
  }
  // F3 mystery encounter (45)
  else if (mode === 45) {
    out.family = 'F3';
    out.options = __texts(h.optionsContainer).map(function(t,i){ return { i:i, label:t }; });
    out.cursor = h.cursor;
    out.readable = out.options.length > 0;
  }
  else {
    // degrade, never block
    out.family = 'unmapped';
    out.cursor = (typeof h.cursor === 'number') ? h.cursor : null;
    out.readable = false;
    out.extra.ownKeys = Object.keys(h).slice(0, 40);
  }
} catch (e) {
  out.readable = false;
  out.extra.error = String(e && e.message || e);
}
return out;
`;

// ------------------------------------------------------------ lean snapshot
export const SNAPSHOT = `
var L = __locate();
if (!L.ready) return { ok:false, why:L.why };
var scene = L.scene, b = scene.currentBattle || null;
var pk = function(p){ return p ? { name:p.name, lv:p.level, hp:p.hp + '/' + p.getMaxHp(),
    status: p.status ? p.status.effect : null, fainted: p.isFainted ? p.isFainted() : null } : null; };
return {
  ok: true,
  wave: b ? b.waveIndex : null,
  turn: b ? b.turn : null,
  battleType: b ? b.battleType : null,
  double: b ? b.double === true : null,
  biome: scene.arena ? scene.arena.biomeType : null,
  money: scene.money,
  gameSpeed: scene.gameSpeed,
  party: (scene.getPlayerParty ? scene.getPlayerParty() : []).map(pk),
  enemy: (scene.getEnemyField ? scene.getEnemyField() : []).map(pk),
  mode: scene.ui.mode
};
`;

// --------------------------------------------------------------------- press
export const press = n => `
var L = __locate();
if (!L.ready) return { ok:false, why:L.why };
return { ok:true, accepted: L.scene.ui.processInput(${n}) === true, mode: L.scene.ui.mode };
`;

export const setModeSpeed = n => `
var L = __locate();
if (!L.ready) return { ok:false, why:L.why };
var prev = L.scene.gameSpeed;
return { ok:true, gameSpeed: prev };
`;
