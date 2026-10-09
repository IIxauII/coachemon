# Newcomer corpus

Situations to compare team-value models on: a **party** plus a newcomer offered to it, each recorded with today's
answer — who the newcomer replaces, whether it is called an upgrade, and whether it is worth taking. Built for the map
*Judging a newcomer against the party* (#555), ticket *Build a replay corpus of party-plus-newcomer situations* (#559).

## What is here

| Path | What |
|---|---|
| `cases/lag-run.json` | 58 real situations: every wild foe the lag runs logged a catch card for, one per wave, with the party as the wave record listed it. `recorded` is what the live card said at the time. Regenerate with `extract-lag-run.ts`. |
| `cases/hand-built.json` | 12 situations built to probe the known failure and the terms #557 found BST misses. Two use the real wave-145 party from `docs/w145-ivy-rayquaza.md`. Each has a `probe`: what it tests and which way a team-aware judgment should lean. That is the author's intent, not ground truth. |
| `answers/today.json` | Today's answer for every case, from `scorers/today.mjs` against the current HUD: 22 take, 48 pass, 12 called upgrades, 26 with a free slot. |
| `scorers/today.mjs` | Today's answer, asked as the catch card asks it: the party profile's weakest member, `partyReasons`' upgrade, and the team side of `catchWorth`. |
| `replay.test.ts.template`, `run.ts` | The replay. Each case becomes a wild battle in upstream's vitest harness in the pinned clone, and every scorer is asked about the live game objects. |

## A case

```jsonc
{
  "id": "hb-all-water-drops-grass",
  "source": { "kind": "hand-built" },        // or lag-run (file, line) or doc
  "offer": "catch",
  "wave": 45,
  "party": [{ "species": "SUNFLORA", "level": 40, "moves": ["GIGA_DRAIN"] }],  // also optional: ability, form, held
  "newcomer": { "species": "MILOTIC", "level": 40 },
  "road": "…",                                // optional: the known road ahead, as prose
  "probe": "…",                               // hand-built only
  "recorded": { "verdict": "catch", "replaces": "Skwovet", "team": [], "account": [] }  // lag-run only
}
```

Keys are the game's own enum names (`SpeciesId`, `MoveId`, `AbilityId`); `form` is a form key. Leave `moves` out and the
mon gets the game's own generated moveset for its level. Each case is seeded by its id, so a replay is deterministic:
two full runs give byte-identical reports. `held` and `road` are case data only. The replay does not put items on the
live mon or set up the coming fight, so a scorer that wants them reads `case`.

## Running a scorer

Needs the provisioned pinned clone (`.cache/pokerogue/v<pinned>`, as `npm run oracle:encounter` does; in a worktree,
link the main checkout's `.cache`).

```sh
node scripts/newcomer-corpus/run.ts                          # every scorer in scorers/, every case (~30 s)
node scripts/newcomer-corpus/run.ts scorers/today.mjs my.mjs # chosen scorers, side by side
node scripts/newcomer-corpus/run.ts --cases hand-built       # one case file
node scripts/newcomer-corpus/run.ts -- -t all-water          # vitest's own name filter
node scripts/newcomer-corpus/run.ts --record                 # also rewrite answers/<scorer>.json
```

It prints one row per case and one column per scorer — `take ↑ −Sunflora (2)` is verdict, upgrade, who is replaced
(`free` for an open slot) and value — and writes the full report, with each mon's level and moveset, to
`.cache/newcomer-corpus/last.json`.

A scorer is one self-contained `.mjs` (it is copied into the clone, so it cannot import its neighbours):

```js
export default {
  name: "threat-coverage",
  // party: the live PlayerPokemon[]; newcomer: the live EnemyPokemon; hud: the HUD bundle's modules by file name
  // (`hud["08-party"].partyProfile`, …); scene: the BattleScene; case: the corpus record.
  score({ party, newcomer, hud, scene, case: c }) {
    return { replaces: "Sunflora" /* or null */, upgrade: false, value: 0.4, verdict: "take" /* | "pass" | "dupe" */, reasons: [] };
  },
};
```

## How far to trust it

- **Real cases lean towards "catch".** The lag runs logged a catch card only when the verdict was not `skip`, and they
  hold no safari, Mystery Encounter, biome or fusion offers. Parties are early-game (waves 1–42, levels 4–33).
- **Real parties have no recorded moves.** The log kept species and level only, so the replay fills the game's
  generated movesets. On the 20 cards that named who is replaced, the replay agrees on 19 (the miss is a near-tie,
  probably a mid-wave level-up). Team reasons match word for word on 42 of 58; every difference is a "hits X (no one else
  does)" hole, which reads moves.
- **`recorded` is the HUD of 2026-09-30 / 10-01; `answers/today.json` is the HUD this branch replays.**
- **Today's verdict is team-only.** `scorers/today.mjs` gives `catchWorth` an account that already owns everything, so
  account value (new species, shiny, IVs) is zero; the live card's `catch` often came from account value instead.
- No journal dumps exist: the journal lives in a browser's `localStorage` and records Mystery Encounters only, without
  moves. Real situations with full party state would need the journal, or the lag run's `get_state`, to log them.
