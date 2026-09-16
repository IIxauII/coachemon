// Declared world: MAIN. Records what world it actually landed in and whether it reaches the live game.
(() => {
  const t0 = Date.now();
  const env = () => ({
    typeofPhaser: typeof window.Phaser,
    typeofBrowser: typeof globalThis.browser,
    typeofChrome: typeof globalThis.chrome,
    typeofChromeRuntimeId: typeof globalThis.chrome?.runtime?.id,
    hasWrappedJSObject: "wrappedJSObject" in window,
  });
  const findGame = () => {
    try { return Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p?.game)?.game ?? null; } catch { return null; }
  };
  const keyProbe = () => {
    // F24 (keyCode 135) is unmapped in PokeRogue, so dispatching it moves nothing.
    let seen = null;
    const l = e => { if (e.code === "F24") seen = { keyCode: e.keyCode, isTrusted: e.isTrusted }; };
    window.addEventListener("keydown", l, true);
    try { window.dispatchEvent(new KeyboardEvent("keydown", { key: "F24", code: "F24", keyCode: 135, which: 135, bubbles: true })); }
    catch (err) { seen = { error: String(err) }; }
    window.removeEventListener("keydown", l, true);
    return seen;
  };
  const report = res => {
    document.documentElement.dataset.probeMain = JSON.stringify(res);
    window.postMessage({ source: "probe-main", res }, "*");
  };
  const tick = () => {
    const game = findGame();
    const elapsed = Date.now() - t0;
    if (!game && elapsed < 30000) return setTimeout(tick, 500);
    const res = { script: "main.js", declaredWorld: "MAIN", ua: navigator.userAgent, elapsedMs: elapsed, env: env() };
    if (game) {
      const f1 = game.loop?.frame;
      const scene = game.scene?.getScene?.("battle");
      res.game = {
        phaserVersion: Phaser.VERSION,
        battleScene: !!scene,
        sceneKeys: game.scene?.scenes?.map(s => s.sys?.settings?.key),
        uiMode: (() => { try { return scene?.ui?.getMode?.(); } catch (e) { return "err: " + e; } })(),
        waveIndex: (() => { try { return scene?.currentBattle?.waveIndex ?? null; } catch { return null; } })(),
      };
      res.key = keyProbe();
      setTimeout(() => { res.game.frameAdvanced = game.loop?.frame > f1; report(res); }, 1000);
    } else {
      res.game = null;
      res.key = keyProbe();
      report(res);
    }
  };
  report({ script: "main.js", stage: "loaded", env: env(), ua: navigator.userAgent });
  tick();
})();
