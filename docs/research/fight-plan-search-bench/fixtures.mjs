// Hand-built tables for one trainer battle: N of ours against F foes, no game. `kind`: "quick" or "stall".
const rng = seed => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// A 4-point roll spread, as tpSpread leaves it (ratios to the mean, mean 1).
const ROLLS = [{ r: 0.9, p: 0.25, n: 1 }, { r: 0.97, p: 0.25, n: 1 }, { r: 1.03, p: 0.25, n: 1 }, { r: 1.1, p: 0.25, n: 1 }];

export const fixture = (kind, N, F = 3, seed = 1, { ties = false } = {}) => {
  const R = rng(seed * 7919 + N * 31 + (kind === "stall" ? 1000 : 0));
  const U = (a, b) => a + (b - a) * R();
  const ourMax = Array.from({ length: N }, () => Math.round(U(220, 360)));
  const foeMax = Array.from({ length: F }, () => Math.round(U(240, 380)));
  const party = ourMax.map((max, mi) => ({ name: `Our${mi}`, hp: mi === 0 ? max : Math.round(max * (R() < 0.4 ? U(0.45, 0.95) : 1)), getMaxHp: () => max,
    isOnField: () => mi === 0, getIconAtlasKey: () => "k", getIconId: () => mi }));
  const foes = foeMax.map((max, fi) => ({ name: kind === "stall" && fi === 0 ? "Tangela" : `Foe${fi}`, hp: fi === 0 ? Math.round(max * 0.85) : max, getMaxHp: () => max,
    isOnField: () => fi === 0, isBoss: () => false, getIconAtlasKey: () => "k", getIconId: () => 100 + fi }));
  const healer = (mi, max) => (R() < 0.3 ? { base: Math.floor(max / 16), sitrus: 0, enigma: 0 } : R() < 0.2 ? { base: 0, sitrus: Math.floor(max / 4), enigma: 0 } : { base: 0, sitrus: 0, enigma: 0 });
  const ours = ourMax.map((_, mi) => foeMax.map((fm, fi) => {
    let frac = R() < 0.25 ? U(0.12, 0.3) : U(0.35, 0.75);
    if (kind === "stall" && fi === 0) frac = U(0.08, 0.2); // only chips Tangela
    return { name: `Move${mi}${fi}`, type: "Normal", cat: R() < 0.5 ? "physical" : "special", e: 1, priority: 0, dmg: fm * frac, use: ROLLS, drain: 0, self: 0, charge: false, recharge: false, semiCharge: false };
  }));
  const theirs = foeMax.map((_, fi) => ourMax.map((om, mi) => {
    let frac = U(0.22, 0.6), drain = 0;
    if (kind === "stall" && fi === 0) { frac = U(0.08, 0.16); drain = 0.5; } // Mega Drain
    const dmg = om * frac;
    return { dmg, entry: dmg, use: ROLLS, name: `FoeMove${fi}`, e: 1, first: undefined, priority: 0, hits: 1, drain, phys: 1 };
  }));
  const first = ourMax.map(() => foeMax.map(() => { const x = R(); return ties ? 0.2 + 0.6 * x : x < 0.1 ? 0.5 : x < 0.55 ? 1 : 0; }));
  const foeHeal = foeMax.map((max, fi) => (kind === "stall" && fi === 0 ? { base: Math.floor(max / 16), sitrus: 0, enigma: 0 } : healer(fi, max)));
  const T = {
    ours, theirs, slots: 1, first,
    send: foeMax.map(() => ourMax.map(() => ({ base: U(0.5, 4), outspeed: R() < 0.5 }))),
    memo: new Map(),
    foeState: foeMax.map(() => ({ bar: 0 })),
    ourMax, foeMax,
    ourHeal: ourMax.map((m, mi) => healer(mi, m)), foeHeal,
    foeStart: foes.map(f => f.hp),
    ourKo: party.map(() => null), foeKo: foes.map(() => null),
    party, foes,
    tok: party.map(() => null), firstPara: party.map(() => null), fromUs: foes.map(() => party.map(() => null)), fromFoe: party.map(() => foes.map(() => null)),
    ourItems: party.map(() => null), foeItems: foes.map(() => null),
  };
  // The ⚔ line's pick this turn: our field mon's best hit on the foe in front, as a live outcome.
  const o = ours[0][0];
  const pin = { mi: 0, free: false, outcome: { name: o.name, type: o.type, cat: o.cat, e: 1, expected: o.dmg, use: ROLLS.map(x => ({ d: o.dmg * x.r, p: x.p, n: 1 })) } };
  return { T, party, foes, facing: foes[0], pin };
};
