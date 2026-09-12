// PROTOTYPE — read-only. Is the wave-1 enemy still alive, and whose turn is it?
import { connect, inGame } from './lib.mjs';
const cdp = await connect();
const r = await cdp.evaluate(inGame(`
  const b = scene.currentBattle;
  return {
    mode: ui.mode,
    phase: scene.phaseManager && scene.phaseManager.currentPhase ? scene.phaseManager.currentPhase.constructor.name : null,
    wave: b ? b.waveIndex : null,
    turn: b ? b.turn : null,
    battleType: b ? b.battleType : null,
    double: b ? b.double : null,
    money: scene.money,
    enemies: b && b.enemyParty ? b.enemyParty.map(p => ({
      name: p.name, level: p.level, hp: p.hp, maxHp: p.getMaxHp(), fainted: p.isFainted(),
    })) : null,
    party: scene.getPlayerParty().map(p => ({
      name: p.name, level: p.level, hp: p.hp, maxHp: p.getMaxHp(), exp: p.exp, onField: p.isOnField(),
      moves: p.moveset ? p.moveset.map(m => m && m.getName ? m.getName() : (m && m.moveId)) : null,
    })),
    commandOptions: handler.config && handler.config.options ? handler.config.options.map(o => o.label) : null,
  };
`));
console.log(JSON.stringify(r, null, 2));
cdp.close();
