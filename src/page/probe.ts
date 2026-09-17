import type { Discriminators } from "./disc.ts";
import type { ConsoleLine, Recorder } from "./errors.ts";
import type { Located, Unlocated } from "./locate.ts";

export type ProbeArgs = { pump?: boolean; tail?: boolean };

/** What every probe carries, located or not. `console` only with `tail: true`. */
type Always = { pumped: boolean; errorAt: number | null; console?: ConsoleLine[] };

export type ProbeResult = Always & (
  | { ready: false; why: string; frame: null; domMode: string | null }
  | {
      ready: true;
      settled: boolean;
      reason: string;
      mode: number;
      phaseName: string | null;
      wave: number | null;
      turn: number | null;
      money: number | null;
      runLive: boolean;
      tutorialActive: boolean;
      handler: string | null;
      cursor: number | null;
      modeChain: number[];
      messageText: string | null;
      onActionInput: boolean;
      awaitingActionInput: boolean;
      fine: string;
      frame: number | null;
      domMode: string | null;
      gameVersion: string | null;
      disc: Discriminators;
    }
);

/**
 * The settle predicate (#3, with #9's and #11's corrections) plus everything the settle loop, the Screen and the
 * progress fingerprint need, in one read. Every field is guarded; a missing path yields null, never a throw.
 *
 * `pump` runs one `game.loop.tick()` first when the loop's frame has not advanced since the previous probe, which is
 * what keeps a hidden tab's frozen loop moving for the driver's settles (§10.3). `errorAt` and `tail` come from the
 * page's error recorder, when one is installed. Self-contained (§10.5).
 */
export function probe(L: Located | Unlocated, args: ProbeArgs): ProbeResult {
  const g = globalThis as any;
  const __try = (f: () => any) => { try { return f(); } catch (e) { return null; } };
  const __txt = (o: any) => (o && typeof o.text === "string") ? o.text : null;
  const __domMode = () => { const el = g.document && g.document.getElementById("touchControls"); return el ? (el.dataset.uiMode || null) : null; };
  const rec: Recorder | undefined = g.__coachemonErrors;
  const always: Always = { pumped: false, errorAt: rec ? rec.at : null };
  if (args.tail === true) always.console = rec ? rec.lines.slice() : [];
  if (!L.ready) return { ready: false, why: L.why, frame: null, domMode: __domMode(), ...always };
  const { game, scene, ui } = L;

  const loop = game.loop || null;
  if (args.pump === true && loop && typeof loop.tick === "function" && typeof loop.frame === "number" && loop.frame === g.__coachemonFrame) {
    loop.tick();
    always.pumped = true;
  }
  g.__coachemonFrame = loop ? loop.frame : null;

  const pm = scene.phaseManager;
  const mode = ui.mode;
  const h = ui.handlers[mode] || null;
  const mh = ui.handlers[0] || null;
  const MESSAGE = 0, MODIFIER_SELECT = 6, SAVE_SLOT = 7, EVOLUTION_SCENE = 11, EGG_HATCH_SCENE = 12, LOADING = 35, UNAVAILABLE = 36, ALERT_MODAL = 47;

  const cur = pm ? (pm.currentPhase || null) : null;
  const phaseName = cur ? (cur.phaseName || null) : null;
  const awaiting = (x: any) => !!x && x.awaitingActionInput === true && x.onActionInput != null;
  const typing = (x: any) => !!x && !!x.textTimer && x.textTimer.hasDispatched !== true;

  let settled = false, reason;
  if (!pm)                                   { reason = "no-phase-manager"; }
  else if (ui.overlayActive === true)        { reason = "ui-transition"; }
  else if (!h || h.active !== true)          { reason = "handler-inactive"; }
  else if (h.blockInput === true)            { reason = "block-input"; }
  else if (h.blockInputOverlay === true)     { reason = "block-input-overlay"; }
  else if (h.transitioning === true)         { reason = "transitioning"; }
  else if (h.blockExit === true)             { reason = "block-exit"; }
  else if (h.pendingPrompt === true)         { reason = "pending-prompt"; }
  else if (typing(h) || typing(mh))          { reason = "text-animating"; }
  else if (mode === LOADING || mode === UNAVAILABLE) { reason = "modal-blocking"; }
  // An alert shown with a closeDelay is unclosable until it elapses; one shown without stays so forever (#15).
  // Busy, not a screen: a closable alert settles as ALERT_MODAL/CLOSABLE, a permanent one times out with its text.
  else if (mode === ALERT_MODAL && h.allowClosing !== true) { reason = "alert-unclosable"; }
  // Save slots resolve from the server one by one; until every hasData is a boolean the screen cannot be acted on.
  else if (mode === SAVE_SLOT && Array.isArray(h.sessionSlots) && h.sessionSlots.some((s: any) => typeof s.hasData !== "boolean")) { reason = "slots-loading"; }
  else if (mode === MESSAGE || mode === EVOLUTION_SCENE || mode === MODIFIER_SELECT) {
    settled = awaiting(h); reason = settled ? "awaiting-action" : "resolving";
  }
  else if (mode === EGG_HATCH_SCENE) { settled = awaiting(mh); reason = settled ? "awaiting-action" : "hatching"; }
  else { settled = true; reason = "menu-open"; }

  const battle = scene.currentBattle || null;
  const modeChain = Array.isArray(ui.modeChain) ? ui.modeChain.slice() : [];
  const messageText = __try(() => (mh && mh.message && typeof mh.message.text === "string") ? mh.message.text : null)
    || (mode === ALERT_MODAL ? __try(() => __txt(h.label)) : null);
  const cursor = h && typeof h.cursor === "number" ? h.cursor : null;

  return {
    ready: true, settled, reason, mode, phaseName,
    wave: battle ? battle.waveIndex : null,
    turn: battle ? battle.turn : null,
    money: __try(() => typeof scene.money === "number" ? scene.money : null),
    runLive: battle != null,
    tutorialActive: h ? h.tutorialActive === true : false,
    handler: h ? h.constructor.name : null,
    cursor, modeChain, messageText,
    onActionInput: h ? h.onActionInput != null : false,
    awaitingActionInput: h ? h.awaitingActionInput === true : false,
    fine: L.fine(),
    frame: loop ? loop.frame : null,
    domMode: __domMode(),
    gameVersion: game.config ? (game.config.gameVersion || null) : null,
    disc: L.disc(h),
    ...always,
  };
}
