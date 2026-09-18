// The watcher's event inference, replayed from recorded probe snapshots: what a run prints, and the state that keeps
// each line to once. `watchEvents` is pure, so this needs no browser and no read.sh — only the snapshots.
import { newWatchState, watchEvents } from "../watch.mjs";

const foe = (name, lv = 12, hp = "40/40") => ({ name, lv, hp, types: ["Normal"], ability: "Run Away", passive: null, moves: [] });
const party = [{
  name: "Charizard", lv: 30, hp: "90/90", types: ["Fire", "Flying"], ability: "Blaze", passive: null,
  stats: { hp: 90, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
  moves: [{ name: "Ember", type: "Fire", category: "Special", power: 40, accuracy: 100 }],
}];

// The summary's declared shape, as probe.js now passes it through whole.
const EMPTY_HUD = { kind: null, wave: null, verdict: null, field: null, danger: [], plan: null, learn: null,
  rewards: null, encounter: null, biome: null, fusion: null, starters: null, next: null, ahead: null, audit: null };
const snap = (over = {}) => ({ wave: 12, turn: 1, double: false, trainer: null, money: 500, hudActive: true,
  hud: null, uiMode: null, learn: null, rewards: null, party, enemy: [foe("Rattata")], items: [], ...over });
const hud = (over = {}) => ({ ...EMPTY_HUD, kind: "battle", wave: 12, ...over });

const replay = (label, snaps, opts = {}) => {
  let state = newWatchState();
  console.log(`== ${label}`);
  snaps.forEach((s, i) => {
    const out = watchEvents(state, s, opts);
    state = out.seen;
    for (const l of out.lines) console.log(`${i} ${l}`);
  });
};

// A new battle: one line with the HUD's verdict, and nothing on the polls after it.
replay("new battle", [
  snap({ hud: hud({ verdict: "fight", field: "Charizard Ember → Rattata · 2 hits" }) }),
  snap({ turn: 2, hud: hud({ verdict: "fight", field: "Charizard Ember → Rattata · 1 hit" }) }),
]);

// An easy wave names the foes only, and a trainer battle names the trainer and the plan.
replay("easy and trainer", [
  snap({ hud: hud({ verdict: "easy", field: "Charizard Ember → Rattata · 1 hit" }) }),
  snap({ wave: 13, trainer: "Youngster Ben", double: true, enemy: [foe("Machop", 9), foe("Geodude", 10)],
    hud: hud({ wave: 13, verdict: "trainer", plan: "winnable · ☠ Charizard KOs 2/2" }) }),
]);

// The HUD's verdict trails the read: the line is held for three polls, then goes out without one.
replay("HUD verdict trails the read", [snap(), snap(), snap(), snap(), snap({ hud: hud({ verdict: "fight" }) })]);

// A 💀 that shows up after the battle line, then the plan turning into a likely loss: once each per wave.
replay("danger mid-wave", [
  snap({ wave: 20, trainer: "Bug Catcher", hud: hud({ wave: 20, verdict: "trainer", plan: "winnable" }) }),
  snap({ wave: 20, turn: 2, trainer: "Bug Catcher",
    hud: hud({ wave: 20, verdict: "danger", plan: "winnable", danger: [{ mon: "Charizard", from: "Butterfree", move: "Gust", level: "ko", saveFor: null }] }) }),
  snap({ wave: 20, turn: 3, trainer: "Bug Catcher",
    hud: hud({ wave: 20, verdict: "danger", plan: "likely lost · nothing outspeeds Butterfree", danger: [{ mon: "Charizard", from: "Butterfree", move: "Gust", level: "ko", saveFor: null }] }) }),
  snap({ wave: 20, turn: 4, trainer: "Bug Catcher", hud: hud({ wave: 20, verdict: "danger", plan: "likely lost · nothing outspeeds Butterfree" }) }),
]);

// A ⚠ after our mon has acted is only notable for one the fight plan is saving.
replay("danger after acting", [
  snap({ wave: 21, trainer: "Lass", hud: hud({ wave: 21, verdict: "trainer",
    danger: [{ mon: "Charizard", from: "Oddish", move: "Absorb", level: "after", saveFor: "Vileplume" },
      { mon: "Pidgey", from: "Oddish", move: "Absorb", level: "after", saveFor: null }] }) }),
]);

// Learn-move and rewards carry the HUD's call; rewards repeat after a reroll changes the names.
replay("learn and rewards", [
  snap({ learn: { pokemon: "Charizard", move: { name: "Flamethrower", type: "Fire", category: "Special", power: 90, accuracy: 100 } },
    hud: hud({ kind: "learn", learn: "Learn → forget Ember" }) }),
  snap({ rewards: { free: [{ name: "Leftovers", desc: null, cost: 0 }], shop: [{ name: "Potion", desc: null, cost: 200 }], rerollCost: 250 },
    hud: hud({ kind: "rewards", rewards: "take Leftovers → Charizard", audit: "2 issues: Charizard has one answer; nothing resists Rock" }) }),
  snap({ rewards: { free: [{ name: "Revive", desc: null, cost: 0 }], shop: [{ name: "Potion", desc: null, cost: 200 }], rerollCost: 500 },
    hud: hud({ kind: "rewards", rewards: "take Revive" }) }),
]);

// The biome card is held until the HUD has actually picked one, not merely listed the options.
replay("biome and encounter", [
  snap({ wave: 30, hud: hud({ kind: "biome", wave: 30, biome: "Swamp · Construction Site" }) }),
  snap({ wave: 30, hud: hud({ kind: "biome", wave: 30, biome: "Swamp 85 pick — 2 mons hit SE · Construction Site 69" }) }),
  snap({ wave: 31, hud: hud({ kind: "encounter", wave: 31, encounter: "Mysterious Chest: take Open it — pick of 3 Ultra items · avoid Leave" }) }),
]);

// `--no-hud`: the probe's own learn and rewards reads still fire, with nothing held back.
replay("no hud", [
  snap({ hudActive: false }),
  snap({ learn: { pokemon: "Charizard", move: { name: "Flamethrower", type: "Fire", category: "Special", power: 90, accuracy: 100 } }, hudActive: false }),
  snap({ rewards: { free: [{ name: "Leftovers", desc: null, cost: 0 }], shop: [], rerollCost: 250 }, hudActive: false }),
], { withHud: false });

// A read error prints once per distinct message; loading is silent, and the next good snapshot carries on.
replay("errors and loading", [
  { error: "no pokerogue.net tab in Orion" },
  { error: "no pokerogue.net tab in Orion" },
  { loading: true },
  { error: "Orion is not running JavaScript" },
  snap({ hud: hud({ verdict: "fight" }) }),
]);

// A battle resumed mid-wave says so, but only for the first one the watcher sees.
replay("resumed", [
  snap({ turn: 4, hud: hud({ verdict: "fight" }) }),
  snap({ wave: 13, turn: 3, enemy: [foe("Pidgey", 13)], hud: hud({ wave: 13, verdict: "fight" }) }),
]);
