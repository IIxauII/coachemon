// PROTOTYPE (#174) — MAIN world. Answers named ops relayed from the isolated content script: reads the live
// game, replays the #23 fade chain, and installs one candidate fix at a time for a game loop frozen by a hidden page.
// No CDP anywhere: this is the extension-shape route the server will have after the migration.
(() => {
  const findGame = () => {
    try { return Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p?.game)?.game ?? null; } catch { return null; }
  };
  const battle = g => g?.scene?.getScene("battle") ?? null;

  // Mechanism counters, installed once: raw rAF callbacks and a 50 ms page timer.
  const counters = { raf: 0, timer: 0, workerMsgs: 0, pumps: 0, workerTicks: 0 };
  (function f() { counters.raf++; requestAnimationFrame(f); })();
  setInterval(() => { counters.timer++; }, 50);

  // ---- candidate fixes ------------------------------------------------------------
  let fix = { name: "none", uninstall() {} };
  let lastPollFrame = null;

  const FIXES = {
    none: () => ({ uninstall() {} }),
    // Every read (one server poll) steps the loop once if no frame ran since the previous read.
    pump: () => ({ uninstall() {}, onRead(g) {
      if (lastPollFrame !== null && g.loop.frame === lastPollFrame) { g.loop.tick(); counters.pumps++; return true; }
      return false;
    } }),
    // A dedicated worker posts every 16 ms; the page steps the loop when no frame has run for 50 ms.
    worker: g => {
      const url = URL.createObjectURL(new Blob(["setInterval(() => postMessage(0), 16);"], { type: "text/javascript" }));
      const w = new Worker(url);
      let seenFrame = g.loop.frame, seenAt = performance.now();
      w.onmessage = () => {
        counters.workerMsgs++;
        const now = performance.now();
        if (g.loop.frame !== seenFrame) { seenFrame = g.loop.frame; seenAt = now; return; }
        if (now - seenAt > 50) { g.loop.tick(); counters.workerTicks++; seenFrame = g.loop.frame; seenAt = now; }
      };
      return { uninstall() { w.terminate(); URL.revokeObjectURL(url); } };
    },
    // Phaser's own forceSetTimeOut, applied after boot by restarting the RAF shim on setTimeout.
    timeout: g => {
      const rebind = force => { g.loop.raf.stop(); g.loop.raf.start(g.loop.step.bind(g.loop), force, g.loop._target); };
      rebind(true);
      return { uninstall() { rebind(false); } };
    },
    // forceSetTimeOut with the game muted: the silent-tab worst case for timer throttling.
    "timeout-muted": g => {
      const t = FIXES.timeout(g), was = g.sound.mute;
      g.sound.mute = true;
      return { uninstall() { g.sound.mute = was; t.uninstall(); } };
    },
    // As timeout-muted, plus a near-silent oscillator: does an "audible" page escape timer throttling?
    audio: g => {
      const t = FIXES["timeout-muted"](g);
      const ctx = new AudioContext();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      gain.gain.value = 0.001;
      osc.frequency.value = 40;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      ctx.resume().catch(() => {});
      return { ctx, uninstall() { osc.stop(); ctx.close(); t.uninstall(); } };
    },
  };

  const read = g => {
    const s = battle(g), ui = s?.ui;
    const pumped = fix.onRead ? fix.onRead(g) : false;
    lastPollFrame = g.loop.frame;
    let playing = null;
    try { playing = g.sound.sounds.filter(x => x.isPlaying).length; } catch {}
    return {
      frame: g.loop.frame, clock: s?.time?.now ?? null, oa: ui?.overlayActive === true, mode: ui?.mode ?? null,
      hidden: document.hidden, vis: document.visibilityState, focus: document.hasFocus(), inFocus: g.loop.inFocus,
      t: performance.now(), wall: Date.now(), setTimeOut: g.loop.raf.isSetTimeOut, fix: fix.name, pumped,
      audio: g.sound.context?.state ?? null, mute: g.sound.mute, fixAudio: fix.ctx?.state ?? null, soundsPlaying: playing, ...counters,
    };
  };

  const ops = {
    info: g => ({
      phaser: Phaser.VERSION, ua: navigator.userAgent, targetFps: g.loop.targetFps, minFps: g.loop.minFps, smoothStep: g.loop.smoothStep,
      forceSetTimeOut: g.loop.forceSetTimeOut, pauseOnBlur: g.sound.pauseOnBlur, mute: g.sound.mute, volume: g.sound.volume,
      renderer: g.renderer?.type, hasBattle: !!battle(g), mode: battle(g)?.ui?.mode ?? null,
      onHidden: String(g.onHidden).replace(/\s+/g, " ").slice(0, 120), pause: String(g.loop.pause).replace(/\s+/g, " ").slice(0, 120),
    }),
    read,
    fade: g => {
      const s = battle(g), ui = s.ui;
      if (ui.overlayActive) return { started: false, why: "overlay already active" };
      ui.fadeOut(250).then(() => { s.time.delayedCall(100, () => { ui.fadeIn(250); }); });
      return { started: true, oa: ui.overlayActive === true };
    },
    fix: (g, args) => {
      fix.uninstall();
      fix = { name: "none", uninstall() {} };
      lastPollFrame = null;
      const made = FIXES[args.name](g);
      fix = { name: args.name, ...made };
      return { fix: fix.name };
    },
  };

  window.addEventListener("message", e => {
    if (e.source !== window || e.data?.source !== "probe174-iso") return;
    const { id, op, args } = e.data;
    let reply;
    try {
      const g = findGame();
      reply = g ? { ok: ops[op](g, args ?? {}) } : { error: "no game" };
    } catch (err) { reply = { error: String(err?.stack ?? err).slice(0, 400) }; }
    window.postMessage({ source: "probe174-main", id, ...reply }, "*");
  });
})();
