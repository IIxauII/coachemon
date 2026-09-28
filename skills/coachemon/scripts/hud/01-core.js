export const TYPES = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
// attacker: [super effective, not very effective, no effect]
export const CHART = {
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
export const ABILITY_IMMUNE = {
  "Levitate": "Ground", "Earth Eater": "Ground",
  "Flash Fire": "Fire", "Well-Baked Body": "Fire",
  "Water Absorb": "Water", "Storm Drain": "Water", "Dry Skin": "Water",
  "Volt Absorb": "Electric", "Lightning Rod": "Electric", "Motor Drive": "Electric",
  "Sap Sipper": "Grass",
};
export const ABILITY_IMMUNE_FLAG = { "Soundproof": MoveFlags.SOUND_BASED, "Bulletproof": MoveFlags.BALLBOMB_MOVE, "Overcoat": MoveFlags.POWDER_MOVE, "Wind Rider": MoveFlags.WIND_MOVE };
export const moveHasFlag = (mv, f) => (typeof mv?.hasFlag === "function" ? mv.hasFlag(f) : !!((mv?.flags ?? 0) & f));

export const typesOf = p => p.getTypes().map(t => TYPES[t]).filter(Boolean);
export const abilitiesOf = p => [p.getAbility()?.name, p.hasPassive?.() ? p.getPassiveAbility()?.name : null].filter(Boolean);
export const vs = (atk, def) => {
  const [se, nve, none] = CHART[atk] ?? [[], [], []];
  return none.includes(def) ? 0 : se.includes(def) ? 2 : nve.includes(def) ? 0.5 : 1;
};
// Idempotent, so `effectiveness` takes a live mon, a replayed foe (`{ types, ability, passive }`) or a plain defender.
export const defenderOf = x => (typeof x?.getTypes === "function"
  ? { types: typesOf(x), abilities: abilitiesOf(x) }
  : { types: x?.types ?? [], abilities: (x?.abilities ?? [x?.ability, x?.passive]).filter(Boolean) });
// Pass `mv` wherever the move is known: without it, Soundproof and the other flag immunities never apply.
export const effectiveness = (type, defender, mv) => {
  const { types, abilities: ab } = defenderOf(defender);
  if (ab.some(a => ABILITY_IMMUNE[a] === type || (mv && ABILITY_IMMUNE_FLAG[a] && moveHasFlag(mv, ABILITY_IMMUNE_FLAG[a])))) return 0;
  let m = types.reduce((x, d) => x * vs(type, d), 1);
  if (ab.includes("Wonder Guard") && m < 2) return 0;
  if (ab.includes("Thick Fat") && (type === "Fire" || type === "Ice")) m /= 2;
  if (ab.includes("Heatproof") && type === "Fire") m /= 2;
  if (m >= 2 && ab.some(a => a === "Solid Rock" || a === "Filter" || a === "Prism Armor")) m *= 0.75;
  return m;
};
const NATURE_STATS = ["Atk", "Def", "Spe", "SpA", "SpD"];
const NATURE_STAT_IDS = [Stat.ATK, Stat.DEF, Stat.SPD, Stat.SPATK, Stat.SPDEF];
const NATURES = ["Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed", "Impish", "Lax", "Timid",
  "Hasty", "Serious", "Jolly", "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash", "Calm", "Gentle", "Sassy",
  "Careful", "Quirky"];
export const natureOf = n => {
  const up = Math.floor(n / 5), down = n % 5, neutral = up === down;
  return { name: NATURES[n] ?? `#${n}`, up: neutral ? null : NATURE_STATS[up], down: neutral ? null : NATURE_STATS[down],
    upStat: neutral ? null : NATURE_STAT_IDS[up], downStat: neutral ? null : NATURE_STAT_IDS[down] };
};
export const stage = s => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
// `i` is a `Stat` index; `statStages` has no HP slot.
export const stat = (p, i) => p.getStat(i) * stage(p.summonData?.statStages?.[i - 1] ?? 0);

export const squeezeDist = (points, k) => {
  const out = [...(points instanceof Map ? [...points].map(([d, p]) => ({ d, p })) : points.map(x => ({ ...x })))]
    .filter(x => x.p > 0).sort((a, b) => a.d - b.d);
  while (out.length > k) {
    let at = 0;
    for (let i = 1; i < out.length - 1; i++) if (out[i + 1].d - out[i].d < out[at + 1].d - out[at].d) at = i;
    const [a, b] = [out[at], out[at + 1]];
    const p = a.p + b.p;
    out.splice(at, 2, { d: (a.d * a.p + b.d * b.p) / p, p, ...(a.n != null || b.n != null ? { n: ((a.n ?? 1) * a.p + (b.n ?? 1) * b.p) / p } : {}) });
  }
  return out;
};

// Indexed by `ModifierTier`.
export const TIER_NAMES = ["Common", "Great", "Ultra", "Rogue", "Master", "Luxury"];

export const SPREAD_TARGETS = [MoveTarget.ALL_OTHERS, MoveTarget.ALL_NEAR_OTHERS, MoveTarget.ALL_NEAR_ENEMIES, MoveTarget.ALL_ENEMIES];
export const hasAttr = (mv, name) => (mv.attrs || []).some(a => a.constructor.name === name);

export const CONTACT_PUNISH = ["Iron Barbs", "Rough Skin", "Static", "Flame Body", "Poison Point", "Effect Spore", "Cursed Body", "Gooey", "Tangling Hair", "Mummy"];

// (CONTEXT.md, `Trap`)
export const MOVE_TRAPS = new Set([...Object.keys(ABILITY_IMMUNE), ...Object.keys(ABILITY_IMMUNE_FLAG), "Wonder Guard",
  "Thick Fat", "Heatproof", "Fluffy", "Solid Rock", "Filter", "Prism Armor", "Intimidate",
  ...CONTACT_PUNISH]);
export const FIELD_TRAPS = new Set(["Guts", "Simple", "Weak Armor", "Stamina",
  "Justified", "Defiant", "Competitive", "Moxie", "Beast Boost", "Speed Boost", "Shed Skin", "Natural Cure", "Regenerator", "Unaware", "Magic Guard", "Marvel Scale", "Fur Coat"]);
export const TRAPS = new Set([...MOVE_TRAPS, ...FIELD_TRAPS, "Sturdy"]);
// A percent swing on a mon's power.
export const GREAT_ABILITY = 12, GOOD_ABILITY = 6, BAD_ABILITY = -20;
const GREAT_ABILITIES = new Set(["Speed Boost", "Parental Bond", "Adaptability", "Magic Guard", "Multiscale", "Shadow Shield", "Protean",
  "Libero", "Beast Boost", "Moxie", "Regenerator", "Intimidate", "Good as Gold", "Unaware", "Prankster", "Sheer Force",
  "Tough Claws", "Technician", "Levitate", "Drought", "Drizzle", "Magic Bounce", "Contrary", "Simple", "Tinted Lens",
  "Serene Grace", "Supreme Overlord", "Sword of Ruin", "Beads of Ruin", "Tablets of Ruin", "Vessel of Ruin"]);
const GOOD_ABILITIES = new Set(["Sand Stream", "Snow Warning", "Thick Fat", "Filter", "Solid Rock", "Prism Armor", "Fur Coat", "Ice Scales",
  "Guts", "Download", "Mold Breaker", "Skill Link", "Strong Jaw", "Iron Fist", "Sharpness", "Aerilate", "Pixilate",
  "Refrigerate", "Galvanize", "Swift Swim", "Chlorophyll", "Sand Rush", "Slush Rush", "Poison Heal", "Water Absorb",
  "Volt Absorb", "Flash Fire", "Storm Drain", "Lightning Rod", "Sap Sipper", "Motor Drive", "Earth Eater",
  "Well-Baked Body", "Dragon's Maw", "Transistor", "Steelworker", "Rocky Payload", "Gorilla Tactics", "Sturdy",
  "Natural Cure", "Unburden", "Hustle", "Punk Rock", "Quark Drive", "Protosynthesis", "Stamina", "Justified"]);
const BAD_ABILITIES = new Set(["Truant", "Slow Start", "Defeatist", "Klutz", "Stall", "Normalize"]);
export const abilityValue = name =>
  (GREAT_ABILITIES.has(name) ? GREAT_ABILITY : GOOD_ABILITIES.has(name) ? GOOD_ABILITY : BAD_ABILITIES.has(name) ? BAD_ABILITY : 0);
export const STATUS_FRAMES = [null, "poison", "toxic", "paralysis", "sleep", "freeze", "burn"]; // by StatusEffect
export const iconOf = p => { try { return [p.getIconAtlasKey(), String(p.getIconId())]; } catch { return null; } };

export const gameVersionOf = s => { try { return s?.game?.config?.gameVersion ?? null; } catch { return null; } };
// An unreadable version is older than everything, so a caller's `false` branch must be the pinned build's rule.
export const versionAtLeast = (version, least) => {
  if (!version) return false;
  const a = String(version).split("."), b = String(least).split(".");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (parseInt(a[i], 10) || 0) - (parseInt(b[i], 10) || 0);
    if (d) return d > 0;
  }
  return true;
};

const QUEUE_METHODS = ["pushPhase", "unshiftPhase", "pushNew", "unshiftNew", "queueMessage", "queueAbilityDisplay", "hideAbilityBar", "queueFaintPhase"];
let sandboxBreaches = 0;
export const sandboxBreachCount = () => sandboxBreaches;
// @only 25-turn, 26-run, 20-enemy-ai, tests: sandbox
// `fn` must finish synchronously: the restore runs the moment it returns (game-code.md §0).
export const sandbox = (s, fn) => {
  const pm = s.phaseManager ?? {};
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
// The turn read and the run read each open their own sandbox, and this keeps them one after the other, never nested.
// @only 25-turn, 26-run, tests: openRead, closeRead
let reading = null;
export const openRead = name => {
  if (reading) throw new Error(`${name} read while a ${reading} read is open`);
  reading = name;
};
export const closeRead = () => { reading = null; };

// Game calls run only while this answers: nothing is mid-execution and the enemy has not chosen yet (game-code.md §9).
export const awaitingDecision = s => {
  const ph = s.phaseManager?.getCurrentPhase?.();
  if (ph?.phaseName === "CommandPhase") return "command";
  if (ph?.phaseName === "CheckSwitchPhase" || (ph?.phaseName === "SwitchPhase" && !ph.isModal)) return "check-switch";
  if (ph?.phaseName === "SwitchPhase" && ph.isModal && !ph.doReturn) return "faint-switch";
  return null;
};

// The sandbox restores `turnData` only when the refresh ends, so without this the next call in the same refresh reads
// the hitCount, hitsLeft or Tera Shell effectiveness the last one left (game-code.md §0).
export const keepTurnData = (mons, fn) => {
  const saved = mons.filter(p => p?.turnData).map(p => [p.turnData, { hitCount: p.turnData.hitCount, hitsLeft: p.turnData.hitsLeft, moveEffectiveness: p.turnData.moveEffectiveness }]);
  try { return fn(); } finally { for (const [td, v] of saved) Object.assign(td, v); }
};

let rngPick = range => (range - 1) >> 1;
let rngRanges = [];
// Only inside `sandbox`.
export const forcedRng = (s, fn) => {
  const battle = s.currentBattle;
  const own = Object.prototype.hasOwnProperty.call(battle, "randSeedInt"), prev = battle.randSeedInt;
  battle.randSeedInt = (range, min = 0) => (range <= 1 ? min : (rngRanges.push(range), min + rngPick(range)));
  try { return fn(); } finally { if (own) battle.randSeedInt = prev; else delete battle.randSeedInt; }
};
export const withPick = (pick, fn) => {
  const prevPick = rngPick, prevRanges = rngRanges;
  rngPick = pick; rngRanges = [];
  try { return [fn(), rngRanges]; } finally { rngPick = prevPick; rngRanges = prevRanges; }
};
