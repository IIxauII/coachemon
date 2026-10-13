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
const out={weather: s.arena.weather?.weatherType, weatherTurns: s.arena.weather?.turnsLeft, phase: pm.getCurrentPhase()?.phaseName};
const nm=p=>p.getNameToRender?.()??p.name;
try {
 const calc=(a,d)=>{ const r={}; for(const m of a.moveset.filter(Boolean)){const mv=m.getMove(); if(mv.category===2) continue; try{ if(d.turnData) d.turnData.moveEffectiveness=null; const x=d.getAttackDamage({source:a,move:mv,ignoreAbility:false,ignoreSourceAbility:false,ignoreAllyAbility:false,ignoreSourceAllyAbility:false,isCritical:false,simulated:true}); r[m.getName()]=Math.round(1000*x.damage/d.getMaxHp())/10;}catch(e){r[m.getName()]='err '+e.message} } return r; };
 const by=n=>[...party,...enemy].find(p=>nm(p)===n);
 const at=(p,i,v,fn)=>{const o=p.summonData.statStages[i]; p.summonData.statStages[i]=v; try{return fn()}finally{p.summonData.statStages[i]=o}};
 for(const foe of ['Tyranitar','Coalossal','Gigalith','Barbaracle','Stonjourner','Carracosta']){ for(const st of [-1,-2]){ out[foe+st]={}; at(by(foe),0,st,()=>{for(const d of party) out[foe+st][nm(d)]=calc(by(foe),d);}); } }
 out.leavM2={}; at(by('Leavanny'),2,-2,()=>{for(const d of enemy) out.leavM2[nm(d)]=calc(by('Leavanny'),d);});
 const cls=n=>{const p=[...party].flatMap(q=>q.moveset.filter(Boolean)).find(m=>m.getName()===n); return p?(p.getMove().attrs||[]).map(a=>a.constructor.name):null};
 out.attrs={Toxic:cls('Toxic'),SleepTalk:cls('Sleep Talk'),BugBite:cls('Bug Bite'),MeanLook:cls('Mean Look'),BellyDrum:cls('Belly Drum'),Rest:cls('Rest')};
 const ty=by('Tyranitar'); out.tyItems=ty.getHeldItems().map(m=>[m.constructor.name, m.berryType, m.getStackCount?.()]);
 out.order = enemy.map(nm);
} finally {
 for (const [k, own, f] of saved) { if (own) pm[k] = f; else delete pm[k]; }
 Phaser.Math.RND.state(rnd); b.battleSeedState=seed; s.rngOffset=ro; s.rngSeedOverride=rso;
 for (const {p,w,su,t,st} of mons){ if(w) p.waveData.abilitiesApplied=w; if(su) p.summonData.abilitiesApplied=su; if(t) Object.assign(p.turnData,t); if(st) p.summonData.statStages=st; }
 out.restored = Phaser.Math.RND.state()===rnd && b.battleSeedState===seed;
}
return out;
})()
