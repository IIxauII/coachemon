// Learn-move card model.
// Learn-move: the SUMMARY screen (UiMode 9, summaryUiMode 1) holds the new move; before it opens, the
// "forget a move?" prompt only has LearnMovePhase's moveId, so the move is built from a PokemonMove.
const learnState = s => {
  const h = s.ui.getHandler();
  const double = !!s.currentBattle?.double;
  if (s.ui.getMode() === 9 && h?.summaryUiMode === 1 && h.newMove) return { pk: h.pokemon, mv: h.newMove, double };
  const phase = s.phaseManager?.getCurrentPhase?.();
  if (phase?.phaseName !== "LearnMovePhase") return null;
  const pk = s.getPlayerParty()[phase.partyMemberIndex];
  const pm = pk?.moveset.find(Boolean);
  return pk && pm ? { pk, mv: new pm.constructor(phase.moveId).getMove(), double } : null;
};

// Effective power of a move on this pokémon: power × accuracy × STAB × how well its attack stat suits the
// category, then adjusted for what it costs or adds, each adjustment named in `notes` so the card can show why.
// null value for status moves, which can't be scored.
const moveScore = (pk, mv, others, double) => {
  if (mv.category === 2 || !(mv.power > 0)) return { value: null, notes: [] };
  const type = TYPES[mv.type];
  const atk = pk.getStat(1), spa = pk.getStat(3);
  const fit = (mv.category === 0 ? atk : spa) / Math.max(atk, spa);
  const acc = mv.accuracy > 0 ? mv.accuracy / 100 : 1;
  let value = mv.power * acc * (typesOf(pk).includes(type) ? 1.5 : 1) * fit;
  const notes = [];
  const sameType = others.filter(o => o.category !== 2 && o.power > 0 && TYPES[o.type] === type).length;
  if (sameType === 0) { value *= 1.2; notes.push("coverage"); }
  else if (sameType >= 2) { value *= 0.8; notes.push(`${sameType + 1}× ${type}`); }
  if (hasAttr(mv, "RecoilAttr")) { value *= 0.67; notes.push("recoil"); }
  if (hasAttr(mv, "PreUseInterruptAttr")) { value *= 0.4; notes.push("fails if hit"); }
  else if (mv.isChargingMove?.()) { value *= 0.5; notes.push("charges"); }
  else if (hasAttr(mv, "RechargeAttr")) { value *= 0.5; notes.push("recharge"); }
  else if (mv.priority < 0) { value *= 0.8; notes.push("moves last"); }
  if (double && SPREAD_TARGETS.includes(mv.moveTarget)) { value *= 1.15; notes.push("spread"); }
  if (fit < 0.9) notes.push(mv.category === 0 ? "weak Atk" : "weak SpA");
  return { value: Math.round(value), notes };
};

const learnModel = ({ pk, mv, double }) => {
  const current = pk.moveset.filter(Boolean).map(m => m.getMove());
  const info = (x, score) => ({ name: x.name, type: TYPES[x.type] ?? "Normal", cat: ["physical", "special", "status"][x.category], ...score });
  // Each slot is judged against the other three, so coverage counts for both the old move and its replacement.
  const moves = current.map((x, i) => {
    const rest = current.filter((_, j) => j !== i);
    return { ...info(x, moveScore(pk, x, rest, double)), replacement: moveScore(pk, mv, rest, double).value };
  });
  const incoming = info(mv, moveScore(pk, mv, current.slice(0, 3), double));
  let forget = -1;
  let verdict;
  if (current.length < 4) verdict = ["Learns it — free slot", "#6d6"];
  else if (incoming.value === null) verdict = ["Status move — your call", "#fa4"];
  else {
    const gain = m => m.replacement - m.value;
    moves.forEach((m, i) => { if (m.value !== null && (forget < 0 || gain(m) > gain(moves[forget]))) forget = i; });
    if (forget < 0) verdict = ["Only status moves to drop — your call", "#fa4"];
    else if (moves[forget].replacement > moves[forget].value * 1.1) verdict = [`Learn → forget ${moves[forget].name}`, "#6d6"];
    else { verdict = ["Skip — not an upgrade", "#e55"]; forget = -1; }
  }
  // Shown against the slot it would take, or against the first three when skipping.
  if (forget >= 0) Object.assign(incoming, moveScore(pk, mv, current.filter((_, j) => j !== forget), double));
  return { kind: "learn", icon: iconOf(pk), name: pk.name, move: incoming, moves, forget, verdict };
};
