// Every Mystery Encounter the player meets, recorded while they play: the card the coach showed, the option the game
// recorded them picking (game-code.md §13), and the run state at each tick that moved. It judges nothing.
import { gameVersionOf } from "./01-core.js";

const KEY = "coach-me-journal";
const MAX_ENTRIES = 40, MAX_STEPS = 60;

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

let journal = null;
let persist = null; // null until the store has been probed once; false once it has refused
let open = null; // the encounter being recorded, already sitting in `journal`
let lastStep = "";

const load = () => {
  if (journal) return journal;
  const stored = tryDo(() => JSON.parse(localStorage.getItem(KEY)));
  journal = Array.isArray(stored) ? stored : [];
  return journal;
};

// A probe, so a store that refuses every write is not mistaken for a full one and emptied.
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
    try { localStorage.setItem(KEY, JSON.stringify(j)); return true; } catch {}
    if (j.length <= 1) return false; // never drop the encounter being recorded
    j.shift();
  }
};

const mon = p => [p.id ?? null, p.species?.speciesId ?? null, p.name ?? null, p.level ?? null,
  p.hp ?? null, tryDo(() => p.getMaxHp()), p.status?.effect ?? 0];

// Properties and the two party accessors only, so the journal spends a tick no game code; the UI mode comes off the
// DOM for the same reason.
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

// null while the last record is another encounter's (game-code.md §13).
const seenRecord = (s, o) => {
  const events = s.mysteryEncounterSaveData?.encounteredEvents;
  const last = Array.isArray(events) ? events[events.length - 1] : null;
  return last && last.type === o.type && last.waveIndex === o.wave ? last : null;
};

const startEntry = (s, me, wave) => {
  const j = load();
  // A panel injected again mid-encounter (a reload, an extension update) finds its own half-written entry last: carry
  // on with it rather than open a second row for one encounter.
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

// Only the card arriving and the pick landing write the store; the steps between wait in memory for the close.
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

export const journalCheck = (s, card) => {
  try {
    const b = s?.currentBattle;
    const me = b?.mysteryEncounter;
    const wave = b?.waveIndex ?? null;
    // The encounter lasts the wave, fights and rewards included (game-code.md §13).
    if (!me || wave == null) { closeEntry(); return; }
    if (!open || open.wave !== wave || open.type !== me.encounterType) { closeEntry(); startEntry(s, me, wave); }
    record(s, card);
  } catch {}
};

export const journalEntries = () => load().slice();

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

export const journalClear = () => {
  open = null;
  lastStep = "";
  journal = [];
  save();
  return true;
};
