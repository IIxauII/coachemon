const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find(t => t.type === 'page' && t.url.includes('pokerogue.net'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
await new Promise(r => ws.addEventListener('open', r));
const ev = (expression) => send('Runtime.evaluate', { expression, returnByValue: true });
const val = async (e) => { const r = await ev(e); return r.exceptionDetails ? 'EXC: ' + (r.exceptionDetails.exception?.description||'').split('\n')[0] : r.result.value; };
const stats = (ts) => { const s=[...ts].sort((a,b)=>a-b); const p=q=>s[Math.min(s.length-1,Math.floor(q*s.length))]; return `min ${s[0].toFixed(2)} p50 ${p(0.5).toFixed(2)} p90 ${p(0.9).toFixed(2)} max ${s[s.length-1].toFixed(2)}`; };
const timeIt = async (n, fn) => { const ts=[]; let last; for(let i=0;i<n;i++){const t0=process.hrtime.bigint(); last=await fn(); ts.push(Number(process.hrtime.bigint()-t0)/1e6);} return {s:stats(ts),last}; };

// The proposed production locator: layered, guarded, never throws.
const LOCATOR = `(() => {
  const P = globalThis.Phaser;
  if (!P || !P.Display || !P.Display.Canvas || !P.Display.Canvas.CanvasPool) return { ready: false, why: 'no-phaser' };
  const pool = P.Display.Canvas.CanvasPool.pool;
  if (!Array.isArray(pool) || pool.length === 0) return { ready: false, why: 'empty-pool' };
  let game = null;
  for (let i = 0; i < pool.length; i++) {                 // route A: TextureManager -> .game
    const p = pool[i] && pool[i].parent;
    if (p && p.game && p.game.scene) { game = p.game; break; }
  }
  if (!game) for (let i = 0; i < pool.length; i++) {      // route B: any GameObject -> .scene.sys.game
    const p = pool[i] && pool[i].parent;
    if (p && p.scene && p.scene.sys && p.scene.sys.game) { game = p.scene.sys.game; break; }
  }
  if (!game) return { ready: false, why: 'no-game-in-pool' };
  if (!game.isBooted || !game.isRunning) return { ready: false, why: 'not-booted' };
  const scene = game.scene.getScene('battle') || game.scene.scenes[0] || null;
  if (!scene || !scene.ui) return { ready: false, why: 'no-battle-scene' };
  return { ready: true, version: game.config.gameVersion, sceneCtor: scene.constructor.name, mode: scene.ui.mode, handlers: scene.ui.handlers.length };
})()`;

console.log('=== production locator (layered + guarded) ===');
let r = await timeIt(50, () => ev(LOCATOR));
console.log('  ', r.s, 'ms');
console.log('   ->', JSON.stringify(r.last.result.value));

console.log('\n=== locator degrades instead of throwing? (simulate each failure) ===');
console.log('   no-phaser:      ', JSON.stringify(await val('(() => { const globalThis2 = {}; ' + LOCATOR.replace('globalThis.Phaser', 'globalThis2.Phaser').slice(7) + ')()')));
console.log('   empty pool:     ', JSON.stringify(await val(LOCATOR.replace('P.Display.Canvas.CanvasPool.pool;', '[];'))));
console.log('   pool all-freed: ', JSON.stringify(await val(LOCATOR.replace('P.Display.Canvas.CanvasPool.pool;', 'P.Display.Canvas.CanvasPool.pool.map(()=>({parent:null}));'))));
console.log('   route A gone -> falls through to B:', JSON.stringify(await val(LOCATOR.replace("if (p && p.game && p.game.scene) { game = p.game; break; }", "if (false) {}"))));

console.log('\n=== settle predicate (#3) + lean snapshot, via locator, end to end ===');
const FULL = `(() => { const loc = ${LOCATOR}; if (!loc.ready) return loc;
  const P = globalThis.Phaser, pool = P.Display.Canvas.CanvasPool.pool;
  let game = null; for (let i=0;i<pool.length;i++){const p=pool[i]&&pool[i].parent; if(p&&p.game&&p.game.scene){game=p.game;break;}}
  const s = game.scene.getScene('battle'), ui = s.ui, h = ui.getHandler();
  return { ready: true, mode: ui.mode, modeChain: ui.modeChain, overlayActive: ui.overlayActive,
    handler: h.constructor.name, handlerActive: h.active, cursor: h.cursor,
    awaitingActionInput: h.awaitingActionInput ?? null, onActionInput: h.onActionInput != null,
    phaseQueue: s.phaseManager.phaseQueue.length, currentPhase: s.phaseManager.currentPhase ? s.phaseManager.currentPhase.constructor.name : null,
    wave: s.currentBattle ? s.currentBattle.waveIndex : null, money: s.money, biome: s.arena ? s.arena.biomeType : null,
    party: s.party.map(p => ({ name: p.name, lv: p.level, hp: p.hp, maxHp: p.getMaxHp(), status: p.status ? p.status.effect : null })),
    enemies: (s.currentBattle && s.currentBattle.enemyParty) ? s.currentBattle.enemyParty.map(p=>({name:p.name, lv:p.level, hp:p.hp, maxHp:p.getMaxHp()})) : [] }; })()`;
r = await timeIt(50, () => ev(FULL));
console.log('  ', r.s, 'ms');
console.log('   ->', JSON.stringify(r.last.result.value));
const bytes = Buffer.byteLength(JSON.stringify(r.last.result.value));
console.log('   payload bytes:', bytes);

console.log('\n=== 100ms settle poll: what does 10 polls cost in wall clock? ===');
r = await timeIt(10, () => ev(FULL));
console.log('   10 consecutive polls:', r.s, 'ms each -> eval overhead is noise next to the 100 ms sleep');
ws.close();
