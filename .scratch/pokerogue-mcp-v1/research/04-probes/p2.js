(() => {
  const out = {};
  const pool = Phaser.Display.Canvas.CanvasPool.pool;
  const entry = pool.find(e => e.parent && e.parent.game);
  out.foundEntryIndex = pool.indexOf(entry);
  const game = entry.parent.game;
  out.gameCtor = game.constructor.name;
  out.gameVersion = game.config.gameVersion;
  out.isBooted = game.isBooted;
  out.isRunning = game.isRunning;
  out.rendererType = game.renderer ? game.renderer.constructor.name : null;
  out.gameCanvasIsDomCanvas = game.canvas === document.querySelector('canvas');
  out.sceneKeys = game.scene.scenes.map(s => s.sys.settings.key);
  out.sceneActive = game.scene.scenes.map(s => ({ key: s.sys.settings.key, active: s.sys.settings.active, visible: s.sys.settings.visible, status: s.sys.settings.status }));
  const battle = game.scene.getScene('battle');
  out.battleFound = !!battle;
  out.battleIsScenes0 = battle === game.scene.scenes[0];
  out.battleCtor = battle ? battle.constructor.name : null;
  if (battle) {
    out.hasUi = !!battle.ui;
    out.uiMode = battle.ui ? battle.ui.mode : null;
    out.uiModeChain = battle.ui ? battle.ui.modeChain : null;
    out.uiHandlersLen = battle.ui && battle.ui.handlers ? battle.ui.handlers.length : null;
    out.hasPhaseManager = !!battle.phaseManager;
    out.partyLen = battle.party ? battle.party.length : null;
    out.money = battle.money;
    out.currentBattleWave = battle.currentBattle ? battle.currentBattle.waveIndex : null;
    out.overlayActive = battle.ui ? battle.ui.overlayActive : null;
    // does the module singleton equal this scene? check via a known global-scene consumer if any
    out.battleKeysSample = Object.keys(battle).filter(k => /^(ui|party|currentBattle|money|score|gameData|arena|phaseManager|gameMode|trainer|pokeballCounts)$/.test(k)).sort();
  }
  out.gameInfo = window.gameInfo;
  return out;
})()
