const t = (await (await fetch('http://127.0.0.1:9222/json/list')).json()).find(x => x.type==='page' && x.url.includes('pokerogue.net'));
const ws = new WebSocket(t.webSocketDebuggerUrl); let id=0; const pend=new Map();
const send=(m,p={})=>new Promise((r,j)=>{const n=++id;pend.set(n,{r,j});ws.send(JSON.stringify({id:n,method:m,params:p}));});
ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(JSON.stringify(m.error))):p.r(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));
const val=async(e,extra={})=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,...extra});return r.exceptionDetails?'EXC: '+(r.exceptionDetails.exception?.description||'').split('\n')[0]:r.result.value;};

console.log('--- Phaser render-type constants (agent said CANVAS=0/WEBGL=1; live pool entries are all type 1) ---');
console.log('AUTO/CANVAS/WEBGL/HEADLESS:', await val('[Phaser.AUTO, Phaser.CANVAS, Phaser.WEBGL, Phaser.HEADLESS]'));
console.log('distinct types present in pool:', await val('[...new Set(Phaser.Display.Canvas.CanvasPool.pool.map(e=>e.type))]'));
console.log('game.config.renderType:', await val('(()=>{const p=Phaser.Display.Canvas.CanvasPool.pool;for(let i=0;i<p.length;i++){const q=p[i]&&p[i].parent;if(q&&q.game&&q.game.scene)return q.game.config.renderType;}})()'));

console.log('\n--- window.PHASER_GAME (in Phaser source, DefinePlugin-stripped from dist) ---');
console.log('typeof window.PHASER_GAME:', await val('typeof window.PHASER_GAME'));

console.log('\n--- window.onblur / onfocus as a nameable "Phaser is running" probe ---');
console.log('typeof window.onblur:', await val('typeof window.onblur'), '| typeof window.onfocus:', await val('typeof window.onfocus'));

console.log('\n--- scene registry: is LoadingScene gone? ---');
console.log('scene keys + status:', await val("(()=>{const p=Phaser.Display.Canvas.CanvasPool.pool;let g=null;for(let i=0;i<p.length;i++){const q=p[i]&&p[i].parent;if(q&&q.game&&q.game.scene){g=q.game;break;}}return {keys:Object.keys(g.scene.keys), scenes:g.scene.scenes.map(s=>s.sys.settings.key), scenes0:g.scene.scenes[0].sys.settings.key, getBattleIsScenes0: g.scene.getScene('battle')===g.scene.scenes[0]};})()"));

console.log('\n--- command-line queryObjects() from a plain Runtime.evaluate: does it RETURN anything? ---');
console.log('typeof queryObjects:', await val('typeof queryObjects', {includeCommandLineAPI:true}));
console.log('queryObjects(Phaser.Game) returns:', await val('String(queryObjects(Phaser.Game))', {includeCommandLineAPI:true}));

console.log('\n--- keepNames: are class names really preserved in the minified bundle? ---');
console.log('ctor names:', await val("(()=>{const p=Phaser.Display.Canvas.CanvasPool.pool;let g=null;for(let i=0;i<p.length;i++){const q=p[i]&&p[i].parent;if(q&&q.game&&q.game.scene){g=q.game;break;}}const s=g.scene.getScene('battle');return {game:g.constructor.name, scene:s.constructor.name, ui:s.ui.constructor.name, handler:s.ui.getHandler().constructor.name, textures:g.textures.constructor.name, texturesName:g.textures.name, phaseMgr:s.phaseManager.constructor.name};})()"));

console.log('\n--- sourcemaps in production? ---');
console.log('script count / any sourceMappingURL:', await val("(()=>{const ss=[...document.querySelectorAll('script[src]')].map(s=>s.src); return {count: ss.length, sample: ss.slice(0,3)};})()"));
ws.close();
