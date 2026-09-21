# Contrast and colour-vision-deficiency safety of the settled panel palette

Research for [#345](https://github.com/IIxauII/coachemon/issues/345), measuring the palette
[#337](https://github.com/IIxauII/coachemon/issues/337) settled. **Findings only.** Whether to change
an ink in response is a decision and belongs to its own ticket.

> **Second pass.** The first pass of this note measured `later` as `#e020c0`, and measured the type
> badges as `TypeColor`-on-`TypeShadow` pills. Both were wrong, and the matchup marks have since
> changed to quote the game's effectiveness table. What changed, and what it cost:
>
> 1. **`later` is `#e331c5`, not `#e020c0`.** The game carries the master-tier colour twice and
>    disagrees with itself: `src/enums/color.ts:21` holds the string `MASTER = "#e020c0"`, but
>    `src/ui/text.ts:683` `getModifierTierTextTint()` returns `0xe331c5`, and that is the value that
>    actually tints. Re-measured throughout. The conclusions about `later` do not change — it still
>    fails AA, and it still separates from `theirs` under every deficiency — but every number moved.
> 2. **The type badges are 13px sprites, not colour.** `badge()` at
>    `skills/coachemon/scripts/hud/90-render.js:54-55` draws `img("types", …, 13)` off the game's own
>    atlas. `TypeColor`/`TypeShadow` never enter the panel at all — `grep` for either across
>    `skills/coachemon/scripts/` returns nothing. The whole "17 of 18 pills fail AA" finding from the
>    first pass was measuring a thing that does not exist. What does exist is the **text fallback**
>    (`90-render.js:40-45`): when a sprite is missing, `img()` returns `fallback`, which `badge()`
>    sets to the type's name. Measured here as text on the panel fill — and note that today that
>    fallback is *not* inked at all; it inherits the panel's body colour.
> 3. **The matchup marks now quote the game's effectiveness table** rather than using the gutter's
>    inks: `▲` weak-to `#4AA500`, `▼` resisted `#FE8E00`, immune `#929292`, from
>    `getTypeDamageMultiplierColor` (`src/data/type.ts:296`). That puts three new inks in the 14px
>    gutter beside the four that were already there, and the near-twins it creates are the most
>    decision-relevant thing in this note. They get their own section, first.

## What was measured, and against what

Every number comes from a throwaway Node script, reproduced verbatim in the appendix. It has no
dependencies; `node palette.mjs` regenerates every table.

### The inks

All verified against the pinned game source at `.cache/pokerogue/v1.12.0.11`:

| column | role | ink | shadow | source |
|---|---|---|---|---|
| law | ours | `#40c8f8` | `#006090` | `ui/text.ts:604-606`, `TextStyle.SUMMARY_BLUE` |
| law | theirs | `#f89890` | `#984038` | `ui/text.ts:585-586`, `TextStyle.PARTY_RED` |
| law | later | `#e331c5` | see below | `ui/text.ts:693`, `getModifierTierTextTint(MASTER)` |
| law | neither | `#a0a0a0` | `#636363` | `ui/text.ts:620-622`, `TextStyle.SETTINGS_LOCKED` |
| gutter | good news | `#78c850` | `#306850` | `ui/text.ts:630-631`, `TextStyle.SUMMARY_GREEN` |
| gutter | bad news | `#e13d3d` | `#632929` | `ui/text.ts:568-572`, `TextStyle.MOVE_PP_EMPTY` |
| gutter | careful | `#f8b050` | `#c07800` | `ui/text.ts:632-636`, `TextStyle.HEADER_LABEL` |
| gutter | `▲` weak-to | `#4AA500` | none | `data/type.ts:314`, offense 2× |
| gutter | `▼` resisted | `#FE8E00` | none | `data/type.ts:312`, offense ½× |
| gutter | immune | `#929292` | none | `data/type.ts:304`, offense 0× |
| — | body | `#f8f8f8` | `#6b5a73` | `ui/text.ts:542-543`, `TextStyle.MESSAGE` |

Three notes on provenance, all of them things the source says and the palette table does not:

- **The quoted effectiveness inks have no shadow.** In the game they are text *tints* applied to the
  effectiveness display, not a `TextStyle` with a paired `ShadowColor`. Nothing in the source says
  what shadow they should take on our panel; they are measured shadowless here.
- **`later`'s shadow is undecided.** #337 paired `#e020c0` with `#6b5a73` (`ShadowColor.PURPLE`, which
  the game uses under body text). The prototype paired `#e331c5` — the value we are now using — with
  `#5c1450`. Since the ink reverted to the prototype's, which shadow travels with it is open. Both
  are measured below; they fail in opposite directions.
- **The effectiveness table has three tiers a side, not one.** Super-effective is `#4AA500` / `#4BB400`
  / `#52C200` for 2× / 4× / 8×, and resisted is `#FE8E00` / `#FF7400` / `#FF5500` for ½× / ¼× / ⅛×.
  The marks quote the 2× and ½× values. The other four are measured in the benchmark section because
  upstream's high-contrast swap touches all three super-effective tiers.

### The backdrops

The panel is translucent, so "the panel fill" is not one colour. Five backdrops were composited:

| id | what it is | composited | relative luminance |
|---|---|---|---|
| A | prototype fill over a black game frame — `rgba(43,36,56,.95)` over `#000000` | `#292235` | 0.0188 |
| B | prototype fill over a **white** game frame — `rgba(43,36,56,.95)` over `#ffffff` | `#362f42` | 0.0320 |
| C | shipped fill over a black game frame — `rgba(12,12,24,.88)` over `#000000` | `#0b0b15` | 0.0035 |
| D | shipped fill over a **white** game frame — `rgba(12,12,24,.88)` over `#ffffff` | `#292934` | 0.0232 |
| E | opaque approximation of the prototype fill — `#2b2438` | `#2b2438` | 0.0206 |

A and B bracket `--fill` in `skills/coachemon/scripts/hud/PROTOTYPE-directions.html:36`. C and D bracket
the shipped panel's `background: rgba(12,12,24,.88)` at `90-render.js:166`. E is the flat approximation
the ticket asked for.

**B is the worst case in the whole report.** The shipped panel is more transparent (88% vs 95%) but its
fill is far darker, so even with a white frame behind it (D, L=0.0232) it stays darker than the
prototype's does with the same frame (B, L=0.0320). Transparency costs the shipped panel more in
*relative* terms — `later` drops 27% from C to D against 16% from A to B — but the prototype's lighter
fill loses in absolute terms. Every verdict below is stated against B.

### Thresholds

Text on the panel is 15px (`PROTOTYPE-directions.html:88`). WCAG 2.2 counts large text as ≥24px, or
≥18.66px bold, so **4.5:1 (AA) is the applicable threshold**, not 3:1. 3:1 is still reported as the
floor a glyph would need if reclassified as a graphical object under SC 1.4.11.

For CIEDE2000, no pass threshold is normative. This note uses one scale throughout, calibrated for a
**14px glyph on a moving background, judged from memory rather than side by side**:

| ΔE00 | verdict | what it looks like |
|---|---|---|
| < 5 | **plainly the same** | one ink. The reader never suspects a distinction was intended. |
| 5 – 20 | **the uncanny middle** | different enough to see, not different enough to mean. Reads as one ink rendered inconsistently — as a bug, not a distinction. |
| > 20 | **plainly different** | two inks. |

The middle band is the dangerous one and the reason it is named. A pair at ΔE00 3 costs the reader
nothing they will notice; a pair at ΔE00 10 costs them a double-take and a wrong hypothesis. This is a
reporting convention for readability, not a standard and not a recommendation.

### CVD method

Brettel, Viénot & Mollon (1997) full two-half-plane simulation at severity 1.0, applied in linear sRGB
with the precomputed parameters published by libDaltonLens (public domain). Every matrix row sums to
1.000, so white maps to white by construction — and `#f8f8f8`, `#a0a0a0` and `#929292` do come back
unchanged under all three deficiencies, which is the sanity check.

Protanopia and deuteranopia were cross-checked against the Viénot, Brettel & Mollon (1999) single-plane
matrices. The two agree to ΔE00 ≤ 8 on every ink **except `later #e331c5` under protanopia (ΔE00
13.84)** — the single-plane approximation is known to be poor for saturated violets, which is exactly
this ink. Both agree `later` stops being magenta; they disagree on what it becomes. Treat that one cell
as the least certain number here.

---

## Finding 1 — the near-twin pairs: none of the three lands as "plainly different"

The quotation puts `#4AA500`, `#FE8E00` and `#929292` into the same 14px column as `#78c850`,
`#f8b050` and (next door, in the law) `#a0a0a0`. Measured against the inks they sit beside:

| pair | what they mean | normal | protan | deutan | tritan | worst | verdict at worst | verdict in normal vision |
|---|---|---|---|---|---|---|---|---|
| `#78c850` vs `#4AA500` | good news vs weak-to | 11.02 | 10.37 | 11.46 | 10.76 | **10.37** | **uncanny middle** | **uncanny middle** |
| `#f8b050` vs `#FE8E00` | careful vs resisted | 9.96 | 8.32 | 6.54 | 7.93 | **6.54** | **uncanny middle** | **uncanny middle** |
| `#a0a0a0` vs `#929292` | nobody acting vs immune | 4.47 | 4.47 | 4.47 | 4.47 | **4.47** | **plainly the same** | **plainly the same** |

**Plainly, for each:**

- **`#78c850` against `#4AA500` — the uncanny middle, and it never leaves it.** ΔE00 11.02 in normal
  vision, 10.37 at worst, 11.46 at best: the pair sits in the middle band in all four conditions, a
  flatter profile than anything else in this report. These two are the same hue at different
  lightness — a lighter green and a darker green — so no deficiency separates them and none collapses
  them either. A reader sees two greens and has no way to learn whether that is a distinction or a
  rendering accident. **This is not a colour-blindness problem. It is a normal-vision problem that
  colour-blindness does not make worse.**
- **`#f8b050` against `#FE8E00` — the uncanny middle, worst under deuteranopia.** ΔE00 9.96 normal,
  falling to 6.54 under deuteranopia, where both go yellow (`#dcc04c` / `#cdaf00`). Closer than the
  green pair in every condition, and closest exactly where a reader is least able to compensate.
- **`#a0a0a0` against `#929292` — plainly the same, in every condition, by construction.** Both are
  achromatic, so all three simulations return them unchanged and the number is 4.47 four times over.
  The entire difference is 4% of lightness. Side by side one grey is a hair darker; anywhere else they
  are one ink. *Nobody is acting* and *this move does nothing* are, visually, the same statement.

**And the pair the quotation creates against itself is worse than any of them.** `#4AA500` and
`#FE8E00` are both in the gutter, they mean opposite things, and under protanopia they are
**ΔE00 0.71 apart** — the smallest number anywhere in this report, well inside "plainly the same":

| pair | normal | protan | deutan | tritan | worst |
|---|---|---|---|---|---|
| weak-to `#4AA500` vs resisted `#FE8E00` | 48.13 | **0.71** | 12.54 | 45.85 | **0.71** |

Both become the same dark yellow (`#b59b00` / `#b79d08`). One more, same column, same problem:
**weak-to `#4AA500` vs the gutter's bad-news red `#e13d3d` is ΔE00 4.61 under deuteranopia** — good
news and bad news, one ink.

## Finding 2 — upstream already hit this, and shipped the fix

The 0.71 above is not our discovery. It is a known defect in the game with a shipped remedy, and
`src/enums/type-hints.ts` says so in as many words:

> ```
> /**
>  * Show hints for moves using a high-contrast palette (blue for super effective moves
>  * instead of green), accessible to people with protanopia (red-green colorblindness).
>  */
> HIGH_CONTRAST,
> ```

`TypeHints` is a three-way display setting — `OFF` / `ON` / `HIGH_CONTRAST`
(`system/settings/settings.ts:636-654`) — and `getTypeDamageMultiplierColor` takes a `highContrast`
flag that swaps the super-effective family off green and onto blue, leaving resisted orange alone:

| tier | default | high contrast | default on B | hc on B |
|---|---|---|---|---|
| immune 0× | `#929292` | `#929292` | 4.12 | 4.12 |
| resisted ⅛× | `#FF5500` | `#FF5500` | 4.00 | 4.00 |
| resisted ¼× | `#FF7400` | `#FF7400` | 4.73 | 4.73 |
| resisted ½× | `#FE8E00` | `#FE8E00` | 5.54 | 5.54 |
| super 2× | `#4AA500` | `#2DB4FF` | 4.07 | 5.54 |
| super 4× | `#4BB400` | `#00A4FF` | 4.78 | 4.73 |
| super 8× | `#52C200` | `#0093FF` | 5.54 | 4.04 |

**What the swap buys, measured.** It is a total fix for the pair it targets:

| pair | mode | normal | protan | deutan | tritan | worst | verdict at worst |
|---|---|---|---|---|---|---|---|
| super 2× vs resisted ½× | default | 48.13 | **0.71** | 12.54 | 45.85 | **0.71** | plainly the same |
| super 2× vs resisted ½× | **high contrast** | 52.83 | 54.51 | 57.67 | 65.31 | **52.83** | **plainly different** |
| super 4× vs resisted ¼× | default | 57.00 | 10.10 | 5.71 | 50.10 | 5.71 | uncanny middle |
| super 4× vs resisted ¼× | **high contrast** | 53.34 | 56.09 | 59.66 | 70.63 | **53.34** | **plainly different** |
| super 8× vs resisted ⅛× | default | 65.97 | 21.31 | 4.13 | 54.30 | 4.13 | plainly the same |
| super 8× vs resisted ⅛× | **high contrast** | 52.55 | 57.10 | 61.28 | 74.14 | **52.55** | **plainly different** |

Default green-against-orange bottoms out at ΔE00 0.71, 5.71 and 4.13 across the three tiers. High
contrast raises the worst of all three above 52, and — the part worth copying — it makes the pair
*more* separated under every deficiency than it is in normal vision. That is the benchmark: **a
green/red-family separation that survives CVD scores above 50, not in the teens.** Every pair in our
own palette that this note flags scores between 0.71 and 15.

**But the swap sets a trap for us specifically, and the number is bad:**

| pair | normal | protan | deutan | tritan | worst | verdict at worst |
|---|---|---|---|---|---|---|
| gutter green `#78c850` vs weak-to `#4AA500` (default) | 11.02 | 10.37 | 11.46 | 10.76 | 10.37 | uncanny middle |
| gutter green `#78c850` vs weak-to `#2DB4FF` (high contrast) | 55.76 | 52.59 | 51.31 | 11.03 | 11.03 | uncanny middle |
| **law ours `#40c8f8` vs weak-to `#2DB4FF` (high contrast)** | **8.57** | **7.02** | **5.64** | **4.32** | **4.32** | **plainly the same** |

Upstream can move super-effective onto blue because nothing else in the game's effectiveness display
is blue. We cannot: **`#2DB4FF` is ΔE00 8.57 from `#40c8f8` in normal vision and 4.32 under
tritanopia.** The law's *ours* ink and a high-contrast *weak-to* mark would be the same blue, in
adjacent columns, on the same row. Adopting upstream's fix verbatim trades a gutter collision for a
cross-column one between the two systems #337 built specifically so they could never collide.

## Finding 3 — contrast: three inks fail AA against the panel fill

| ink | A | B | C | D | E | AA 4.5 on B | 3:1 on B |
|---|---|---|---|---|---|---|---|
| law ours `#40c8f8` | 7.87 | 6.61 | 10.12 | 7.40 | 7.67 | pass | pass |
| law theirs `#f89890` | 7.18 | 6.03 | 9.23 | 6.75 | 7.00 | pass | pass |
| **law later `#e331c5`** | 4.00 | **3.36** | 5.15 | 3.77 | 3.90 | **FAIL** | pass |
| law neither `#a0a0a0` | 5.83 | 4.90 | 7.50 | 5.49 | 5.69 | pass | pass |
| gutter green `#78c850` | 7.39 | 6.21 | 9.51 | 6.95 | 7.21 | pass | pass |
| **gutter red `#e13d3d`** | 3.59 | **3.01** | 4.61 | 3.37 | 3.50 | **FAIL** | pass |
| gutter gold `#f8b050` | 8.22 | 6.90 | 10.57 | 7.73 | 8.01 | pass | pass |
| **matchup weak-to `#4AA500`** | 4.85 | **4.07** | 6.23 | 4.56 | 4.73 | **FAIL** | pass |
| matchup resisted `#FE8E00` | 6.60 | 5.54 | 8.49 | 6.21 | 6.43 | pass | pass |
| **matchup immune `#929292`** | 4.90 | **4.12** | 6.30 | 4.61 | 4.78 | **FAIL** | pass |
| body `#f8f8f8` | 14.36 | 12.06 | 18.47 | 13.51 | 14.00 | pass | pass |

Four fail AA on the worst-case backdrop: `later` 3.36, `gutter red` 3.01, `weak-to` 4.07, `immune`
4.12. All four clear the 3:1 graphical floor. Nothing in the palette reaches AAA (7:1) on B. Swapping
`later` from `#e020c0` to `#e331c5` improved it from 3.13 to 3.36 — still a fail.

On the prototype's tinted group fills (`PROTOTYPE-directions.html:39-42`), which are lighter than the
panel's own, `later` drops to 2.88 and `gutter red` to 2.58 on `--gold-fill`, below the 3:1 floor as
well; `weak-to` falls to 3.48 and `immune` to 3.52.

## Finding 4 — the 1px text-shadow does not help, and `later`'s two candidates both fail differently

Every shadow the game pairs with one of these inks is **brighter than the panel fill** — 1.4× to 7.7×:

| ink | shadow | C(ink, shadow) | shadow luminance | × brighter than the fill | C(shadow, B) |
|---|---|---|---|---|---|
| law ours `#40c8f8` | `#006090` | 3.52 | 0.1038 | 3.25 | 1.88 |
| law theirs `#f89890` | `#984038` | 3.16 | 0.1063 | 3.33 | 1.91 |
| law later `#e331c5` | `#6b5a73` | **1.65** | 0.1168 | 3.65 | 2.03 |
| law neither `#a0a0a0` | `#636363` | 2.30 | 0.1248 | 3.91 | 2.13 |
| gutter green `#78c850` | `#306850` | 3.16 | 0.1111 | 3.48 | 1.97 |
| gutter red `#e13d3d` | `#632929` | 2.63 | 0.0440 | **1.38** | **1.15** |
| gutter gold `#f8b050` | `#c07800` | 1.91 | 0.2464 | **7.71** | 3.62 |
| matchup `#4AA500` / `#FE8E00` / `#929292` | *none in the game* | — | — | — | — |
| body `#f8f8f8` | `#6b5a73` | 5.93 | 0.1168 | 3.65 | 2.03 |

The shadows are darker companions to their own ink, which is what the game needed on its own windows.
On a fill darker than all of them, the shadow is not a halo — it is a **mid-tone ramp between the ink
and the ground**, down and right of every stroke. So it adds no contrast against the panel and
slightly softens each glyph's edge at 15px. It helps only where a bright game frame shows through,
which at 88–95% opacity is a small effect. Gold's `#c07800` is the one shadow bright enough to read as
part of the glyph (7.71× the fill), so gold text looks bolder than everything else; red's `#632929` is
C 1.15 against the fill, effectively no shadow at all.

**`later`'s two candidate shadows fail in opposite directions**, which is why the choice is not
arbitrary:

| candidate | C(ink, shadow) | × brighter than the fill | C(shadow, B) | what goes wrong |
|---|---|---|---|---|
| `#6b5a73` (#337's) | **1.65** | 3.65 | 2.03 | visible against the fill, but nearly the ink's own luminance — a grey-purple fringe that thickens and desaturates a magenta already failing contrast |
| `#5c1450` (prototype's) | 3.30 | **1.05** | **1.02** | separates cleanly from the ink, but is within 5% of the fill's luminance — invisible, i.e. no shadow at all |

Neither is a shadow that works. The three quoted matchup inks have no candidate at all.

## Finding 5 — the type text fallback, which is all `TypeColor` can reach

The panel draws types as 13px sprites (`90-render.js:54-55`) and never applies `TypeColor`. The only
path by which a type colour could reach the screen is the fallback at `90-render.js:40-45`, when a
sprite is missing — and today that fallback is the type's *name as uncoloured text*. So this table
measures a hypothetical: what the 18 `TypeColor` values would score if that fallback were inked with
them.

| type | TypeColor | A | B | C | D | E | AA 4.5 on B | 3:1 on B |
|---|---|---|---|---|---|---|---|---|
| NORMAL | `#ADA594` | 6.24 | 5.24 | 8.02 | 5.87 | 6.08 | pass | pass |
| FIGHTING | `#A55239` | 2.81 | 2.36 | 3.61 | 2.64 | 2.74 | FAIL | **FAIL** |
| FLYING | `#9CADF7` | 7.07 | 5.94 | 9.09 | 6.65 | 6.89 | pass | pass |
| POISON | `#9141CB` | 2.78 | 2.33 | 3.57 | 2.61 | 2.71 | FAIL | **FAIL** |
| GROUND | `#AE7A3B` | 4.10 | 3.45 | 5.28 | 3.86 | 4.00 | FAIL | pass |
| ROCK | `#BDA55A` | 6.32 | 5.30 | 8.12 | 5.94 | 6.16 | pass | pass |
| BUG | `#ADBD21` | 7.32 | 6.15 | 9.41 | 6.89 | 7.14 | pass | pass |
| GHOST | `#6363B5` | 2.89 | 2.43 | 3.72 | 2.72 | 2.82 | FAIL | **FAIL** |
| STEEL | `#81A6BE` | 5.91 | 4.96 | 7.60 | 5.56 | 5.76 | pass | pass |
| FIRE | `#F75231` | 4.51 | 3.79 | 5.80 | 4.24 | 4.39 | FAIL | pass |
| WATER | `#399CFF` | 5.36 | 4.50 | 6.89 | 5.04 | 5.22 | FAIL | pass |
| GRASS | `#7BCE52` | 7.84 | 6.58 | 10.08 | 7.37 | 7.64 | pass | pass |
| ELECTRIC | `#FFC631` | 9.72 | 8.16 | 12.49 | 9.14 | 9.47 | pass | pass |
| PSYCHIC | `#EF4179` | 4.14 | 3.48 | 5.33 | 3.90 | 4.04 | FAIL | pass |
| ICE | `#5ACEE7` | 8.29 | 6.97 | 10.67 | 7.80 | 8.08 | pass | pass |
| DRAGON | `#7B63E7` | 3.47 | 2.92 | 4.47 | 3.27 | 3.39 | FAIL | **FAIL** |
| DARK | `#735A4A` | 2.39 | 2.01 | 3.07 | 2.25 | 2.33 | FAIL | **FAIL** |
| FAIRY | `#EF70EF` | 5.98 | 5.02 | 7.69 | 5.63 | 5.83 | pass | pass |

**9 of 18 fail AA** on B — DARK 2.01, POISON 2.33, FIGHTING 2.36, GHOST 2.43, DRAGON 2.92, GROUND
3.45, PSYCHIC 3.48, FIRE 3.79, WATER 4.50 — and **5 of those fail the 3:1 floor as well**. The
low-luminance types are the whole failing set; the game picked them to sit on its own light windows.

Separately, the sprite colours themselves converge under CVD: 39 of 153 type pairs fall under ΔE00 12
in some condition, worst FLYING vs FAIRY 1.80 (deutan), FIRE vs PSYCHIC 2.27 (tritan), FLYING vs GRASS
2.28 (tritan). Four pairs are already under ΔE00 12 in *normal* vision, so this is the game's own art,
not something the panel introduced — and a sprite carries a shape, not only a colour.

## Finding 6 — every pair of inks, under every vision

Sorted by worst case. "Same column" marks the pairs where a collision is an actual ambiguity rather
than an annoyance: #337's two-column rule means a gutter ink and a law ink never answer the same
question.

| pair | normal | protan | deutan | tritan | worst | same column |
|---|---|---|---|---|---|---|
| matchup weak-to #4AA500 vs matchup resisted #FE8E00 | 48.13 | 0.71 | 12.54 | 45.85 | 0.71 | **gutter** |
| gutter green #78c850 vs gutter gold #f8b050 | 36.48 | 2.14 | 6.02 | 39.94 | 2.14 | **gutter** |
| law theirs #f89890 vs gutter gold #f8b050 | 25.91 | 17.68 | 13.12 | 3.69 | 3.69 |  |
| law neither #a0a0a0 vs matchup immune #929292 | 4.47 | 4.47 | 4.47 | 4.47 | 4.47 |  |
| law theirs #f89890 vs matchup resisted #FE8E00 | 24.86 | 20.07 | 17.15 | 4.56 | 4.56 |  |
| gutter red #e13d3d vs matchup weak-to #4AA500 | 69.80 | 26.83 | 4.61 | 49.80 | 4.61 | **gutter** |
| law later #e331c5 vs gutter red #e13d3d | 30.47 | 43.49 | 43.85 | 5.42 | 5.42 |  |
| gutter gold #f8b050 vs matchup resisted #FE8E00 | 9.96 | 8.32 | 6.54 | 7.93 | 6.54 | **gutter** |
| gutter green #78c850 vs matchup resisted #FE8E00 | 46.65 | 9.68 | 8.17 | 43.28 | 8.17 | **gutter** |
| gutter gold #f8b050 vs matchup weak-to #4AA500 | 39.39 | 9.03 | 15.89 | 43.57 | 9.03 | **gutter** |
| law theirs #f89890 vs law neither #a0a0a0 | 23.94 | 9.63 | 16.62 | 24.21 | 9.63 | **law** |
| law theirs #f89890 vs gutter green #78c850 | 56.29 | 19.15 | 9.83 | 40.65 | 9.83 |  |
| law ours #40c8f8 vs gutter green #78c850 | 48.24 | 46.95 | 47.30 | 10.24 | 10.24 |  |
| gutter green #78c850 vs matchup weak-to #4AA500 | 11.02 | 10.37 | 11.46 | 10.76 | 10.37 | **gutter** |
| law theirs #f89890 vs matchup immune #929292 | 25.28 | 11.34 | 18.86 | 25.54 | 11.34 |  |
| law ours #40c8f8 vs law later #e331c5 | 58.77 | 32.13 | 12.37 | 66.31 | 12.37 | **law** |
| law later #e331c5 vs matchup resisted #FE8E00 | 55.83 | 62.55 | 51.42 | 12.44 | 12.44 |  |
| gutter green #78c850 vs gutter red #e13d3d | 69.81 | 33.98 | 13.56 | 50.60 | 13.56 | **gutter** |
| matchup weak-to #4AA500 vs matchup immune #929292 | 28.60 | 27.18 | 25.26 | 14.92 | 14.92 | **gutter** |
| law neither #a0a0a0 vs gutter green #78c850 | 27.74 | 26.60 | 23.47 | 15.02 | 15.02 |  |
| law theirs #f89890 vs law later #e331c5 | 31.05 | 44.25 | 37.59 | 15.32 | 15.32 | **law** |
| law ours #40c8f8 vs matchup weak-to #4AA500 | 52.22 | 50.03 | 51.34 | 15.44 | 15.44 |  |
| law neither #a0a0a0 vs matchup weak-to #4AA500 | 28.99 | 27.02 | 26.04 | 15.75 | 15.75 |  |
| gutter red #e13d3d vs matchup resisted #FE8E00 | 29.97 | 27.19 | 16.53 | 16.59 | 16.53 | **gutter** |
| gutter green #78c850 vs matchup immune #929292 | 29.02 | 28.36 | 24.70 | 17.20 | 17.20 | **gutter** |
| law later #e331c5 vs matchup immune #929292 | 29.99 | 30.98 | 17.92 | 25.79 | 17.92 |  |
| law theirs #f89890 vs gutter red #e13d3d | 20.33 | 25.54 | 18.03 | 20.01 | 18.03 |  |
| law theirs #f89890 vs matchup weak-to #4AA500 | 59.05 | 20.40 | 18.19 | 43.58 | 18.19 |  |
| law later #e331c5 vs law neither #a0a0a0 | 31.10 | 33.75 | 18.73 | 27.01 | 18.73 | **law** |
| gutter red #e13d3d vs gutter gold #f8b050 | 36.00 | 32.01 | 18.85 | 23.57 | 18.85 | **gutter** |
| law later #e331c5 vs gutter gold #f8b050 | 58.77 | 62.78 | 49.52 | 18.88 | 18.88 |  |
| law ours #40c8f8 vs law neither #a0a0a0 | 23.19 | 20.22 | 21.17 | 23.44 | 20.22 | **law** |
| gutter green #78c850 vs body #f8f8f8 | 31.36 | 28.33 | 28.80 | 21.20 | 21.20 |  |
| law theirs #f89890 vs body #f8f8f8 | 28.59 | 21.95 | 21.37 | 28.83 | 21.37 |  |
| law neither #a0a0a0 vs body #f8f8f8 | 21.55 | 21.55 | 21.55 | 21.55 | 21.55 |  |
| law ours #40c8f8 vs body #f8f8f8 | 26.19 | 21.91 | 25.23 | 26.38 | 21.91 |  |
| law ours #40c8f8 vs matchup immune #929292 | 24.98 | 22.59 | 22.93 | 25.21 | 22.59 |  |
| gutter red #e13d3d vs matchup immune #929292 | 29.06 | 23.71 | 22.89 | 28.67 | 22.89 | **gutter** |
| law neither #a0a0a0 vs gutter red #e13d3d | 30.65 | 27.42 | 24.21 | 30.28 | 24.21 |  |
| law neither #a0a0a0 vs gutter gold #f8b050 | 27.05 | 25.35 | 27.16 | 24.29 | 24.29 |  |
| law neither #a0a0a0 vs matchup resisted #FE8E00 | 29.18 | 26.81 | 28.88 | 25.24 | 25.24 |  |
| matchup immune #929292 vs body #f8f8f8 | 25.87 | 25.87 | 25.87 | 25.87 | 25.87 |  |
| matchup resisted #FE8E00 vs matchup immune #929292 | 29.98 | 27.07 | 29.94 | 26.14 | 26.14 | **gutter** |
| gutter gold #f8b050 vs matchup immune #929292 | 28.75 | 26.89 | 28.97 | 26.16 | 26.16 | **gutter** |
| gutter gold #f8b050 vs body #f8f8f8 | 28.88 | 28.57 | 28.40 | 26.41 | 26.41 |  |
| law ours #40c8f8 vs law theirs #f89890 | 52.49 | 30.06 | 38.10 | 58.99 | 30.06 | **law** |
| matchup weak-to #4AA500 vs body #f8f8f8 | 38.76 | 35.35 | 37.64 | 30.35 | 30.35 |  |
| matchup resisted #FE8E00 vs body #f8f8f8 | 34.43 | 34.81 | 33.14 | 31.23 | 31.23 |  |
| law later #e331c5 vs body #f8f8f8 | 42.79 | 49.45 | 32.34 | 39.72 | 32.34 |  |
| gutter red #e13d3d vs body #f8f8f8 | 43.80 | 45.71 | 37.72 | 43.57 | 37.72 |  |
| law later #e331c5 vs gutter green #78c850 | 88.43 | 64.41 | 45.58 | 46.28 | 45.58 |  |
| law later #e331c5 vs matchup weak-to #4AA500 | 90.43 | 62.55 | 46.82 | 45.91 | 45.91 |  |
| law ours #40c8f8 vs gutter gold #f8b050 | 49.34 | 46.18 | 50.18 | 56.89 | 46.18 |  |
| law ours #40c8f8 vs gutter red #e13d3d | 64.49 | 47.33 | 49.00 | 71.38 | 47.33 |  |
| law ours #40c8f8 vs matchup resisted #FE8E00 | 52.52 | 49.70 | 53.34 | 63.70 | 49.70 |  |

What each ink becomes:

| ink | normal | protan | deutan | tritan |
|---|---|---|---|---|
| law ours | `#40c8f8` | `#a8c1f8` | `#96b7f9` | `#37caef` |
| law theirs | `#f89890` | `#ada691` | `#c5b78d` | `#fa95a1` |
| law later | `#e331c5` | `#0065c6` | `#758fc2` | `#da586c` |
| law neither | `#a0a0a0` | `#a0a0a0` | `#a0a0a0` | `#a0a0a0` |
| gutter green | `#78c850` | `#d9be4f` | `#c5ae55` | `#8fbacc` |
| gutter red | `#e13d3d` | `#6d623f` | `#978433` | `#e23759` |
| gutter gold | `#f8b050` | `#d0b751` | `#dcc04c` | `#ffa5af` |
| matchup weak-to | `#4aa500` | `#b59b00` | `#a18b18` | `#6797a9` |
| matchup resisted | `#fe8e00` | `#b79d08` | `#cdaf00` | `#ff8293` |
| matchup immune | `#929292` | `#929292` | `#929292` | `#929292` |
| body | `#f8f8f8` | `#f8f8f8` | `#f8f8f8` | `#f8f8f8` |

Reading the matrix by column:

**Inside the gutter**, now seven inks deep, the failures are `#4AA500` vs `#FE8E00` at 0.71 (protan),
`#78c850` vs `#f8b050` at 2.14 (protan), `#e13d3d` vs `#4AA500` at 4.61 (deutan), `#f8b050` vs
`#FE8E00` at 6.54 (deutan), `#78c850` vs `#FE8E00` at 8.17 (deutan), `#f8b050` vs `#4AA500` at 9.03
(protan), `#78c850` vs `#4AA500` at 10.37 (protan) and `#78c850` vs `#e13d3d` at 13.56 (deutan).
**Eight of the twenty-one gutter pairs land at or below ΔE00 14**, and three of them are below 5.

**Inside the law**, four inks: `theirs` vs `neither` at 9.63 (protan) is the failure — salmon
desaturates to `#ada691`, a khaki-grey beside `#a0a0a0`, and unlike the gutter the law has no shape to
fall back on, being text ink and a frame. `ours` vs `later` at 12.37 (deutan) is marginal, both landing
in blue-lilac. **`theirs` vs `later` — the pair #345 was written to catch — passes at 15.32 worst, and
under protanopia and deuteranopia it is *more* separated (44.25, 37.59) than in normal vision
(31.05).** `#e331c5` is not a red-side magenta: it carries a large blue component that red-green
deficiency leaves intact, so it renders blue while the salmon renders khaki. `ours` vs `neither`
passes at 20.22.

**Across the columns**, four pairs fall under ΔE00 6, all of them the quoted inks or tritanopia:
`neither` vs `immune` 4.47 (all conditions), `theirs` vs `gold` 3.69 (tritan), `theirs` vs `resisted`
4.56 (tritan), `later` vs `red` 5.42 (tritan).

`neither #a0a0a0`, `immune #929292` and `body #f8f8f8` are achromatic and come back unchanged under
all three simulations — the only three inks in the palette with no CVD exposure at all. That
invariance is also the sanity check on the simulation.

---

## Plain statement of what fails

**The near-twin pairs the quotation creates — the three the ticket asked for a verdict on:**

- `#78c850` vs `#4AA500` (good news vs weak-to): **the uncanny middle**, ΔE00 11.02 in normal vision
  and 10.37 at worst. Never plainly different, never plainly the same, in any of the four conditions.
- `#f8b050` vs `#FE8E00` (careful vs resisted): **the uncanny middle**, ΔE00 9.96 normal, 6.54 at
  worst (deuteranopia).
- `#a0a0a0` vs `#929292` (nobody acting vs immune): **plainly the same**, ΔE00 4.47, identical in all
  four conditions because both are achromatic.

Neither of the first two is a colour-blindness failure — they are same-hue, different-lightness pairs
that sit in the middle band under normal vision and stay there. The third is not a colour-blindness
failure either; it is simply two greys.

**The quoted inks against each other and against the rest of the gutter:**

- weak-to `#4AA500` vs resisted `#FE8E00`: **ΔE00 0.71 under protanopia** — the worst number in the
  report, same column, opposite meanings.
- weak-to `#4AA500` vs gutter red `#e13d3d`: ΔE00 4.61 under deuteranopia — good news and bad news,
  same column.
- Eight of the gutter's twenty-one pairs are at or below ΔE00 14 somewhere; three are below 5.

**Pre-existing failures, unchanged by the corrections:**

- gutter green `#78c850` vs gutter gold `#f8b050`: ΔE00 2.14 protan, 6.02 deutan, same column.
- law theirs `#f89890` vs law neither `#a0a0a0`: ΔE00 9.63 protan, same column, no shape to fall back
  on.
- law ours `#40c8f8` vs law later `#e331c5`: ΔE00 12.37 deutan, marginal.
- gutter green vs gutter red: ΔE00 13.56 deutan, marginal, mitigated by shape.

**Passing:** `theirs` vs `later` (15.32 worst, and more separated under red-green deficiency than in
normal vision), `ours` vs `neither` (20.22 worst).

**Contrast:** `later #e331c5` (3.36), `gutter red #e13d3d` (3.01), `weak-to #4AA500` (4.07) and
`immune #929292` (4.12) fail WCAG AA against the panel fill at the 15px the panel draws. All four
clear 3:1. `later` and `gutter red` drop below 3:1 on the prototype's tinted group fills. Nothing
reaches AAA. If the type text fallback were inked with `TypeColor`, 9 of 18 would fail AA and 5 would
fail 3:1.

**The shadow:** every shadow colour is brighter than the panel fill, so the 1px text-shadow adds no
contrast and slightly softens each glyph's edge. The three quoted matchup inks have no shadow defined
anywhere in the game. `later`'s two candidates both fail — `#6b5a73` is too close to the ink (C 1.65),
`#5c1450` is too close to the fill (C 1.02).

**The benchmark:** the game's own `TypeHints.HIGH_CONTRAST` fixes the 0.71 collision completely,
raising the three super-effective-vs-resisted pairs to ΔE00 52.83, 53.34 and 52.55 at worst — *more*
separated under every deficiency than in normal vision. A separation that survives CVD scores above
50. Every flagged pair in our palette scores between 0.71 and 15. But upstream's remedy does not
transplant unchanged: its blue `#2DB4FF` is **ΔE00 8.57 from the law's `ours #40c8f8` in normal vision
and 4.32 under tritanopia**, so adopting it verbatim would trade a gutter collision for a collision
between the two colour systems #337 built to be incapable of colliding.

No palette changes proposed here — that is a decision, and this ticket is findings only.

## Sources

- Palette as settled, and its amendments: [#337](https://github.com/IIxauII/coachemon/issues/337).
- Game inks and shadows: `.cache/pokerogue/v1.12.0.11/src/enums/color.ts`;
  `src/ui/text.ts` (`getTextColor` 539-657, `getModifierTierTextTint` 683-698).
- Effectiveness inks and the high-contrast swap: `src/data/type.ts:296-320`
  (`getTypeDamageMultiplierColor`); `src/enums/type-hints.ts`; `src/system/settings/settings.ts:636-654`;
  called with the flag at `src/ui/handlers/fight-ui-handler.ts:403`.
- Type badges as sprites: `skills/coachemon/scripts/hud/90-render.js:54-55` (`badge`), with the text
  fallback at `:40-45` (`img`).
- Panel fill: `skills/coachemon/scripts/hud/PROTOTYPE-directions.html:36-42` and its text-shadow at
  `:88-96`; shipped panel at `skills/coachemon/scripts/hud/90-render.js:166`.
- WCAG 2.2 SC 1.4.3 (Contrast Minimum), 1.4.6 (Enhanced), 1.4.11 (Non-text Contrast), and the relative
  luminance and contrast-ratio definitions — W3C Recommendation, 5 October 2023.
- CIEDE2000: CIE 142-2001, as given by Sharma, Wu & Dalal (2005), "The CIEDE2000 color-difference
  formula", *Color Research & Application* 30(1).
- Dichromat simulation: Brettel, Viénot & Mollon (1997), "Computerized simulation of color appearance
  for dichromats", *JOSA A* 14(10) 2647-2655; Viénot, Brettel & Mollon (1999), "Digital video
  colourmaps for checking the legibility of displays by dichromats", *Color Research & Application*
  24(4) 243-252. Precomputed linear-sRGB parameters from libDaltonLens (public domain).

## Appendix: the script

Throwaway, no dependencies. `node palette.mjs` reproduces every table above.

```js
// Throwaway: WCAG contrast + CVD simulation + CIEDE2000 for the settled Coachemon palette (#345).
// No dependencies. Run: node palette.mjs

/* ---------- colour plumbing ---------- */
const hex = h => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lin = c => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const unlin = v => { const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return s * 255; };
const relLum = rgb => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// src-over composite of an rgba ink over an opaque backdrop
const over = (rgb, alpha, back) => rgb.map((c, i) => c * alpha + back[i] * (1 - alpha));

/* ---------- CIELAB / CIEDE2000 ---------- */
const XYZ = rgb => {
  const [r, g, b] = rgb.map(lin);
  return [
    (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100,
    (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) * 100,
    (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) * 100,
  ];
};
const WP = [95.047, 100.000, 108.883]; // D65, 2 deg
const lab = rgb => {
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
  const [x, y, z] = XYZ(rgb).map((v, i) => f(v / WP[i]));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
function ciede2000(rgb1, rgb2) {
  const [L1, a1, b1] = lab(rgb1), [L2, a2, b2] = lab(rgb2);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (a, b) => { if (a === 0 && b === 0) return 0; const h = deg(Math.atan2(b, a)); return h < 0 ? h + 360 : h; };
  const hp1 = hp(ap1, b1), hp2 = hp(ap2, b2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(rad(dh) / 2);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb;
  if (Cp1 * Cp2 === 0) hb = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hb = (hp1 + hp2) / 2;
  else hb = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb))
    + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.20 * Math.cos(rad(4 * hb - 63));
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T;
  const RT = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

/* ---------- CVD: Brettel/Vienot/Mollon 1997, precomputed linear-sRGB form ----------
   Parameters as published by libDaltonLens (public domain), derived from Brettel,
   Vienot & Mollon (1997). Two half-planes per deficiency, selected by the sign of the
   dot product with the separation-plane normal. Every row sums to 1, so white maps to
   white. Severity = 1.0 (full dichromacy). */
const BRETTEL = {
  protan: {
    m1: [0.14980, 1.19548, -0.34528, 0.10764, 0.84864, 0.04372, 0.00384, -0.00540, 1.00156],
    m2: [0.14570, 1.16172, -0.30742, 0.10816, 0.85291, 0.03892, 0.00386, -0.00524, 1.00139],
    n: [0.00048, 0.00393, -0.00441],
  },
  deutan: {
    m1: [0.36477, 0.86381, -0.22858, 0.26294, 0.64245, 0.09462, -0.02006, 0.02728, 0.99278],
    m2: [0.37298, 0.88166, -0.25464, 0.25954, 0.63506, 0.10540, -0.01980, 0.02784, 0.99196],
    n: [-0.00281, -0.00611, 0.00892],
  },
  tritan: {
    m1: [1.01277, 0.13548, -0.14826, -0.01243, 0.86812, 0.14431, 0.07589, 0.80500, 0.11911],
    m2: [0.93678, 0.18979, -0.12657, 0.06154, 0.81526, 0.12320, -0.37562, 1.12767, 0.24796],
    n: [0.03901, -0.02788, -0.01113],
  },
};
function simulate(rgb, kind) {
  if (kind === 'normal') return rgb;
  const p = BRETTEL[kind];
  const v = rgb.map(lin);
  const dot = v[0] * p.n[0] + v[1] * p.n[1] + v[2] * p.n[2];
  const m = dot >= 0 ? p.m1 : p.m2;
  const out = [0, 1, 2].map(i => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]);
  return out.map(unlin);
}
// Cross-check for protan/deutan only: Vienot, Brettel & Mollon (1999) single-plane matrices.
const VIENOT = {
  protan: [0.11238, 0.88762, 0.00000, 0.11238, 0.88762, 0.00000, 0.00401, -0.00401, 1.00000],
  deutan: [0.29275, 0.70725, 0.00000, 0.29275, 0.70725, 0.00000, -0.02234, 0.02234, 1.00000],
};
function vienot(rgb, kind) {
  const m = VIENOT[kind], v = rgb.map(lin);
  return [0, 1, 2].map(i => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]).map(unlin);
}

/* ---------- the palette ---------- */
// law inks, gutter judgement inks, gutter matchup inks (quoted from the game's
// effectiveness table), chrome and body.
const INK = {
  'law ours #40c8f8': '#40c8f8',
  'law theirs #f89890': '#f89890',
  'law later #e331c5': '#e331c5',
  'law neither #a0a0a0': '#a0a0a0',
  'gutter green #78c850': '#78c850',
  'gutter red #e13d3d': '#e13d3d',
  'gutter gold #f8b050': '#f8b050',
  'matchup weak-to #4AA500': '#4AA500',
  'matchup resisted #FE8E00': '#FE8E00',
  'matchup immune #929292': '#929292',
  'body #f8f8f8': '#f8f8f8',
};
// Shadows the game pairs with each ink. The matchup inks are text tints in the game's
// effectiveness display and have no paired shadow; `later` has two candidates (see doc).
const SHADOW = {
  'law ours #40c8f8': '#006090',
  'law theirs #f89890': '#984038',
  'law later #e331c5': '#6b5a73',
  'law neither #a0a0a0': '#636363',
  'gutter green #78c850': '#306850',
  'gutter red #e13d3d': '#632929',
  'gutter gold #f8b050': '#c07800',
  'body #f8f8f8': '#6b5a73',
};

const BACKDROP = {
  'A prototype fill over black game  rgba(43,36,56,.95)/#000': over(hex('#2b2438'), 0.95, hex('#000000')),
  'B prototype fill over white game  rgba(43,36,56,.95)/#fff': over(hex('#2b2438'), 0.95, hex('#ffffff')),
  'C shipped fill over black game    rgba(12,12,24,.88)/#000': over(hex('#0c0c18'), 0.88, hex('#000000')),
  'D shipped fill over white game    rgba(12,12,24,.88)/#fff': over(hex('#0c0c18'), 0.88, hex('#ffffff')),
  'E opaque approximation            #2b2438': hex('#2b2438'),
};
const GROUPFILL = { 'blue-fill #1d3a4d': '#1d3a4d', 'green-fill #243c2c': '#243c2c', 'red-fill #4a2426': '#4a2426', 'gold-fill #4a3a1e': '#4a3a1e', 'fill-solid #3a3048': '#3a3048' };

const TypeColor = { NORMAL: '#ADA594', FIGHTING: '#A55239', FLYING: '#9CADF7', POISON: '#9141CB', GROUND: '#AE7A3B', ROCK: '#BDA55A', BUG: '#ADBD21', GHOST: '#6363B5', STEEL: '#81A6BE', FIRE: '#F75231', WATER: '#399CFF', GRASS: '#7BCE52', ELECTRIC: '#FFC631', PSYCHIC: '#EF4179', ICE: '#5ACEE7', DRAGON: '#7B63E7', DARK: '#735A4A', FAIRY: '#EF70EF' };

// getTypeDamageMultiplierColor, offense side, src/data/type.ts:296
const EFFECT = {
  'immune 0x': { def: '#929292', hc: '#929292' },
  'resisted 1/8x': { def: '#FF5500', hc: '#FF5500' },
  'resisted 1/4x': { def: '#FF7400', hc: '#FF7400' },
  'resisted 1/2x': { def: '#FE8E00', hc: '#FE8E00' },
  'super 2x': { def: '#4AA500', hc: '#2DB4FF' },
  'super 4x': { def: '#4BB400', hc: '#00A4FF' },
  'super 8x': { def: '#52C200', hc: '#0093FF' },
};

/* ---------- report ---------- */
const f2 = n => n.toFixed(2);
const row = cells => '| ' + cells.join(' | ') + ' |';
const sep = n => '|' + Array(n).fill('---').join('|') + '|';
const P = console.log;
const kinds = ['normal', 'protan', 'deutan', 'tritan'];
const bkeys = Object.keys(BACKDROP);
const B = BACKDROP[bkeys[1]]; // the worst-case backdrop
// verdict scale for a 14px glyph on a moving background, judged from memory
const verdict = d => d < 5 ? 'plainly the same' : d <= 20 ? 'UNCANNY MIDDLE' : 'plainly different';
const dEs = (x, y) => kinds.map(k => ciede2000(simulate(hex(x), k), simulate(hex(y), k)));

P('### 1. Backdrops\n');
P(row(['backdrop', 'composited', 'relative luminance']));
P(sep(3));
for (const [k, v] of Object.entries(BACKDROP)) P(row(['`' + k + '`', '`' + toHex(v) + '`', relLum(v).toFixed(4)]));

P('\n### 2. WCAG contrast, ink against backdrop\n');
P(row(['ink', ...bkeys.map(k => k.slice(0, 1)), 'AA 4.5 on B', '3:1 on B']));
P(sep(bkeys.length + 3));
for (const [name, h] of Object.entries(INK)) {
  const c = contrast(hex(h), B);
  P(row([name, ...bkeys.map(b => f2(contrast(hex(h), BACKDROP[b]))),
    c >= 4.5 ? 'pass' : 'FAIL', c >= 3 ? 'pass' : 'FAIL']));
}

P('\n### 3. The 1px text-shadow\n');
P(row(['ink', 'shadow', 'C(ink,shadow)', 'shadow lum', 'x brighter than B', 'C(shadow,B)']));
P(sep(6));
for (const [name, h] of Object.entries(INK)) {
  if (!SHADOW[name]) { P(row([name, '_none in the game_', '-', '-', '-', '-'])); continue; }
  const s = hex(SHADOW[name]);
  P(row([name, '`' + SHADOW[name] + '`', f2(contrast(hex(h), s)),
    relLum(s).toFixed(4), f2(relLum(s) / relLum(B)), f2(contrast(s, B))]));
}
P('\nboth candidate shadows for `later #e331c5`:');
for (const s of ['#6b5a73', '#5c1450']) {
  P(`  ${s}: C(ink,shadow) ${f2(contrast(hex('#e331c5'), hex(s)))}, ` +
    `${f2(relLum(hex(s)) / relLum(B))}x the fill, C(shadow,B) ${f2(contrast(hex(s), B))}`);
}

P('\n### 4. Ink on the prototype group fills\n');
P(row(['ink', ...Object.keys(GROUPFILL)]));
P(sep(Object.keys(GROUPFILL).length + 1));
for (const [name, h] of Object.entries(INK)) {
  P(row([name, ...Object.values(GROUPFILL).map(g => f2(contrast(hex(h), hex(g))))]));
}

P('\n### 5. The near-twin pairs: quoted matchup ink against the gutter ink beside it\n');
const TWINS = [
  ['gutter green #78c850', 'matchup weak-to #4AA500', 'good news vs weak-to'],
  ['gutter gold #f8b050', 'matchup resisted #FE8E00', 'careful vs resisted'],
  ['law neither #a0a0a0', 'matchup immune #929292', 'nobody acting vs immune'],
];
P(row(['pair', 'what they mean', ...kinds, 'worst', 'verdict at worst', 'verdict in normal vision']));
P(sep(kinds.length + 5));
for (const [a, b, mean] of TWINS) {
  const ds = dEs(INK[a], INK[b]);
  P(row([`${INK[a]} vs ${INK[b]}`, mean, ...ds.map(f2), f2(Math.min(...ds)),
    verdict(Math.min(...ds)), verdict(ds[0])]));
}
P('\nand what each becomes:\n');
P(row(['ink', ...kinds]));
P(sep(kinds.length + 1));
for (const t of TWINS.flatMap(([a, b]) => [a, b])) {
  P(row([t, ...kinds.map(k => '`' + toHex(simulate(hex(INK[t]), k)) + '`')]));
}

P("\n### 6. The game's own high-contrast swap as a benchmark\n");
P(row(['tier', 'default', 'high contrast', 'default on B', 'hc on B']));
P(sep(5));
for (const [k, v] of Object.entries(EFFECT)) {
  P(row([k, '`' + v.def + '`', '`' + v.hc + '`',
    f2(contrast(hex(v.def), B)), f2(contrast(hex(v.hc), B))]));
}
P('\nthe separation the swap is meant to buy — super-effective against resisted:\n');
P(row(['pair', 'mode', ...kinds, 'worst', 'verdict at worst']));
P(sep(kinds.length + 4));
for (const [sup, res] of [['super 2x', 'resisted 1/2x'], ['super 4x', 'resisted 1/4x'], ['super 8x', 'resisted 1/8x']]) {
  for (const mode of ['def', 'hc']) {
    const ds = dEs(EFFECT[sup][mode], EFFECT[res][mode]);
    P(row([`${sup} vs ${res}`, mode === 'def' ? 'default' : 'high contrast',
      ...ds.map(f2), f2(Math.min(...ds)), verdict(Math.min(...ds))]));
  }
}
P('\nand what the swap does to our own near-twin pair:\n');
P(row(['pair', ...kinds, 'worst', 'verdict at worst']));
P(sep(kinds.length + 3));
for (const [a, b, label] of [
  ['#78c850', '#4AA500', 'gutter green vs weak-to, default'],
  ['#78c850', '#2DB4FF', 'gutter green vs weak-to, high contrast'],
  ['#40c8f8', '#2DB4FF', 'law ours vs weak-to, high contrast'],
]) {
  const ds = dEs(a, b);
  P(row([label, ...ds.map(f2), f2(Math.min(...ds)), verdict(Math.min(...ds))]));
}

P('\n### 7. The 18 TypeColor values as text on the panel fill\n');
P(row(['type', 'TypeColor', ...bkeys.map(k => k.slice(0, 1)), 'AA 4.5 on B', '3:1 on B']));
P(sep(bkeys.length + 4));
const tfail = [];
for (const t of Object.keys(TypeColor)) {
  const fg = hex(TypeColor[t]), c = contrast(fg, B);
  if (c < 4.5) tfail.push([t, c]);
  P(row([t, '`' + TypeColor[t] + '`', ...bkeys.map(b => f2(contrast(fg, BACKDROP[b]))),
    c >= 4.5 ? 'pass' : 'FAIL', c >= 3 ? 'pass' : 'FAIL']));
}
tfail.sort((a, b) => a[1] - b[1]);
P(`\n${tfail.length} of 18 fail AA on B: ` + tfail.map(([t, c]) => `${t} ${f2(c)}`).join(', '));
P(`${tfail.filter(([, c]) => c < 3).length} of 18 fail 3:1 on B: ` +
  tfail.filter(([, c]) => c < 3).map(([t, c]) => `${t} ${f2(c)}`).join(', '));

P('\n### 8. CVD simulation of each ink\n');
P(row(['ink', ...kinds]));
P(sep(kinds.length + 1));
for (const [name, h] of Object.entries(INK)) {
  P(row([name, ...kinds.map(k => '`' + toHex(simulate(hex(h), k)) + '`')]));
}
P('\ncross-check, Vienot 1999 single-plane (protan / deutan only):\n');
P(row(['ink', 'protan Brettel', 'protan Vienot', 'dE', 'deutan Brettel', 'deutan Vienot', 'dE']));
P(sep(7));
for (const [name, h] of Object.entries(INK)) {
  const c = hex(h);
  const pb = simulate(c, 'protan'), pv = vienot(c, 'protan');
  const db = simulate(c, 'deutan'), dv = vienot(c, 'deutan');
  P(row([name, '`' + toHex(pb) + '`', '`' + toHex(pv) + '`', f2(ciede2000(pb, pv)),
    '`' + toHex(db) + '`', '`' + toHex(dv) + '`', f2(ciede2000(db, dv))]));
}

P('\n### 9. CIEDE2000 between every pair of inks, under each vision\n');
const names = Object.keys(INK);
const COL = {
  'law ours #40c8f8': 'law', 'law theirs #f89890': 'law', 'law later #e331c5': 'law', 'law neither #a0a0a0': 'law',
  'gutter green #78c850': 'gutter', 'gutter red #e13d3d': 'gutter', 'gutter gold #f8b050': 'gutter',
  'matchup weak-to #4AA500': 'gutter', 'matchup resisted #FE8E00': 'gutter', 'matchup immune #929292': 'gutter',
  'body #f8f8f8': 'body',
};
P(row(['pair', ...kinds, 'worst', 'same column?']));
P(sep(kinds.length + 3));
const rows = [];
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const ds = dEs(INK[names[i]], INK[names[j]]);
  rows.push([`${names[i]} vs ${names[j]}`, ds,
    COL[names[i]] === COL[names[j]] ? '**' + COL[names[i]] + '**' : '']);
}
rows.sort((x, y) => Math.min(...x[1]) - Math.min(...y[1]));
for (const [p, ds, col] of rows) P(row([p, ...ds.map(f2), f2(Math.min(...ds)), col]));

P('\n### 10. Type-sprite colours that converge under CVD (dE < 12 in any condition)\n');
const tn = Object.keys(TypeColor);
const conv = [];
for (let i = 0; i < tn.length; i++) for (let j = i + 1; j < tn.length; j++) {
  const ds = dEs(TypeColor[tn[i]], TypeColor[tn[j]]);
  if (Math.min(...ds) < 12) conv.push([`${tn[i]} vs ${tn[j]}`, ds]);
}
conv.sort((x, y) => Math.min(...x[1]) - Math.min(...y[1]));
P(row(['type pair', ...kinds, 'worst']));
P(sep(kinds.length + 2));
for (const [p, ds] of conv.slice(0, 15)) P(row([p, ...ds.map(f2), f2(Math.min(...ds))]));
P(`\n${conv.length} of ${tn.length * (tn.length - 1) / 2} type pairs fall under dE 12 in at least one condition; worst 15 shown.`);
```
