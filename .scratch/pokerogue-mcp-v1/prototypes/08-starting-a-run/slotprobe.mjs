// PROTOTYPE — read-only. What does SAVE_SLOT expose, and which slots are taken?
import { connect, inGame } from './lib.mjs';
const cdp = await connect();
const r = await cdp.evaluate(inGame(`
  const h = handler;
  return {
    handler: h.constructor.name,
    mode: ui.mode,
    cursor: h.cursor,
    scrollCursor: h.scrollCursor,
    sessionSlotsCount: h.sessionSlots ? h.sessionSlots.length : null,
    uiModeArg: h.uiMode,
    slots: h.sessionSlots ? h.sessionSlots.map((s, i) => ({
      i,
      hasData: s.hasData === true,
      // saveSlotUiHandler stores the decoded session in .saveData when present
      wave: s.saveData ? s.saveData.waveIndex : null,
      gameMode: s.saveData ? s.saveData.gameMode : null,
      partyCount: s.saveData && s.saveData.party ? s.saveData.party.length : null,
      timestamp: s.saveData ? s.saveData.timestamp : null,
    })) : null,
    keys: Object.keys(h).sort(),
  };
`));
console.log(JSON.stringify(r, null, 2));
cdp.close();
