// Gordie switch / send-in predictor. Knobs (set before this expr):
// __P = { ours:'Leavanny', foe:'Carracosta', hp:{Coalossal:0.6,...}, ourTera:['Gyarados'], foeTera:['Coalossal'], counter:0, dead:['Gigalith'] }
(() => {
const P = globalThis.__P || {};
const game = Phaser.Display.Canvas.CanvasPool.pool.map(p=>p.parent).find(p=>p&&p.game).game;
const s = game.scene.getScene("battle"); const pm = s.phaseManager;
const Q=["pushPhase","unshiftPhase","pushNew","unshiftNew","queueMessage","queueAbilityDisplay","hideAbilityBar","queueFaintPhase"];
const saved = Q.filter(k=>typeof pm[k]==="function").map(k=>[k,Object.prototype.hasOwnProperty.call(pm,k),pm[k]]);
const rnd=Phaser.Math.RND.state();
const party=s.getPlayerParty(), enemy=s.getEnemyParty(); const nm=p=>p.getNameToRender?.()??p.name;
for(const [k] of saved) pm[k]=()=>{};
const touched=[...party,...enemy].map(p=>[p,p.isTerastallized,p.hp]);
let out;
try{
 for(const p of party) if((P.ourTera||[]).includes(nm(p))) p.isTerastallized=true;
 for(const p of enemy) if((P.foeTera||[]).includes(nm(p))) p.isTerastallized=true;
 for(const p of [...party,...enemy]) if((P.hp||{})[nm(p)]!=null) p.hp=Math.max(0,Math.round(p.getMaxHp()*P.hp[nm(p)]));
 const ours=party.find(p=>nm(p)===P.ours);
 const alive=enemy.filter(e=>!(P.dead||[]).includes(nm(e)) && e.hp>0);
 const leg=ours.species.legendary?0.5:1;
 const bench=alive.filter(e=>nm(e)!==P.foe).map(e=>[nm(e),+(e.getMatchupScore(ours)*leg).toFixed(2)]).sort((a,b)=>b[1]-a[1]);
 const foe=alive.find(e=>nm(e)===P.foe);
 const c=P.counter||0, mult=1-(c?Math.pow(0.1,1/c):0);
 if(foe){ const a=+foe.getMatchupScore(ours).toFixed(2); const sw=bench.length && bench[0][1]*mult>=a*2;
   out={vs:P.ours, active:[P.foe,a], need:+(a*2).toFixed(2), mult:+mult.toFixed(2), bench, decision: sw?('SWITCH → '+bench[0][0]):'stays'}; }
 else out={vs:P.ours, sendIn: bench.length?bench[0][0]:null, bench};
} finally {
 for(const [p,t,h] of touched){p.isTerastallized=t;p.hp=h;}
 for (const [k, own, f] of saved) { if (own) pm[k] = f; else delete pm[k]; }
 Phaser.Math.RND.state(rnd);
}
return JSON.stringify(out);
})()
