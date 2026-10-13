(() => {
  const root = document.documentElement;
  if (root.dataset.coachOut) return;
  const game = Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game;
  const s = game.scene.getScene("battle");
  const gd = s.gameData;
  const big = (k, v) => typeof v === "bigint" ? v.toString() : v;
  gd.getSession(s.sessionSlotId).then(sess => {
    root.dataset.coachOut = JSON.stringify({
      slot: s.sessionSlotId, gameVersion: game.config.gameVersion,
      battleSeed: s.currentBattle.battleSeed, turn: s.currentBattle.turn, wave: s.currentBattle.waveIndex,
      phase: s.phaseManager.getCurrentPhase()?.constructor?.name,
      save: JSON.stringify(sess, big),
      live: JSON.stringify(gd.getSessionSaveData(), big),
    });
  }, e => { root.dataset.coachOut = JSON.stringify({ error: String(e) }); });
})();
