// Read-only CDP benchmark of candidate mechanisms for reaching globalScene.
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find(t => t.type === 'page' && t.url.includes('pokerogue.net'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const events = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params }));
});
const waitFor = (name, ms = 5000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout waiting ' + name)), ms);
  const h = (e) => { if (e.name === name) { clearTimeout(t); events.splice(events.indexOf(h), 1); res(e.params); } };
  h.name2 = name; events.push(h);
});
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method) { for (const h of [...events]) h({ name: m.method, params: m.params }); }
});
await new Promise(r => ws.addEventListener('open', r));

const stats = (ts) => { const s=[...ts].sort((a,b)=>a-b); const p=q=>s[Math.min(s.length-1,Math.floor(q*s.length))];
  return `min ${s[0].toFixed(2)} p50 ${p(0.5).toFixed(2)} p90 ${p(0.9).toFixed(2)} max ${s[s.length-1].toFixed(2)}`; };
const timeIt = async (n, fn) => { const ts=[]; let last; for (let i=0;i<n;i++){ const t0=process.hrtime.bigint(); last=await fn(); ts.push(Number(process.hrtime.bigint()-t0)/1e6);} return { s: stats(ts), last }; };

const DISCOVER = `Phaser.Display.Canvas.CanvasPool.pool.find(e => e && e.parent && e.parent.game).parent.game.scene.getScene('battle')`;
// A realistic settle-poll payload, per issue #3's predicate + a lean snapshot.
const POLL_BODY = `(() => { const s = SCENE; const ui = s.ui; const h = ui.getHandler();
  return { mode: ui.mode, chain: ui.modeChain.length, overlay: ui.overlayActive, hActive: h.active,
    awaiting: h.awaitingActionInput ?? null, hasOnAction: h.onActionInput != null,
    textDone: (ui.getMessageHandler && ui.getMessageHandler().message && ui.getMessageHandler().message.textTimer) ? ui.getMessageHandler().message.textTimer.hasDispatched : null,
    wave: s.currentBattle ? s.currentBattle.waveIndex : null, money: s.money, phases: s.phaseManager.phaseQueue.length,
    party: s.party.map(p => ({ n: p.name, lv: p.level, hp: p.hp, max: p.getMaxHp() })) }; })()`;

console.log('=== pool size drift ===');
const poolNow = (await send('Runtime.evaluate', { expression: 'Phaser.Display.Canvas.CanvasPool.pool.length', returnByValue: true })).result.value;
const freeSlots = (await send('Runtime.evaluate', { expression: 'Phaser.Display.Canvas.CanvasPool.pool.filter(e=>!e.parent).length', returnByValue: true })).result.value;
const idx = (await send('Runtime.evaluate', { expression: `Phaser.Display.Canvas.CanvasPool.pool.findIndex(e => e && e.parent && e.parent.game)`, returnByValue: true })).result.value;
console.log(`pool.length=${poolNow}  freeSlots(parent==null)=${freeSlots}  index of game-bearing entry=${idx}  CanvasPool.total=${(await send('Runtime.evaluate',{expression:'Phaser.Display.Canvas.CanvasPool.total',returnByValue:true})).result.value}`);

console.log('\n=== M1: rediscover-every-call (scan pool, then read) ===');
let r = await timeIt(30, () => send('Runtime.evaluate', { expression: POLL_BODY.replace('SCENE', DISCOVER), returnByValue: true }));
console.log('  ', r.s, 'ms   ok=' + !r.last.exceptionDetails);
if (r.last.exceptionDetails) console.log('   EXC:', r.last.exceptionDetails.exception?.description?.split('\n')[0]);
else console.log('   payload:', JSON.stringify(r.last.result.value));

console.log('\n=== M1b: discovery expression alone (no payload) ===');
r = await timeIt(30, () => send('Runtime.evaluate', { expression: DISCOVER + '.constructor.name', returnByValue: true }));
console.log('  ', r.s, 'ms   ->', r.last.result?.value);

console.log('\n=== M2: persisted objectId + Runtime.callFunctionOn (no page mutation) ===');
const handle = await send('Runtime.evaluate', { expression: DISCOVER, returnByValue: false, objectGroup: 'pmcp' });
const sceneObjectId = handle.result.objectId;
console.log('   sceneObjectId acquired:', !!sceneObjectId, ' className:', handle.result.className);
const FN = 'function() { ' + POLL_BODY.replace('SCENE', 'this') + ' }';
// callFunctionOn needs a function whose body returns; wrap properly
const FN2 = `function() { return (${POLL_BODY.replace('SCENE', 'this')}); }`;
r = await timeIt(30, () => send('Runtime.callFunctionOn', { objectId: sceneObjectId, functionDeclaration: FN2, returnByValue: true }));
console.log('  ', r.s, 'ms   ok=' + !r.last.exceptionDetails);
if (r.last.exceptionDetails) console.log('   EXC:', r.last.exceptionDetails.exception?.description?.split('\n')[0]);

console.log('\n=== M3: Runtime.queryObjects on Phaser.Game.prototype (experimental) ===');
try {
  const proto = await send('Runtime.evaluate', { expression: 'Phaser.Game.prototype', returnByValue: false });
  const t0 = process.hrtime.bigint();
  const q = await send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
  const dt = Number(process.hrtime.bigint() - t0) / 1e6;
  const count = await send('Runtime.callFunctionOn', { objectId: q.objects.objectId, functionDeclaration: 'function(){ return this.length; }', returnByValue: true });
  console.log(`   queryObjects ok: ${count.result.value} Game instance(s) found, single call ${dt.toFixed(2)} ms`);
  const r3 = await timeIt(5, async () => { const p = await send('Runtime.evaluate', { expression: 'Phaser.Game.prototype', returnByValue: false }); return send('Runtime.queryObjects', { prototypeObjectId: p.result.objectId }); });
  console.log('   repeat timing:', r3.s, 'ms');
} catch (e) { console.log('   queryObjects FAILED:', e.message); }

console.log('\n=== M4: window.gameInfo only (no scene) ===');
r = await timeIt(30, () => send('Runtime.evaluate', { expression: 'window.gameInfo', returnByValue: true }));
console.log('  ', r.s, 'ms');

console.log('\n=== M5: Debugger.pause + evaluateOnCallFrame (does it reach module scope?) ===');
try {
  await send('Debugger.enable');
  const t0 = process.hrtime.bigint();
  const pausedP = waitFor('Debugger.paused', 8000);
  await send('Debugger.pause');
  const paused = await pausedP;
  const tPause = Number(process.hrtime.bigint() - t0) / 1e6;
  const frames = paused.callFrames.map(f => ({ fn: f.functionName, url: (f.url||'').split('/').pop(), scopes: f.scopeChain.map(s => s.type) }));
  console.log(`   paused after ${tPause.toFixed(2)} ms, reason=${paused.reason}, ${paused.callFrames.length} frame(s)`);
  console.log('   frames:', JSON.stringify(frames.slice(0, 6)));
  const cf = paused.callFrames[0].callFrameId;
  for (const expr of ['typeof globalScene', 'typeof gameInfo', 'typeof Phaser']) {
    try { const e = await send('Debugger.evaluateOnCallFrame', { callFrameId: cf, expression: expr, returnByValue: true });
      console.log(`   evaluateOnCallFrame(${expr}) ->`, e.exceptionDetails ? 'EXC ' + e.exceptionDetails.exception?.description?.split('\n')[0] : JSON.stringify(e.result.value)); } catch (err) { console.log('   ', expr, 'ERR', err.message); }
  }
  const t1 = process.hrtime.bigint();
  await send('Debugger.resume');
  console.log(`   resumed (+${(Number(process.hrtime.bigint()-t1)/1e6).toFixed(2)} ms). total pause window ${(Number(process.hrtime.bigint()-t0)/1e6).toFixed(2)} ms`);
} catch (e) { console.log('   Debugger path FAILED:', e.message); try { await send('Debugger.resume'); } catch {} }
finally { try { await send('Debugger.disable'); } catch {} }

console.log('\n=== M6: globalLexicalScopeNames / command line API ===');
const gl = await send('Runtime.globalLexicalScopeNames', {});
console.log('   globalLexicalScopeNames:', JSON.stringify(gl.names));
const cli = await send('Runtime.evaluate', { expression: 'typeof queryObjects', returnByValue: true, includeCommandLineAPI: true });
console.log('   typeof queryObjects with includeCommandLineAPI:', cli.result.value);
const cli2 = await send('Runtime.evaluate', { expression: 'typeof getEventListeners', returnByValue: true, includeCommandLineAPI: true });
console.log('   typeof getEventListeners with includeCommandLineAPI:', cli2.result.value);
try {
  const cli3 = await send('Runtime.evaluate', { expression: 'getEventListeners(document).keydown ? getEventListeners(document).keydown.length : 0', returnByValue: true, includeCommandLineAPI: true });
  console.log('   getEventListeners(document).keydown count:', cli3.exceptionDetails ? 'EXC' : cli3.result.value);
} catch (e) { console.log('   getEventListeners err', e.message); }

await send('Runtime.releaseObjectGroup', { objectGroup: 'pmcp' }).catch(()=>{});
ws.close();
