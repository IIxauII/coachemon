const t = (await (await fetch('http://127.0.0.1:9222/json/list')).json()).find(x => x.type==='page' && x.url.includes('pokerogue.net'));
const ws = new WebSocket(t.webSocketDebuggerUrl); let id=0; const pend=new Map();
const send=(m,p={})=>new Promise((r,j)=>{const n=++id;pend.set(n,{r,j});ws.send(JSON.stringify({id:n,method:m,params:p}));});
ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(JSON.stringify(m.error))):p.r(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));

// EXACT §5 locator from the doc, with `game`/`scene` swapped for a serialisable summary
// so it can cross the wire. The discovery logic is byte-for-byte what is documented.
const LOCATOR_BODY = `
  const isGame = g => !!g && typeof g === 'object'
    && 'isBooted' in g && g.scene && Array.isArray(g.scene.scenes) && g.textures && g.loop;

  let game = typeof globalThis.PHASER_GAME !== 'undefined' && isGame(globalThis.PHASER_GAME)
    ? globalThis.PHASER_GAME : null;

  const P = globalThis.Phaser;
  if (!game) {
    if (!P?.Display?.Canvas?.CanvasPool) return { ready: false, why: 'no-phaser' };
    const pool = P.Display.Canvas.CanvasPool.pool;
    if (!Array.isArray(pool) || pool.length === 0) return { ready: false, why: 'empty-pool' };
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i] && pool[i].parent;
      if (!p || typeof p !== 'object') continue;
      for (const cand of [p, p.game, p.scene && p.scene.game,
                          p.manager && p.manager.game, p.renderer && p.renderer.game]) {
        if (isGame(cand)) { game = cand; break; }
      }
      if (game) break;
    }
  }
  if (!game) return { ready: false, why: 'no-game-in-pool' };
  if (!game.isBooted || !game.isRunning) return { ready: false, why: 'not-booted' };

  const scene = game.scene.getScene('battle');
  if (!scene || !scene.ui) return { ready: false, why: 'no-battle-scene' };
`;
const LOCATOR = `(() => {${LOCATOR_BODY}
  return { ready: true, version: game.config.gameVersion, sceneCtor: scene.constructor.name,
           mode: scene.ui.mode, handlers: scene.ui.handlers.length,
           handler: scene.ui.getHandler().constructor.name,
           wave: scene.currentBattle ? scene.currentBattle.waveIndex : null };
})()`;

const ev = e => send('Runtime.evaluate', { expression: e, returnByValue: true });
const stats = ts => { const s=[...ts].sort((a,b)=>a-b); const p=q=>s[Math.min(s.length-1,Math.floor(q*s.length))];
  return `min ${s[0].toFixed(2)} p50 ${p(0.5).toFixed(2)} p90 ${p(0.9).toFixed(2)} max ${s[s.length-1].toFixed(2)}`; };

const ts=[]; let last;
for (let i=0;i<50;i++){ const t0=process.hrtime.bigint(); last=await ev(LOCATOR); ts.push(Number(process.hrtime.bigint()-t0)/1e6); }
console.log('FINAL §5 locator, exactly as documented:');
if (last.exceptionDetails) console.log('  EXCEPTION:', last.exceptionDetails.exception?.description?.split('\n')[0]);
else console.log('  ->', JSON.stringify(last.result.value));
console.log('  timing:', stats(ts), 'ms');

// and confirm it still degrades rather than throwing
console.log('\ndegradation (unchanged logic, each failure forced):');
for (const [name, mutate] of [
  ['no-phaser',       s => s.replace('const P = globalThis.Phaser;', 'const P = undefined;')],
  ['empty-pool',      s => s.replace('P.Display.Canvas.CanvasPool.pool;', '[];')],
  ['all-freed',       s => s.replace('P.Display.Canvas.CanvasPool.pool;', 'P.Display.Canvas.CanvasPool.pool.map(()=>({parent:null}));')],
  ['route A removed', s => s.replace('p.game,', 'undefined,')],
  ['A+B removed',     s => s.replace('p.game,', 'undefined,').replace('p.scene && p.scene.game,', 'undefined,')],
]) {
  const r = await ev(`(() => {${mutate(LOCATOR_BODY)}
    return { ready: true, sceneCtor: scene.constructor.name }; })()`);
  console.log(`  ${name.padEnd(16)} ->`, r.exceptionDetails ? 'THREW: ' + r.exceptionDetails.exception?.description?.split('\n')[0] : JSON.stringify(r.result.value));
}
ws.close();
