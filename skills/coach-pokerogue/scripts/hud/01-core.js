// Shared building blocks: type chart, ability immunities, stats, move attributes, icons.
const TYPES = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
// attacker: [super effective, not very effective, no effect]
const CHART = {
  Normal: [[], ["Rock","Steel"], ["Ghost"]],
  Fighting: [["Normal","Rock","Steel","Ice","Dark"], ["Flying","Poison","Bug","Psychic","Fairy"], ["Ghost"]],
  Flying: [["Fighting","Bug","Grass"], ["Rock","Steel","Electric"], []],
  Poison: [["Grass","Fairy"], ["Poison","Ground","Rock","Ghost"], ["Steel"]],
  Ground: [["Poison","Rock","Steel","Fire","Electric"], ["Bug","Grass"], ["Flying"]],
  Rock: [["Flying","Bug","Fire","Ice"], ["Fighting","Ground","Steel"], []],
  Bug: [["Grass","Psychic","Dark"], ["Fighting","Flying","Poison","Ghost","Steel","Fire","Fairy"], []],
  Ghost: [["Ghost","Psychic"], ["Dark"], ["Normal"]],
  Steel: [["Rock","Ice","Fairy"], ["Steel","Fire","Water","Electric"], []],
  Fire: [["Bug","Steel","Grass","Ice"], ["Rock","Fire","Water","Dragon"], []],
  Water: [["Ground","Rock","Fire"], ["Water","Grass","Dragon"], []],
  Grass: [["Ground","Rock","Water"], ["Flying","Poison","Bug","Steel","Fire","Grass","Dragon"], []],
  Electric: [["Flying","Water"], ["Grass","Electric","Dragon"], ["Ground"]],
  Psychic: [["Fighting","Poison"], ["Steel","Psychic"], ["Dark"]],
  Ice: [["Flying","Ground","Grass","Dragon"], ["Steel","Fire","Water","Ice"], []],
  Dragon: [["Dragon"], ["Steel"], ["Fairy"]],
  Dark: [["Ghost","Psychic"], ["Fighting","Dark","Fairy"], []],
  Fairy: [["Fighting","Dragon","Dark"], ["Poison","Steel","Fire"], []],
};
const ABILITY_IMMUNE = {
  "Levitate": "Ground", "Earth Eater": "Ground",
  "Flash Fire": "Fire", "Well-Baked Body": "Fire",
  "Water Absorb": "Water", "Storm Drain": "Water", "Dry Skin": "Water",
  "Volt Absorb": "Electric", "Lightning Rod": "Electric", "Motor Drive": "Electric",
  "Sap Sipper": "Grass",
};

const typesOf = p => p.getTypes().map(t => TYPES[t]).filter(Boolean);
const abilitiesOf = p => [p.getAbility()?.name, p.hasPassive?.() ? p.getPassiveAbility()?.name : null].filter(Boolean);
const vs = (atk, def) => {
  const [se, nve, none] = CHART[atk] ?? [[], [], []];
  return none.includes(def) ? 0 : se.includes(def) ? 2 : nve.includes(def) ? 0.5 : 1;
};
const effectiveness = (type, p) => {
  const ab = abilitiesOf(p);
  if (ab.some(a => ABILITY_IMMUNE[a] === type)) return 0;
  let m = typesOf(p).reduce((x, d) => x * vs(type, d), 1);
  if (ab.includes("Wonder Guard") && m < 2) return 0;
  if (ab.includes("Thick Fat") && (type === "Fire" || type === "Ice")) m /= 2;
  if (ab.includes("Heatproof") && type === "Fire") m /= 2;
  if (m >= 2 && ab.some(a => a === "Solid Rock" || a === "Filter" || a === "Prism Armor")) m *= 0.75;
  return m;
};
const stage = s => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
// i: 1 atk, 2 def, 3 spa, 4 spd, 5 spe. statStages has no HP slot.
const stat = (p, i) => p.getStat(i) * stage(p.summonData?.statStages?.[i - 1] ?? 0);

const SPREAD_TARGETS = [2, 4, 6, 8]; // MoveTarget ALL_OTHERS, ALL_NEAR_OTHERS, ALL_NEAR_ENEMIES, ALL_ENEMIES
const hasAttr = (mv, name) => (mv.attrs || []).some(a => a.constructor.name === name);

const TRAPS = new Set([...Object.keys(ABILITY_IMMUNE), "Wonder Guard", "Thick Fat", "Heatproof", "Solid Rock", "Filter", "Prism Armor", "Sturdy", "Intimidate", "Guts", "Fluffy", "Simple"]);
const STATUS_FRAMES = [null, "poison", "toxic", "paralysis", "sleep", "freeze", "burn"];
const iconOf = p => { try { return [p.getIconAtlasKey(), String(p.getIconId())]; } catch { return null; } };

// ---- Calling the game's own code safely
// Even the game's "simulated" paths have hidden effects (read from the live build; see the coach spec): they can
// queue ability displays/messages, record abilities in waveData/summonData.abilitiesApplied, draw from the battle
// RNG (Outrage-type targeting, consecutive Protect, Shell Side Arm ties, Psywave) or Phaser's global RNG (Present),
// and write turnData (Tera Shell's moveEffectiveness; our own multi-hit hitCount/hitsLeft). `sandbox` runs `fn`
// with the phase queue muted and restores all of that afterwards. It is synchronous, so nothing else runs in
// between and the restore is exact. Wrap a whole refresh in one sandbox; never call game functions outside it
// unless the spec lists them as pure reads.
const QUEUE_METHODS = ["pushPhase", "unshiftPhase", "pushNew", "unshiftNew", "queueMessage", "queueAbilityDisplay", "hideAbilityBar", "queueFaintPhase"];
let sandboxBreaches = 0; // times a restore didn't match — surfaced on the panel, never expected
const sandbox = (s, fn) => {
  const pm = s.phaseManager;
  const queue = QUEUE_METHODS.filter(k => typeof pm[k] === "function").map(k => [k, Object.prototype.hasOwnProperty.call(pm, k), pm[k]]);
  const rnd = Phaser.Math.RND.state();
  const battle = s.currentBattle;
  const seed = battle?.battleSeedState;
  const rngOffset = s.rngOffset, rngSeedOverride = s.rngSeedOverride;
  const mons = [...(s.getPlayerParty?.() ?? []), ...(s.getEnemyParty?.() ?? [])].filter(Boolean).map(p => ({
    p,
    wave: p.waveData?.abilitiesApplied && new Set(p.waveData.abilitiesApplied),
    summon: p.summonData?.abilitiesApplied && new Set(p.summonData.abilitiesApplied),
    turn: p.turnData && { hitCount: p.turnData.hitCount, hitsLeft: p.turnData.hitsLeft, moveEffectiveness: p.turnData.moveEffectiveness },
  }));
  for (const [k] of queue) pm[k] = () => {};
  try {
    return fn();
  } finally {
    for (const [k, own, f] of queue) { if (own) pm[k] = f; else delete pm[k]; }
    Phaser.Math.RND.state(rnd);
    if (battle) battle.battleSeedState = seed;
    s.rngOffset = rngOffset;
    s.rngSeedOverride = rngSeedOverride;
    for (const { p, wave, summon, turn } of mons) {
      if (wave) p.waveData.abilitiesApplied = wave;
      if (summon) p.summonData.abilitiesApplied = summon;
      if (turn) Object.assign(p.turnData, turn);
    }
    if (Phaser.Math.RND.state() !== rnd || (battle && battle.battleSeedState !== seed)) sandboxBreaches++;
  }
};
// Game-code calls only run while the game is waiting for the player's command: no phase is mid-execution, and
// the enemy's decisions for the turn haven't been made yet.
const awaitingCommand = s => s.phaseManager?.getCurrentPhase?.()?.phaseName === "CommandPhase";
