// PROTOTYPE — throwaway. #19's extended stall probe: the settle predicate plus what drives
// ui.overlayActive. fadeOut sets it synchronously; only fadeIn clears it, reached through a
// 250 ms tween onComplete + a 100 ms scene.time.delayedCall — so log the loop, tweens, timers
// and page visibility alongside it.
//   node probe.mjs            one read-only sample, then another 1 s later
import { Cdp } from './lib.mjs';
import { PREDICATE } from './game.mjs';

export const PROBE = `
var base = (function(){ ${PREDICATE} })();
var L = __locate();
if (!L.ready) return { base: base };
var s = L.scene, ui = s.ui, g = L.game, ov = ui.overlay;
var tw = null, twOv = null, timers = null;
try { tw = s.tweens.getTweens().length; } catch(e) { tw = 'err'; }
try { twOv = s.tweens.getTweensOf(ov).map(function(t){ return { st: t.state, prog: +t.progress.toFixed(3), paused: t.paused === true }; }); } catch(e) { twOv = 'err'; }
try { timers = (s.time._active ? s.time._active.length : -1) + '+' + (s.time._pendingInsertion ? s.time._pendingInsertion.length : -1); } catch(e) { timers = 'err'; }
return {
  base: base,
  oa: ui.overlayActive, ovAlpha: ov ? +ov.alpha.toFixed(3) : null, ovVis: ov ? ov.visible : null,
  tw: tw, twOv: twOv, timers: timers,
  tweensPaused: s.tweens.paused === true, timePaused: s.time.paused === true, timeScale: s.time.timeScale,
  frame: g.loop.frame, loopRunning: g.loop.running, loopSleeping: g.loop.sleeping === true, delta: +(g.loop.delta || 0).toFixed(1),
  sceneStatus: s.sys.settings.status,
  vis: document.visibilityState, focus: document.hasFocus(),
  modeChain: ui.modeChain.join('.'), gameSpeed: s.gameSpeed,
  partyUiMode: ui.handlers[8].partyUiMode, optionsMode: ui.handlers[8].optionsMode === true,
  now: Math.round(performance.now())
};`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const cdp = await new Cdp().connect();
  console.log(JSON.stringify(await cdp.evalIn(PROBE)));
  await new Promise(r => setTimeout(r, 1000));
  console.log(JSON.stringify(await cdp.evalIn(PROBE)));
  cdp.ws.close();
}
