// The oracle line handed to the overlay, drawn only for the one fight it was solved for (CONTEXT.md, `Oracle line`),
// and scored at each decision against the checkpoint before it. It reads the game and writes nothing to it.
import { iconOf, STAT_NAMES, STATUS_FRAMES, TYPES } from "./01-core.js";
import { isReplacement } from "./02-decision.js";
import { gameTables } from "./04-game-tables.js";
import { learnMoveById } from "./40-learn.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// `lead`: our mon in front when the oracle line was handed on or before its first turn, and `field` both sides' field
// slots then. Its first move names no mover, and only then is the game still showing it. `scored`: the last step scored,
// or played before the handoff. `played`: the player's commands by turn and field slot, as the frames saw them.
// `strayed`: a free switch since the last step scored. `asked`: by pick, the mon each move prompt the oracle line
// answers was put to, as the frames saw it.
let held = null, holds = 0;
// (CONTEXT.md, `Confidence`)
let wrongSeed = null;

const sameFight = (s, line) => typeof s?.seed === "string" && s.seed === line.seed && s.currentBattle?.waveIndex === line.wave;
// The held oracle line while it leads this scene's fight.
const leading = s => (held && !held.off && sameFight(s, held.line) ? held : null);
const markOf = line => (wrongSeed === line.seed ? "!" : "~");
const phaseOf = s => tryDo(() => s.phaseManager.getCurrentPhase());
const frontOf = s => tryDo(() => s.getPlayerParty().find(p => p?.isOnField?.()).species.speciesId);
// A field slot is its party slot, on either side (game-code.md §7, §34).
const fieldOf = party => [0, 1].map(f => (tryDo(() => party[f].isOnField(), false) ? party[f].species.speciesId : null));
// The field slot a faint's party screen fills (game-code.md §34).
const replacingField = s => {
  const ph = phaseOf(s);
  const fieldZero = tryDo(() => s.currentBattle.getBattlerCount() > 1 && s.getPokemonAllowedInBattle().length <= 1, false);
  return fieldZero ? 0 : ph?.fieldIndex ?? 0;
};
const liveField = s => ({ ours: fieldOf(tryDo(() => s.getPlayerParty(), [])), foes: fieldOf(tryDo(() => s.getEnemyParty(), [])) });
// At a faint's replacement the battle's turn has already moved on (game-code.md §9, §21), and the oracle line picks
// that replacement inside the step whose turn it was.
const battleTurn = s => {
  const faintPick = isReplacement(phaseOf(s));
  return { faintPick, turn: s.currentBattle.turn - (faintPick ? 1 : 0) };
};
const lastBefore = (steps, turn) => steps.findLastIndex(st => st.turn < turn);
// A pick on the line's last step is no claim (extension-distribution.md §11.1).
const picksOf = (line, st) => (st.turn === lastTurn(line) ? [] : st.input?.learns ?? []);
// A move prompt comes inside its turn, or after it from a faint at the turn's end (game-code.md §21): the oracle line
// answers it in the step whose turn asked it.
const promptOf = (s, h) => {
  const ph = phaseOf(s);
  if (ph?.phaseName !== "LearnMovePhase") return null;
  const t = s.currentBattle.turn, learner = tryDo(() => s.getPlayerParty()[ph.partyMemberIndex]);
  const fits = p => p.move === ph.moveId && p.species === learner?.species?.speciesId;
  for (const [i, st] of h.line.steps.entries()) {
    if (i <= h.scored || (st.turn !== t && st.turn !== t - 1)) continue;
    const picks = picksOf(h.line, st);
    const pick = picks.find(p => fits(p) && p.slot === ph.partyMemberIndex) ?? picks.find(fits);
    if (pick) return { st, pick, learner };
  }
  return null;
};
const moverOf = (h, i) => (i ? h.line.steps[i - 1].checkpoint.ours.find(m => m.onField)?.species ?? null : h.lead);
// Who stands in field slot `f` of `side` going into step `i` of a double.
const standing = (h, i, side, f) => (i ? h.line.steps[i - 1].checkpoint[side].find(m => m.onField && m.slot === f)?.species ?? null
  : h.field?.[side][f] ?? null);
// The mon a faint in field slot `f` takes down: the one it switched in that turn, else the one standing there.
const outOf = (h, i, f) => {
  const c = h.line.steps[i].input?.commands?.[f];
  return c?.kind === "switch" ? c.to.species : standing(h, i, "ours", f);
};
const isObject = v => typeof v === "object" && v !== null;
const mons = side => Array.isArray(side) && side.every(isObject);
// The page is not trusted (extension-distribution.md §9.5), and an oracle line `oracleLineModel` cannot read would fail
// every card built for its fight.
const pickShaped = p => isObject(p) && [p.slot, p.species, p.move].every(Number.isInteger) && (p.forget === null || Number.isInteger(p.forget));
const fieldShaped = f => f === 0 || f === 1;
const commandShaped = c => c === null || (isObject(c) && (c.kind === "switch" ? isObject(c.to)
  : c.kind === "move" && Number.isInteger(c.move)
    && (c.target === undefined || (isObject(c.target) && ["foes", "ours"].includes(c.target.side) && fieldShaped(c.target.field)))));
const fieldPicksShaped = list => list === undefined || (Array.isArray(list) && list.every(r => isObject(r) && fieldShaped(r.field)));
// A double that asks nothing of either slot names a replacement, a pick or a pivot, as a queued step does.
const doubleShaped = i => Array.isArray(i.commands) && i.commands.length === 2 && i.commands.every(commandShaped) && i.replacement === undefined
  && fieldPicksShaped(i.replacements) && fieldPicksShaped(i.pivots)
  && (i.commands.some(Boolean) || i.replacements?.length > 0 || i.learns?.length > 0 || i.pivots?.length > 0);
const inputShaped = i => i === null || (isObject(i) && (i.kind !== "switch" || isObject(i.to))
  && (i.kind !== "queued" || isObject(i.replacement) || i.learns?.length > 0 || i.pivots?.length > 0) && (i.kind !== "double" || doubleShaped(i))
  && (i.pivots === undefined || (Array.isArray(i.pivots) && i.pivots.every(isObject)))
  && (i.replacement === undefined || isObject(i.replacement)) && (i.learns === undefined || (Array.isArray(i.learns) && i.learns.every(pickShaped))));
const shaped = line => typeof line?.seed === "string" && Number.isInteger(line.wave) && Array.isArray(line.steps) && line.steps.length > 0
  && line.steps.every((st, i) => Number.isInteger(st?.turn) && st.turn >= 1 && (i === 0 || st.turn > line.steps[i - 1].turn)
    && inputShaped(st.input) && mons(st.checkpoint?.ours) && mons(st.checkpoint?.foes));
// A turn the game plays for us asks for no press, even one that names a faint replacement.
const pressed = input => (input?.kind === "queued" || (input?.kind === "double" && !input.commands.some(Boolean)) ? null : input);
// A faint's replacements in the order the turn asks them, each with the field slot it fills.
const sentOf = input => (input?.kind === "double" ? input.replacements ?? [] : input?.replacement ? [{ ...input.replacement, field: 0 }] : []);
// A turn's pivots in the order it asks them, each with the field slot it fills (CONTEXT.md, `Pivot`).
const pivotsOf = input => (input?.kind === "double" ? input.pivots ?? [] : (input?.pivots ?? []).map(p => ({ ...p, field: 0 })));

// @only 98-watch, tests: holdOracleLine
export const holdOracleLine = (s, line) => {
  if (!shaped(line)) return { ok: false, why: "malformed" };
  if (!sameFight(s, line)) return { ok: false, why: "other-fight" };
  const onTime = s.currentBattle.turn <= line.steps[0].turn;
  // The turns already played when it was handed are where the oracle line was solved from, not its claims.
  held = { line, lead: onTime ? frontOf(s) : null, field: onTime ? liveField(s) : null, id: ++holds,
    scored: lastBefore(line.steps, battleTurn(s).turn), played: {}, strayed: false, asked: new Map(), off: null };
  return { ok: true };
};

const LOST = { icon: null, name: "the fight", expected: "won", came: "lost" };

const battlerOf = t => (t.side === "foes" ? BattlerIndex.ENEMY : BattlerIndex.PLAYER) + t.field;
const commandMatches = (c, played) => {
  const cmd = played?.cmd;
  if (c.kind === "switch") return cmd?.command === Command.POKEMON && cmd.cursor === c.to.slot;
  return cmd?.command === Command.FIGHT && cmd.move?.move === c.move && played.tera === !!c.tera
    && (!c.target || (cmd.move.targets?.length === 1 && cmd.move.targets[0] === battlerOf(c.target)));
};
// A slot the double asks nothing of matches whatever it played.
const matchesLine = (st, played) => {
  const input = pressed(st.input);
  if (!input) return true;
  if (input.kind === "double") return input.commands.every((c, f) => !c || commandMatches(c, played?.[f]));
  return commandMatches(input, played?.[0]);
};
// Only a faint asks for a replacement: with the mover still in front, none was picked. A pivot's pick shows in who is in
// front once the turn is over.
const pickedOther = (s, h, i) => {
  const front = liveField(s).ours, st = h.line.steps[i];
  const fieldDiffers = () => [0, 1].some(f => (st.checkpoint.ours.find(m => m.onField && m.slot === f)?.species ?? null) !== front[f]);
  return sentOf(st.input).some(r => front[r.field] !== outOf(h, i, r.field) && front[r.field] !== r.species)
    || (pivotsOf(st.input).length > 0 && fieldDiffers());
};
// Steps `from` exclusive to `i` inclusive are behind us now, and `misses` came of them.
const miss = (h, from, i, misses, picked) => {
  h.off = { turn: h.line.steps[i].turn, misses };
  const wrong = !picked && !h.strayed && h.line.steps.slice(from + 1, i + 1).every(st => matchesLine(st, h.played[st.turn]));
  if (wrong) wrongSeed = h.line.seed;
  return wrong;
};
const lastTurn = line => line.steps[line.steps.length - 1].turn;
// What a decision scored, for the journal: the step whose checkpoint it was, or none for a fight lost past every step.
const scoredOf = (h, st, turn, misses, wrong) => ({ turn, of: lastTurn(h.line), input: st?.input ?? null,
  checkpoint: st?.checkpoint ?? null, misses, wrong });

// The turn's command is cleared when the turn ends (game-code.md §5), so every frame takes it while it is there. The
// free switch's party screen is a non-modal `SwitchPhase` (game-code.md §9), and a lost fight never reaches a decision.
// @only 98-watch, tests: oracleLineSeen
export const oracleLineSeen = s => {
  const h = leading(s);
  if (!h) return null;
  const b = s.currentBattle, cmds = b.turnCommands, ph = phaseOf(s), prompt = promptOf(s, h);
  if (ph?.phaseName === "SwitchPhase" && !ph.isModal) h.strayed = true;
  if (prompt) h.asked.set(prompt.pick, prompt.learner);
  if (ph?.phaseName === "GameOverPhase") {
    // A fight lost to a TURN_END tag (Leech Seed, Curse…) ends after the turn has moved on (game-code.md §21).
    const turn = cmds?.[0] || cmds?.[1] ? b.turn : b.turn - 1;
    const i = h.line.steps.findLastIndex(st => st.turn <= turn);
    if (i > h.scored) return scoredOf(h, h.line.steps[i], h.line.steps[i].turn, [LOST], miss(h, h.scored, i, [LOST], false));
    h.off = { turn, misses: [LOST] };
    return scoredOf(h, null, turn, [LOST], false);
  }
  // A field slot's command is a new object on every commit (game-code.md §25).
  for (let f = 0; f < 2; f++) {
    const cmd = cmds?.[f];
    if (cmd && h.played[b.turn]?.[f]?.cmd !== cmd) (h.played[b.turn] ??= [])[f] = { cmd, tera: b.preTurnCommands?.[f]?.command === Command.TERA };
  }
  return null;
};

const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
// What `harness.test.ts.template`'s `mon` reads, read the same way off the live game.
const liveOf = p => ({
  onField: !!tryDo(() => p.isOnField(), false), hp: p.hp, status: p.status?.effect ?? 0,
  statStages: p.summonData?.statStages ?? [], tera: !!p.isTerastallized,
  bossBars: tryDo(() => p.isBoss(), false) ? (tryDo(() => p.isFainted(), p.hp <= 0) ? 0 : p.bossSegmentIndex + 1) : undefined,
});
const missOf = (want, p) => {
  if (!p) return { ...named(null, want.species), expected: `${want.hp}/${want.maxHp}`, came: "not in the party" };
  const got = liveOf(p), expected = [], came = [];
  const differ = (a, b, text) => { if (a !== b) { expected.push(text(a)); came.push(text(b)); } };
  differ(want.onField, got.onField, v => (v ? "in front" : "benched"));
  differ(want.hp, got.hp, v => `${v}/${want.maxHp}`);
  differ(want.status, got.status, v => STATUS_FRAMES[v] ?? "no status");
  // `statStages` has no HP slot.
  (Array.isArray(want.statStages) ? want.statStages : []).forEach((v, i) => differ(v, got.statStages[i] ?? 0, n => `${STAT_NAMES[i + 1]} ${signed(n)}`));
  differ(want.tera, got.tera, v => (v ? "Tera" : "no Tera"));
  if (want.bossBars !== undefined) differ(want.bossBars, got.bossBars ?? 0, v => `${v} boss bar${v === 1 ? "" : "s"}`);
  return expected.length ? { ...named(p, want.species), expected: expected.join(" "), came: came.join(" ") } : null;
};
const missesOf = (s, cp) => [[cp.ours, tryDo(() => s.getPlayerParty(), [])], [cp.foes, tryDo(() => s.getEnemyParty(), [])]]
  .flatMap(([want, side]) => {
    const used = new Set();
    return want.map(m => {
      const p = side.find(x => x?.species?.speciesId === m.species && !used.has(x)) ?? null;
      if (p) used.add(p);
      return missOf(m, p);
    });
  }).filter(Boolean);

const knows = (p, id) => !!tryDo(() => p.moveset.some(m => m?.moveId === id), false);
// A later pick on the same mon that forgets this one's move, or learns back its forget, is what the moveset shows.
const overtaken = (p, later) => later.some(q => q.species === p.species && (q.forget === p.move || q.move === p.forget));
// The move prompts of steps `from` exclusive to `i` inclusive, read off the learner's moves. `asked`: the game put the
// prompt, so an answer other than the oracle line's is the player's; one it never put is the oracle line's own miss.
const answersOf = (s, h, from, i) => {
  const party = tryDo(() => s.getPlayerParty(), []);
  const picks = h.line.steps.slice(from + 1, i + 1).flatMap(st => picksOf(h.line, st));
  return picks.filter((p, k) => !overtaken(p, picks.slice(k + 1))).map(p => {
    const asked = h.asked.has(p), learner = h.asked.get(p) ?? inSlot(party)(p);
    if (!learner) return null;
    const name = id => moveOf(party, id).move, learned = knows(learner, p.move);
    const came = !asked ? "no prompt"
      : learned === (p.forget === null) ? `${learned ? "learned" : "skipped"} ${name(p.move)}`
      : p.forget !== null && knows(learner, p.forget) ? `kept ${name(p.forget)}` : null;
    return came && { ...named(learner, p.species), expected: p.forget === null ? `skip ${name(p.move)}` : `${name(p.move)} over ${name(p.forget)}`, came, asked };
  }).filter(Boolean);
};

// A won fight's last checkpoint is read once the battle has ended (oracle-line.ts, `Checkpoint`): the next decision is
// its rewards screen, or a tenth wave's biome screen (game-code.md §12). A move prompt from the win's level-up can come
// before the turn's end (§21), and a send-in builds mid-turn, so neither scores.
const SCORED_AT = new Set(["CommandPhase", "SelectModifierPhase", "SelectBiomePhase"]);
// @only 98-watch, tests: oracleLineCheck
export const oracleLineCheck = s => {
  const h = leading(s);
  if (!h || !SCORED_AT.has(phaseOf(s)?.phaseName)) return null;
  const i = lastBefore(h.line.steps, s.currentBattle.turn);
  if (i <= h.scored) return null;
  const from = h.scored, st = h.line.steps[i];
  h.scored = i;
  const answers = answersOf(s, h, from, i);
  const misses = [...missesOf(s, st.checkpoint), ...answers.map(({ asked: _asked, ...m }) => m)];
  if (misses.length) return scoredOf(h, st, st.turn, misses, miss(h, from, i, misses, pickedOther(s, h, i) || answers.some(a => a.asked)));
  h.strayed = false;
  return scoredOf(h, st, st.turn, [], false);
};

// @only 60-card, tests: offTheLineModel
export const offTheLineModel = s => {
  const off = held?.off;
  return off && sameFight(s, held.line) ? { ...off, of: lastTurn(held.line), mark: markOf(held.line) } : null;
};
export const offTheLineSummary = o => (o ? `off the line · ${o.mark} re-solving…` : null);

// A trainer can field one species twice (game-code.md §10), so a mon the line names by its slot is looked for there.
const inSlot = side => ({ species, slot }) => {
  const there = slot == null ? null : side[slot];
  return there?.species?.speciesId === species ? there : side.find(p => p?.species?.speciesId === species) ?? null;
};
const named = (p, id) => ({ icon: p ? iconOf(p) : null,
  name: p?.name ?? tryDo(() => gameTables().species.getSpecies(id).name, `#${id}`) });
const moveOf = (party, id) => {
  const known = party.find(p => p?.moveset?.some(m => m?.moveId === id));
  const mv = tryDo(() => known.moveset.find(m => m?.moveId === id).getMove()) ?? learnMoveById(party, id) ?? tryDo(() => gameTables().moves[id]);
  return { move: String(mv?.name ?? `#${id}`).replace(/ \(N\)$/, ""), type: TYPES[mv?.type] ?? null };
};

// `forgetSlot`: the forgotten move's place in the learner's moves, −1 for a skip.
const pickOf = (party, p, pick) => ({ ...named(p, pick.species), move: moveOf(party, pick.move).move,
  forget: pick.forget === null ? null : moveOf(party, pick.forget).move,
  forgetSlot: pick.forget === null ? -1 : tryDo(() => p.moveset.filter(Boolean).findIndex(m => m.moveId === pick.forget), -1) });

// @only 60-card, tests: oracleLineModel
export const oracleLineModel = s => {
  const h = leading(s);
  if (!h) return null;
  const { line } = h;
  const { faintPick, turn: t } = battleTurn(s), prompt = promptOf(s, h), turn = prompt?.st.turn ?? t;
  const party = tryDo(() => s.getPlayerParty(), []), foes = tryDo(() => s.getEnemyParty(), []);
  const ours = inSlot(party), theirs = inSlot(foes), live = liveField(s);
  const inFront = (side, find) => side.filter(m => m.onField)
    .map(m => ({ ...named(find(m), m.species), hp: m.hp, maxHp: m.maxHp }));
  const moveAct = (input, by, slot) => {
    const mover = by == null ? null : ours({ species: by, slot });
    return { kind: "move", by: by == null ? null : named(mover, by), ...moveOf(party, input.move),
      tera: input.tera ? { type: tryDo(() => TYPES[mover.getTeraType()]) } : null };
  };
  const steps = line.steps.map((st, i) => {
    const input = pressed(st.input), double = st.input?.kind === "double";
    // A double names its movers and targets from the checkpoint before it, else, on this turn, from the game.
    const at = (side, f) => standing(h, i, side, f) ?? (st.turn === turn ? live[side][f] : null);
    const slotAct = (c, f) => {
      if (!c) return null;
      const by = at("ours", f), who = by == null ? null : named(ours({ species: by, slot: f }), by);
      if (c.kind === "switch") return { kind: "switch", by: who, to: named(ours(c.to), c.to.species) };
      const tg = c.target && at(c.target.side, c.target.field), ourSide = c.target?.side === "ours";
      return { ...moveAct(c, by, f),
        target: tg == null ? null : { ...named((ourSide ? ours : theirs)({ species: tg, slot: c.target.field }), tg), ourSide } };
    };
    const act = !input ? null
      : double ? { kind: "double", slots: input.commands.map(slotAct).filter(Boolean) }
      : input.kind === "switch" ? { kind: "switch", to: named(ours(input.to), input.to.species) }
      : moveAct(input, moverOf(h, i));
    const sends = sentOf(st.input).map(r => {
      const out = double ? outOf(h, i, r.field) : null;
      return { ...named(ours(r), r.species), field: r.field, for: out == null ? null : named(ours({ species: out }), out) };
    });
    // Each pivot takes out whoever the one before it in that field sent in.
    const pivotedOut = new Map();
    const pivots = pivotsOf(st.input).map(r => {
      const out = pivotedOut.get(r.field) ?? (double ? outOf(h, i, r.field) : input?.kind === "switch" ? input.to.species : moverOf(h, i));
      pivotedOut.set(r.field, r.species);
      return { ...named(ours(r), r.species), field: r.field, for: out == null ? null : named(ours({ species: out }), out) };
    });
    return {
      turn: st.turn,
      at: st.turn < turn ? "done" : st.turn === turn ? "now" : "later",
      act,
      learns: picksOf(line, st).map(p => pickOf(party, ours(p), p)),
      pivots,
      sends,
      after: [...inFront(st.checkpoint.ours, ours), ...inFront(st.checkpoint.foes, theirs)],
    };
  });
  const last = line.steps[line.steps.length - 1], sends = steps.find(st => st.at === "now")?.sends ?? [];
  return {
    id: h.id,
    mark: markOf(line),
    faintPick,
    // The replacement this faint prompt asks for: the one for its field slot, and none where the line names none.
    sending: faintPick ? sends.find(x => x.field === replacingField(s)) ?? null : null,
    learning: prompt ? steps[line.steps.indexOf(prompt.st)].learns[picksOf(line, prompt.st).indexOf(prompt.pick)] : null,
    last: last.turn,
    turns: last.turn - line.steps[0].turn + 1,
    left: last.checkpoint.ours.filter(m => m.hp > 0).length,
    of: last.checkpoint.ours.length,
    steps,
  };
};

export const oracleLineSummary = m => (m ? `${m.mark} oracle line wins in ${m.turns} turn${m.turns === 1 ? "" : "s"} · ${m.left} of ${m.of} left` : null);

const nowAt = m => (m ? m.steps.findIndex(st => st.at === "now") : -1);
export const oracleLineNow = m => m?.steps[nowAt(m)] ?? null;
// No decision comes for these, so this decision's card is the one up while they play out.
export const oracleLineUnasked = m => {
  const i = nowAt(m);
  if (i < 0) return [];
  const j = m.steps.findIndex((st, k) => k > i && st.act);
  return m.steps.slice(i + 1, j < 0 ? m.steps.length : j);
};

const expectText = after => after.map(x => `${x.name} ${x.hp}/${x.maxHp}`).join(" · ");
const actText = a => (a.kind === "double" ? a.slots.map(actText).join(" ; ")
  : a.kind === "switch" ? (a.by ? `switch ${a.by.name} for ${a.to.name}` : `switch to ${a.to.name}`)
  : [a.by?.name, ...(a.tera ? [`Tera ${a.tera.type ?? ""}`.trim(), "+"] : []), a.move, a.target ? `→ ${a.target.ourSide ? "our " : ""}${a.target.name}` : null].filter(Boolean).join(" "));
const sendWords = x => `send ${x.name}${x.for ? ` for ${x.for.name}` : ""}`;
// The replacements a faint prompt leaves to come, or every one before it.
export const sendsToCome = (m, st) => (m.sending ? st.sends.slice(st.sends.findIndex(x => x.field === m.sending.field) + 1) : st.sends);

export const pickWords = p => (p.forget ? `learns ${p.move} over ${p.forget}` : `skips ${p.move}`);
const pickText = p => `${p.name} ${pickWords(p)}`;

export const oracleStepSummary = m => {
  const st = oracleLineNow(m);
  if (!st) return null;
  const at = `${m.mark} T${st.turn}/${m.last}`;
  if (m.learning) return `⚔ ${at} · ${pickText(m.learning)}`;
  const sends = sendsToCome(m, st).map(x => `then ${sendWords(x)}`);
  if (m.sending) return [`⚔ ${at}`, sendWords(m.sending), ...sends].join(" · ");
  const then = [...st.pivots.map(x => `then ${sendWords(x)}`), ...st.learns.map(p => `then ${pickText(p)}`), ...sends];
  if (!st.act) return [at, "no input", ...then, `expect ${expectText(st.after)}`].filter(Boolean).join(" · ");
  return [`⚔ ${at}`, actText(st.act), ...then].filter(Boolean).join(" · ");
};
export const oracleLearnCall = m => (m?.learning ? pickText(m.learning) : null);

// The card event's `oracleLine` (extension-distribution.md §11.1).
export const oracleLineState = (m, off) => {
  const st = oracleLineNow(m);
  if (st) return { state: "on", turn: st.turn, of: m.last };
  return off ? { state: "off", turn: off.turn, of: off.of } : null;
};
