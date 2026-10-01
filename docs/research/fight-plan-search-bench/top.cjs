const fs=require("fs");const d=process.argv[2];const f=fs.readdirSync(d)[0];const p=JSON.parse(fs.readFileSync(d+"/"+f));
const self={};const dt={};p.samples.forEach((s,i)=>{dt[s]=(dt[s]||0)+(p.timeDeltas[i]||0)});
for(const n of p.nodes){const k=n.callFrame.functionName+":"+n.callFrame.lineNumber;self[k]=(self[k]||0)+(dt[n.id]||0)}
const tot=Object.values(self).reduce((a,b)=>a+b,0);Object.entries(self).sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([k,v])=>console.log((v/tot*100).toFixed(1)+"%",k));console.log("total ms",(tot/1000).toFixed(0))
