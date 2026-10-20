export const TY = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
export const cat = { P: 0, S: 1, X: 2 };
// moves: [name, type, power, cat, priority = 0, { target = 3, attrs = [], id }]; an attr is a class name, or
// [name, fields] for one that carries its constructor arguments.
export const attr = a => (Array.isArray(a) ? Object.assign(new ({ [a[0]]: class {} })[a[0]](), a[1]) : new ({ [a]: class {} })[a]());
// `getTypes` follows `summonData` as the game's does (game-code.md §14), so a hypothesis the planner writes shows here.
const monTypes = (sd, types) => () => {
  const base = sd.types?.length ? [...sd.types] : types.map(t => TY.indexOf(t));
  return sd.addedType != null && !base.includes(sd.addedType) ? [...base, sd.addedType] : base;
};
export const mon = (name, lv, types, [hp, atk, def, spa, spd, spe], moves, field, curHp, extra = {}, summonData = { statStages: [0,0,0,0,0,0,0], types: [] }) => ({
  id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
  name, level: lv, hp: curHp ?? hp, getMaxHp: () => hp, getTypes: monTypes(summonData, types), getAbility: () => ({ name: "x" }), hasPassive: () => false,
  getStat: i => [hp, atk, def, spa, spd, spe][i], summonData, isOnField: () => field, isBoss: () => !!extra.bossSegments,
  getIconAtlasKey: () => "k", getIconId: () => 1, status: null, getBattlerIndex: () => (field ? 0 : -1), getHeldItems: () => [],
  moveset: moves.map(([n, t, p, c, priority = 0, { target = 3, attrs = [], id } = {}]) => ({ getName: () => n, moveId: id, getMove: () => ({ id, name: n, type: TY.indexOf(t), power: p, category: cat[c], moveTarget: target, priority, accuracy: 100, attrs: attrs.map(attr) }), getMovePp: () => 10, ppUsed: 0 })),
  ...extra,
});

// 07-move-traits' shape; a scenario that needs a trait sets it on the record it hands back.
export const TRAITS = {
  charge: false, semiCharge: false, recharge: false, interrupt: false, needsAttack: false, once: false, lock: false,
  noRepeat: false, recoil: null, halfSac: false, crash: false, selfKo: null, drops: {}, removesType: false,
};
// `table`: "attacker>move>defender" → [per-hit max damage, accuracy, effectiveness]. Enumerates hits landed × 16
// damage rolls, with boss bars clamping each hit at the bar's boundary.
export const outcomeFrom = table => (atk, def, pm, { crit = false } = {}) => {
  const row = table[`${atk.name}>${pm.getName()}>${def.name}`];
  if (!row) return null;
  const [per, acc, e] = row;
  // Stat stages and burn, as the game's damage call has them (game-code.md §1).
  const phys = pm.getMove().category === 0;
  const stg = (p, i) => { const x = p.summonData?.statStages?.[i - 1] ?? 0; return x >= 0 ? (2 + x) / 2 : 2 / (2 - x); };
  const mult = (crit ? 1.5 : 1) * stg(atk, phys ? 1 : 3) / stg(def, phys ? 2 : 4) * (phys && atk.status?.effect === 6 ? 0.5 : 1);
  const seg = def.getMaxHp() / (def.bossSegments || 1);
  const land = per.map((_, k) => (k < per.length - 1 ? acc ** (k + 1) * (1 - acc) : acc ** per.length));
  const play = (hits, roll) => {
    let hp = def.hp, idx = def.bossSegments ? def.bossSegmentIndex : 0;
    for (let k = 0; k < hits && hp > 0; k++) {
      let d = Math.floor(per[k] * mult * roll);
      if (idx > 0 && hp - d < seg * idx) { d = hp - seg * idx; idx--; }
      hp -= d;
    }
    return hp;
  };
  let expected = 0, pKo = 0, uncapped = 0;
  per.forEach((x, k) => {
    for (let r = 0; r < 16; r++) uncapped += acc ** (k + 1) / 16 * Math.floor(x * mult * (85 + r) / 100);
  });
  land.forEach((p, i) => {
    for (let r = 0; r < 16; r++) {
      const hp = play(i + 1, (85 + r) / 100);
      expected += p / 16 * (def.hp - Math.max(hp, 0));
      if (hp <= 0) pKo += p / 16;
    }
  });
  const mv = pm.getMove();
  return {
    name: pm.getName(), type: TY[mv.type], cat: mv.category ? "special" : "physical", e, priority: mv.priority, spread: [2, 4, 6, 8].includes(mv.moveTarget),
    acc, dist: [{ n: per.length, p: 1 }], perHit: per.map(x => ({ max: Math.floor(x * mult), min: Math.floor(x * mult * 0.85) })),
    expected, uncapped, max: def.hp - Math.max(play(per.length, 1), 0), pKo, traits: { ...TRAITS }, costs: [], notes: [],
  };
};
