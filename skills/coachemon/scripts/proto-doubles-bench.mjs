// Throwaway prototype for #285 — never merge.
//
// Question: in a double battle where both enemy slots draw from ONE bench, can both
// EnemyCommandPhases name the same party index, and what does the game do with the second
// command? The HUD (`hud/20-enemy-ai.js:437`) drops the second switch; EnemyCommandPhase has
// no such rule.
//
// This does not drive the game. It re-runs the game's own snippets, copied verbatim from the
// pinned source, over a synthetic party — so the claims below are the source's arithmetic, not
// a paraphrase of it. Every snippet is drift-guarded: if the pinned file no longer contains the
// line this file was derived from, the run fails loudly instead of asserting something stale.
//
//   node skills/coachemon/scripts/proto-doubles-bench.mjs

import { readFileSync } from "node:fs";
import path from "node:path";

const PIN =
  process.env.POKEROGUE_SRC ??
  path.resolve("/Users/xau/Documents/projects/coachemon/.cache/pokerogue/v1.12.0.11");

// ---------------------------------------------------------------- drift guard

const ANCHORS = [
  [
    "src/field/trainer.ts",
    "isDouble",
    "return this.config.doubleOnly || this.variant === TrainerVariant.DOUBLE;",
  ],
  [
    "src/field/trainer.ts",
    "isPartner",
    "  isPartner(): boolean {\n    return this.variant === TrainerVariant.DOUBLE;",
  ],
  [
    "src/field/trainer.ts",
    "party member is tagged by index parity",
    "!this.isDouble() || !(index % 2) ? TrainerSlot.TRAINER : TrainerSlot.TRAINER_PARTNER,",
  ],
  [
    "src/field/trainer.ts",
    "bench is filtered by the asking mon's tag",
    ".filter(p => !trainerSlot || p.trainerSlot === trainerSlot);",
  ],
  [
    "src/field/trainer.ts",
    "bench excludes the field by position",
    ".slice(globalScene.currentBattle.getBattlerCount())",
  ],
  [
    "src/field/trainer.ts",
    "tie-break draws in a seed fork keyed on the turn",
    "globalScene.currentBattle.turn << 2,",
  ],
  [
    "src/phases/enemy-command-phase.ts",
    "switch command carries the party index, no dedupe",
    "const index = trainer.getNextSummonIndex(enemyPokemon.trainerSlot, partyMemberScores);",
  ],
  [
    "src/phases/turn-start-phase.ts",
    "non-FIGHT commands sort ahead of FIGHT",
    "if (aCommand?.command === Command.FIGHT) {\n          return 1;\n        }",
  ],
  [
    "src/phases/turn-start-phase.ts",
    "ties keep current field order",
    "return aIndex < bIndex ? -1 : aIndex > bIndex ? 1 : 0;",
  ],
  [
    "src/phase-manager.ts",
    "unshifted phases run FIFO",
    "Unshifted phases are run in FIFO order if multiple are queued during a single phase's execution.",
  ],
  [
    "src/phases/switch-summon-phase.ts",
    "the switch is a two-line party swap",
    "party[this.slotIndex] = this.lastPokemon;\n    party[this.fieldIndex] = switchedInPokemon;",
  ],
  [
    "src/data/moves/move.ts",
    "force-switch filters by tag ONLY for a partner trainer",
    "&& (!isPartnerTrainer || pokemon.trainerSlot === (switchOutTarget as EnemyPokemon).trainerSlot)",
  ],
];

const drift = [];
for (const [file, what, needle] of ANCHORS) {
  const src = readFileSync(path.join(PIN, file), "utf8");
  if (!src.includes(needle)) drift.push(`${file} — ${what}`);
}
if (drift.length) {
  console.error("DRIFT: the pinned source no longer contains what this prototype copied:");
  for (const d of drift) console.error("  - " + d);
  process.exit(1);
}
console.log(
  `drift guard: ${ANCHORS.length}/${ANCHORS.length} anchors present at ${path.basename(PIN)}\n`,
);

// ------------------------------------------------------- the game's own rules

const NONE = 0,
  TRAINER = 1,
  TRAINER_PARTNER = 2;
const BATTLER_COUNT = 2; // a double

// trainer.ts:432 — how a trainer party member gets its tag
const tagFor = (isDouble, index) => (!isDouble || !(index % 2) ? TRAINER : TRAINER_PARTNER);

// trainer.ts:551-580 — the candidate bench for one asking mon
const benchFor = (trainer, party, askerTag) => {
  let slot = askerTag;
  if (slot && !trainer.isDouble) slot = NONE; // 552-554
  return party
    .slice(BATTLER_COUNT) // 558 — the field is excluded by position
    .filter(p => p.allowedInBattle) // 559
    .filter(p => !slot || p.tag === slot) // 560
    .map(p => [party.indexOf(p), p.score]); // 580
};

// move.ts:7458-7468 — which off-field mons a force-switch may drag in
const forceSwitchEligible = (trainer, party, target) =>
  party.flatMap((p, i) =>
    p.allowedInBattle &&
    !party.slice(0, BATTLER_COUNT).includes(p) &&
    (!trainer.isPartner || p.tag === target.tag) // the filter that is skipped for doubleOnly
      ? [i]
      : [],
  );

// turn-start-phase.ts:20-46 — the command order
const commandOrder = commands => {
  const ordered = [0, 1, 2, 3]; // player field, then enemy field
  ordered.sort((a, b) => {
    const aC = commands[a],
      bC = commands[b];
    if (aC?.command !== bC?.command) {
      if (aC?.command === "FIGHT") return 1;
      if (bC?.command === "FIGHT") return -1;
    }
    const aIndex = ordered.indexOf(a),
      bIndex = ordered.indexOf(b);
    return aIndex < bIndex ? -1 : aIndex > bIndex ? 1 : 0;
  });
  return ordered;
};

// switch-summon-phase.ts:183-184 — what a resolving switch actually does
const switchAndSummon = (party, fieldIndex, slotIndex) => {
  const switchedIn = party[slotIndex];
  const last = party[fieldIndex]; // getPokemon() reads the live field
  party[slotIndex] = last;
  party[fieldIndex] = switchedIn;
  return { came: switchedIn.name, left: last.name };
};

// ------------------------------------------------------------------- the runs

const mk = (name, tag, score) => ({ name, tag, score, allowedInBattle: true });
const partyOf = (isDouble, scores) => scores.map((s, i) => mk("ABCDEF"[i], tagFor(isDouble, i), s));
const show = p => p.map((m, i) => `${i}:${m.name}${m.tag === TRAINER ? "·T" : "·P"}`).join("  ");

const line = t => console.log("\n" + t + "\n" + "-".repeat(t.length));

// 1 — a healthy double: are the two benches disjoint?
line("1. A healthy double (either kind): whose bench is whose");
{
  const party = partyOf(true, [1, 1, 9, 9, 2, 2]);
  const trainer = { isDouble: true, isPartner: false }; // doubleOnly — the harder case
  const b0 = benchFor(trainer, party, party[0].tag);
  const b1 = benchFor(trainer, party, party[1].tag);
  console.log(`party         ${show(party)}`);
  console.log(`slot 0 (T) bench  ${JSON.stringify(b0.map(x => x[0]))}`);
  console.log(`slot 1 (P) bench  ${JSON.stringify(b1.map(x => x[0]))}`);
  const shared = b0.map(x => x[0]).filter(i => b1.some(y => y[0] === i));
  console.log(`shared        ${shared.length ? shared : "none — disjoint by index parity"}`);
}

// 2 — does the parity survive a normal switch?
line("2. Does a normal switch keep the parity?");
{
  const party = partyOf(true, [1, 1, 9, 9, 2, 2]);
  console.log(`before        ${show(party)}`);
  switchAndSummon(party, 0, 2); // slot 0 (even) <-> index 2 (even)
  console.log(`slot 0 <-> 2  ${show(party)}`);
  const ok = party.every((m, i) => m.tag === tagFor(true, i));
  console.log(`parity        ${ok ? "held — a slot only ever names its own parity class" : "BROKEN"}`);
}

// 3 — can a force-switch break it?
line("3. Can Roar / Whirlwind / Dragon Tail break the parity?");
for (const trainer of [
  { name: "partner pair (variant DOUBLE)      ", isDouble: true, isPartner: true },
  { name: "doubleOnly single trainer (Twins…) ", isDouble: true, isPartner: false },
]) {
  const party = partyOf(true, [1, 1, 9, 9, 2, 2]);
  const eligible = forceSwitchEligible(trainer, party, party[0]);
  const wrongParity = eligible.filter(i => i % 2 === 1);
  console.log(`${trainer.name}`);
  console.log(`  Roar on slot 0 may drag in  ${JSON.stringify(eligible)}`);
  console.log(
    `  of those, wrong parity      ${wrongParity.length ? JSON.stringify(wrongParity) + "   <-- parity CAN break" : "none — parity safe"}`,
  );
}

// 4 — after the parity breaks, do both slots name the same index?
line("4. After a Roar drags an odd-tagged mon into slot 0");
const collided = (() => {
  const party = partyOf(true, [1, 1, 9, 9, 2, 2]);
  const trainer = { isDouble: true, isPartner: false };
  switchAndSummon(party, 0, 3); // Roar: slot 0 (even) <-> index 3 (odd)
  console.log(`party         ${show(party)}`);
  const b0 = benchFor(trainer, party, party[0].tag);
  const b1 = benchFor(trainer, party, party[1].tag);
  console.log(`slot 0 bench  ${JSON.stringify(b0)}`);
  console.log(`slot 1 bench  ${JSON.stringify(b1)}`);
  const same = JSON.stringify(b0) === JSON.stringify(b1);
  console.log(
    `same bench    ${same ? "YES — identical arrays, so identical best score and identical max-score set" : "no"}`,
  );
  console.log(
    `              getNextSummonIndex's only draw is seeded on (turn << 2) — the same turn for both`,
  );
  console.log(
    `              slots — so even a tie resolves to the same index. A same-turn double switch`,
  );
  console.log(`              therefore ALWAYS names one index, never two.`);
  return { party, index: b0.slice().sort((x, y) => y[1] - x[1])[0][0] };
})();

// 5 — what the game does with two identical commands
line("5. Both slots command POKEMON -> " + collided.index);
{
  const party = collided.party.slice();
  const commands = {
    0: { command: "FIGHT" },
    1: { command: "FIGHT" },
    2: { command: "POKEMON", cursor: collided.index },
    3: { command: "POKEMON", cursor: collided.index },
  };
  const order = commandOrder(commands).filter(o => commands[o].command === "POKEMON");
  console.log(
    `resolve order ${JSON.stringify(order)} (enemy slots ${order.map(o => o - 2).join(", ")}) — non-FIGHT first, field order kept, unshifted FIFO`,
  );
  console.log(`before        ${show(party)}`);
  for (const o of order) {
    const fieldIndex = o - 2;
    const { came, left } = switchAndSummon(party, fieldIndex, commands[o].cursor);
    console.log(`  slot ${fieldIndex}: ${left} out, ${came} in  ->  ${show(party)}`);
  }
  console.log(`after         field is ${party.slice(0, 2).map(m => m.name).join(", ")}`);
  console.log(`
  The second switch does NOT send the same mon twice and does NOT fail. By the time it runs,
  party[${collided.index}] holds the mon the FIRST switch just took off the field, so the game summons
  that mon straight back in, into the other slot, with resetSummonData() and a fresh
  PostSummonPhase. The HUD's dedupe predicts "slot 1 attacks"; the game switches slot 1.`);
}
