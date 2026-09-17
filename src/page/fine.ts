import type { Page, Scene } from "./locate.ts";
import type { PageModes } from "./modes.ts";

/**
 * The fine fingerprint: the settle loop's "has the game stopped moving" (#14: within-press, timing axis). `probe`
 * reports it, and every act recomputes it in the same page turn before acting (§10.2). Self-contained (§10.5).
 */
export function fine(L: Scene, modes: PageModes): string {
  const __try = (f: () => Page) => { try { return f(); } catch (e) { return null; } };
  const __txt = (o: Page) => (o && typeof o.text === "string") ? o.text : null;
  const m = modes.m;
  const { scene, ui } = L;
  const pm = scene.phaseManager;
  const mode = ui.mode;
  const h = ui.handlers[mode] || null;
  const mh = ui.handlers[m.MESSAGE] || null;
  const cur = pm ? (pm.currentPhase || null) : null;
  const phaseName = cur ? (cur.phaseName || null) : null;
  const awaiting = (x: Page) => !!x && x.awaitingActionInput === true && x.onActionInput != null;
  const typing = (x: Page) => !!x && !!x.textTimer && x.textTimer.hasDispatched !== true;
  const battle = scene.currentBattle || null;
  const modeChain = Array.isArray(ui.modeChain) ? ui.modeChain.slice() : [];
  const messageText = __try(() => (mh && mh.message && typeof mh.message.text === "string") ? mh.message.text : null)
    || (mode === m.ALERT_MODAL ? __try(() => __txt(h.label)) : null);
  const cursor = h && typeof h.cursor === "number" ? h.cursor : null;
  return [
    phaseName, mode, modeChain.join("."), cursor,
    h && typeof h.optionsCursor === "number" ? h.optionsCursor : "",
    h && typeof h.rowCursor === "number" ? h.rowCursor : "",
    h && typeof h.scrollCursor === "number" ? h.scrollCursor : "",
    h && typeof h.fullCursor === "number" ? h.fullCursor : "",
    // SUMMARY's move-list row: without it a row press reads as unmoved (#32).
    h && typeof h.moveCursor === "number" ? h.moveCursor : "",
    messageText,
    // The level-up stats window: its presses swap increments for totals, then close it, under an unchanged message (#55).
    __try(() => mh.levelUpStatsContainer.visible ? (mh.levelUpStatsIncrContent.visible ? "incr" : "total") : "") ?? "",
    ui.overlayActive === true ? 1 : 0, h && h.active === true ? 1 : 0,
    awaiting(h) ? 1 : 0, typing(h) || typing(mh) ? 1 : 0,
    battle ? battle.waveIndex : "", battle ? battle.turn : "",
  ].join("|");
}
