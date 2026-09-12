// PROTOTYPE — read-only. What does the PARTY screen expose and is CANCEL allowed?
import { connect, inGame } from './lib.mjs';
const cdp = await connect();
const r = await cdp.evaluate(inGame(`
  const h = handler;
  return {
    handler: h.constructor.name,
    mode: ui.mode,
    partyUiMode: h.partyUiMode,
    cursor: h.cursor,
    optionsCursor: h.optionsCursor,
    options: h.options,
    partyUiModeIsSwitch: h.partyUiMode === 1,
    phase: scene.phaseManager && scene.phaseManager.currentPhase ? scene.phaseManager.currentPhase.constructor.name : null,
    party: scene.getPlayerParty().map((p, i) => ({
      i, name: p.name, species: p.species.speciesId, level: p.level,
      hp: p.hp, maxHp: p.getMaxHp ? p.getMaxHp() : null,
      fainted: p.isFainted ? p.isFainted() : null,
      active: p.isActive ? p.isActive() : null,
      onField: p.isOnField ? p.isOnField() : null,
    })),
    fieldSize: scene.currentBattle ? scene.currentBattle.getBattlerCount() : null,
    double: scene.currentBattle ? scene.currentBattle.double : null,
    keys: Object.keys(h).sort(),
  };
`));
console.log(JSON.stringify(r, null, 2));
cdp.close();
