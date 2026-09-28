# Comments

A comment in this repo is exactly one of four kinds. **Name the kind, in one word, before you write the line.** A line
you cannot name does not go in, and a line already in the tree that you cannot name comes out.

## The four kinds

- **Scar** — what broke here, and what it cost. Carries its ticket: `(#378)`.
- **Gotcha** — the trap that is still armed, on the line that arms it.
- **Citation** — a pointer to where the fact is written down. A pointer and nothing more.
- **Contract** — a promise the code makes that reading the code does not reveal.

Everything else is **rationale**: what was weighed, what was rejected, why a number is this number. Rationale lives in
the ticket that decided it, which is where anyone revisiting the decision looks anyway. In source it goes stale the
first time the value moves, and stale rationale is worse than none — `90-render.js` carried 389 comment lines of 661,
and one constant change falsified most of them (#389).

**Orphaned rationale dies.** When a paragraph of it comes out, nothing archives it: not `game-code.md`, which refuses
repo-derived logic, not a doc, not a ticket opened for the purpose. Git history keeps it retrievable.

## The bar

**Cite, never restate.** A comment may point at a fact; it may not carry a second copy of one. The second copy drifts,
and the reader who wanted the fact was better served by the original. The code underneath is a fact too: a line that
says what the call beneath it plainly says is a restatement.

**Brief, with no cap.** Multi-line where the trap needs it, and nothing longer than the trap needs. There is no line
count to hit, so the worked pairs below are the only teeth this has — read them before you judge a comment of yours
short.

**Non-obvious, with no floor.** A kind is necessary, never sufficient. A contract on an export whose name and signature
already state it is not admissible for being a contract. No line is kept for the sake of an index — not a file's first
line, not a test file's header.

**JSDoc is under the same bar.** A `/** … */` is a comment; being a doc block buys it nothing, and the export boundary
decides nothing. A gnarly module-private helper earns a contract, a trivial export does not.

**Constants ship bare.** Where a derivation is worth keeping, one line of arithmetic beats ten of prose. A trap in
*changing* the constant is a gotcha and stays — `90-render.js`'s `SHARE`: "raising the share alone drags the width
floor up with it".

## Citations

A citation **names its document**, always: the bare file name with its extension, then the section.

```
(game-code.md §12)    (extension-distribution.md §9.4)    (v1-tool-surface.md §6.4)
```

- **A run of citations into one document names it once.** Within one block, with nothing between them pointing
  elsewhere, the rest stay bare (`§10.5`, `§10.2`).
- **`docs/spec/*.md` are citable at `§N` and `§N.N`.** Numbering in all three documents is append-only across their
  whole history, so a sub-section pointer into an 88 KB document is worth writing and owes no drift test.
- **A citation may name another file, never a line in it**, and never a paragraph by description — that is the
  back-reference that rots the moment the prose moves.
- **`(#NNN)` cites a ticket and takes no section.** `#NNN §N` is not a form: its validity rests on a property of the
  cited issue that no reader can check from the call site, and two of the three compounds in the tree named sections
  their issue never had (#417).

### Where a fact lives

- **The game's actual behaviour** → `game-code.md`. Cite it freely. **Correct** it where you find it wrong about the
  game, or find behaviour that went untracked: a subagent verifies the claim against the pinned source
  (`v1.12.0.11`), and only then does the fact land in `game-code.md`, in the same change as the comment that cites it.
  **Never extend it** with logic derived from this repo.
- **A decision this repo made** → `docs/spec/*.md` where one covers the area; else the code that enforces it
  (`hud-bundle.mjs`'s header holds the module rules, and a test fails if the bundler drifts from them); else the ticket,
  as a bare `(#NNN)`. There is no fourth home.

## Positions, not kinds

Three places look as if they had rules of their own. Each is a **position** where the same four kinds apply, at the
same bar.

**A file's first line.** A contract may sit at module scope: what the module answers, and what it refuses to do. One to
three lines, no tables, no narration of upstream, no history. `90-render.js`'s "it draws no card and decides nothing"
earns it; `95-render-ahead.js`'s "Look-ahead card and its plain-text summary" is what the file name and its imports
already say, so it goes. A live promise about one export moves onto that export.

**A test's name.** `src/**/*.test.ts` and `extension/test/*.ts` pass one to `test()`, citation included —
`test("a refused request leaves the browser unconsented (extension-distribution.md §8.4)")`. `scripts/test/*.mjs` have
no such slot, so the `// ---- ` banner over a scenario **is** the name, and is held to a name's bar: one line, the claim
the scenario checks, **no ordinal** (`encountertest.mjs` carries two `14.`s and a `16c` above its `16b`; nothing reads
the numbers and nothing keeps them honest), no coverage prose, and no repeat of a `title` the scenario already passes.
A `// ---- ` divider with no scenario under it is not a name, and faces the four kinds.

**An assertion message.** It is the failure's own words, never a home for prose that failed the four kinds. A comment
that passes the four kinds stays a comment; one that fails dies where it is, and nothing migrates. **A sweep writes no
assertion message at all** — every assert is left exactly as it is, because how good a message is, is a testing
question.

A name says what holds now; only a scar says what broke. A test earns both.

A golden file earns nothing per file: `run.mjs`'s header states the rule once for all 27.

## Markers

Three one-line forms, each meaning what it means here and never re-explained where it sits.

- **`game-less-backed`** — on a fallback that answers a question without the game's own method (`03-calendar.js`).
- **`// GENERATED by <script> — do not edit.`** — a gotcha: your edit is overwritten by the next run.
- **`// @only <importers>: <names>`** — a contract about who may import these names, enforced by `hud-bundle.mjs`
  (`only-violation`, pinned by `src/hud-bundle.test.ts`).

## One worked pair per kind

### Scar — `90-render.js`, the sprite fallback

Before (`a4bd89d`), six lines:

```js
    // **The fallback is an element, not a bare string**, because the rows and the caption that hold a sprite are
    // flex containers whose spacing is a `gap`. Contiguous text collapses into one anonymous flex item, so a
    // string fallback landing beside a neighbouring string is spaced by neither the gap nor a space of its own:
    // `Youngster` and `Charizard` drew as `YoungsterCharizard`. Only a missing sprite could show it, which is
    // every store shot (§12) and a game whose atlas has not loaded. The flattener joins siblings with a space
    // either way, so the card's text is unchanged.
```

After (`c4c6acf`), four:

```js
    // **The fallback is an element, not a bare string**: the rows and the caption that hold a sprite are flex
    // containers spaced by a `gap`, and contiguous text collapses into one anonymous flex item — so a string fallback
    // landing beside a neighbouring string is spaced by neither the gap nor a space of its own, and `Youngster` and
    // `Charizard` drew as `YoungsterCharizard` (#378).
```

A scar states the trap, the mechanism that arms it, the symptom it produced, and its ticket. What went is everything
around that: where the bug could be seen, and the reassurance that the flattener makes the text come out the same.
Neither is the trap, and neither would keep the next reader out of it.

Beside it in the same file, at the same commit, a comment of no kind:

```js
// The panel's **width**: 0.156 of the game — 300px at a 1920 game — clamped to 0.75×–1.5× of that reference. Below
// the floor legibility stops paying for proportion; above the ceiling, which binds at game width 2880, a crisp panel
// stops reading as part of upscaled pixel art. Past 2880 the ladder and this clamp deliberately part company: …
```

Four lines of weighing, and `SHARE` is 0.234 now: the paragraph was falsified by the edit that moved the number. What
survives on that constant is one line, and it is a gotcha — `REF_W` is derived from `SHARE`, so raising the share alone
drags the floor up with it.

### Gotcha — `03-calendar.js`, `gymRule`

Before, five lines:

```js
// The one gym rule. `GameMode.isWaveTrainer` returns on it before the chance roll, so a gym wave is a trainer wave
// that costs no draw — and as certain as a fixed battle. The run's last wave is the only exception, which `waveKind`
// takes first; the look-back in `trainerOdds` asks the rule itself, the way the game's own loop does. The rule lives
// *inside* `isWaveTrainer`, so a mode that never asks it has no gym wave: the modulo alone would hand Endless a gym
// leader on 200 that the game never generates.
const gymRule = (s, w) => hasTrainers(s) && w % 30 === (s?.offsetGym ? 0 : 20);
```

After, two:

```js
// `isWaveTrainer` holds the gym rule, so a mode that never asks it has no gym wave: the modulo alone would hand
// Endless a gym leader on 200 that the game never generates (game-code.md §12).
const gymRule = (s, w) => hasTrainers(s) && w % 30 === (s?.offsetGym ? 0 : 20);
```

The trap is the whole of it: the `hasTrainers(s)` term looks redundant beside the modulo, and deleting it is the bug.
The rest is `game-code.md §12` restated, or the code itself — `waveKind` visibly takes the final wave first, and
`trainerOdds` visibly calls `gymRule`.

### Citation — `src/cdp/link.ts`

One file, two spec documents, and no qualifier anywhere. Before (`6507389`):

```ts
/**
 * The CDP link (§12.1): every store command as one `Runtime.evaluate` of the page handler, stringified with `dispatch`,
 * the locator, `fine` and `disc` as its arguments (§10.5). … an act's fingerprint check and the act itself run
 * in the same page turn (§10.2).
 */
…
/** Each button's keyboard equivalent, for the raw fallback (§6.4). Phaser binds to `window`, so a dispatched key reaches the game (#9). */
…
/** CDP reads never advance a frozen loop: the guard still checks the frame and refuses `loop_frozen` (#23, §10.3). */
```

After:

```ts
/**
 * The CDP link (extension-distribution.md §12.1): every store command as one `Runtime.evaluate` of the page handler,
 * stringified with `dispatch`, the locator, `fine` and `disc` as its arguments (§10.5). … an act's fingerprint check
 * and the act itself run in the same page turn (§10.2).
 */
…
/** Each button's keyboard equivalent, for the raw fallback (v1-tool-surface.md §6.4). Phaser binds to `window`, so a dispatched key reaches the game (#9). */
…
/** CDP reads never advance a frozen loop: the guard still checks the frame and refuses `loop_frozen` (#23, extension-distribution.md §10.3). */
```

`§6.4` is `v1-tool-surface.md` and `§10.3` is `extension-distribution.md`, 22 lines apart in one file, so no
per-directory default was ever available to read them by. The block header's `§10.5` and `§10.2` stay bare: they follow
`extension-distribution.md §12.1` inside the same run. `#9` and `#23` are scars' tickets, not section pointers, and
nothing here touches them.

### Contract — `test/fixtures/party.mjs`

Before, the header, twelve lines:

```js
// One party, shared by the tests that ask about the party as a whole (`hud/08-party.js`). The card tests keep their
// own mon builders — a card needs a scene, a battle and a screen around the party — but nothing about a *profile*
// depends on any of that, so the profile is checked against this one team.
//
// The team is built to exercise every part of the profile at once:
//   Garchomp   Dragon/Ground, BST 600, final form   — immune to Electric, ×4 weak to Ice
//   Snorlax    Normal, BST 540, final form
//   Lapras     Water/Ice, BST 535, final form
//   Magikarp   Water, BST 200, one stage from Gyarados — the weakest member, by an *estimated* final BST
// So: Fighting, Grass and Electric are shared weaknesses (two members weak, fewer resisting), while Ice is not — only
// Garchomp is weak to it and Lapras resists it. Normal, Fighting, Bug, Water, Ice, Dark and Fairy are holes: no move
// on the team hits them super-effectively.
```

After, three:

```js
// Fighting, Grass and Electric are shared weaknesses — two members weak, fewer resisting — while Ice is not: only
// Garchomp is weak to it and Lapras resists it. Normal, Fighting, Bug, Water, Ice, Dark and Fairy are holes. Magikarp
// is the weakest member by an *estimated* final BST, not its own.
```

This is the premise many asserts read and no one assert could carry, which is what puts a contract at module scope; and
it is non-obvious in the strongest sense — seeing it otherwise means running the type chart over four species by hand.
The roster block above it is the `species(445, "Garchomp", ["Dragon", "Ground"], 600, …)` calls read back, line for
line, and the opening paragraph is placement rationale for a file called `fixtures/party.mjs`.

A contract earns its line anywhere, on the same test. In the same file:

```js
/** `moves`: `[name, type, power, category, attrs?]`. `power` −1 is a move the game prices from the situation. */
```

A positional array the code cannot name, and a sentinel it cannot show. Two doors away, a comment telling the reader
that Garchomp is Dragon/Ground would be the same kind of fact and would not earn a word.
