// PROTOTYPE (#174): one line per trial from a lab log. Usage: node summarize.mjs lab-chrome.jsonl [...]
import fs from "node:fs";

for (const file of process.argv.slice(2)) {
  console.log(`# ${file}`);
  for (const r of fs.readFileSync(file, "utf8").trim().split("\n").map(l => JSON.parse(l))) {
    if (r.event === "trial") {
      const expectHidden = r.state === "front" ? 0 : r.totalPolls;
      const clean = r.hiddenPolls === expectHidden ? "" : ` DIRTY(${r.hiddenPolls}/${r.totalPolls} hidden)`;
      console.log(`${r.tag} ${r.state.padEnd(8)} ${r.fix.padEnd(13)} rep${r.rep} idle=${r.idleS} vis=${r.vis} fps=${r.fps} raf=${r.rafPerS} timer=${r.timerPerS} worker=${r.workerMsgsPerS} ` +
        `clock=${r.clockMsPerS} cleared=${r.overlayClearedMs ?? "NEVER"} afterShow=${r.clearedAfterRestoreMs} audio=${r.audio}${r.mute ? "/muted" : ""}${r.fixAudio ? "+osc:" + r.fixAudio : ""}${clean}`);
    } else if (/error|skip|missing|closed/.test(r.event)) console.log(`${r.event} ${JSON.stringify(r).slice(0, 240)}`);
  }
}
