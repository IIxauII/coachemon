(() => {
  const pool = Phaser.Display.Canvas.CanvasPool.pool;
  let game = null; for (let i=0;i<pool.length;i++){const p=pool[i]&&pool[i].parent; if(p&&p.game&&p.game.scene){game=p.game;break;}}
  const s = game.scene.getScene('battle'), ui = s.ui, pm = s.phaseManager;
  const probe = (o, name) => ({ has: name in o, type: typeof o[name], val: (typeof o[name] === 'object' && o[name] !== null) ? (Array.isArray(o[name]) ? 'array len ' + o[name].length : o[name].constructor.name) : o[name] });
  return {
    ui_overlayActive: probe(ui, 'overlayActive'),
    ui_keys_overlay: Object.keys(ui).filter(k => /overlay/i.test(k)),
    ui_mode: ui.mode, ui_modeChain: ui.modeChain,
    pm_ctor: pm.constructor.name,
    pm_phaseQueue: probe(pm, 'phaseQueue'),
    pm_keys: Object.keys(pm),
    pm_proto_methods: Object.getOwnPropertyNames(Object.getPrototypeOf(pm)).filter(n => /queue|phase/i.test(n)).slice(0, 40),
    // guard test: does the locator return not-ready when Phaser is absent?
    guardNoPhaser: (() => { const fake = undefined; const P = fake; if (!P || !P.Display) return { ready: false, why: 'no-phaser' }; return 'unreachable'; })(),
  };
})()
