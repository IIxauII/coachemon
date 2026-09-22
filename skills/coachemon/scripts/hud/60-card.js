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
// A slot with no move to recommend. By here the search has looked for a status play and a switch and found neither,
// so what is lost is the turn, not the member — and where a restriction took its moves away, that is the news. One
// sentence for both surfaces that say it: the panel's ⚔ line and the card the coach reads.
export const deadEndText = sl => (sl.stopped?.length ? `nothing it can use — ${sl.stopped.join(" · ")}` : "nothing it can do");

// What the living party can hit with and what hits it, off one profile (`08-party.js`), so the rows and the cards
// that score matchups read one moveset the same way. `moveTypes`: damaging move types, which is what keeps the foe
// rows from listing a weakness nobody can hit. `weak`: the attacking types two or more of us are weak to, with how
// many of us each one hits — the foes line falls back to it when nothing threatens a KO (#349 §6).
const partyTypes = party => {
  const profile = partyProfile(party);
  return { moveTypes: profile.ourTypes, weak: profile.weakTypes.map(t => [t, profile.weakTo(t).length]) };
};

// The battle card: the planner's field model, the whole-fight plan (trainer battles) and the catch advice (wild), put
// together here rather than inside the planner. All three read one **turn** (`25-turn.js`), which is the refresh's
// single sandbox and its single set of answers — every damage number post-Tera, every AI number pre-Tera (spec §7).
//
// The order is the authority decided in #113: the fight plan's tables and searches are built first, the ⚔ line reads
// them to price what a turn costs the rest of the fight, and the plan is then rendered **pinned to the turn the ⚔
// line chose** — so its step 1 is that action by construction and the panel never shows two answers to one turn.
//
// One turn in, one card out: everything the battle card says about this moment. Exported so a scenario can hand it a
// turn built from tables (`test/fake-turn.mjs`) and get the card the panel would draw, with no scene in sight.
// @only tests: composeBattleCard
export const composeBattleCard = (turn, account) => {
  const { trainer, double, party } = turn.facts;
  // The exact enemy move is load-bearing (#183): where the game's own call can't be made, the battle card, the fight
  // plan and the catch advice stop **together** and print the reason, rather than one of them quietly falling back
  // to an estimate. The planner owns the gate; this is only the order — the plan isn't built to be thrown away.
  const gate = turn.exact?.() ?? { ok: true };
  if (!gate.ok) {
    const { pin: _pin, ...shell } = battleModel(turn);
    return { ...shell, teamPlan: null, catch: null, trainer: !!trainer, double, moveTypes: [], weak: [], verdict: "unavailable" };
  }
  // Same turn the ⚔ line is answered on, so a returning switch-in is priced at base stat stages in both (#285).
  const team = trainer ? teamPlanner(arrivalTurn(turn)) : null;
  // `pin` carries the live outcome the ⚔ line picked, so it stays off the card: the card's JSON is the panel's
  // change signature (98-tick).
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

// ---- The hold
// The panel refreshes every second and a turn's answers cost real work, so a card built from a live turn is kept
// until the turn itself moves on: a new wave, a new turn, or an enemy switch. **Not HP** — HP runs down through the
// turn's animations, and a hold keyed on it would collapse on the first hit and rebuild the card from a scene that
// is halfway through resolving. An approximate card is never kept, and never replaces a live one. This is the one
// hold in the engine: 30-planner, 35-team-plan and 45-catch each used to keep their own, on keys that disagreed.
let held = { key: null, card: null };
const battleCard = (s, account) => readTurn(s, turn => {
  const { wave, turn: t, enemySwitchCounter, party, foes } = turn.facts;
  // Who is in the battle as well as when it is: a wave 1 turn 1 of a new run is not the last run's, and a mon's
  // faint changes the field without changing the turn.
  const key = [wave, t, enemySwitchCounter, ...party.map(p => p?.id), "|", ...foes.map(f => f?.id)].join(",");
  if (held.key === key && held.card) return held.card;
  const card = composeBattleCard(turn, account);
  if (turn.live) held = { key, card };
  return card;
});

// ---- The battle verdict
// Danger the panel flags on our side: the 💀 / ⚠ tags on field slots and on mons a switch takes out. `after`: a ⚠ that
// is a likely KO once the mon has acted.
const dangerTags = m => (m.field ? [...m.field.slots.map(sl => [sl.name, sl.threat]), ...m.field.switches.map(sw => [sw.out?.name, sw.out?.threat])] : [])
  .filter(([name, t]) => name && t).map(([name, t]) => ({ mon: name, level: t.level, from: t.from, move: t.move, after: !!t.after }));
// The ones worth saying out loud: a likely KO this turn, or one that lands once the mon has acted. One predicate, so
// the foes line and the structured read can never disagree about what counts as danger.
const dangerList = m => dangerTags(m).filter(d => d.level === "ko" || d.after);
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
// `account`: the run's own data, read once a refresh by 98-tick (dex, starter table, party, the event's shiny
// multiplier). The catch card and the Mystery Encounter card weigh a mon by it, and neither is turn state.
export const readCard = (s, account) => {
  if (!s?.ui) return null;
  const handler = s.ui.getHandler();
  const starters = starterScreen(s);
  const learn = learnState(s);
  const rewards = rewardsScreen(s);
  let card = null;
  if (starters) {
    card = starterModel(s, starters);
  } else if (learn) {
    // The same next-big-fight roster the rewards card judges a TM against, so the two cards weigh a move alike. A
    // look-ahead the run read couldn't build reaches the card as its reason, not as a swallowed throw.
    card = readRun(s, run => learnModel({ ...learn, roster: learnRoster(aheadModel(run)) }));
  } else if (spliceScreen(s, handler)) {
    card = fusionModel(s, handler);
  } else if (rewards) {
    card = readRun(s, run => rewardsModel(run, rewards));
  } else if (biomeScreen(s, handler)) {
    card = readRun(s, run => biomeModel(run, handler));
  } else if (encounterScreen(s, handler)) {
    card = readRun(s, run => encounterModel(run, handler, account));
  } else {
    const b = s.currentBattle;
    const foes = s.getEnemyParty().filter(p => p.hp > 0);
    const party = s.getPlayerParty().filter(p => p.hp > 0);
    if (!b || !foes.length || !party.length) return null;
    card = battleCard(s, account);
  }
  if (!card) return null;
  card.wave = s.currentBattle?.waveIndex ?? null;
  if (card.kind === "battle" || card.kind === "rewards") {
    // After the turn read has closed: the two reads are sequential, never nested (26-run).
    readRun(s, run => {
      card.preview = previewNext(run);
      // The rewards card builds its own (it spends against it); every other card just draws it.
      card.ahead ??= aheadModel(run);
    });
  }
  return card;
};

// ---- The summary
const slotText = sl => `${sl.name} ${sl.move ?? deadEndText(sl)}${sl.target === "both" ? " → both" : sl.target ? ` → ${sl.target.name}` : ""}${sl.then ? `, then ${sl.then}` : ""}${slowestKo(sl) > 0 && slowestKo(sl) <= 3 ? ` · ${hitsText(slowestKo(sl))}` : ""}`;

// The battle's field line: what to do this turn, one clause per field slot — or, where the enemy's move couldn't be
// made, why there is no advice at all. The act group's summary is this string **verbatim** (#349 §6), so the strip,
// the watch line and the structured read are one string and cannot disagree.
export const actSummary = card => (card.unavailable ? `no advice — ${card.unavailable}`
  : card.field ? card.field.slots.map(slotText).join(" ; ") : null);

// The foes group's line (#349 §6): what threatens a KO this turn — `💀 Charizard ← Butterfree Gust`, `⚠` once the mon
// has acted — and, with nothing threatening one, what the party itself is weak to. Both are fields the coach has
// already computed; this only joins them, which is what keeps it presentation.
// A mon the turn both attacks with and switches out carries its threat on two rows, so the same entry reaches this
// twice; a line that says one thing twice is worse than one that says it once, so identical clauses collapse.
export const foesSummary = card => {
  const danger = dangerList(card).map(d => `${d.level === "ko" ? "💀" : "⚠"} ${d.mon} ← ${d.from} ${d.move}`);
  if (danger.length) return [...new Set(danger)].join(" · ");
  // "we're weak to", not "weak to": the group is called Foes and a row below it reads `foes weak to:`, which is the
  // other direction entirely. The one word is what keeps the two from reading as each other.
  return card.weak?.length ? `we're weak to ${card.weak.map(([t, n]) => `${t} ×${n}`).join(" · ")}` : null;
};

// The fight plan in one line: its verdict, the win condition, then what it warns about (a likely loss says why).
export const planSummary = tp => {
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

// ---- The card event (§11.1)
// What the panel pushes whenever the card it shows changes: the kind the stream uses, the key it is deduplicated on,
// the wave and the leading call. The watcher's old per-kind keys move here, so the stream and the card agree by
// construction. `starters` and `fusion` have no event kind of their own: they are read, never streamed.
//
// The call is read back out of the summary the panel already wrote (§11.1: "the leading call of the matching field of
// cardSummary() as the HUD already writes it"), so each card's wording stays in the file that owns its model — at the
// cost of knowing how that file joins its clauses. `SEP` is that join.
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

// One row per card kind: the name it streams under (the panel's `rewards` goes out as `reward`), the key it is
// deduplicated on, and where its call comes from. Every kind the panel can show has a row; a row without `event` is
// read-only. A battle is keyed on the wave alone, because its foes drop out of the list as they faint.
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

export const cardEvent = card => {
  if (!card) return null;
  const k = KINDS[card.kind];
  if (!k) return null;
  const s = cardSummary(card);
  return { kind: k.event ?? card.kind, key: k.key(card), wave: card.wave ?? null, verdict: s ? k.call(s) : null };
};

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
  // Nothing the enemy model feeds is being claimed, so the read says that and why, and claims nothing else.
  if (card.unavailable) return { ...base, verdict: "unavailable", field: actSummary(card) };
  // The foe the fight plan is keeping that mon for: the win condition's answers, or the foes only it beats (#170 §A).
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
