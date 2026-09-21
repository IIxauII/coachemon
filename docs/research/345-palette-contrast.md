# Contrast and colour-vision-deficiency safety of the settled panel palette

Research for [#345](https://github.com/IIxauII/coachemon/issues/345), measuring the palette
[#337](https://github.com/IIxauII/coachemon/issues/337) settled. **Findings only.** Whether to change
an ink in response is a decision and belongs to its own ticket.

## What was measured, and against what

Every number below comes from a throwaway Node script, reproduced verbatim in the appendix. It has
no dependencies; `node palette.mjs` regenerates every table.

### The inks

Taken from #337's resolution and checked against the pinned game source at
`.cache/pokerogue/v1.12.0.11`:

| role | ink | shadow | source |
|---|---|---|---|
| law — ours | `#40c8f8` | `#006090` | `src/ui/text.ts:604-606`, `TextStyle.SUMMARY_BLUE` |
| law — theirs | `#f89890` | `#984038` | `src/ui/text.ts:585-586`, `TextStyle.PARTY_RED` |
| law — later | `#e020c0` | `#6b5a73` | `src/enums/color.ts:21` (`Color.MASTER`); shadow **assigned by #337**, see note |
| law — neither | `#a0a0a0` | `#636363` | `src/ui/text.ts:620-622`, `TextStyle.SETTINGS_LOCKED` |
| gutter — green | `#78c850` | `#306850` | `src/ui/text.ts:630-631`, `TextStyle.SUMMARY_GREEN` |
| gutter — red | `#e13d3d` | `#632929` | `src/ui/text.ts:568-572`, `TextStyle.MOVE_PP_EMPTY` (modern theme) |
| gutter — gold / chrome | `#f8b050` | `#c07800` | `src/ui/text.ts:632-636`, `TextStyle.HEADER_LABEL` |
| body | `#f8f8f8` | `#6b5a73` | `src/ui/text.ts:542-543`, `TextStyle.MESSAGE` |

**Note on `later`.** `Color.MASTER = "#e020c0"` is a bare enum value with no `TextStyle` case, so the
game never draws it as text and never pairs it with a shadow. The only place the game renders a
master tier as text is `getModifierTierTextTint` (`src/ui/text.ts:693-694`), which returns a
*different* magenta, `#e331c5` — the one the prototype used before #337. So `later`'s ink/shadow pair
is the one pair in the law that the game itself does not make: `#e020c0` is borrowed from an enum,
and `#6b5a73` is `ShadowColor.PURPLE`, which the game uses under `MESSAGE` body text. That is a
factual gap, not a fault; it matters below because this pair behaves worst of the eight.

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
the shipped panel's `background: rgba(12,12,24,.88)` in
`skills/coachemon/scripts/hud/90-render.js:166`. E is the flat approximation the ticket asked for.

**B is the worst case in the whole report.** The shipped panel is more transparent (88% vs 95%) but
its fill is far darker, so even with a white frame behind it (D, L=0.0232) it stays darker than the
prototype's fill does with the same frame (B, L=0.0320). Transparency costs the shipped panel more in
*relative* terms — `later` drops 27% from C to D, against 16% from A to B — but the prototype's
lighter fill loses that race in absolute terms. Every "fails" verdict below is stated against B.

### Thresholds used

Text on the panel is 15px (`PROTOTYPE-directions.html:88`). WCAG 2.2 counts large text as ≥24px, or
≥18.66px bold, so **4.5:1 (AA) is the applicable threshold**, not 3:1. 3:1 is still reported as the
floor a glyph would need if it were reclassified as a graphical object under SC 1.4.11.

For CIEDE2000, no pass threshold is normative. This report labels ΔE00 **< 5 "the same colour"**,
**5–15 "tellable side by side, not from memory"**, and **> 20 "comfortable"** — a reporting
convention for readability, not a standard and not a recommendation.

### CVD method

Brettel, Viénot & Mollon (1997) full two-half-plane simulation at severity 1.0, applied in linear
sRGB with the precomputed parameters published by libDaltonLens (public domain). Every matrix row
sums to 1.000, so white maps to white by construction — and indeed `#f8f8f8` and `#a0a0a0` come back
unchanged under all three deficiencies, which is the sanity check.

Protanopia and deuteranopia were cross-checked against the Viénot, Brettel & Mollon (1999)
single-plane matrices. The two methods agree to ΔE00 ≤ 8 on every ink **except `later #e020c0` under
protanopia (ΔE00 14.28)** — the single-plane approximation is known to be poor for saturated violets,
which is exactly this ink. Both methods agree that `later` stops being magenta; they disagree on what
it becomes. Treat that one cell as the least certain number here.

---

## Findings

### 1. Two inks fail WCAG AA against the panel fill

`later #e020c0` and `gutter red #e13d3d` fall below 4.5:1 on every backdrop except the shipped fill
over a black frame, and on the worst case (B) both sit at the 3:1 large-text floor.

| ink | A | B | C | D | E | AA 4.5:1 on B? |
|---|---|---|---|---|---|---|
| ours `#40c8f8` | 7.87 | 6.61 | 10.12 | 7.40 | 7.67 | pass |
| theirs `#f89890` | 7.18 | 6.03 | 9.23 | 6.75 | 7.00 | pass |
| **later `#e020c0`** | **3.73** | **3.13** | 4.80 | **3.51** | **3.64** | **FAIL** |
| neither `#a0a0a0` | 5.83 | 4.90 | 7.50 | 5.49 | 5.69 | pass |
| gutter green `#78c850` | 7.39 | 6.21 | 9.51 | 6.95 | 7.21 | pass |
| **gutter red `#e13d3d`** | **3.59** | **3.01** | 4.61 | **3.37** | **3.50** | **FAIL** |
| gold `#f8b050` | 8.22 | 6.90 | 10.57 | 7.73 | 8.01 | pass |
| body `#f8f8f8` | 14.36 | 12.06 | 18.47 | 13.51 | 14.00 | pass |

Nothing reaches AAA (7:1) on B. `neither #a0a0a0` is the tightest pass, 4.90 on B.

### 2. On the prototype's tinted group fills, those same two inks drop below 3:1

If the open group keeps the prototype's interior fills
(`PROTOTYPE-directions.html:39-42`), the rows inside it sit on a lighter backdrop than the panel's:

| ink | blue-fill `#1d3a4d` | green-fill `#243c2c` | red-fill `#4a2426` | gold-fill `#4a3a1e` | fill-solid `#3a3048` |
|---|---|---|---|---|---|
| ours `#40c8f8` | 6.14 | 6.16 | 6.89 | 5.66 | 6.39 |
| theirs `#f89890` | 5.60 | 5.62 | 6.29 | 5.16 | 5.83 |
| **later `#e020c0`** | **2.91** | **2.92** | 3.27 | **2.68** | 3.03 |
| neither `#a0a0a0` | 4.55 | 4.57 | 5.11 | 4.19 | 4.73 |
| gutter green `#78c850` | 5.77 | 5.79 | 6.48 | 5.31 | 6.00 |
| **gutter red `#e13d3d`** | **2.80** | **2.81** | 3.14 | **2.58** | 2.91 |
| gold `#f8b050` | 6.41 | 6.44 | 7.20 | 5.91 | 6.67 |
| body `#f8f8f8` | 11.21 | 11.25 | 12.58 | 10.32 | 11.66 |

These fills are opaque in the prototype, so a game frame behind the panel does not make them worse.

### 3. The 1px text-shadow does not help on this panel, and in one case hurts

The shadows were chosen by the game as *darker companions to their own ink*, and they are. But the
panel fill is darker than any of them. Measured against backdrop B (L=0.0320):

| shadow | luminance | × brighter than the fill | C(ink, shadow) | C(shadow, B) |
|---|---|---|---|---|
| ours `#006090` | 0.1038 | 3.25 | 3.52 | 1.88 |
| theirs `#984038` | 0.1063 | 3.33 | 3.16 | 1.91 |
| later `#6b5a73` | 0.1168 | 3.65 | **1.54** | 2.03 |
| neither `#636363` | 0.1248 | 3.91 | 2.30 | 2.13 |
| green `#306850` | 0.1111 | 3.48 | 3.16 | 1.97 |
| red `#632929` | 0.0440 | **1.38** | 2.63 | **1.15** |
| gold `#c07800` | 0.2464 | **7.71** | 1.91 | 3.62 |
| body `#6b5a73` | 0.1168 | 3.65 | 5.93 | 2.03 |

Every shadow is brighter than the fill. So the shadow is never a halo that darkens the ground behind
a glyph; it is a **mid-tone ramp sitting between the ink and the fill**, down and right of every
stroke. Three consequences:

- **It adds no contrast against the panel.** Softening the ink→fill step slightly lowers apparent
  edge contrast at 15px rather than raising it.
- **It does help where the panel is translucent.** With a bright game frame showing through, every
  shadow except gold's is far darker than the frame, so the shadow is what separates the glyph from
  the game. At 95% and 88% opacity only 5–12% of the frame reaches the eye, so this is a small effect.
- **It hurts `later` specifically.** `#e020c0` on `#6b5a73` is C 1.54 — the shadow is nearly the same
  luminance as the ink. It reads as a grey-purple fringe that thickens and desaturates a magenta that
  already fails contrast. The gold shadow `#c07800` is the opposite extreme (7.71× the fill, C 3.62
  against it): it is the only shadow bright enough to read as part of the glyph, which makes gold text
  look bolder than the rest. Red's shadow `#632929` is the least visible of the eight (C 1.15 against
  the fill) — effectively no shadow at all.

### 4. Seventeen of the eighteen type pills fail AA foreground-on-own-shadow

Reading #337's "`TypeColor` on `TypeShadow`, verbatim, and only ever as a filled pill" as a pill
filled `TypeShadow` carrying a `TypeColor` label — the pairing the ticket asked to measure:

| type | TypeColor | TypeShadow | fg on shadow | AA 4.5 | 3:1 floor | TypeColor on B | TypeShadow on B |
|---|---|---|---|---|---|---|---|
| NORMAL | `#ADA594` | `#574F4A` | 3.27 | FAIL | pass | 5.24 | 1.60 |
| **FIGHTING** | `#A55239` | `#4E637C` | **1.14** | FAIL | **FAIL** | 2.36 | 2.07 |
| FLYING | `#9CADF7` | `#4E637C` | 2.86 | FAIL | **FAIL** | 5.94 | 2.07 |
| POISON | `#9141CB` | `#352166` | 2.45 | FAIL | **FAIL** | 2.33 | 1.05 |
| GROUND | `#AE7A3B` | `#572D1E` | 3.14 | FAIL | pass | 3.45 | 1.10 |
| ROCK | `#BDA55A` | `#5F442D` | 3.70 | FAIL | pass | 5.30 | 1.43 |
| BUG | `#ADBD21` | `#5F5010` | 3.82 | FAIL | pass | 6.15 | 1.61 |
| GHOST | `#6363B5` | `#323D5B` | 2.04 | FAIL | **FAIL** | 2.43 | 1.19 |
| STEEL | `#81A6BE` | `#415C5F` | 2.78 | FAIL | **FAIL** | 4.96 | 1.78 |
| FIRE | `#F75231` | `#7C1818` | 3.10 | FAIL | pass | 3.79 | 1.22 |
| WATER | `#399CFF` | `#1C4E80` | 3.01 | FAIL | pass | 4.50 | 1.50 |
| GRASS | `#7BCE52` | `#4F6729` | 3.27 | FAIL | pass | 6.58 | 2.02 |
| **ELECTRIC** | `#FFC631` | `#804618` | **4.76** | **pass** | pass | 8.16 | 1.71 |
| PSYCHIC | `#EF4179` | `#782155` | 2.66 | FAIL | **FAIL** | 3.48 | 1.31 |
| ICE | `#5ACEE7` | `#2D5C74` | 3.94 | FAIL | pass | 6.97 | 1.77 |
| DRAGON | `#7B63E7` | `#313874` | 2.45 | FAIL | **FAIL** | 2.92 | 1.19 |
| DARK | `#735A4A` | `#392725` | 2.21 | FAIL | **FAIL** | 2.01 | 1.10 |
| FAIRY | `#EF70EF` | `#663878` | 3.43 | FAIL | pass | 5.02 | 1.47 |

**ELECTRIC is the only pass** at 4.76. **Eight fail even the 3:1 floor**: FIGHTING 1.14, GHOST 2.04,
DARK 2.21, POISON 2.45, DRAGON 2.45, PSYCHIC 2.66, STEEL 2.78, FLYING 2.86. FIGHTING at 1.14 is
effectively unreadable — `#A55239` and `#4E637C` are near-identical in luminance.

Two caveats that bound this finding:

- In the game these are a text colour and a 1px drop shadow, not a fill and a label. Read that way the
  relevant number is **TypeColor against the panel fill** (column 7), where five types fall under 3:1:
  DARK 2.01, POISON 2.33, FIGHTING 2.36, GHOST 2.43, DRAGON 2.92. Either reading leaves the same
  cluster of dark, low-luminance types weakest.
- `TypeShadow` is not distinct per type. FIGHTING and FLYING share `#4E637C`, so a pill filled with it
  is the same pill for two types.

### 5. CVD: one critical pair collapses, and the pair the ticket feared survives

Every pair of the eight inks, CIEDE2000, under normal vision and each deficiency. The four pairs #345
named as critical are marked.

| pair | normal | protan | deutan | tritan | worst | critical |
|---|---|---|---|---|---|---|
| **gutter green `#78c850` vs gold `#f8b050`** | 36.48 | **2.14** | **6.02** | 39.94 | **2.14** | **yes** |
| theirs `#f89890` vs gold `#f8b050` | 25.91 | 17.68 | 13.12 | **3.69** | **3.69** | |
| later `#e020c0` vs gutter red `#e13d3d` | 30.34 | 43.90 | 43.74 | **3.77** | **3.77** | |
| theirs `#f89890` vs neither `#a0a0a0` | 23.94 | **9.63** | 16.62 | 24.21 | **9.63** | |
| theirs `#f89890` vs gutter green `#78c850` | 56.29 | 19.15 | **9.83** | 40.65 | **9.83** | |
| ours `#40c8f8` vs gutter green `#78c850` | 48.24 | 46.95 | 47.30 | 10.24 | 10.24 | |
| **gutter green `#78c850` vs gutter red `#e13d3d`** | 69.81 | 33.98 | 13.56 | 50.60 | 13.56 | **yes** |
| ours `#40c8f8` vs later `#e020c0` | 59.95 | 35.20 | 13.95 | 67.54 | 13.95 | |
| neither `#a0a0a0` vs gutter green `#78c850` | 27.74 | 26.60 | 23.47 | 15.02 | 15.02 | |
| **theirs `#f89890` vs later `#e020c0`** | 32.12 | 46.34 | 38.14 | 17.34 | 17.34 | **yes** |
| theirs `#f89890` vs gutter red `#e13d3d` | 20.33 | 25.54 | 18.03 | 20.01 | 18.03 | |
| gutter red `#e13d3d` vs gold `#f8b050` | 36.00 | 32.01 | 18.85 | 23.57 | 18.85 | |
| later `#e020c0` vs neither `#a0a0a0` | 31.99 | 36.14 | 19.28 | 28.00 | 19.28 | |
| **ours `#40c8f8` vs neither `#a0a0a0`** | 23.19 | 20.22 | 21.17 | 23.44 | 20.22 | **yes** |
| later `#e020c0` vs gold `#f8b050` | 59.63 | 64.66 | 50.02 | 20.88 | 20.88 | |
| gutter green `#78c850` vs body `#f8f8f8` | 31.36 | 28.33 | 28.80 | 21.20 | 21.20 | |
| theirs `#f89890` vs body `#f8f8f8` | 28.59 | 21.95 | 21.37 | 28.83 | 21.37 | |
| neither `#a0a0a0` vs body `#f8f8f8` | 21.55 | 21.55 | 21.55 | 21.55 | 21.55 | |
| ours `#40c8f8` vs body `#f8f8f8` | 26.19 | 21.91 | 25.23 | 26.38 | 21.91 | |
| neither `#a0a0a0` vs gutter red `#e13d3d` | 30.65 | 27.42 | 24.21 | 30.28 | 24.21 | |
| neither `#a0a0a0` vs gold `#f8b050` | 27.05 | 25.35 | 27.16 | 24.29 | 24.29 | |
| gold `#f8b050` vs body `#f8f8f8` | 28.88 | 28.57 | 28.40 | 26.41 | 26.41 | |
| ours `#40c8f8` vs theirs `#f89890` | 52.49 | 30.06 | 38.10 | 58.99 | 30.06 | |
| later `#e020c0` vs body `#f8f8f8` | 44.28 | 52.11 | 33.64 | 41.29 | 33.64 | |
| gutter red `#e13d3d` vs body `#f8f8f8` | 43.80 | 45.71 | 37.72 | 43.57 | 37.72 | |
| later `#e020c0` vs gutter green `#78c850` | 89.35 | 66.33 | 45.96 | 47.45 | 45.96 | |
| ours `#40c8f8` vs gold `#f8b050` | 49.34 | 46.18 | 50.18 | 56.89 | 46.18 | |
| ours `#40c8f8` vs gutter red `#e13d3d` | 64.49 | 47.33 | 49.00 | 71.38 | 47.33 | |

What the inks become:

| ink | normal | protan | deutan | tritan |
|---|---|---|---|---|
| ours | `#40c8f8` | `#a8c1f8` | `#96b7f9` | `#37caef` |
| theirs | `#f89890` | `#ada691` | `#c5b78d` | `#fa95a1` |
| later | `#e020c0` | `#005fc1` | `#718abd` | `#d75065` |
| neither | `#a0a0a0` | `#a0a0a0` | `#a0a0a0` | `#a0a0a0` |
| gutter green | `#78c850` | `#d9be4f` | `#c5ae55` | `#8fbacc` |
| gutter red | `#e13d3d` | `#6d623f` | `#978433` | `#e23759` |
| gold | `#f8b050` | `#d0b751` | `#dcc04c` | `#ffa5af` |
| body | `#f8f8f8` | `#f8f8f8` | `#f8f8f8` | `#f8f8f8` |

#### The pairs that fail

Ordered by how much the collision costs, which depends on whether the two inks share a column. #337's
two-column rule means a gutter ink and a law ink never answer the same question, so a collision across
columns is a visual annoyance; a collision *within* a column is an ambiguity.

**Within the gutter:**

- **green `#78c850` vs gold `#f8b050` — ΔE00 2.14 under protanopia, 6.02 under deuteranopia. The
  worst result in the report.** Both become the same olive-khaki (`#d9be4f` / `#d0b751`). *Good news*
  and *careful* are one ink for a protan reader. Shape still separates them — `⚔ ▲ ➜ ★ ✓` against
  `✦ ⚠` — but the ink carries none of it.
- green `#78c850` vs red `#e13d3d` — ΔE00 13.56 under deuteranopia. Survives, narrowly: both go
  yellow-brown (`#c5ae55` / `#978433`) and separate almost entirely on lightness. As #337 anticipated,
  the shape differs here too (`▲`/`▼`, `★`/`✗`), so the ink is not the only carrier.

**Within the law:**

- theirs `#f89890` vs neither `#a0a0a0` — ΔE00 9.63 under protanopia, 16.62 under deuteranopia.
  Salmon desaturates to `#ada691`, a khaki-grey close to `#a0a0a0`. *Something is coming at us* and
  *nobody is acting* converge, and the law has no shape to fall back on — it is text ink and a frame.
- ours `#40c8f8` vs later `#e020c0` — ΔE00 13.95 under deuteranopia. Both land in blue-lilac
  (`#96b7f9` / `#718abd`).
- **theirs `#f89890` vs later `#e020c0` — ΔE00 17.34, its worst under tritanopia, 46.34 and 38.14
  under protanopia and deuteranopia. The pair #345 singled out as the likeliest to converge is the
  safest of the four critical pairs.** The reason is that `#e020c0` is not a red-side magenta: it
  carries a large blue component that protanopia and deuteranopia leave intact, so it renders blue
  while the salmon renders khaki. The two inks diverge *further* under red-green deficiency than they
  are in normal vision.
- ours `#40c8f8` vs neither `#a0a0a0` — ΔE00 20.22 worst. Comfortable in every condition.

**Across columns** (lower cost, listed for completeness):

- theirs `#f89890` vs gold `#f8b050` — ΔE00 3.69 under tritanopia. Both become pink (`#fa95a1` /
  `#ffa5af`). A `theirs` row's text and a gold `⚠` in its own gutter would be the same colour, inches
  apart on one line.
- later `#e020c0` vs red `#e13d3d` — ΔE00 3.77 under tritanopia (`#d75065` / `#e23759`).
- theirs `#f89890` vs green `#78c850` — ΔE00 9.83 under deuteranopia.
- ours `#40c8f8` vs green `#78c850` — ΔE00 10.24 under tritanopia.

Grey `#a0a0a0` and body `#f8f8f8` are achromatic and therefore invariant under all three simulations.
Their separation from everything else is the same number in every condition, which makes them the only
two inks in the palette with no CVD exposure at all.

### 6. Type pills also converge, but the pill carries the type's name

39 of the 153 type-colour pairs fall under ΔE00 12 in at least one condition. The worst:

| type pair | normal | protan | deutan | tritan | worst |
|---|---|---|---|---|---|
| FLYING vs FAIRY | 25.53 | 11.73 | 1.80 | 39.53 | 1.80 |
| FIRE vs PSYCHIC | 21.77 | 29.74 | 16.10 | 2.27 | 2.27 |
| FLYING vs GRASS | 52.96 | 51.71 | 48.30 | 2.28 | 2.28 |
| POISON vs GHOST | 13.57 | 7.83 | 3.26 | 27.69 | 3.26 |
| GRASS vs ELECTRIC | 30.97 | 3.88 | 10.11 | 39.99 | 3.88 |
| NORMAL vs BUG | 23.15 | 22.64 | 21.19 | 4.21 | 4.21 |
| BUG vs GRASS | 13.24 | 4.44 | 5.08 | 21.24 | 4.44 |
| ROCK vs GRASS | 23.39 | 9.91 | 4.45 | 35.51 | 4.45 |
| BUG vs ELECTRIC | 19.28 | 4.62 | 8.29 | 19.43 | 4.62 |
| GROUND vs FIRE | 22.41 | 4.62 | 7.02 | 14.16 | 4.62 |
| FLYING vs STEEL | 11.01 | 11.50 | 10.50 | 4.64 | 4.64 |
| WATER vs FAIRY | 38.44 | 4.68 | 8.68 | 57.92 | 4.68 |
| POISON vs DARK | 36.64 | 39.13 | 37.94 | 4.71 | 4.71 |
| GHOST vs DRAGON | 8.70 | 6.46 | 8.00 | 5.30 | 5.30 |
| POISON vs DRAGON | 10.59 | 8.35 | 5.49 | 28.94 | 5.49 |

Four pairs are already under ΔE00 15 in **normal** vision — GHOST vs DRAGON 8.70, POISON vs DRAGON
10.59, FLYING vs STEEL 11.01, STEEL vs WATER 11.13 — so this is the game's own palette, not something
the panel introduced. The pill carries the type's name as text, so colour is redundant information
here in a way it is not for the law or the gutter.

---

## Plain statement of what fails

**WCAG, against the panel fill, at the 15px the panel draws:**

- `later #e020c0` fails AA (4.5:1) on every backdrop but one — 3.13 at worst, 4.80 at best.
- `gutter red #e13d3d` fails AA on every backdrop but one — 3.01 at worst, 4.61 at best.
- Both drop below the 3:1 graphical floor on the prototype's tinted group fills (2.58 worst, on
  gold-fill).
- 17 of 18 type pills fail AA as `TypeColor` on `TypeShadow`; 8 of them fail 3:1; FIGHTING at 1.14 is
  the extreme. Only ELECTRIC passes.
- Every other ink passes AA on every backdrop. None reaches AAA on the worst-case backdrop.

**CVD:**

- **gutter green vs gutter gold fails outright** — ΔE00 2.14 under protanopia, 6.02 under
  deuteranopia, within one column.
- **law theirs vs law neither fails** — ΔE00 9.63 under protanopia, within one column, with no shape
  to fall back on.
- **law ours vs law later is marginal** — ΔE00 13.95 under deuteranopia.
- **gutter green vs gutter red is marginal** — ΔE00 13.56 under deuteranopia, mitigated by shape.
- **theirs vs later, the pair #345 was written to catch, passes comfortably** — ΔE00 17.34 worst,
  and it is *more* separated under protanopia and deuteranopia than under normal vision.
- **ours vs neither passes comfortably** — ΔE00 20.22 worst.
- Two cross-column pairs fall under ΔE00 4 under tritanopia: theirs vs gold (3.69) and later vs red
  (3.77).

**The shadow:** every shadow colour is brighter than the panel fill, so the 1px text-shadow adds no
contrast against the panel and slightly softens each glyph's edge. It helps only where the fill is
translucent enough for a bright game frame to show through, which at 88–95% opacity is a small effect.
It measurably hurts `later`, whose ink-to-shadow contrast is 1.54.

---

## Sources

- Palette as settled: [#337](https://github.com/IIxauII/coachemon/issues/337) (resolution comment).
- Game inks and their shadows: `.cache/pokerogue/v1.12.0.11/src/enums/color.ts`,
  `.cache/pokerogue/v1.12.0.11/src/ui/text.ts` (`getTextColor`, lines 539-657;
  `getModifierTierTextTint`, lines 683-698).
- Panel fill, prototype: `skills/coachemon/scripts/hud/PROTOTYPE-directions.html:36-42`; text-shadow
  `:88-96`.
- Panel fill, shipped: `skills/coachemon/scripts/hud/90-render.js:166`.
- WCAG 2.2 SC 1.4.3 (Contrast Minimum), 1.4.6 (Enhanced), 1.4.11 (Non-text Contrast), and the relative
  luminance / contrast-ratio definitions — W3C Recommendation, 5 October 2023.
- CIEDE2000: CIE 142-2001, as given by Sharma, Wu & Dalal (2005), "The CIEDE2000 color-difference
  formula", *Color Research & Application* 30(1).
- Dichromat simulation: Brettel, Viénot & Mollon (1997), "Computerized simulation of color appearance
  for dichromats", *JOSA A* 14(10) 2647-2655; Viénot, Brettel & Mollon (1999), "Digital video
  colourmaps for checking the legibility of displays by dichromats", *Color Research & Application*
  24(4) 243-252. Precomputed linear-sRGB parameters from libDaltonLens (public domain).

## Appendix: the script

Throwaway, no dependencies. `node palette.mjs` reproduces every table above.

```js
// WCAG contrast + CVD simulation + CIEDE2000 for the settled Coachemon palette (#345).

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
const INK = {
  'ours #40c8f8': '#40c8f8',
  'theirs #f89890': '#f89890',
  'later #e020c0': '#e020c0',
  'neither/grey #a0a0a0': '#a0a0a0',
  'gutter green #78c850': '#78c850',
  'gutter red #e13d3d': '#e13d3d',
  'gold #f8b050': '#f8b050',
  'body #f8f8f8': '#f8f8f8',
};
const SHADOW = {
  'ours #40c8f8': '#006090',
  'theirs #f89890': '#984038',
  'later #e020c0': '#6b5a73',
  'neither/grey #a0a0a0': '#636363',
  'gutter green #78c850': '#306850',
  'gutter red #e13d3d': '#632929',
  'gold #f8b050': '#c07800',
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
const TypeShadow = { NORMAL: '#574F4A', FIGHTING: '#4E637C', FLYING: '#4E637C', POISON: '#352166', GROUND: '#572D1E', ROCK: '#5F442D', BUG: '#5F5010', GHOST: '#323D5B', STEEL: '#415C5F', FIRE: '#7C1818', WATER: '#1C4E80', GRASS: '#4F6729', ELECTRIC: '#804618', PSYCHIC: '#782155', ICE: '#2D5C74', DRAGON: '#313874', DARK: '#392725', FAIRY: '#663878' };

/* ---------- report ---------- */
const f2 = n => n.toFixed(2);
const row = cells => '| ' + cells.join(' | ') + ' |';
const sep = n => '|' + Array(n).fill('---').join('|') + '|';
const P = console.log;

P('### 1. Backdrops\n');
P(row(['backdrop', 'composited', 'relative luminance']));
P(sep(3));
for (const [k, v] of Object.entries(BACKDROP)) P(row(['`' + k + '`', '`' + toHex(v) + '`', relLum(v).toFixed(4)]));

P('\n### 2. WCAG 2.x contrast, ink against backdrop\n');
const bkeys = Object.keys(BACKDROP);
P(row(['ink', ...bkeys.map(k => k.slice(0, 1))]));
P(sep(bkeys.length + 1));
for (const [name, h] of Object.entries(INK)) {
  P(row([name, ...bkeys.map(b => f2(contrast(hex(h), BACKDROP[b])))]));
}

P('\n### 3. The 1px text-shadow\n');
P(row(['ink', 'shadow', 'C(ink,shadow)', 'C(shadow,A)', 'C(shadow,B)', 'shadow darker than B?']));
P(sep(6));
for (const [name, h] of Object.entries(INK)) {
  const s = hex(SHADOW[name]);
  P(row([name, '`' + SHADOW[name] + '`', f2(contrast(hex(h), s)),
    f2(contrast(s, BACKDROP[bkeys[0]])), f2(contrast(s, BACKDROP[bkeys[1]])),
    relLum(s) < relLum(BACKDROP[bkeys[1]]) ? 'yes' : 'NO - lighter']));
}

P('\n### 4. Ink on the prototype group fills\n');
P(row(['ink', ...Object.keys(GROUPFILL)]));
P(sep(Object.keys(GROUPFILL).length + 1));
for (const [name, h] of Object.entries(INK)) {
  P(row([name, ...Object.values(GROUPFILL).map(g => f2(contrast(hex(h), hex(g))))]));
}

P('\n### 5. Type pills - TypeColor on its own TypeShadow\n');
P(row(['type', 'TypeColor', 'TypeShadow', 'fg on shadow', 'AA 4.5', 'AA-large 3.0', 'shadow on B', 'TypeColor on B']));
P(sep(8));
const pill = [];
for (const t of Object.keys(TypeColor)) {
  const fg = hex(TypeColor[t]), sh = hex(TypeShadow[t]);
  const c = contrast(fg, sh);
  pill.push([t, c]);
  P(row([t, '`' + TypeColor[t] + '`', '`' + TypeShadow[t] + '`', f2(c),
    c >= 4.5 ? 'pass' : 'FAIL', c >= 3 ? 'pass' : 'FAIL',
    f2(contrast(sh, BACKDROP[bkeys[1]])), f2(contrast(fg, BACKDROP[bkeys[1]]))]));
}
pill.sort((a, b) => a[1] - b[1]);
P('\nworst five: ' + pill.slice(0, 5).map(([t, c]) => `${t} ${f2(c)}`).join(', '));
P('best five: ' + pill.slice(-5).reverse().map(([t, c]) => `${t} ${f2(c)}`).join(', '));

P('\n### 6. CVD simulation of each ink\n');
const kinds = ['normal', 'protan', 'deutan', 'tritan'];
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

P('\n### 7. CIEDE2000 between every pair of inks, under each vision\n');
const names = Object.keys(INK);
const CRIT = new Set(['theirs #f89890|later #e020c0', 'gutter green #78c850|gutter red #e13d3d',
  'ours #40c8f8|neither/grey #a0a0a0', 'gold #f8b050|gutter green #78c850']);
P(row(['pair', ...kinds, 'worst', 'critical?']));
P(sep(kinds.length + 3));
const rows = [];
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = hex(INK[names[i]]), b = hex(INK[names[j]]);
  const ds = kinds.map(k => ciede2000(simulate(a, k), simulate(b, k)));
  const crit = CRIT.has(names[i] + '|' + names[j]) || CRIT.has(names[j] + '|' + names[i]);
  rows.push([`${names[i]} vs ${names[j]}`, ds, crit]);
}
rows.sort((x, y) => Math.min(...x[1]) - Math.min(...y[1]));
for (const [p, ds, crit] of rows) {
  P(row([p, ...ds.map(f2), f2(Math.min(...ds)), crit ? '**yes**' : '']));
}

P('\n### 8. Type-pill fills that converge under CVD (dE < 12 in any condition)\n');
const tn = Object.keys(TypeColor);
const conv = [];
for (let i = 0; i < tn.length; i++) for (let j = i + 1; j < tn.length; j++) {
  const a = hex(TypeColor[tn[i]]), b = hex(TypeColor[tn[j]]);
  const ds = kinds.map(k => ciede2000(simulate(a, k), simulate(b, k)));
  if (Math.min(...ds) < 12) conv.push([`${tn[i]} vs ${tn[j]}`, ds]);
}
conv.sort((x, y) => Math.min(...x[1]) - Math.min(...y[1]));
P(row(['type pair', ...kinds, 'worst']));
P(sep(kinds.length + 2));
for (const [p, ds] of conv) P(row([p, ...ds.map(f2), f2(Math.min(...ds))]));
P(`\n${conv.length} of ${tn.length * (tn.length - 1) / 2} type pairs fall under dE 12 in at least one condition.`);
```
