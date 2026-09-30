// Are the `coach:` markers on the same clock as the export's records? Every refresh runs inside some script task
// (the 1 s timer, an event, a frame), so each `coach:refresh` marker should sit inside one; and a GC is an allocation
// pause on the main thread, so it should never overlap a script task it is not nested in.
import fs from "node:fs";

const rec = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).recording;
const FROM = rec.discontinuities[0].endTime;
const tasks = rec.records.filter(x => x.type === "timeline-record-type-script" && x.eventType !== "garbage-collected"
  && x.endTime > x.startTime && x.startTime >= FROM).sort((a, b) => a.startTime - b.startTime);
const name = m => (typeof m.details === "string" ? m.details : m.details?.name) ?? "";
const marks = rec.markers.filter(m => m.time >= FROM && name(m) === "coach:refresh");
const containing = t => tasks.find(x => x.startTime <= t && x.endTime >= t);
const nearest = t => Math.min(...tasks.map(x => (t < x.startTime ? x.startTime - t : t > x.endTime ? t - x.endTime : 0)));
let inTask = 0;
const kinds = {}, off = [];
for (const m of marks) {
  const x = containing(m.time);
  if (x) { inTask++; kinds[x.eventType] = (kinds[x.eventType] ?? 0) + 1; } else off.push(nearest(m.time) * 1000);
}
off.sort((a, b) => a - b);
console.log(`coach:refresh markers: ${marks.length}; inside a script task: ${inTask}`, kinds);
console.log(`outside: ${off.length}, distance to nearest task ms p50 ${off[off.length >> 1]?.toFixed(1)} max ${off.at(-1)?.toFixed(1)}`);

// GC records against the script tasks: nested inside one, or overlapping none?
const gcs = rec.records.filter(x => x.eventType === "garbage-collected" && x.startTime >= FROM);
let nested = 0, partial = 0;
for (const g of gcs) {
  const o = tasks.filter(x => x.endTime > g.startTime && x.startTime < g.endTime);
  if (o.some(x => x.startTime <= g.startTime && x.endTime >= g.endTime)) nested++;
  else if (o.length) partial++;
}
console.log(`GCs: ${gcs.length}; nested in a script task: ${nested}; straddling one: ${partial}; between tasks: ${gcs.length - nested - partial}`);
