// Which card the panel is showing, and what that card says in plain text. One module decides: it detects the screen,
// builds that card's model, hangs the wave, the next-wave preview and the look-ahead on it, and sets the battle
// verdict. 90-render and the renderers above it draw what they are handed and decide nothing.
//
// A **Card** is the model its builder returns plus `kind`, `wave`, and — on a battle card — `verdict`
// (easy / trainer / danger / catch / fight, most specific first: what the watcher and Claude's brief key off).
//
// `cardSummary` is the plain-text read of a card (`window.__coachHud.summary()`, which probe.js passes through whole
// to the watcher and to Claude's battle read). Pure and lazy: a draw never calls it. Each card's own wording lives
// beside its model builder, so a summary change lands in the file that owns the model it reads.
import { TYPES, sandbox } from "./01-core.js";
import { learnState, rewardsScreen, biomeScreen, encounterScreen } from "./02-screens.js";
import { predictedTeras, withPredictedTera } from "./20-enemy-ai.js";
import { battleModel, plannerReady } from "./30-planner.js";
import { teamPlan } from "./35-team-plan.js";
import { learnModel, learnSummary } from "./40-learn.js";
import { catchAdvice } from "./45-catch.js";
import { encounterModel, encounterSummary } from "./46-encounter.js";
import { biomeModel, biomeSummary } from "./47-biome.js";
import { previewNext, previewSummary } from "./48-preview.js";
import { aheadModel, learnRoster, aheadSummary } from "./49-ahead.js";
import { auditSummary } from "./49-audit.js";
import { spliceScreen, fusionModel, fusionSummary } from "./49-fusion.js";
import { rewardsModel, rewardsSummary } from "./50-shop.js";
import { starterScreen, starterModel, startersSummary } from "./51-starters.js";

export const hitsText = n => `${n} hit${n === 1 ? "" : "s"}`;
// A spread move KOing the two foes on different turns carries `koEach` instead of one `ko`: the slower one counts.
export const slowestKo = sl => (sl.koEach?.length ? Math.max(...sl.koEach) : sl.ko);

// Damaging move types across the living party: the foe rows only list weaknesses we can hit.
const moveTypesOf = party => [...new Set(party.flatMap(p => p.moveset.filter(Boolean).map(pm => {
  try { const mv = pm.getMove(); return mv.category !== MoveCategory.STATUS && mv.power > 0 ? TYPES[mv.type] : null; } catch { return null; }
})).filter(Boolean))];

// The battle card: the planner's field model, the whole-fight plan (trainer battles) and the catch advice (wild), put
// together here rather than inside the planner. All three run inside the one sandbox the refresh opens, with the foes
// that Terastallize this turn flagged, so every damage number is the post-Tera one (spec §7).
const battleCard = (s, b, party, foes) => {
  const build = () => ({
    ...battleModel(s, b, party, foes),
    teamPlan: b.trainer ? teamPlan(s, b, party, foes) : null,
    catch: b.trainer ? null : catchAdvice(s, b, party, foes),
    trainer: !!b.trainer,
    double: !!b.double,
    moveTypes: moveTypesOf(party),
  });
  return plannerReady(s) ? sandbox(s, () => withPredictedTera(predictedTeras(s, b), build)) : build();
};

// ---- The battle verdict
// Danger the panel flags on our side: the 💀 / ⚠ tags on field slots and on mons a switch takes out. `after`: a ⚠ that
// is a likely KO once the mon has acted.
const dangerTags = m => (m.field ? [...m.field.slots.map(sl => [sl.name, sl.threat]), ...m.field.switches.map(sw => [sw.out?.name, sw.out?.threat])] : [])
  .filter(([name, t]) => name && t).map(([name, t]) => ({ mon: name, level: t.level, from: t.from, move: t.move, after: !!t.after }));
const catchWorthIt = m => !!m.catch?.targets?.some(t => t.verdict !== "skip");
const planLost = m => !!m.teamPlan && m.teamPlan.result !== "win";
// An easy wave: a wild fight with nothing to decide. No boss, no danger tag, no switch (nor a missing one), every
// slot KOs in 1–2 hits, and no catch worth a ball. Anything else expands the panel on its own.
const easyWave = m => {
  const f = m.field;
  if (m.kind !== "battle" || m.trainer || !f || f.freeSwitch || m.enemySwitches?.length || m.rows.some(r => r.boss)) return false;
  if (f.switches.length || f.noSafeSwitch || dangerTags(m).length || catchWorthIt(m) || planLost(m)) return false;
  return f.slots.length > 0 && f.slots.every(sl => sl.move && slowestKo(sl) >= 1 && slowestKo(sl) <= 2);
};
const verdictOf = m => (easyWave(m) ? "easy" : m.trainer ? "trainer"
  : dangerTags(m).length || m.rows.some(r => r.boss) || m.field?.noSafeSwitch ? "danger"
  : catchWorthIt(m) ? "catch" : "fight");

// ---- Reading the screen
// The card on show, or null when there is nothing to coach (mid-reload, the title screen, a wave with no field).
export const readCard = s => {
  if (!s?.ui) return null;
  const handler = s.ui.getHandler();
  const starters = starterScreen(s);
  const learn = learnState(s);
  const rewards = rewardsScreen(s);
  let card = null;
  if (starters) {
    card = starterModel(s, starters);
  } else if (learn) {
    // The same next-big-fight roster the rewards card judges a TM against, so the two cards weigh a move alike.
    let roster = null;
    try { roster = learnRoster(aheadModel(s)); } catch {}
    card = learnModel({ ...learn, roster });
  } else if (spliceScreen(s, handler)) {
    card = fusionModel(s, handler);
  } else if (rewards) {
    card = rewardsModel(s, rewards);
  } else if (biomeScreen(s, handler)) {
    card = biomeModel(s, handler);
  } else if (encounterScreen(s, handler)) {
    card = encounterModel(s, handler);
  } else {
    const b = s.currentBattle;
    const foes = s.getEnemyParty().filter(p => p.hp > 0);
    const party = s.getPlayerParty().filter(p => p.hp > 0);
    if (!b || !foes.length || !party.length) return null;
    card = battleCard(s, b, party, foes);
  }
  if (!card) return null;
  card.wave = s.currentBattle?.waveIndex ?? null;
  if (card.kind === "battle" || card.kind === "rewards") {
    card.preview = previewNext(s);
    // The rewards card builds its own (it spends against it); every other card just draws it.
    card.ahead ??= aheadModel(s);
  }
  if (card.kind === "battle") card.verdict = verdictOf(card);
  return card;
};

// ---- The summary
const slotText = sl => `${sl.name} ${sl.move ?? "—"}${sl.target === "both" ? " → both" : sl.target ? ` → ${sl.target.name}` : ""}${sl.then ? `, then ${sl.then}` : ""}${slowestKo(sl) > 0 && slowestKo(sl) <= 3 ? ` · ${hitsText(slowestKo(sl))}` : ""}`;

// The fight plan in one line: its verdict, the win condition, then what it warns about (a likely loss says why).
const planSummary = tp => {
  if (!tp) return null;
  if (tp.summary) return tp.summary;
  const lost = tp.result !== "win";
  return [lost ? "likely lost" : "winnable",
    tp.win ? `☠ ${tp.win.name} KOs ${tp.win.kills}/${tp.win.of}` : null,
    ...tp.warnings.map(w => w.replace(/^likely lost: /, "")),
    tp.sacrifice.length ? `sacrifice ${tp.sacrifice.map(x => `${x.name} → ${x.frees.name} in free`).join(", ")}` : null,
  ].filter(Boolean).join(" · ");
};

// One declared shape: every key is present on every card, `null` when it isn't this one, and `kind` says which card
// it is. A contract test holds each kind to exactly these keys, so probe.js can pass the whole thing through.
const EMPTY = {
  kind: null, wave: null, verdict: null, field: null, danger: [], plan: null,
  learn: null, rewards: null, encounter: null, biome: null, fusion: null, starters: null,
  next: null, ahead: null, audit: null,
};
export const summaryKeys = () => Object.keys(EMPTY);

// `danger`: a likely KO of one of our mons this turn — `level` "ko" before it acts (the 💀 tags), "after" once it has
// acted; `saveFor` names the foe the fight plan keeps that mon for. `plan`: the fight plan's line (trainer battles).
export const cardSummary = card => {
  if (!card) return null;
  const base = { ...EMPTY, kind: card.kind, wave: card.wave ?? null,
    next: previewSummary(card.preview), ahead: aheadSummary(card.ahead), audit: auditSummary(card.audit) };
  if (card.kind === "starters") return { ...base, starters: startersSummary(card) };
  if (card.kind === "fusion") return { ...base, fusion: fusionSummary(card) };
  if (card.kind === "biome") return { ...base, biome: biomeSummary(card) };
  if (card.kind === "encounter") return { ...base, encounter: encounterSummary(card) };
  if (card.kind === "learn") return { ...base, learn: learnSummary(card) };
  if (card.kind === "rewards") return { ...base, rewards: rewardsSummary(card) };
  const saveFor = name => card.teamPlan?.reserve?.find(r => r.name === name)?.for.name ?? null;
  return { ...base,
    verdict: card.verdict ?? verdictOf(card),
    field: card.field ? card.field.slots.map(slotText).join(" ; ") : null,
    danger: dangerTags(card).filter(d => d.level === "ko" || d.after)
      .map(({ mon: name, from, move, level }) => ({ mon: name, from, move, level: level === "ko" ? "ko" : "after", saveFor: saveFor(name) })),
    plan: planSummary(card.teamPlan) };
};
