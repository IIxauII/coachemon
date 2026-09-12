(() => {
  const pool = Phaser.Display.Canvas.CanvasPool.pool;
  const keys = {};
  let withScene = 0, distinctScenes = new Set();
  for (const c of pool) {
    const s = c && c.parent && c.parent.scene;
    if (!s) continue;
    withScene++;
    distinctScenes.add(s);
    const k = s.sys && s.sys.settings ? s.sys.settings.key : '(no sys)';
    keys[k] = (keys[k] || 0) + 1;
  }
  return {
    poolLength: pool.length,
    entriesWithParentScene: withScene,
    sceneKeyHistogram: keys,
    distinctSceneObjects: distinctScenes.size,
    allSameScene: distinctScenes.size === 1,
  };
})()
