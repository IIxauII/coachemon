// PROTOTYPE (#161) — MAIN world. Answers each relayed command with a live read of the page,
// proving the command reached page code, not just the content script.
(() => {
  const findGame = () => {
    try { return Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p?.game)?.game ?? null; } catch { return null; }
  };
  window.addEventListener("message", e => {
    if (e.source !== window || e.data?.source !== "probe161-iso" || e.data.tag !== CONFIG.tag) return;
    const game = findGame();
    window.postMessage({
      source: "probe161-main", tag: CONFIG.tag, id: e.data.id,
      typeofPhaser: typeof window.Phaser, frame: game?.loop?.frame ?? null, hidden: document.hidden,
    }, "*");
  });
})();
