// The run calendar (`hud/03-calendar.js`): what a run's wave numbers alone decide, checked as tables rather than as a
// card. Nothing here draws, so a mock game mode is only the pinned source's own rules written out — the classic fixed
// battle table, the gym rule, every tenth wave a boss, and each mode's last wave. Covers `waveKind`'s precedence in
// classic, Daily, Endless and with `offsetGym`; the schedule `bigFightsAhead` walks; the heal and who it revives under
// Limited Support and Hardcore; the trainer odds over a biome's ten waves; and the game-less fallbacks a build that
// hides its `gameMode` falls back to. Prints the tables, so run.mjs keeps a golden.
import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

// ---- Mock game modes, shaped like `GameMode`'s own methods (references/game-code.md §12).
// The classic table, by the waves `ClassicFixedBossWaves` names: the youngster, the rivals, the evil team, the Elite
// Four and the champion.
const CLASSIC_FIXED = new Set([5, 8, 25, 35, 55, 62, 64, 66, 95, 112, 114, 115, 145, 164, 165, 182, 184, 186, 188, 190, 195]);
const MODES = {
  classic: { isClassic: true, isWaveFinal: w => w === 200, isBoss: w => w % 10 === 0, isFixedBattle: w => CLASSIC_FIXED.has(w) },
  daily: { isDaily: true, isWaveFinal: w => w === 50, isBoss: w => w % 10 === 0, isFixedBattle: () => false },
  endless: { isEndless: true, isWaveFinal: w => w % 250 === 0, isBoss: w => w % 10 === 0, isFixedBattle: () => false },
};
// Challenge ids, as `Challenges` numbers them: Limited Support 8, Hardcore 9.
const LIMITED_SUPPORT = 8, HARDCORE = 9;
const scene = (mode = "classic", { offsetGym = false, challenges = [], only } = {}) =>
  ({ offsetGym, gameMode: { ...(only ?? MODES[mode]), challenges } });

// ---- Mount the HUD once with a bare scene and no `ui`, so its tick draws nothing; every case below then hands the
// calendar a plain scene object of its own, which is all the module reads.
globalThis.window = globalThis;
globalThis.Phaser = { Math: { RND: { state: () => "!rnd,0" } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => ({ gameMode: {} }) } } } }] } } } };
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };
eval(bundle("hud", { expose: true }));
const { waveKind, isBossWave, bigFightsAhead, nextHeal, healRevives, trainerOdds, hasTrainers, kindIsRolled } = globalThis.__hud["03-calendar"];

const row = (label, cells) => console.log(`${label.padEnd(26)}${cells.join("  ")}`);
const kinds = (s, waves) => waves.map(w => `${w}:${waveKind(s, w) ?? "—"}`);

// ---- 1. Classic: the four rules in precedence order. A wave can match several, and the first one wins.
{
  const s = scene("classic");
  console.log("== waveKind, classic");
  row("early", kinds(s, [1, 5, 8, 10, 11, 20, 25, 30]));
  row("late", kinds(s, [170, 182, 188, 190, 195, 199, 200]));
  assert.equal(waveKind(s, 1), null, "an ordinary wave is no kind at all");
  assert.equal(waveKind(s, 5), "fixed", "the youngster");
  assert.equal(waveKind(s, 10), "boss", "every tenth wave");
  assert.equal(waveKind(s, 20), "gym", "20 is a gym wave and a tenth wave: the gym rule outranks the boss rule");
  assert.equal(waveKind(s, 50), "gym");
  assert.equal(waveKind(s, 190), "fixed", "the champion is also a tenth wave: the table outranks both");
  assert.equal(waveKind(s, 200), "final", "200 is the final wave, a gym wave by the modulo and a tenth wave");
  // Membership, not precedence: 20 is still a boss wave, which is what the double-battle chance asks.
  assert.equal(isBossWave(s, 20), true);
  assert.equal(isBossWave(s, 21), false);
}

// ---- 2. `offsetGym` moves the gym rule to the X0 waves, and nowhere else.
{
  const s = scene("classic", { offsetGym: true });
  console.log("== waveKind, offsetGym");
  row("gym waves", kinds(s, [20, 30, 50, 60, 90]));
  assert.equal(waveKind(s, 30), "gym");
  assert.equal(waveKind(s, 20), "boss", "without the offset 20 was the gym; with it, it is only a tenth wave");
  assert.equal(waveKind(s, 60), "gym");
}

// ---- 3. Daily and Endless: each mode's own last wave, and the rules that carry over.
{
  const d = scene("daily"), e = scene("endless");
  console.log("== waveKind, daily / endless");
  row("daily", kinds(d, [20, 30, 45, 50]));
  row("endless", kinds(e, [20, 200, 210, 250, 500]));
  assert.equal(waveKind(d, 50), "final", "the Daily run ends at 50, which the gym rule would otherwise claim");
  assert.equal(waveKind(d, 20), "gym");
  assert.equal(waveKind(e, 250), "final", "Endless ends every 250th wave");
  assert.equal(waveKind(e, 210), "boss", "210 is only a tenth wave");
  // The gym rule lives inside `isWaveTrainer`, and `handleNonFixedBattle` never asks it without trainers: Endless
  // has no gym leader on 20 or 200, however the modulo falls.
  assert.equal(waveKind(e, 20), "boss", "Endless has no trainers, so no gym wave — only a tenth wave");
  assert.equal(waveKind(e, 200), "boss");
  assert.equal(hasTrainers(e), false, "Endless and Spliced Endless have no trainer battles at all");
  assert.equal(hasTrainers(d), true);
  assert.equal(hasTrainers(scene("classic")), true);
  assert.equal(trainerOdds(e, 22, { trainerChance: 8 }), 0, "and no trainer share on any wave");
  assert.equal(trainerOdds(e, 20, { trainerChance: 8 }), 0);
}

// ---- 3b. Whether a wave's kind costs a draw (`kindIsRolled`): what the preview's `type` confidence turns on. Every
// path `isWaveTrainer` returns on before its `1/trainerChance` roll is a rule, and holds from any point in the run.
{
  const s = scene("classic"), rolled = w => kindIsRolled({ ...s, arena: { trainerChance: 8 } }, w);
  console.log("== kind rolled, classic");
  row("waves 41–50", [41, 42, 43, 44, 47, 48, 49, 50].map(w => `${w}:${rolled(w) ? "roll" : "rule"}`));
  assert.equal(rolled(42), true, "an ordinary wave rolls the trainer chance on the stream");
  assert.equal(rolled(41), false, "X1 returns before the roll (the trainer sprite bug)");
  assert.equal(rolled(40), false, "so does X0");
  assert.equal(rolled(50), false, "the gym rule returns first");
  assert.equal(rolled(48), false, "and a wave the look-back blocks never reaches the roll");
  assert.equal(rolled(5), false, "a fixed battle is a table lookup, not a roll");
  assert.equal(kindIsRolled({ ...s, arena: { trainerChance: 0 } }, 42), false, "a biome with no trainer chance draws nothing");
  assert.equal(kindIsRolled(s, 42), true, "with no arena to read, assume the roll: `replay` is the careful answer");
  assert.equal(kindIsRolled({ ...scene("daily"), arena: { trainerChance: 8 } }, 42), false, "Daily answers from its own calendar");
  assert.equal(kindIsRolled({ ...scene("endless"), arena: { trainerChance: 8 } }, 42), false, "Endless never asks");
}

// ---- 4. The schedule: every big fight ahead, in wave order, stopping at the run's last wave.
{
  const s = scene("classic");
  const at = (from, n) => bigFightsAhead(s, from, n).map(f => [f.wave, f.kind]);
  console.log(`== schedule from 1  ${JSON.stringify(at(1, 30))}`);
  console.log(`== schedule from 181 ${JSON.stringify(at(181, 30))}`);
  assert.deepEqual(at(1, 30), [[5, "fixed"], [8, "fixed"], [10, "boss"], [20, "gym"], [25, "fixed"], [30, "boss"]]);
  assert.deepEqual(at(196, 30), [[200, "final"]], "nothing is scheduled past the run's last wave");
  assert.deepEqual(at(191, 30).map(f => f[0]), [195, 200], "the walk stops at the final wave it reaches");
  // No game mode at all: the schedule stands down rather than walking thirty waves of fallbacks.
  assert.deepEqual(bigFightsAhead({ gameMode: { isClassic: true } }, 1, 30), []);
  assert.deepEqual(bigFightsAhead(null, 1, 30), []);
}

// ---- 5. Heals. A classic run heals entering every X1 up to the final wave; Limited Support 1 and 3 have no heal at
// all, and Hardcore keeps the heal but leaves the fainted where they are.
{
  const s = scene("classic");
  console.log("== heals, classic");
  row("next heal", [10, 11, 17, 181, 191, 195].map(w => `${w}→${nextHeal(s, w + 1) ?? "none"}`));
  assert.equal(nextHeal(s, 12), 21);
  assert.equal(nextHeal(s, 182), 191, "the Elite Four is 181–190 with no heal in it");
  assert.equal(nextHeal(s, 192), null, "no full heal left before 200");
  console.log("== heals, challenges");
  for (const [name, challenges] of [["none", []], ["limited support 1", [{ id: LIMITED_SUPPORT, value: 1 }]],
    ["limited support 2", [{ id: LIMITED_SUPPORT, value: 2 }]], ["limited support 3", [{ id: LIMITED_SUPPORT, value: 3 }]],
    ["hardcore", [{ id: HARDCORE, value: 1 }]], ["hardcore + ls 1", [{ id: HARDCORE, value: 1 }, { id: LIMITED_SUPPORT, value: 1 }]]]) {
    const c = scene("classic", { challenges });
    row(name, [`heal ${nextHeal(c, 12) ?? "none"}`, `revives ${healRevives(c)}`]);
  }
  const ls1 = scene("classic", { challenges: [{ id: LIMITED_SUPPORT, value: 1 }] });
  assert.equal(nextHeal(ls1, 12), null, "Limited Support 1 drops the heal");
  assert.equal(healRevives(ls1), false, "a heal that never happens revives nobody");
  const ls2 = scene("classic", { challenges: [{ id: LIMITED_SUPPORT, value: 2 }] });
  assert.equal(nextHeal(ls2, 12), 21, "only value 2 keeps the heal");
  assert.equal(healRevives(ls2), true);
  const hard = scene("classic", { challenges: [{ id: HARDCORE, value: 1 }] });
  assert.equal(nextHeal(hard, 12), 21, "Hardcore still heals");
  assert.equal(healRevives(hard), false, "…it just doesn't revive");
}

// ---- 6. Trainer odds over the ten waves a biome choice covers: the certainties, the 1/trainerChance roll, its
// look-back and the block around a gym or fixed battle.
{
  const s = scene("classic"), biome = { trainerChance: 8 };
  const odds = w => trainerOdds(s, w, biome);
  console.log("== trainer odds, trainerChance 8");
  row("waves 41–50", [41, 42, 43, 44, 47, 48, 49, 50].map(w => `${w}:${odds(w).toFixed(3)}`));
  assert.equal(odds(41), 0, "X1 is skipped for a sprite bug");
  assert.equal(odds(42), 1 / 8, "the first wave of the window rolls plainly");
  assert.equal(odds(43), (7 / 8) / 8, "less the chance wave 42 already took the slot");
  assert.equal(odds(44), (7 / 8) ** 2 / 8, "two waves of look-back, and no more");
  assert.equal(odds(48), 0, "within two waves of the gym at 50");
  assert.equal(odds(49), 0);
  assert.equal(odds(50), 1, "the gym wave is a trainer by the calendar, with no roll at all");
  assert.equal(odds(40), 0, "an X0 is the wild boss");
  // A fixed battle blocks its neighbours the same way, and is nobody's trainer roll itself.
  assert.equal(odds(23), 0, "wave 25's rival blocks 23");
  assert.equal(odds(25), 0, "and is not the biome's at all");
  assert.equal(odds(22), 1 / 8, "three waves out is clear again");
  // The biome has to say how likely a trainer is at all.
  assert.equal(trainerOdds(s, 42, { trainerChance: 0 }), 0);
  assert.equal(trainerOdds(s, 42, null), 0);
  // Daily replaces the roll with certainties: X5, and X0 past wave 10.
  const d = scene("daily");
  console.log("== trainer odds, daily");
  row("waves 11–20", [11, 15, 16, 20].map(w => `${w}:${trainerOdds(d, w, biome)}`));
  assert.deepEqual([5, 10, 15, 20, 30].map(w => trainerOdds(d, w, biome)), [1, 0, 1, 1, 1]);
  assert.equal(trainerOdds(d, 16, biome), 0, "no roll in Daily: the calendar names its trainer waves outright");
}

// ---- 7. Game-less fallbacks. This is the only file allowed them, so a build that hides `gameMode`'s methods still
// gets one reading of the run rather than each card guessing its own.
{
  const bare = { gameMode: { isClassic: true } };
  console.log("== game-less fallbacks");
  row("classic", kinds(bare, [1, 10, 20, 199, 200]));
  assert.equal(waveKind(bare, 10), "boss", "every tenth wave");
  assert.equal(waveKind(bare, 20), "gym");
  assert.equal(waveKind(bare, 200), "final");
  assert.equal(waveKind({ gameMode: { isDaily: true } }, 50), "final", "the Daily run ends at 50");
  assert.equal(waveKind({ gameMode: { isEndless: true } }, 250), "final", "Endless every 250th");
  assert.equal(waveKind({ gameMode: { isEndless: true } }, 210), "boss");
  // With no game mode at all there is no run to read: the gym and tenth-wave rules are all that is left.
  assert.equal(waveKind({}, 210), "boss", "a tenth wave; which mode's last wave the run has, nobody said");
  assert.equal(waveKind({}, 20), "gym");
  assert.equal(waveKind({}, 1), null);
  assert.equal(healRevives({}), true, "no challenges, so the heal revives");
}

console.log("ok");
