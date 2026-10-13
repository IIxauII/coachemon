(() => {
const game = Phaser.Display.Canvas.CanvasPool.pool.map(p=>p.parent).find(p=>p&&p.game).game;
const s = game.scene.getScene("battle");
const pm = s.phaseManager;
const Q=["pushPhase","unshiftPhase","pushNew","unshiftNew","queueMessage","queueAbilityDisplay","hideAbilityBar","queueFaintPhase"];
const saved = Q.filter(k=>typeof pm[k]==="function").map(k=>[k,Object.prototype.hasOwnProperty.call(pm,k),pm[k]]);
const rnd=Phaser.Math.RND.state(); const b=s.currentBattle; const seed=b.battleSeedState; const ro=s.rngOffset, rso=s.rngSeedOverride;
const party=s.getPlayerParty(), enemy=s.getEnemyParty();
const mons=[...party,...enemy].map(p=>({p,w:p.waveData?.abilitiesApplied&&new Set(p.waveData.abilitiesApplied),su:p.summonData?.abilitiesApplied&&new Set(p.summonData.abilitiesApplied),t:p.turnData&&{hitCount:p.turnData.hitCount,hitsLeft:p.turnData.hitsLeft,moveEffectiveness:p.turnData.moveEffectiveness}, st: p.summonData?.statStages && [...p.summonData.statStages]}));
for(const [k] of saved) pm[k]=()=>{};
const TERA=(globalThis.__MX_TERA||[]).map(n=>enemy.find(e=>(e.getNameToRender?.()??e.name)===n)).filter(Boolean); const teraOld=TERA.map(e=>e.isTerastallized); TERA.forEach(e=>e.isTerastallized=true);
const nm=p=>p.getNameToRender?.()??p.name;
const out={weather: s.arena.weather?.weatherType};
try {
 const calc=(a,d)=>{ const r={}; for(const m of a.moveset.filter(Boolean)){const mv=m.getMove(); if(mv.category===2) continue; const one=c=>{ if(d.turnData) d.turnData.moveEffectiveness=null; const x=d.getAttackDamage({source:a,move:mv,ignoreAbility:false,ignoreSourceAbility:false,ignoreAllyAbility:false,ignoreSourceAllyAbility:false,isCritical:c,simulated:true}); return Math.round(1000*x.damage/d.getMaxHp())/10;}; try{ r[m.getName()]=[one(false),one(true)].join('/');}catch(e){r[m.getName()]='err '+e.message} } return r; };
 const FOES = (globalThis.__MX_FOES||[]);
 const foes = FOES.length? enemy.filter(e=>FOES.includes(nm(e))) : enemy.filter(e=>e.isActive?.());
 for(const f of foes){ out['foe:'+nm(f)]={hp:f.hp+'/'+f.getMaxHp()}; for(const d of party.filter(p=>!p.isFainted())) out['foe:'+nm(f)][nm(d)+' '+d.hp+'/'+d.getMaxHp()]=calc(f,d); out['into:'+nm(f)]={}; for(const a of party.filter(p=>!p.isFainted())) out['into:'+nm(f)][nm(a)]=calc(a,f); }
} finally {
 TERA.forEach((e,i)=>e.isTerastallized=teraOld[i]);
 for (const [k, own, f] of saved) { if (own) pm[k] = f; else delete pm[k]; }
 Phaser.Math.RND.state(rnd); b.battleSeedState=seed; s.rngOffset=ro; s.rngSeedOverride=rso;
 for (const {p,w,su,t,st} of mons){ if(w) p.waveData.abilitiesApplied=w; if(su) p.summonData.abilitiesApplied=su; if(t) Object.assign(p.turnData,t); if(st) p.summonData.statStages=st; }
 out.restored = Phaser.Math.RND.state()===rnd && b.battleSeedState===seed;
}
return JSON.stringify(out);
})()
