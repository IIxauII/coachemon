// Damage estimates for our moves into foes and foes' moves into us, and 1-v-1 matchups.
// Per-turn damage discount for moves that often don't land when chosen: Focus Punch fails if the user is hit
// first, charging and recharging moves spend a second turn, negative priority moves go last.
const reliability = mv => {
  if (hasAttr(mv, "PreUseInterruptAttr")) return 0.4;
  if (mv.isChargingMove?.() || hasAttr(mv, "RechargeAttr")) return 0.5;
  return mv.priority < 0 ? 0.8 : 1;
};

const ATE = { Refrigerate: "Ice", Pixilate: "Fairy", Aerilate: "Flying", Galvanize: "Electric" };
// Enemy damage is estimated pessimistically: held items, crits and rolls aren't modelled, and a recommendation
// that underestimates an enemy hit gets a pokémon killed.
const FOE_MARGIN = 1.15;

// Rough damage of each usable damaging move of attacker into defender. `foe` marks an enemy attacking us:
// it gets the safety margin and no discount for moves that may not land, since it might still use them.
const hits = (a, d, foe = false) => {
  const out = [];
  const ab = abilitiesOf(a);
  for (const m of a.moveset.filter(Boolean)) {
    const mv = m.getMove();
    if (mv.category === 2 || !(mv.power > 0) || m.getMovePp() - m.ppUsed <= 0) continue;
    let type = TYPES[mv.type];
    let power = mv.power;
    const ate = ab.map(x => ATE[x]).find(Boolean);
    if (ate && type === "Normal") { type = ate; power *= 1.2; }
    if (ab.includes("Technician") && power <= 60) power *= 1.5;
    const phys = mv.category === 0;
    let atk = stat(a, phys ? 1 : 3);
    if (phys && (ab.includes("Huge Power") || ab.includes("Pure Power"))) atk *= 2;
    if (phys && ab.includes("Hustle")) atk *= 1.5;
    const base = ((2 * a.level / 5 + 2) * power * atk / stat(d, phys ? 2 : 4)) / 50 + 2;
    const e = effectiveness(type, d);
    const stab = typesOf(a).includes(type) ? (ab.includes("Adaptability") ? 2 : 1.5) : 1;
    let dmg = base * stab * e;
    if (phys && ab.includes("Tough Claws")) dmg *= 1.3; // most physical moves make contact
    if (ab.includes("Sheer Force")) dmg *= 1.3;
    if (ab.includes("Strong Jaw") && /bite|crunch|fang|jaw/i.test(m.getName())) dmg *= 1.5;
    dmg *= foe ? FOE_MARGIN : reliability(mv);
    out.push({ name: m.getName(), type, cat: phys ? "physical" : "special", e, dmg, spread: SPREAD_TARGETS.includes(mv.moveTarget), priority: mv.priority ?? 0 });
  }
  return out;
};
const bestMove = (a, d, foe = false) => hits(a, d, foe).reduce((best, x) => (!best || x.dmg > best.dmg ? x : best), null);
const turnsToKo = (hp, dmg) => (dmg > 0 ? Math.min(9, Math.ceil(hp / dmg)) : 9);

// Positive score = we KO it in fewer turns than it KOs us.
const matchup = (me, foe) => {
  const mine = bestMove(me, foe);
  const theirs = bestMove(foe, me, true);
  const myTurns = mine?.dmg > 0 ? Math.min(9, Math.ceil(foe.hp / mine.dmg)) : 9;
  const theirTurns = theirs?.dmg > 0 ? Math.min(9, Math.ceil(me.hp / theirs.dmg)) : 9;
  const faster = stat(me, 5) >= stat(foe, 5);
  return { me, mine, myTurns, score: theirTurns - myTurns + (faster ? 0.5 : -0.5) };
};
