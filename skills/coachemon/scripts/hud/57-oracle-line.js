// The oracle line handed to the panel, held for the one fight it was solved for (CONTEXT.md, `Oracle line`). It reads
// the battle the card is built on and writes nothing to the game.
import { iconOf, TYPES } from "./01-core.js";
import { gameTables } from "./04-game-tables.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// `lead`: our mon in front when the line was handed on or before its first turn. A line's first move names no mover,
// and only then is the game still showing it.
let held = null;

const sameFight = (s, line) => typeof s?.seed === "string" && s.seed === line.seed && s.currentBattle?.waveIndex === line.wave;
const isObject = v => typeof v === "object" && v !== null;
const mons = side => Array.isArray(side) && side.every(isObject);
// The page is not trusted (extension-distribution.md §9.5), and a line the model cannot read would fail every card built
// for its fight.
const shaped = line => typeof line?.seed === "string" && Number.isInteger(line.wave) && Array.isArray(line.steps) && line.steps.length > 0
  && line.steps.every(st => Number.isInteger(st?.turn) && (st.input === null || (isObject(st.input) && (st.input.kind !== "switch" || isObject(st.input.to))))
    && (st.input?.replacement === undefined || isObject(st.input.replacement)) && mons(st.checkpoint?.ours) && mons(st.checkpoint?.foes));

// @only 98-watch, tests: holdOracleLine
export const holdOracleLine = (s, line) => {
  if (!shaped(line)) return { ok: false, why: "malformed" };
  if (!sameFight(s, line)) return { ok: false, why: "other-fight" };
  const lead = s.currentBattle.turn <= line.steps[0].turn
    ? tryDo(() => s.getPlayerParty().find(p => p?.isOnField?.()).species.speciesId) : null;
  held = { line, lead };
  return { ok: true };
};

const named = (p, id) => ({ icon: p ? iconOf(p) : null,
  name: p?.name ?? tryDo(() => gameTables().species.getSpecies(id).name, `#${id}`) });
const moveOf = (party, id) => {
  const known = party.find(p => p?.moveset?.some(m => m?.moveId === id));
  const mv = tryDo(() => known.moveset.find(m => m?.moveId === id).getMove()) ?? tryDo(() => gameTables().moves[id]);
  return { move: String(mv?.name ?? `#${id}`).replace(/ \(N\)$/, ""), type: TYPES[mv?.type] ?? null };
};

// Each step as the card draws it: `at` is `done`, `now` or `later` against the battle's own turn, and `after` the mons in
// front once the step's turn has played, ours first.
// @only 60-card, tests: oracleLineModel
export const oracleLineModel = s => {
  const line = held?.line;
  if (!line || !sameFight(s, line)) return null;
  const turn = s.currentBattle.turn;
  const party = tryDo(() => s.getPlayerParty(), []), foes = tryDo(() => s.getEnemyParty(), []);
  const ours = id => party.find(p => p?.species?.speciesId === id) ?? null;
  const theirs = id => foes.find(p => p?.species?.speciesId === id) ?? null;
  const inFront = (side, find) => side.filter(m => m.onField).map(m => ({ ...named(find(m.species), m.species), hp: m.hp, maxHp: m.maxHp }));
  const steps = line.steps.map((st, i) => {
    const by = i ? line.steps[i - 1].checkpoint.ours.find(m => m.onField)?.species ?? null : held.lead;
    const mover = by == null ? null : ours(by);
    const input = st.input;
    const act = !input ? null
      : input.kind === "switch" ? { kind: "switch", to: named(ours(input.to.species), input.to.species) }
      : { kind: "move", by: by == null ? null : named(mover, by), ...moveOf(party, input.move),
          tera: input.tera ? { type: tryDo(() => TYPES[mover.getTeraType()]) } : null };
    return {
      turn: st.turn,
      at: st.turn < turn ? "done" : st.turn === turn ? "now" : "later",
      act,
      send: input?.replacement ? named(ours(input.replacement.species), input.replacement.species) : null,
      after: [...inFront(st.checkpoint.ours, ours), ...inFront(st.checkpoint.foes, theirs)],
    };
  });
  const last = line.steps[line.steps.length - 1];
  return {
    turns: last.turn - line.steps[0].turn + 1,
    left: last.checkpoint.ours.filter(m => m.hp > 0).length,
    of: last.checkpoint.ours.length,
    steps,
  };
};

export const oracleLineSummary = m => (m ? `~ line wins in ${m.turns} turn${m.turns === 1 ? "" : "s"} · ${m.left} of ${m.of} left` : null);
