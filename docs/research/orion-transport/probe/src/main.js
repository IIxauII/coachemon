// PROTOTYPE (#150) — MAIN world. Answers each relayed command with a live read of the game,
// proving the command reached page code, not just the content script.
(() => {
  const findGame = () => {
    try { return Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p?.game)?.game ?? null; } catch { return null; }
  };
  window.addEventListener("message", e => {
    if (e.source !== window || e.data?.source !== "probe150-iso") return;
    const game = findGame();
    const scene = game?.scene?.getScene?.("battle");
    let uiMode = null, wave = null;
    try { uiMode = scene?.ui?.getMode?.() ?? null; wave = scene?.currentBattle?.waveIndex ?? null; } catch {}
    window.postMessage({
      source: "probe150-main", id: e.data.id,
      typeofPhaser: typeof window.Phaser, typeofBrowser: typeof globalThis.browser,
      frame: game?.loop?.frame ?? null, uiMode, wave, hidden: document.hidden,
    }, "*");
  });
})();
