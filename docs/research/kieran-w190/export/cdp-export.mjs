// usage: node cdp-export.mjs <out-dir> — reads the pokerogue.net tab on Chrome's debug port 9222; writes <out-dir>/save.json
// (the wave-start save, gameData.getSession) and <out-dir>/live.json (getSessionSaveData), and prints the fields to check.
const out = process.argv[2];
const expr = `(async () => {
  const game = Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game;
  const s = game.scene.getScene("battle"); const gd = s.gameData;
  const big = (k, v) => typeof v === "bigint" ? v.toString() : v;
  const sess = await gd.getSession(s.sessionSlotId);
  return JSON.stringify({ slot: s.sessionSlotId, gameVersion: game.config.gameVersion,
    battleSeed: s.currentBattle.battleSeed, turn: s.currentBattle.turn, wave: s.currentBattle.waveIndex,
    phase: s.phaseManager.getCurrentPhase()?.constructor?.name,
    save: JSON.stringify(sess, big), live: JSON.stringify(gd.getSessionSaveData(), big) });
})()`;
const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
const t = tabs.find(x => x.type === "page" && x.url.includes("pokerogue.net"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true, awaitPromise: true } }));
ws.onmessage = async m => { const d = JSON.parse(m.data); if (d.id !== 1) return;
  const v = d.result?.result?.value; if (!v) { console.log(JSON.stringify(d).slice(0, 2000)); process.exit(1); }
  const o = JSON.parse(v); const fs = await import("node:fs");
  fs.writeFileSync(`${out}/save.json`, o.save); fs.writeFileSync(`${out}/live.json`, o.live);
  const sv = JSON.parse(o.save);
  console.log(JSON.stringify({ slot: o.slot, gameVersion: o.gameVersion, battleSeed: o.battleSeed, turn: o.turn, wave: o.wave, phase: o.phase,
    saveWave: sv.waveIndex, saveSeed: sv.seed, saveVer: sv.gameVersion, ts: sv.timestamp, playTime: sv.playTime, battleType: sv.battleType, trainer: sv.trainer, gameMode: sv.gameMode, mysteryEncounterType: sv.mysteryEncounterType }));
  process.exit(0); };
