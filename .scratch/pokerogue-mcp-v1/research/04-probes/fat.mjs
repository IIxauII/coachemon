const t = (await (await fetch('http://127.0.0.1:9222/json/list')).json()).find(x => x.type==='page' && x.url.includes('pokerogue.net'));
const ws = new WebSocket(t.webSocketDebuggerUrl); let id=0; const pend=new Map();
const send=(m,p={})=>new Promise((r,j)=>{const n=++id;pend.set(n,{r,j});ws.send(JSON.stringify({id:n,method:m,params:p}));});
ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.j(new Error(JSON.stringify(m.error))):p.r(m.result);}});
await new Promise(r=>ws.addEventListener('open',r));
const ev=e=>send('Runtime.evaluate',{expression:e,returnByValue:true});
const stats=ts=>{const s=[...ts].sort((a,b)=>a-b);const p=q=>s[Math.min(s.length-1,Math.floor(q*s.length))];return `min ${s[0].toFixed(2)} p50 ${p(0.5).toFixed(2)} p90 ${p(0.9).toFixed(2)}`;};
const timeIt=async(n,f)=>{const ts=[];let l;for(let i=0;i<n;i++){const t0=process.hrtime.bigint();l=await f();ts.push(Number(process.hrtime.bigint()-t0)/1e6);}return{s:stats(ts),l};};
const LOC = `(()=>{const pool=Phaser.Display.Canvas.CanvasPool.pool;for(let i=0;i<pool.length;i++){const p=pool[i]&&pool[i].parent;if(p&&p.game&&p.game.scene)return p.game.scene.getScene('battle');}return null;})()`;
const FAT = `(() => { const s = ${LOC}; if(!s) return {ready:false};
  const mon = p => ({ id: p.id, name: p.name, species: p.species ? p.species.name : null, lv: p.level, exp: p.exp, hp: p.hp, maxHp: p.getMaxHp(),
    status: p.status ? p.status.effect : null, types: p.getTypes ? p.getTypes() : null, ability: p.getAbility ? p.getAbility().name : null,
    nature: p.nature, shiny: p.shiny, ivs: p.ivs, stats: p.stats, statStages: p.summonData ? p.summonData.statStages : null,
    moveset: (p.moveset||[]).filter(Boolean).map(m => ({ name: m.getName ? m.getName() : null, pp: m.ppUsed, maxPp: m.getMovePp ? m.getMovePp() : null })) });
  return { ready: true, mode: s.ui.mode, wave: s.currentBattle?s.currentBattle.waveIndex:null, money: s.money, score: s.score,
    biome: s.arena?s.arena.biomeType:null, pokeballCounts: s.pokeballCounts, gameMode: s.gameMode?s.gameMode.modeId:null,
    party: s.party.map(mon), enemies: (s.currentBattle&&s.currentBattle.enemyParty)?s.currentBattle.enemyParty.map(mon):[],
    modifiers: (s.modifiers||[]).map(m => ({ type: m.type ? m.type.name : m.constructor.name, stack: m.stackCount })),
    enemyModifiers: (s.enemyModifiers||[]).map(m => ({ type: m.type ? m.type.name : m.constructor.name, stack: m.stackCount })) }; })()`;
let r = await timeIt(30, () => ev(FAT));
console.log('FAT snapshot:', r.s, 'ms');
if (r.l.exceptionDetails) console.log('EXC:', r.l.exceptionDetails.exception?.description?.split('\n')[0]);
else { const j = JSON.stringify(r.l.result.value); console.log('bytes:', Buffer.byteLength(j)); console.log('sample:', j.slice(0, 700)); }
console.log('\nscreenshot cost for comparison:');
r = await timeIt(3, () => send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }));
console.log('Page.captureScreenshot jpeg q70:', r.s, 'ms, base64 bytes:', r.l.data ? r.l.data.length : 'n/a');
ws.close();
