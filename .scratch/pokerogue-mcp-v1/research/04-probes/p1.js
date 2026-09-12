(() => {
  const out = {};
  out.url = location.href;
  out.hasPhaser = typeof Phaser !== 'undefined';
  out.phaserVersion = typeof Phaser !== 'undefined' ? Phaser.VERSION : null;
  out.phaserTopKeys = typeof Phaser !== 'undefined' ? Object.keys(Phaser).sort() : null;
  out.phaserGAMES = typeof Phaser !== 'undefined' ? (('GAMES' in Phaser) ? (Array.isArray(Phaser.GAMES) ? 'array len ' + Phaser.GAMES.length : typeof Phaser.GAMES) : 'ABSENT') : null;
  // CanvasPool
  try {
    const cp = Phaser.Display.Canvas.CanvasPool;
    out.canvasPool = { exists: !!cp, keys: Object.keys(cp) };
    const pool = cp.pool ?? (cp.total !== undefined ? 'total=' + cp.total : undefined);
    out.poolIsArray = Array.isArray(cp.pool);
    if (Array.isArray(cp.pool)) {
      out.poolLength = cp.pool.length;
      out.poolEntries = cp.pool.map((e, i) => ({
        i,
        keys: Object.keys(e),
        parentCtor: e.parent && e.parent.constructor ? e.parent.constructor.name : String(e.parent),
        parentHasGame: !!(e.parent && e.parent.game),
        parentGameCtor: e.parent && e.parent.game && e.parent.game.constructor ? e.parent.game.constructor.name : null,
        canvasTag: e.canvas ? e.canvas.tagName : null,
        canvasW: e.canvas ? e.canvas.width : null,
        canvasH: e.canvas ? e.canvas.height : null,
        inDom: e.canvas ? document.contains(e.canvas) : null,
        type: e.type,
      }));
    }
  } catch (err) { out.canvasPoolError = String(err); }
  // canvases in the DOM
  out.domCanvases = [...document.querySelectorAll('canvas')].map(c => ({
    w: c.width, h: c.height, id: c.id, cls: c.className,
    ownProps: Object.keys(c).filter(k => !(k in HTMLCanvasElement.prototype)),
  }));
  out.windowKeyCount = Object.keys(window).length;
  out.gameInfoPresent = typeof window.gameInfo !== 'undefined';
  out.windowSuspects = Object.keys(window).filter(k => /game|scene|phaser|battle|rogue|ui|debug/i.test(k));
  return out;
})()
