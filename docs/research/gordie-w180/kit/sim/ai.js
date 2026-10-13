// Predict each enemy's chosen move vs one of ours. Knobs: __A = { ours:'Leavanny', foes:[...], hp:{}, ourTera:[], foeTera:[] }
(() => {
const A = globalThis.__A || {};
const game = Phaser.Display.Canvas.CanvasPool.pool.map(p=>p.parent).find(p=>p&&p.game).game;
const s = game.scene.getScene("battle"); const pm = s.phaseManager;
const Q=["pushPhase","unshiftPhase","pushNew","unshiftNew","queueMessage","queueAbilityDisplay","hideAbilityBar","queueFaintPhase"];
const saved = Q.filter(k=>typeof pm[k]==="function").map(k=>[k,Object.prototype.hasOwnProperty.call(pm,k),pm[k]]);
const rnd=Phaser.Math.RND.state(); const b=s.currentBattle; const seed=b.battleSeedState;
const party=s.getPlayerParty(), enemy=s.getEnemyParty(); const nm=p=>p.getNameToRender?.()??p.name;
const touched=[...party,...enemy].map(p=>[p,p.isTerastallized,p.hp,p.turnData&&{...p.turnData}]);
for(const [k] of saved) pm[k]=()=>{};
const out={};
try{
 for(const p of party) if((A.ourTera||[]).includes(nm(p))) p.isTerastallized=true;
 for(const p of enemy) if((A.foeTera||[]).includes(nm(p))) p.isTerastallized=true;
 for(const p of [...party,...enemy]) if((A.hp||{})[nm(p)]!=null) p.hp=Math.max(1,Math.round(p.getMaxHp()*A.hp[nm(p)]));
 const o=party.find(p=>nm(p)===A.ours);
 for(const f of enemy.filter(e=>!A.foes||A.foes.includes(nm(e)))){
  const pool=f.getMoveset().filter(m=>m.isUsable(f,false,true)[0]);
  const dmg=m=>{ if(o.turnData) o.turnData.moveEffectiveness=null; return o.getAttackDamage({source:f,move:m.getMove(),ignoreAbility:false,ignoreSourceAbility:false,ignoreAllyAbility:false,ignoreSourceAllyAbility:false,isCritical:false,simulated:true}).damage; };
  const ko=pool.filter(m=>m.getMove().category!==2 && m.getMove().applyConditions(f,o,-1) && dmg(m)>=o.hp);
  const cand=ko.length?ko:pool;
  const sc=cand.map(m=>{const mv=m.getMove(); let t=mv.getUserBenefitScore(f,o,mv)-mv.getTargetBenefitScore(f,o,mv); if(Number.isNaN(t)) t=0;
    if(!mv.applyConditions(f,o,-1)) t=-20; else if(s.arena.isMoveWeatherCancelled(f,mv)) t=-20; else if(mv.is("AttackMove")){ const e=o.getMoveEffectiveness(f,mv,false,undefined,undefined,true); t*=e; if(f.isOfType(mv.type)) t*=1.5; if(!t) t=-20; }
    return [m.getName(),Math.round(t*10)/10];}).sort((x,y)=>y[1]-x[1]);
  out[nm(f)]={pick:sc[0][0], ko:ko.map(m=>m.getName()), scores:sc.map(x=>x.join(':')).join(' ')};
 }
} finally {
 for(const [p,t,h,td] of touched){p.isTerastallized=t;p.hp=h; if(td) Object.assign(p.turnData,td);}
 for (const [k, own, f] of saved) { if (own) pm[k] = f; else delete pm[k]; }
 Phaser.Math.RND.state(rnd); b.battleSeedState=seed;
}
return JSON.stringify(out);
})()
