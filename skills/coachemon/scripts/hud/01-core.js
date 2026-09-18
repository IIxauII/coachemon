// Shared building blocks: type chart, ability immunities, stats, move attributes, icons.
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
// Immunities by move flag rather than type.
export const ABILITY_IMMUNE_FLAG = { "Soundproof": MoveFlags.SOUND_BASED, "Bulletproof": MoveFlags.BALLBOMB_MOVE, "Overcoat": MoveFlags.POWDER_MOVE, "Wind Rider": MoveFlags.WIND_MOVE };
export const moveHasFlag = (mv, f) => (typeof mv?.hasFlag === "function" ? mv.hasFlag(f) : !!((mv?.flags ?? 0) & f));

export const typesOf = p => p.getTypes().map(t => TYPES[t]).filter(Boolean);
export const abilitiesOf = p => [p.getAbility()?.name, p.hasPassive?.() ? p.getPassiveAbility()?.name : null].filter(Boolean);
export const vs = (atk, def) => {
  const [se, nve, none] = CHART[atk] ?? [[], [], []];
  return none.includes(def) ? 0 : se.includes(def) ? 2 : nve.includes(def) ? 0.5 : 1;
};
// ---- One effectiveness
// Everything that asks "how hard does this type hit that" goes through `effectiveness`, and it answers about a plain
// **defender**: `{ types: [name], abilities: [name] }`. That is all the chart and the ability immunities need, so a
// species the biome card only knows by name is asked the same way as a mon on the field — the cards can't drift apart
// on the type chart, and a defender with no abilities simply has no ability immunities.
// `defenderOf` adapts what the HUD holds instead: a live mon (through the game's own `getTypes` / `getAbility`), a
// preview foe from the replay (`{ types, ability, passive }`), or a plain defender, which it hands back unchanged. It
// is idempotent, and `effectiveness` runs it on whatever it is given, so no caller can pass the wrong shape.
export const defenderOf = x => (typeof x?.getTypes === "function"
  ? { types: typesOf(x), abilities: abilitiesOf(x) }
  : { types: x?.types ?? [], abilities: (x?.abilities ?? [x?.ability, x?.passive]).filter(Boolean) });
// `mv` (optional): the move, so flag immunities (Soundproof and co.) apply too. They are read wherever a move is
// known; a caller that has only a type gets the chart and the type immunities.
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
// Natures: the enum is the grid 5·raised + lowered over [Atk, Def, Spe, SpA, SpD], neutral on the diagonal.
// `upStat` / `downStat` are Stat indices (1 atk, 2 def, 3 spa, 4 spd, 5 spe); null when neutral.
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
// i: 1 atk, 2 def, 3 spa, 4 spd, 5 spe. statStages has no HP slot.
export const stat = (p, i) => p.getStat(i) * stage(p.summonData?.statStages?.[i - 1] ?? 0);

// A damage distribution ([{ d, p }] or a Map d → p) cut down to at most `k` points by joining the two closest
// neighbours into their weighted mean, over and over: the KO thresholds that matter keep their sharp edges, a miss
// (0) and a crit stay apart from the rolls. A point's hit count `n`, where given, is averaged the same way.
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

// Reward rarities, indexed by `ModifierTier`. Named here rather than on the shop card, because the look-ahead quotes a
// fixed battle's pinned tiers waves before a shop exists (49-ahead's `rewardRules`) and a file never reads a later one.
export const TIER_NAMES = ["Common", "Great", "Ultra", "Rogue", "Master", "Luxury"];

export const SPREAD_TARGETS = [MoveTarget.ALL_OTHERS, MoveTarget.ALL_NEAR_OTHERS, MoveTarget.ALL_NEAR_ENEMIES, MoveTarget.ALL_ENEMIES];
export const hasAttr = (mv, name) => (mv.attrs || []).some(a => a.constructor.name === name);

export const TRAPS = new Set([...Object.keys(ABILITY_IMMUNE), ...Object.keys(ABILITY_IMMUNE_FLAG), "Wonder Guard", "Thick Fat", "Heatproof", "Solid Rock", "Filter", "Prism Armor", "Sturdy", "Intimidate", "Guts", "Fluffy", "Simple",
  // Punish contact or being hit: chip, status, stat drops, a lost ability.
  "Iron Barbs", "Rough Skin", "Static", "Flame Body", "Poison Point", "Effect Spore", "Cursed Body", "Gooey", "Tangling Hair", "Mummy", "Weak Armor", "Stamina",
  // Turn our hits, stat drops or KOs into boosts; undo chip or status; ignore our boosts or residual damage.
  "Justified", "Defiant", "Competitive", "Moxie", "Beast Boost", "Speed Boost", "Shed Skin", "Natural Cure", "Regenerator", "Unaware", "Magic Guard", "Marvel Scale", "Fur Coat"]);
export const STATUS_FRAMES = [null, "poison", "toxic", "paralysis", "sleep", "freeze", "burn"]; // by StatusEffect
export const iconOf = p => { try { return [p.getIconAtlasKey(), String(p.getIconId())]; } catch { return null; } };

// ---- Which build the page is running
// The HUD is written against one pinned version of the game, so a rule that changed between builds has to ask which
// one it is in rather than pick a side. `gameVersionOf` is the dotted string the game keeps on its Phaser config
// ("1.12.0.11"); `versionAtLeast` compares two of those segment by segment, missing segments counting as 0.
// A version that can't be read is older than everything: the pinned reading is what the HUD has, so it is what it
// falls back to.
export const gameVersionOf = s => { try { return s?.game?.config?.gameVersion ?? null; } catch { return null; } };
export const versionAtLeast = (version, least) => {
  if (!version) return false;
  const a = String(version).split("."), b = String(least).split(".");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (parseInt(a[i], 10) || 0) - (parseInt(b[i], 10) || 0);
    if (d) return d > 0;
  }
  return true;
};

// ---- Calling the game's own code safely
// Even the game's "simulated" paths have hidden effects (see game-code.md §0): they can
// queue ability displays/messages, record abilities in waveData/summonData.abilitiesApplied, draw from the battle
// RNG (Outrage-type targeting, consecutive Protect, Shell Side Arm ties, Psywave) or Phaser's global RNG (Present),
// and write turnData (Tera Shell's moveEffectiveness; our own multi-hit hitCount/hitsLeft). `sandbox` runs `fn`
// with the phase queue muted and restores all of that afterwards. It is synchronous, so nothing else runs in
// between and the restore is exact. Wrap a whole refresh in one sandbox; never call game functions outside it
// unless the spec lists them as pure reads.
const QUEUE_METHODS = ["pushPhase", "unshiftPhase", "pushNew", "unshiftNew", "queueMessage", "queueAbilityDisplay", "hideAbilityBar", "queueFaintPhase"];
let sandboxBreaches = 0; // times a restore didn't match — surfaced on the panel, never expected
export const sandboxBreachCount = () => sandboxBreaches;
export const sandbox = (s, fn) => {
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
// Game-code calls only run while the game is waiting on a player decision: no phase is mid-execution, and the
// enemy's decisions for the turn haven't been made yet. "check-switch" is the free "Will you switch?" prompt at an
// encounter's start (and its party screen); "faint-switch" replaces a fainted mon. A U-turn-style mid-turn switch
// (modal SwitchPhase with doReturn) is excluded: the turn is still resolving. See references/game-code.md §9.
export const awaitingDecision = s => {
  const ph = s.phaseManager?.getCurrentPhase?.();
  if (ph?.phaseName === "CommandPhase") return "command";
  // SwitchPhase(0, slot, isModal false, doReturn true) is the party screen after answering Yes.
  if (ph?.phaseName === "CheckSwitchPhase" || (ph?.phaseName === "SwitchPhase" && !ph.isModal)) return "check-switch";
  if (ph?.phaseName === "SwitchPhase" && ph.isModal && !ph.doReturn) return "faint-switch";
  return null;
};

// A game call writes `turnData` as it goes — our own multi-hit hitCount/hitsLeft, Tera Shell's moveEffectiveness —
// and the next call in the same turn would read what the last one left. The turn's sandbox puts all of it back, but
// only when the whole refresh ends, so a read that writes turnData undoes it as soon as it is done. This is what the
// old per-call sandboxes were really for; unlike them it nests nothing and touches nothing else.
export const keepTurnData = (mons, fn) => {
  const saved = mons.filter(p => p?.turnData).map(p => [p.turnData, { hitCount: p.turnData.hitCount, hitsLeft: p.turnData.hitsLeft, moveEffectiveness: p.turnData.moveEffectiveness }]);
  try { return fn(); } finally { for (const [td, v] of saved) Object.assign(td, v); }
};

// ---- Forcing the battle RNG
// Game code the HUD calls draws from the battle RNG in a few places — the enemy AI's Outrage-type targeting and
// consecutive Protect, a move's own `applyConditions`. `forcedRng` answers those draws from `pick(range)` instead and
// records the ranges asked for, so each branch can be evaluated and weighed by its chance rather than sampled;
// `withPick` sets the answer for one call and hands back the ranges it drew. The sandbox restores the seed either way,
// so these only decide *which* branch the call takes. Only inside `sandbox`.
let rngPick = range => (range - 1) >> 1;
let rngRanges = [];
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
