(() => {
  const isGame = g => !!g && typeof g === 'object'
    && 'isBooted' in g && g.scene && Array.isArray(g.scene.scenes) && g.textures && g.loop;
  let game = null;
  const P = globalThis.Phaser;
  if (!P?.Display?.Canvas?.CanvasPool) return { ready: false, why: 'no-phaser' };
  const pool = P.Display.Canvas.CanvasPool.pool;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i] && pool[i].parent; if (!p || typeof p !== 'object') continue;
    for (const c of [p, p.game, p.scene && p.scene.game, p.manager && p.manager.game, p.renderer && p.renderer.game]) { if (isGame(c)) { game = c; break; } }
    if (game) break;
  }
  if (!game) return { ready: false, why: 'no-game' };
  const scene = game.scene.getScene('battle');
  if (!scene || !scene.ui) return { ready: false, why: 'no-scene' };
  const ui = scene.ui;
  const h = ui.getHandler();
  return {
    ready: true,
    version: game.config.gameVersion,
    mode: ui.mode,
    handler: h.constructor.name,
    domUiMode: document.getElementById('touchControls')?.dataset?.uiMode ?? null,
    wave: scene.currentBattle ? scene.currentBattle.waveIndex : null,
    handlerKeys: Object.keys(h).sort(),
  };
})()
