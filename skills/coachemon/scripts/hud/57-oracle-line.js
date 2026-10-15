// The oracle line handed to the overlay, drawn only for the one fight it was solved for (CONTEXT.md, `Oracle line`),
// and scored at each decision against the checkpoint before it. It reads the game and writes nothing to it.
import { iconOf, STAT_NAMES, STATUS_FRAMES, TYPES } from "./01-core.js";
import { isReplacement } from "./02-decision.js";
import { gameTables } from "./04-game-tables.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// `lead`: our mon in front when the oracle line was handed on or before its first turn. Its first move names no mover,
// and only then is the game still showing it. `scored`: the last step scored, or played before the handoff. `played`:
// the player's command by turn, as the frames saw it. `strayed`: a free switch since the last step scored.
let held = null, holds = 0;
// (CONTEXT.md, `Confidence`)
let wrongSeed = null;

const sameFight = (s, line) => typeof s?.seed === "string" && s.seed === line.seed && s.currentBattle?.waveIndex === line.wave;
// The held oracle line while it leads this scene's fight.
const leading = s => (held && !held.off && sameFight(s, held.line) ? held : null);
const markOf = line => (wrongSeed === line.seed ? "!" : "~");
const phaseOf = s => tryDo(() => s.phaseManager.getCurrentPhase());
const frontOf = s => tryDo(() => s.getPlayerParty().find(p => p?.isOnField?.()).species.speciesId);
// At a faint's replacement the battle's turn has already moved on (game-code.md §9, §21), and the oracle line picks
// that replacement inside the step whose turn it was.
const battleTurn = s => {
  const faintPick = isReplacement(phaseOf(s));
  return { faintPick, turn: s.currentBattle.turn - (faintPick ? 1 : 0) };
};
const lastBefore = (steps, turn) => steps.findLastIndex(st => st.turn < turn);
const moverOf = (h, i) => (i ? h.line.steps[i - 1].checkpoint.ours.find(m => m.onField)?.species ?? null : h.lead);
const isObject = v => typeof v === "object" && v !== null;
const mons = side => Array.isArray(side) && side.every(isObject);
// The page is not trusted (extension-distribution.md §9.5), and an oracle line `oracleLineModel` cannot read would fail
// every card built for its fight.
const shaped = line => typeof line?.seed === "string" && Number.isInteger(line.wave) && Array.isArray(line.steps) && line.steps.length > 0
  && line.steps.every((st, i) => Number.isInteger(st?.turn) && st.turn >= 1 && (i === 0 || st.turn > line.steps[i - 1].turn)
    && (st.input === null || (isObject(st.input) && (st.input.kind !== "switch" || isObject(st.input.to))
      && (st.input.kind !== "queued" || isObject(st.input.replacement))))
    && (st.input?.replacement === undefined || isObject(st.input.replacement)) && mons(st.checkpoint?.ours) && mons(st.checkpoint?.foes));
// A turn the game plays for us asks for no press, even one that names a faint replacement.
const pressed = input => (input?.kind === "queued" ? null : input);

// @only 98-watch, tests: holdOracleLine
export const holdOracleLine = (s, line) => {
  if (!shaped(line)) return { ok: false, why: "malformed" };
  if (!sameFight(s, line)) return { ok: false, why: "other-fight" };
  const lead = s.currentBattle.turn <= line.steps[0].turn ? frontOf(s) : null;
  // The turns already played when it was handed are where the oracle line was solved from, not its claims.
  held = { line, lead, id: ++holds, scored: lastBefore(line.steps, battleTurn(s).turn), played: {}, strayed: false, off: null };
  return { ok: true };
};

const LOST = { icon: null, name: "the fight", expected: "won", came: "lost" };

const matchesLine = (st, played) => {
  const input = pressed(st.input);
  if (!input) return true;
  const cmd = played?.cmd;
  if (input.kind === "switch") return cmd?.command === Command.POKEMON && cmd.cursor === input.to.slot;
  return cmd?.command === Command.FIGHT && cmd.move?.move === input.move && played.tera === !!input.tera;
};
// Only a faint asks for a replacement: with the mover still in front, none was picked.
const pickedOther = (s, st, mover) => {
  const want = st.input?.replacement?.species;
  if (want == null) return false;
  const front = frontOf(s);
  return front !== mover && front !== want;
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
  const b = s.currentBattle, cmd = b.turnCommands?.[0], ph = phaseOf(s);
  if (ph?.phaseName === "SwitchPhase" && !ph.isModal) h.strayed = true;
  if (ph?.phaseName === "GameOverPhase") {
    // A fight lost to a TURN_END tag (Leech Seed, Curse…) ends after the turn has moved on (game-code.md §21).
    const turn = cmd ? b.turn : b.turn - 1;
    const i = h.line.steps.findLastIndex(st => st.turn <= turn);
    if (i > h.scored) return scoredOf(h, h.line.steps[i], h.line.steps[i].turn, [LOST], miss(h, h.scored, i, [LOST], false));
    h.off = { turn, misses: [LOST] };
    return scoredOf(h, null, turn, [LOST], false);
  }
  if (cmd && h.played[b.turn]?.cmd !== cmd) h.played[b.turn] = { cmd, tera: b.preTurnCommands?.[0]?.command === Command.TERA };
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
  const misses = missesOf(s, st.checkpoint);
  if (misses.length) return scoredOf(h, st, st.turn, misses, miss(h, from, i, misses, pickedOther(s, st, moverOf(h, i))));
  h.strayed = false;
  return scoredOf(h, st, st.turn, [], false);
};

// @only 60-card, tests: offTheLineModel
export const offTheLineModel = s => {
  const off = held?.off;
  return off && sameFight(s, held.line) ? { ...off, of: lastTurn(held.line), mark: markOf(held.line) } : null;
};
export const offTheLineSummary = o => (o ? `off the line · ${o.mark} re-solving…` : null);

const named = (p, id) => ({ icon: p ? iconOf(p) : null,
  name: p?.name ?? tryDo(() => gameTables().species.getSpecies(id).name, `#${id}`) });
const moveOf = (party, id) => {
  const known = party.find(p => p?.moveset?.some(m => m?.moveId === id));
  const mv = tryDo(() => known.moveset.find(m => m?.moveId === id).getMove()) ?? tryDo(() => gameTables().moves[id]);
  return { move: String(mv?.name ?? `#${id}`).replace(/ \(N\)$/, ""), type: TYPES[mv?.type] ?? null };
};

// @only 60-card, tests: oracleLineModel
export const oracleLineModel = s => {
  const h = leading(s);
  if (!h) return null;
  const { line } = h;
  const { faintPick, turn } = battleTurn(s);
  const party = tryDo(() => s.getPlayerParty(), []), foes = tryDo(() => s.getEnemyParty(), []);
  const ours = id => party.find(p => p?.species?.speciesId === id) ?? null;
  const theirs = id => foes.find(p => p?.species?.speciesId === id) ?? null;
  const inFront = (side, find) => side.filter(m => m.onField).map(m => ({ ...named(find(m.species), m.species), hp: m.hp, maxHp: m.maxHp }));
  const steps = line.steps.map((st, i) => {
    const by = moverOf(h, i);
    const mover = by == null ? null : ours(by);
    const input = pressed(st.input), sent = st.input?.replacement;
    const act = !input ? null
      : input.kind === "switch" ? { kind: "switch", to: named(ours(input.to.species), input.to.species) }
      : { kind: "move", by: by == null ? null : named(mover, by), ...moveOf(party, input.move),
          tera: input.tera ? { type: tryDo(() => TYPES[mover.getTeraType()]) } : null };
    return {
      turn: st.turn,
      at: st.turn < turn ? "done" : st.turn === turn ? "now" : "later",
      act,
      send: sent ? named(ours(sent.species), sent.species) : null,
      after: [...inFront(st.checkpoint.ours, ours), ...inFront(st.checkpoint.foes, theirs)],
    };
  });
  const last = line.steps[line.steps.length - 1];
  return {
    id: h.id,
    mark: markOf(line),
    faintPick,
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
const actText = a => (a.kind === "switch" ? `switch to ${a.to.name}`
  : [a.by?.name, ...(a.tera ? [`Tera ${a.tera.type ?? ""}`.trim(), "+"] : []), a.move].filter(Boolean).join(" "));

export const oracleStepSummary = m => {
  const st = oracleLineNow(m);
  if (!st) return null;
  const at = `${m.mark} T${st.turn}/${m.last}`;
  if (m.faintPick && st.send) return `⚔ ${at} · send ${st.send.name}`;
  if (!st.act) return [at, "no input", st.send ? `then send ${st.send.name}` : null, `expect ${expectText(st.after)}`].filter(Boolean).join(" · ");
  return [`⚔ ${at}`, actText(st.act), st.send ? `then send ${st.send.name}` : null].filter(Boolean).join(" · ");
};

// The card event's `oracleLine` (extension-distribution.md §11.1).
export const oracleLineState = (m, off) => {
  const st = oracleLineNow(m);
  if (st) return { state: "on", turn: st.turn, of: m.last };
  return off ? { state: "off", turn: off.turn, of: off.of } : null;
};
