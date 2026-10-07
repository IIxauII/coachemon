// Which card the panel shows, and what it says in plain text: this module detects the screen, builds the card and sets
// the battle verdict, and the renderers decide nothing. Each card's own wording lives beside its model builder.
import { note, stage } from "./01-meter.js";
import { learnState, rewardsScreen, biomeScreen, encounterScreen } from "./02-screens.js";
import { partyProfile } from "./08-party.js";
import { readTurn } from "./25-turn.js";
import { readRun } from "./26-run.js";
import { arrivalTurn, battleModel } from "./30-planner.js";
import { teamPlanner } from "./35-team-plan.js";
import { learnModel, learnSummary } from "./40-learn.js";
import { catchAdvice } from "./45-catch.js";
import { encounterModel, encounterSummary } from "./46-encounter.js";
import { biomeModel, biomeSummary } from "./47-biome.js";
import { previewNext, previewSummary } from "./48-preview.js";
import { aheadModel, learnRoster, aheadSummary } from "./49-ahead.js";
import { auditSummary } from "./50-audit.js";
import { spliceScreen, fusionModel, fusionSummary } from "./49-fusion.js";
import { rewardsModel, rewardsSummary } from "./52-shop.js";
import { starterScreen, starterModel, startersSummary } from "./51-starters.js";

export const hitsText = n => `${n} hit${n === 1 ? "" : "s"}`;
// A spread move KOing the two foes on different turns carries `koEach` instead of one `ko`: the slower one counts.
export const slowestKo = sl => (sl.koEach?.length ? Math.max(...sl.koEach) : sl.ko);
export const deadEndText = sl => (sl.stopped?.length ? `nothing it can use — ${sl.stopped.join(" · ")}` : "nothing it can do");

// `weak`: `[type, how many of us it hits]`, for each attacking type two or more of us are weak to.
const partyTypes = party => {
  const profile = partyProfile(party);
  return { moveTypes: profile.ourTypes, weak: profile.weakTypes.map(t => [t, profile.weakTo(t).length]) };
};

// The fight plan is built first, the ⚔ line reads it, and the plan is then pinned to the turn the ⚔ line chose: its
// step 1 is that action by construction, and the panel never shows two answers to one turn (#113).
// @only tests: composeBattleCard
export const composeBattleCard = (turn, account) => {
  const { trainer, double, party } = turn.facts;
  // Without the enemy's exact move, the card, the fight plan and the catch advice all stop together and say why (#183).
  const gate = turn.exact?.() ?? { ok: true };
  if (!gate.ok) {
    const { pin: _pin, ...shell } = battleModel(turn);
    return { ...shell, teamPlan: null, catch: null, trainer: !!trainer, double, moveTypes: [], weak: [], verdict: "unavailable" };
  }
  // Same turn the ⚔ line is answered on, so a returning switch-in is priced at base stat stages in both (#285).
  const team = trainer ? teamPlanner(arrivalTurn(turn)) : null;
  // `pin` carries the live outcome the ⚔ line picked, so it stays off the card, which is plain data read whole by
  // `__coachHud.last()`.
  const { pin, ...model } = battleModel(turn, { team });
  const card = {
    ...model,
    teamPlan: team ? team.view(pin) : null,
    catch: trainer ? null : catchAdvice(turn, account),
    trainer: !!trainer,
    double,
    ...partyTypes(party.filter(p => p && p.hp > 0)),
  };
  card.verdict = verdictOf(card);
  return card;
};

const battleCard = (s, account, estimate) => readTurn(s, turn => composeBattleCard(turn, account), { estimate });

// Our side's 💀 / ⚠ tags. `after`: a likely KO once the mon has acted.
const dangerTags = m => (m.field ? [...m.field.slots.map(sl => [sl.name, sl.threat]), ...m.field.switches.map(sw => [sw.out?.name, sw.out?.threat])] : [])
  .filter(([name, t]) => name && t).map(([name, t]) => ({ mon: name, level: t.level, from: t.from, move: t.move, after: !!t.after }));
const dangerList = m => dangerTags(m).filter(d => d.level === "ko" || d.after);
const catchWorthIt = m => !!m.catch?.targets?.some(t => t.verdict !== "skip");
const planLost = m => !!m.teamPlan && m.teamPlan.result !== "win";
const easyWave = m => {
  const f = m.field;
  if (m.kind !== "battle" || m.trainer || !f || f.freeSwitch || m.enemySwitches?.length || m.rows.some(r => r.boss)) return false;
  if (f.switches.length || f.noSafeSwitch || dangerTags(m).length || catchWorthIt(m) || planLost(m)) return false;
  return f.slots.length > 0 && f.slots.every(sl => sl.move && slowestKo(sl) >= 1 && slowestKo(sl) <= 2);
};
const verdictOf = m => (easyWave(m) ? "easy" : m.trainer ? "trainer"
  : dangerTags(m).length || m.rows.some(r => r.boss) || m.field?.noSafeSwitch ? "danger"
  : catchWorthIt(m) ? "catch" : "fight");

// `lag-run/shop.ts` tells a shop's first draw from one after a reroll or a buy by these (#516).
const tmCount = offers => (offers ?? []).filter(f => f.class === "TmModifierType").length;
const shopNote = (s, card) => note({ shop: {
  rerolls: s.phaseManager?.getCurrentPhase?.()?.rerollCount ?? 0, money: s.money, party: s.getPlayerParty().length,
  tms: tmCount(card?.free), rollTms: (card?.rerollAhead?.rolls ?? []).reduce((n, r) => n + tmCount(r.offers), 0),
} });

export const hasRoad = card => card?.kind === "battle" || card?.kind === "rewards";
// After the turn read has closed: the two reads are sequential, never nested (26-run).
export const readRoad = (s, card) => readRun(s, run => {
  card.preview = previewNext(run);
  // The rewards card has already built its own.
  card.ahead ??= aheadModel(run);
});
export const keepRoad = (from, to) => { to.preview = from.preview; to.ahead = from.ahead; };

// `account`: the run's own data, read once a refresh by 98-watch.js, which only the catch and Mystery Encounter cards
// weigh a mon by. `road: false` leaves the road group to `readRoad`; `estimate` reads a battle card's turn without the
// game.
export const readCard = (s, account, { road = true, estimate = false } = {}) => {
  if (!s?.ui) return null;
  const handler = s.ui.getHandler();
  const starters = starterScreen(s);
  const learn = learnState(s);
  const rewards = rewardsScreen(s);
  let card = null;
  if (starters) {
    card = starterModel(s, starters);
  } else if (learn) {
    // The roster the rewards card judges a TM against, so the two cards weigh a move alike.
    card = readRun(s, run => learnModel({ ...learn, roster: learnRoster(aheadModel(run)) }));
  } else if (spliceScreen(s, handler)) {
    card = fusionModel(s, handler);
  } else if (rewards) {
    card = stage("shop.run", () => readRun(s, run => stage("shop.model", () => rewardsModel(run, rewards))));
    shopNote(s, card);
  } else if (biomeScreen(s, handler)) {
    card = readRun(s, run => biomeModel(run, handler));
  } else if (encounterScreen(s, handler)) {
    card = readRun(s, run => encounterModel(run, handler, account));
  } else {
    const b = s.currentBattle;
    const foes = s.getEnemyParty().filter(p => p.hp > 0);
    const party = s.getPlayerParty().filter(p => p.hp > 0);
    if (!b || !foes.length || !party.length) return null;
    card = battleCard(s, account, estimate);
  }
  if (!card) return null;
  card.wave = s.currentBattle?.waveIndex ?? null;
  if (road && hasRoad(card)) stage("road", () => readRoad(s, card));
  return card;
};

const slotText = sl => `${sl.name} ${sl.move ?? deadEndText(sl)}${sl.target === "both" ? " → both" : sl.target ? ` → ${sl.target.name}` : ""}${sl.then ? `, then ${sl.then}` : ""}${slowestKo(sl) > 0 && slowestKo(sl) <= 3 ? ` · ${hitsText(slowestKo(sl))}` : ""}`;

// The act group's summary is this string verbatim, so the strip, the watch line and the structured read agree (#349).
export const actSummary = card => (card.unavailable ? `no advice — ${card.unavailable}`
  : card.field ? card.field.slots.map(slotText).join(" ; ") : null);

// A mon the turn both attacks with and switches out carries its threat on two rows, so identical clauses collapse.
export const foesSummary = card => {
  const danger = dangerList(card).map(d => `${d.level === "ko" ? "💀" : "⚠"} ${d.mon} ← ${d.from} ${d.move}`);
  if (danger.length) return [...new Set(danger)].join(" · ");
  // "we're": a row below reads `foes weak to:`, which is the other direction entirely.
  return card.weak?.length ? `we're weak to ${card.weak.map(([t, n]) => `${t} ×${n}`).join(" · ")}` : null;
};

export const roadSummary = (preview, ahead) =>
  [previewSummary(preview), aheadSummary(ahead)].filter(Boolean).join(" · ") || null;

export const planSummary = tp => {
  if (!tp) return null;
  if (tp.summary) return tp.summary;
  const lost = tp.result !== "win";
  return [lost ? "likely lost" : "winnable",
    tp.win ? `💀 ${tp.win.name} KOs ${tp.win.kills}/${tp.win.of}` : null,
    ...tp.warnings.map(w => w.replace(/^likely lost: /, "")),
    tp.sacrifice.length ? `sacrifice ${tp.sacrifice.map(x => `${x.name} → ${x.frees.name} in free`).join(", ")}` : null,
  ].filter(Boolean).join(" · ");
};

// Every summary carries every key, empty where it isn't that card's: a contract test holds each kind to exactly these,
// so probe.js can pass the whole thing through.
const EMPTY = {
  kind: null, wave: null, verdict: null, field: null, danger: [], plan: null,
  learn: null, rewards: null, encounter: null, biome: null, fusion: null, starters: null,
  next: null, ahead: null, audit: null,
};
export const summaryKeys = () => Object.keys(EMPTY);

// The card event reads its call back out of `cardSummary` (extension-distribution.md §11.1), so it has to know how
// each card's summary joins its clauses: `SEP` is that join.
const SEP = " · ";
const leading = s => (typeof s === "string" && s ? s.split(SEP)[0] : null);
// `Swamp 72 pick — …`: the option the card picked, not the first one it listed.
const biomePick = s => {
  const picked = (typeof s === "string" ? s : "").split(SEP).find(o => o.includes(" pick — "));
  return picked ? picked.replace(/ \d+ pick — [\s\S]*$/, "") : null;
};
// `Mysterious Chest: take Open it — pick of 3 Ultra items`: the call alone, without what it would get us.
const encounterCall = s => {
  const head = leading(typeof s === "string" ? s.slice(s.indexOf(": ") + 2) : null);
  return head ? head.split(" — ")[0] : null;
};

// Every kind the panel can show has a row, and one without `event` is never streamed. A battle keys on the wave alone:
// its foes drop out of the list as they faint.
const wave = card => `${card.wave ?? null}`;
const KINDS = {
  battle: { event: "battle", key: wave, call: s => s.verdict },
  learn: { event: "learn", key: card => `${wave(card)}|${card.name ?? ""}|${card.move?.name ?? ""}`, call: s => leading(s.learn) },
  // A reroll changes the offers, so the rewards screen is a new decision under the same wave.
  rewards: { event: "reward", key: card => `${wave(card)}|${(card.free ?? []).map(f => f.name).join(",")}`, call: s => leading(s.rewards) },
  biome: { event: "biome", key: wave, call: s => biomePick(s.biome) },
  // A continuous encounter asks again on the same wave under the same name: the mon in front of you and the two
  // stages are what make a minigame turn its own decision, so they key it (`46-encounter.js`).
  encounter: { event: "encounter", call: s => encounterCall(s.encounter),
    key: card => `${wave(card)}|${card.name ?? ""}${card.minigame ? `|${card.minigame.mon}|${card.minigame.left}|${card.minigame.catchStage},${card.minigame.fleeStage}` : ""}` },
  starters: { event: null, key: wave, call: s => leading(s.starters) },
  fusion: { event: null, key: wave, call: s => leading(s.fusion) },
};

// Derived, never spelled a second time (extension-distribution.md §11.1). `streamable` gates the stream on it, and the
// relay keeps its own copy (`extension/src/relay/channel.ts`), pinned to this one by `cardtest.mjs`: a drift on the
// `rewards` → `reward` rename would drop every shop card off the wire in silence (#388).
export const EVENT_KINDS = Object.values(KINDS).map(k => k.event).filter(Boolean);

export const cardEvent = card => {
  if (!card) return null;
  const k = KINDS[card.kind];
  if (!k) return null;
  const s = cardSummary(card);
  return { kind: k.event ?? card.kind, key: k.key(card), wave: card.wave ?? null, verdict: s ? k.call(s) : null };
};
// What the stream pushes and the relay's gate admits (extension-distribution.md §11.1).
export const streamable = card => {
  const ev = cardEvent(card);
  return !!ev && EVENT_KINDS.indexOf(ev.kind) >= 0 && typeof ev.wave === "number" && typeof ev.key === "string" && typeof ev.verdict === "string";
};

// Pure, and never called by a draw.
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
  if (card.unavailable) return { ...base, verdict: "unavailable", field: actSummary(card) };
  // The foe the fight plan is keeping that mon for: the win condition's answers, or the foes only it beats (#170).
  const saveFor = name => {
    const r = (card.teamPlan?.reserve ?? []).find(x => x.name === name);
    if (r) return r.for.name;
    const o = (card.teamPlan?.only ?? []).find(x => x.name === name);
    return o ? o.for.map(f => f.name).join(", ") : null;
  };
  return { ...base,
    verdict: card.verdict ?? verdictOf(card),
    field: actSummary(card),
    danger: dangerList(card)
      .map(({ mon: name, from, move, level }) => ({ mon: name, from, move, level: level === "ko" ? "ko" : "after", saveFor: saveFor(name) })),
    plan: planSummary(card.teamPlan) };
};
