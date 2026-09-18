// Mystery Encounter journal: every encounter the player meets, written down while they play — the card the coach put
// up on the option screen, the option the game recorded them picking, and the run state at each tick it moved while
// the encounter played out. It judges nothing. It puts the coach's reading and the game's result side by side so that
// checking the encounter judgments is reading a file rather than playing until all twelve turn up.
//
// ---- Where the pick comes from (read from the pinned source, v1.12.0.11)
// `MysteryEncounterPhase.start` pushes a `SeenEncounterData { type, tier, waveIndex, selectedOption }` onto
// `scene.mysteryEncounterSaveData.encounteredEvents` as the encounter opens, and `handleOptionSelect` writes the
// chosen index into that same record — `selectedOption` is −1 until then, and is written only for the encounter's own
// option list, never for a follow-up menu (`optionSelectSettings`). So the pick is the game's own record rather than
// anything this file infers, and it survives a save and reload.
//
// ---- What a step holds
// Properties and the two party accessors, nothing whose body could drift and nothing that draws: the journal costs a
// tick no game code. A step is appended only when it differs from the one before it, so a wave where nothing happens
// leaves one row and a fight the encounter started leaves the turns that actually moved.
//
// ---- Where it lives
// `localStorage`, because twelve common-tier encounters do not arrive in one session: the journal has to outlive the
// run, the reload and the browser. It is bounded both ways — `MAX_ENTRIES` encounters, `MAX_STEPS` steps each — and a
// write the quota refuses drops the oldest entries and tries again, so a full store degrades to a shorter journal
// rather than to a thrown tick. A store that refuses a probe write at all (private mode, disabled site data) leaves
// the journal in memory for the rest of the session instead.
import { gameVersionOf } from "./01-core.js";

const KEY = "coach-me-journal";
const MAX_ENTRIES = 40, MAX_STEPS = 60;

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

let journal = null; // loaded on first use, then held: the tick reads it far more often than it writes
let persist = null; // null until the store has been probed once; false once it has refused
let open = null; // the encounter being recorded, already sitting in `journal`
let lastStep = ""; // the signature of the step last appended, so an unchanged tick writes nothing

const load = () => {
  if (journal) return journal;
  const stored = tryDo(() => JSON.parse(localStorage.getItem(KEY)));
  journal = Array.isArray(stored) ? stored : [];
  return journal;
};

// A probe write first, so a store that refuses everything is told apart from one that is merely full: the full one
// wants entries dropped, the refusing one wants them kept in memory.
const storable = () => {
  if (persist === null) {
    persist = tryDo(() => { localStorage.setItem(`${KEY}:probe`, "1"); localStorage.removeItem(`${KEY}:probe`); return true; }, false);
  }
  return persist;
};

const save = () => {
  if (!storable()) return false;
  const j = load();
  for (;;) {
    try { localStorage.setItem(KEY, JSON.stringify(j)); return true; } catch { /* quota: drop the oldest and retry */ }
    if (j.length <= 1) return false; // never drop the encounter being recorded
    j.shift();
  }
};

// A party or enemy member, as small as it can be and still show what the encounter did to it.
const mon = p => [p.id ?? null, p.species?.speciesId ?? null, p.name ?? null, p.level ?? null,
  p.hp ?? null, tryDo(() => p.getMaxHp()), p.status?.effect ?? 0];

// The run as it stands. The UI mode is read off the touch controls' dataset — the same DOM read the probe uses — so
// that the step says which screen it was taken on without calling into the game's UI.
const step = s => {
  const b = s.currentBattle;
  const party = tryDo(() => s.getPlayerParty().filter(Boolean), []) ?? [];
  const enemy = tryDo(() => s.getEnemyParty().filter(Boolean), []) ?? [];
  return {
    wave: b?.waveIndex ?? null, turn: b?.turn ?? null, battle: b?.battleType ?? null, double: !!b?.double,
    biome: s.arena?.biomeId ?? null, money: s.money ?? null,
    ui: tryDo(() => document.getElementById("touchControls").dataset.uiMode),
    party: party.map(mon), enemy: enemy.map(mon),
    items: (s.modifiers ?? []).map(m => `${m.type?.name ?? "?"}×${m.stackCount ?? 1}${m.pokemonId == null ? "" : `@${m.pokemonId}`}`).sort(),
  };
};

// The game's own record of this encounter, or null while it is someone else's: `encounteredEvents` is appended to as
// the encounter opens, so the one being recorded is the last, and it is only ours while type and wave both match.
const seenRecord = (s, o) => {
  const events = s.mysteryEncounterSaveData?.encounteredEvents;
  const last = Array.isArray(events) ? events[events.length - 1] : null;
  return last && last.type === o.type && last.waveIndex === o.wave ? last : null;
};

const startEntry = (s, me, wave) => {
  const j = load();
  // A panel injected part-way through an encounter — a reload, or the extension updating — finds its own half-written
  // entry at the end of the store. Carry on with it rather than opening a second row for one encounter.
  const prev = j[j.length - 1];
  if (prev && prev.seed === (s.seed ?? null) && prev.wave === wave && prev.type === (me.encounterType ?? null)) {
    open = prev;
    lastStep = "";
    return;
  }
  open = {
    at: new Date().toISOString(), seed: s.seed ?? null, game: gameVersionOf(s),
    wave, type: me.encounterType ?? null, tier: me.encounterTier ?? null,
    name: null, card: null, picked: null, pickedLabel: null, steps: [],
  };
  lastStep = "";
  j.push(open);
  while (j.length > MAX_ENTRIES) j.shift();
  save();
};

// Milestones are the only writes to the store besides the close: the card arriving and the pick landing. Everything
// between them is held in memory, so a tick during an encounter costs a `JSON.stringify` of one step, not of the
// whole journal.
const record = (s, card) => {
  let milestone = false;
  if (!open.card && card?.kind === "encounter" && card.wave === open.wave) {
    open.card = tryDo(() => JSON.parse(JSON.stringify(card)));
    open.name = card.name ?? null;
    milestone = true;
  }
  if (open.picked == null) {
    const seen = seenRecord(s, open);
    if (seen && seen.selectedOption >= 0) {
      open.picked = seen.selectedOption;
      open.pickedLabel = open.card?.options?.[seen.selectedOption]?.label ?? null;
      milestone = true;
    }
  }
  const now = step(s);
  const sig = JSON.stringify(now);
  if (sig !== lastStep) {
    lastStep = sig;
    if (open.steps.length < MAX_STEPS) open.steps.push(now);
    else open.truncated = true;
  }
  if (milestone) save();
};

const closeEntry = () => {
  if (!open) return;
  open = null;
  lastStep = "";
  save();
};

// One refresh's worth of journalling, called by the tick with the card it just read (which may be null). Never
// throws: a journal that cannot write is worth less than a panel that cannot draw.
export const journalCheck = (s, card) => {
  try {
    const b = s?.currentBattle;
    const me = b?.mysteryEncounter;
    const wave = b?.waveIndex ?? null;
    // `mysteryEncounter` stays on the battle for the whole wave, which is what keeps the trace running through a
    // fight the encounter started and through the rewards it hands out.
    if (!me || wave == null) { closeEntry(); return; }
    if (!open || open.wave !== wave || open.type !== me.encounterType) { closeEntry(); startEntry(s, me, wave); }
    record(s, card);
  } catch { /* the journal never takes the panel down with it */ }
};

// `window.__coachHud.journal()`: every encounter recorded on this browser, oldest first.
export const journalEntries = () => load().slice();

// The tally a live check reads first: how many of each encounter have been met, how many the coach had a judgment
// for, and how many were played through to a pick.
export const journalStats = () => {
  const j = load();
  const encounters = {};
  for (const e of j) {
    const name = e.name ?? `#${e.type}`;
    const t = encounters[name] ?? (encounters[name] = { tier: e.card?.tier ?? e.tier ?? null, met: 0, judged: 0, picked: 0 });
    t.met++;
    if (e.card?.known) t.judged++;
    if (e.picked != null) t.picked++;
  }
  return { entries: j.length, stored: storable(), encounters };
};

// `window.__coachHud.journalClear()`: after the journal has been harvested, so the next run starts a fresh tally.
export const journalClear = () => {
  open = null;
  lastStep = "";
  journal = [];
  save();
  return true;
};
