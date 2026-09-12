const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find(t => t.type === 'page' && t.url.includes('pokerogue.net'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const evs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
const waitFor = (name, ms = 8000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout ' + name)), ms);
  const h = (e) => { if (e.n === name) { clearTimeout(t); evs.splice(evs.indexOf(h), 1); res(e.p); } }; evs.push(h); });
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method) for (const h of [...evs]) h({ n: m.method, p: m.params }); });
await new Promise(r => ws.addEventListener('open', r));
const ev = (expression, extra = {}) => send('Runtime.evaluate', { expression, returnByValue: true, ...extra });
const val = async (e, extra) => { const r = await ev(e, extra); return r.exceptionDetails ? 'EXC: ' + (r.exceptionDetails.exception?.description||'').split('\n')[0] : r.result.value; };
const stats = (ts) => { const s=[...ts].sort((a,b)=>a-b); const p=q=>s[Math.min(s.length-1,Math.floor(q*s.length))]; return `min ${s[0].toFixed(2)} p50 ${p(0.5).toFixed(2)} p90 ${p(0.9).toFixed(2)} max ${s[s.length-1].toFixed(2)}`; };
const timeIt = async (n, fn) => { const ts=[]; let last; for(let i=0;i<n;i++){const t0=process.hrtime.bigint(); last=await fn(); ts.push(Number(process.hrtime.bigint()-t0)/1e6);} return {s:stats(ts),last}; };

console.log('=== worst case: FULL pool traversal (no short-circuit) ===');
console.log('   pool.length now:', await val('Phaser.Display.Canvas.CanvasPool.pool.length'));
let r = await timeIt(20, () => ev('Phaser.Display.Canvas.CanvasPool.pool.filter(e => e && e.parent && e.parent.game).length'));
console.log('   full filter traversal:', r.s, 'ms  ->', r.last.result.value, 'match(es)');
r = await timeIt(20, () => ev('(() => { const p = Phaser.Display.Canvas.CanvasPool.pool; for (let i = p.length - 1; i >= 0; i--) { const e = p[i]; if (e && e.parent && e.parent.game) return i; } return -1; })()'));
console.log('   reverse scan (pessimal, game entry at idx 0):', r.s, 'ms  -> idx', r.last.result.value);

console.log('\n=== ROUTE B: pool entry whose parent is a Text GameObject -> .parent.scene ===');
console.log('   count of entries with .parent.scene:', await val('Phaser.Display.Canvas.CanvasPool.pool.filter(e => e && e.parent && e.parent.scene).length'));
console.log('   that scene ctor:', await val("Phaser.Display.Canvas.CanvasPool.pool.find(e => e && e.parent && e.parent.scene).parent.scene.constructor.name"));
console.log('   identical to route A scene?:', await val("(() => { const p = Phaser.Display.Canvas.CanvasPool.pool; const a = p.find(e=>e&&e.parent&&e.parent.game).parent.game.scene.getScene('battle'); const b = p.find(e=>e&&e.parent&&e.parent.scene).parent.scene; return a === b; })()"));
console.log('   parent ctors seen for route B (first 5):', JSON.stringify(await val('Phaser.Display.Canvas.CanvasPool.pool.filter(e=>e&&e.parent&&e.parent.scene).slice(0,5).map(e=>e.parent.constructor.name)')));
console.log('   route B also yields game?:', await val("Phaser.Display.Canvas.CanvasPool.pool.find(e=>e&&e.parent&&e.parent.scene).parent.scene.sys.game.constructor.name"));

console.log('\n=== ROUTE C: getEventListeners via command line API ===');
for (const t of ['window', 'document', 'document.querySelector("canvas")']) {
  console.log(`   getEventListeners(${t}):`, JSON.stringify(await val(`Object.entries(getEventListeners(${t})||{}).map(([k,v])=>k+':'+v.length)`, { includeCommandLineAPI: true })));
}
console.log('   window keydown listener fn names:', JSON.stringify(await val('(getEventListeners(window).keydown||[]).map(l=>l.listener.name||"(anon)")', { includeCommandLineAPI: true })));

console.log('\n=== ROUTE D: Debugger breakpoint INSIDE a game listener -> module scope? ===');
try {
  await send('Debugger.enable');
  const fnHandle = await send('Runtime.evaluate', { expression: '(getEventListeners(window).keydown||[])[0] && (getEventListeners(window).keydown||[])[0].listener', includeCommandLineAPI: true, returnByValue: false });
  if (!fnHandle.result.objectId) { console.log('   no keydown listener on window; cannot breakpoint. skipping'); }
  else {
    console.log('   listener objectId ok; setting breakpoint on function call...');
    await send('Debugger.setBreakpointOnFunctionCall', { objectId: fnHandle.result.objectId });
    console.log('   NOTE: would need a real keypress to trigger; not sending input (read-only). Reporting reachability only.');
  }
  // Instead: pause inside the game's rAF loop by breaking on a Phaser prototype method that runs every frame.
  const step = await send('Runtime.evaluate', { expression: "Phaser.Display.Canvas.CanvasPool.pool.find(e=>e&&e.parent&&e.parent.game).parent.game.loop.step", returnByValue: false });
  if (step.result.objectId) {
    await send('Debugger.setBreakpointOnFunctionCall', { objectId: step.result.objectId });
    const t0 = process.hrtime.bigint();
    const paused = await waitFor('Debugger.paused', 5000);
    const tHit = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`   paused inside game.loop.step after ${tHit.toFixed(2)} ms; ${paused.callFrames.length} frames`);
    console.log('   top frames:', JSON.stringify(paused.callFrames.slice(0,4).map(f=>({fn:f.functionName||'(anon)', url:(f.url||'').split('/').pop(), scopes:f.scopeChain.map(s=>s.type)}))));
    for (const f of paused.callFrames.slice(0, 4)) {
      const e = await send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression: 'typeof globalScene', returnByValue: true });
      console.log(`     frame ${f.functionName||'(anon)'} -> typeof globalScene =`, e.exceptionDetails ? 'EXC' : JSON.stringify(e.result.value));
    }
    await send('Debugger.resume');
    console.log(`   resumed. pause window ${(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2)} ms`);
  }
} catch (e) { console.log('   ROUTE D failed:', e.message); try { await send('Debugger.resume'); } catch {} }
finally { try { await send('Debugger.setBreakpointsActive', { active: false }); await send('Debugger.disable'); } catch {} }

console.log('\n=== pool growth over 30s idle ===');
const a = await val('Phaser.Display.Canvas.CanvasPool.pool.length');
await new Promise(r => setTimeout(r, 30000));
const b = await val('Phaser.Display.Canvas.CanvasPool.pool.length');
console.log(`   ${a} -> ${b} (+${b - a} in 30s); game entry index still:`, await val('Phaser.Display.Canvas.CanvasPool.pool.findIndex(e=>e&&e.parent&&e.parent.game)'));

console.log('\n=== identity: is the scene a stable object across evaluates? (cache on window) ===');
console.log('   stash+compare:', await val("(() => { const s = Phaser.Display.Canvas.CanvasPool.pool.find(e=>e&&e.parent&&e.parent.game).parent.game.scene.getScene('battle'); const same = window.__pmcp_probe === s; window.__pmcp_probe = s; return { firstRun: !same, nowCached: window.__pmcp_probe === s }; })()"));
console.log('   second call sees cache:', JSON.stringify(await val("(() => { const s = Phaser.Display.Canvas.CanvasPool.pool.find(e=>e&&e.parent&&e.parent.game).parent.game.scene.getScene('battle'); return window.__pmcp_probe === s; })()")));
await ev('delete window.__pmcp_probe');
console.log('   probe global cleaned up:', await val('typeof window.__pmcp_probe'));
ws.close();
