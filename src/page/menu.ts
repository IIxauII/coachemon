import type { Discriminators } from "./disc.ts";
import type { Located } from "./locate.ts";

export type MenuOption = {
  i: number | string;
  label: string | null;
  /** The plain name under a decorated label (CONTEXT.md, `Option`). */
  name?: string | null;
  [k: string]: unknown;
};

export type MenuResult =
  | {
      readable: boolean;
      why?: string;
      mode: number;
      handler: string;
      family: string | null;
      options: MenuOption[];
      cursor: number | string | null;
      text: string | null;
      /** A handler's own message box waits for ACTION and swallows every cursor press (#44). */
      messagePending: boolean;
      extra: Record<string, unknown>;
      disc: Discriminators;
    }
  | { readable: false; why: "no-handler"; mode: number; disc?: undefined };

/**
 * The families of v1-tool-surface.md §7. `extra` never copies a discriminator: the adapter reads them off `disc`. A
 * modal's typed form text never leaves the page (extension-distribution.md §6). Self-contained (§10.5).
 */
export function menu(L: Located, _args: Record<string, never>): MenuResult {
  const __txt = (o: any) => (o && typeof o.text === "string") ? o.text : null;
  const __kids = (c: any): any[] => (c && Array.isArray(c.list)) ? c.list : [];
  const __texts = (c: any): string[] => __kids(c).map(__txt).filter((t: string | null) => t !== null);
  const __strip = (s: any) => typeof s === "string" ? s.replace(/\[\/?[^\]]*\]/g, "").trim() : s;
  const __try = (f: () => any) => { try { return f(); } catch (e) { return null; } };
  const { m, sm } = L;
  const { scene, ui } = L;
  const mode = ui.mode;
  const h = ui.handlers[mode];
  if (!h) return { readable: false, why: "no-handler", mode };
  const disc = L.disc(h);
  const out: Extract<MenuResult, { handler: string }> = { mode, handler: h.constructor.name, family: null, options: [], cursor: null, readable: false, text: null, messagePending: false, extra: {}, disc };
  const mh = ui.handlers[m.MESSAGE];
  out.text = __try(() => (mh && mh.message && typeof mh.message.text === "string") ? mh.message.text : null);
  const opt = (i: number | string, label: string | null, more?: Record<string, unknown>): MenuOption => Object.assign({ i, label }, more || {});
  // A trainer battle refuses every ball (#56, game-code.md §20).
  const catchable = () => __try(() => !scene.currentBattle.trainer);

  try {
    if (h.config && Array.isArray(h.config.options)) {
      out.family = "option_select";
      out.options = h.config.options.map((o: any, i: number) => opt(i, __strip(o.label), { skip: o.skip === true }));
      out.cursor = typeof h.fullCursor === "number" ? h.fullCursor : h.cursor;
      out.extra.unskippedIndices = Array.isArray(h.unskippedIndices) ? h.unskippedIndices.slice() : null;
      const unskipped = out.extra.unskippedIndices as number[] | null;
      out.extra.selectedIndex = unskipped && typeof unskipped[out.cursor as number] === "number" ? unskipped[out.cursor as number] : out.cursor;
      out.readable = out.options.length > 0;
    } else if (mode === m.COMMAND) {
      out.family = "command";
      out.options = __texts(h.commandsContainer).map((t, i) => opt(i, t));
      out.cursor = h.getCursor ? h.getCursor() : h.cursor;
      out.extra.fieldIndex = h.fieldIndex || 0;
      out.extra.catchable = catchable();
      out.readable = out.options.length > 0;
    } else if (mode === m.FIGHT) {
      out.family = "fight";
      out.options = __texts(h.movesContainer).map((t, i) => opt(i, t));
      out.cursor = h.getCursor ? h.getCursor() : h.cursor;
      out.extra.fieldIndex = h.fieldIndex || 0;
      const pk = __try(() => scene.getPlayerField()[h.fieldIndex || 0]);
      const ms = __try(() => pk.getMoveset());
      if (ms) out.extra.moves = ms.map((m: any) => m ? __try(() => {
        const mv = m.getMove ? m.getMove() : null;
        return { name: m.getName(), pp: m.getMovePp() - m.ppUsed, maxPp: m.getMovePp(), power: mv ? mv.power : null, category: mv ? mv.category : null, type: mv ? mv.type : null };
      }) : null);
      out.readable = out.options.length > 0;
    } else if (mode === m.BALL) {
      out.family = "ball";
      // One text of names, a line per `pokeballCounts` key then Cancel, beside `countsText` (#46, game-code.md §20).
      const names = __kids(h.pokeballSelectContainer).find((k: any) => k !== h.countsText && typeof k.text === "string" && k.text.indexOf("\n") > -1);
      const lines: string[] = names ? names.text.split("\n").map(__strip) : [];
      const counts = Object.entries(scene.pokeballCounts || {});
      out.options = counts.map(([type, c], i) => {
        const name = lines[i] || null;
        return opt(i, (name ? name + " " : "") + "×" + c, { name, ballType: Number(type), count: c });
      });
      if (lines.length > counts.length) out.options.push(opt(counts.length, lines[counts.length]));
      out.cursor = h.cursor;
      out.extra.catchable = catchable();
      out.readable = out.options.length > 0;
    } else if (mode === m.TARGET_SELECT) {
      out.family = "target_select";
      const field = __try(() => scene.getField()) || [];
      out.options = (h.targets || []).map((bi: number) => {
        const p = field[bi];
        return opt(bi, p ? p.name : ("slot " + bi), { battlerIndex: bi, hp: p ? p.hp : null, maxHp: p ? __try(() => p.getMaxHp()) : null, level: p ? p.level : null });
      });
      out.cursor = h.cursor;
      out.extra.isMultipleTargets = h.isMultipleTargets === true;
      out.readable = out.options.length > 0;
    } else if (mode === m.MODIFIER_SELECT) {
      out.family = "modifier_select";
      const rows: { row: number; kind: string; items: { col: number; label: string | null; cost?: unknown; desc?: string | null }[] }[] = [];
      // Row 0's labels are the game's own text, never hardcoded (v1-tool-surface.md §7, §10).
      const btn = (c: any, col: number) => ({ col, label: __strip(__texts(c)[0]) || null, visible: !!(c && c.visible) });
      const buttons = [btn(h.rerollButtonContainer, 0), btn(h.transferButtonContainer, 1), btn(h.checkButtonContainer, 2), btn(h.lockRarityButtonContainer, 3)];
      if (h.continueButtonContainer && h.continueButtonContainer.visible) buttons.push(btn(h.continueButtonContainer, 4));
      rows.push({ row: 0, kind: "buttons", items: buttons.filter(b => b.visible && b.label) });
      const item = (o: any, col: number) => ({ col, label: __try(() => o.modifierTypeOption.type.name), cost: __try(() => o.modifierTypeOption.cost), desc: __try(() => o.modifierTypeOption.type.getDescription()) });
      rows.push({ row: 1, kind: "reward", items: (h.options || []).map(item) });
      const shop = h.shopOptionsRows || [];
      for (let r = 0; r < shop.length; r++) {
        // Shop rows are indexed backwards (v1-tool-surface.md §7).
        rows.push({ row: 2 + r, kind: "shop", items: (shop[shop.length - 1 - r] || []).map(item) });
      }
      out.extra.rows = rows;
      out.options = rows.flatMap(r => r.items.map(it => opt(r.row + ":" + it.col, it.label, { row: r.row, col: it.col, cost: it.cost === undefined ? null : it.cost, kind: r.kind, desc: it.desc === undefined ? null : it.desc })));
      out.cursor = h.rowCursor + ":" + h.cursor;
      out.extra.rowCursor = h.rowCursor; out.extra.colCursor = h.cursor;
      out.extra.money = scene.money;
      out.extra.rerollCost = __try(() => h.rerollCost);
      out.readable = true;
    } else if (mode === m.SAVE_SLOT) {
      out.family = "save_slot";
      // `hasData` is undefined until the slot's server fetch resolves (v1-tool-surface.md §10).
      out.options = (h.sessionSlots || []).map((s: any, i: number) => opt(i, "Slot " + (i + 1), { hasData: s.hasData === true ? true : s.hasData === false ? false : null, wave: __try(() => s.saveData ? s.saveData.waveIndex : null), gameMode: __try(() => s.saveData ? s.saveData.gameMode : null) }));
      out.cursor = (h.cursor || 0) + (h.scrollCursor || 0);
      out.readable = out.options.length > 0;
    } else if (mode === m.PARTY) {
      out.family = "party";
      out.extra.optionsScroll = h.optionsScroll === true;
      if (h.awaitingActionInput === true && h.onActionInput != null) {
        // The handler's own message takes ACTION and CANCEL only; its text is on `h.message` (#44, game-code.md §25).
        out.options = [];
        out.text = __try(() => __txt(h.message));
        out.messagePending = true;
        out.cursor = disc.optionsMode ? h.optionsCursor : h.cursor;
      } else if (disc.optionsMode) {
        // Sorted by `y` ascending; descending selects the wrong option (#6, v1-tool-surface.md §7).
        const kids = __kids(h.optionsContainer).filter((k: any) => typeof k.text === "string");
        kids.sort((a: any, b: any) => a.y - b.y);
        out.options = kids.map((k: any, i: number) => opt(i, __strip(k.text)));
        out.cursor = h.optionsCursor;
      } else {
        // Cancel is the fixed cursor 6, not `party.length` (v1-tool-surface.md §10).
        const party = __try(() => scene.getPlayerParty()) || [];
        out.options = party.map((p: any, i: number) => opt(i, p.name, { level: p.level, hp: p.hp, maxHp: __try(() => p.getMaxHp()), fainted: __try(() => p.isFainted()), active: __try(() => p.isActive(true)) }));
        out.options.push(opt(6, "Cancel", { synthetic: true }));
        if (__try(() => h.isItemManageMode()) === true) out.options.push(opt(7, __try(() => __texts(h.partyDiscardModeButton || h.partyTransferModeButton)[0]) || "Toggle", { synthetic: true }));
        out.cursor = h.cursor;
      }
      out.readable = out.options.length > 0 || out.messagePending;
    } else if (mode === m.STARTER_SELECT) {
      out.family = "starter_select";
      const gd = scene.gameData;
      const grid = h.filteredStarterContainers || [];
      out.options = grid.map((c: any, i: number) => opt(i, __try(() => c.species.name), { cost: __try(() => gd.getSpeciesStarterValue(c.species.speciesId)) }));
      out.cursor = h.cursor;
      out.extra.scrollCursor = h.scrollCursor;
      const party = (h.starterSpecies || []).map((s: any) => ({ name: s.name, cost: __try(() => gd.getSpeciesStarterValue(s.speciesId)) }));
      out.extra.party = party;
      out.extra.partyValue = party.reduce((t: number, s: any) => t + (s.cost || 0), 0);
      out.extra.valueLimit = __try(() => h.getValueLimit());
      out.extra.partyValid = __try(() => h.isPartyValid());
      out.readable = out.options.length > 0;
    } else if (mode === m.MESSAGE || mode === m.EVOLUTION_SCENE || mode === m.EGG_HATCH_SCENE || mode === m.EGG_HATCH_SUMMARY || mode === m.LOADING || mode === m.UNAVAILABLE || mode === m.ALERT_MODAL) {
      out.family = "acknowledge";
      out.options = [];
      out.extra.awaitingActionInput = h.awaitingActionInput === true && h.onActionInput != null;
      if (mode === m.ALERT_MODAL) out.text = __try(() => __txt(h.label)) || out.text;
      out.readable = true;
    } else if (mode === m.SUMMARY && disc.summaryUiMode === sm.LEARN_MOVE) {
      // The row cursor is `moveCursor`; `cursor` is the page (v1-tool-surface.md §7).
      out.family = "learn_move";
      const pk = h.pokemon;
      const ms = __try(() => pk.getMoveset()) || [];
      const pp = (m: any) => __try(() => ({ pp: m.getMovePp() - m.ppUsed, maxPp: m.getMovePp() })) || {};
      out.options = ms.map((m: any, i: number) => opt(i, __try(() => m.getName()), Object.assign({ forget: true }, pp(m))));
      const nm = h.newMove;
      if (nm) out.options.push(opt(4, __try(() => nm.name), { forget: false, new: true, pp: nm.pp, maxPp: nm.pp }));
      out.cursor = h.moveSelect === true ? h.moveCursor : null;
      out.extra.moveSelect = h.moveSelect === true;
      out.extra.page = h.cursor;
      out.extra.pokemon = __try(() => pk.name);
      out.extra.newMove = __try(() => nm.name);
      if (h.moveSelect !== true) out.options = [];
      out.readable = true;
    } else if (mode === m.SUMMARY || mode === m.GAME_STATS || mode === m.POKEDEX_PAGE || mode === m.RUN_INFO) {
      out.family = "paged_viewer";
      out.cursor = h.cursor;
      out.extra.page = h.cursor;
      out.readable = true;
    } else if (Array.isArray(h.buttonLabels)) {
      out.family = "modal";
      out.options = h.buttonLabels.map((b: any, i: number) => opt(i, __strip(__txt(b))));
      out.text = __try(() => __txt(h.titleText)) || out.text;
      out.extra.formLabels = (h.formLabels || []).map(__txt);
      out.cursor = null;
      out.readable = out.options.length > 0;
    } else if (mode === m.MENU) {
      out.family = "menu";
      out.options = (__txt(h.optionSelectText) || "").split("\n").map((t: string, i: number) => opt(i, t));
      out.cursor = h.cursor;
      out.readable = out.options.length > 0;
    } else if (mode === m.MYSTERY_ENCOUNTER) {
      out.family = "mystery_encounter";
      out.options = __texts(h.optionsContainer).map((t, i) => opt(i, __strip(t)));
      out.cursor = h.cursor;
      out.readable = out.options.length > 0;
    } else {
      out.family = "unmapped";
      out.cursor = typeof h.cursor === "number" ? h.cursor : null;
      out.readable = false;
      out.extra.ownKeys = Object.keys(h).slice(0, 40);
      out.extra.texts = __try(() => __texts(h.getUi ? h.getUi() : null)).slice(0, 20);
    }
  } catch (e: any) {
    out.readable = false;
    out.extra.error = String(e && e.message || e);
  }
  return out;
}
