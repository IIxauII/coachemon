# Contrast and colour-vision-deficiency safety of the settled panel palette

Research for [#345](https://github.com/IIxauII/coachemon/issues/345), measuring the palette
[#337](https://github.com/IIxauII/coachemon/issues/337) settled. **Findings only.** Whether to change
an ink in response is a decision and belongs to its own ticket.

> **Third pass.** The palette has moved twice while this note was being written. What is current:
>
> - **One shadow for the whole panel, `#181818`**, keeping the 1px offset. The per-style pairs from
>   the game (`#006090`, `#984038`, `#306850`, …) are gone. This was amended on #337 in response to
>   the second pass's finding that every one of those shadows was *brighter* than the panel fill.
> - **Gold has left the gutter.** `✦` and `⚠` moved to red, so the gutter is green `#78c850`
>   (`⚔ ➜ ★ ✓`), red `#e13d3d` (`↯ ✗ ✦ ⚠`), grey `#a0a0a0` (`⇄ ⤵ ≈ ↺ ·`), plus the quoted
>   effectiveness inks `▲ #4AA500`, `▼ #FE8E00` and immune `#929292`. `#f8b050` survives as chrome.
> - **`later` is `#e331c5`**, not `#e020c0` — the game carries the master-tier colour twice and
>   disagrees with itself (`enums/color.ts:21` holds a dead string; `ui/text.ts:693`
>   `getModifierTierTextTint()` returns the value that actually tints).
> - **Type badges are 13px sprites**, not colour (`90-render.js:54-55`). An earlier pass measured a
>   `TypeColor`-on-`TypeShadow` pill; no such thing exists in the panel. That section is gone.
>
> Two findings from earlier passes were acted on and are now **closed by the change rather than by
> measurement**: the bright shadows, and the `#78c850` / `#f8b050` collision. Both are recorded below
> with the numbers that retired them, because a later reader needs to know they were real.

## Method

Backdrops, unchanged — the panel is translucent, so "the fill" is five colours:

| id | what it is | composited | relative luminance |
|---|---|---|---|
| A | prototype fill over a black game frame — `rgba(43,36,56,.95)` over `#000000` | `#292235` | 0.0188 |
| B | prototype fill over a **white** game frame — same over `#ffffff` | `#362f42` | 0.0320 |
| C | shipped fill over a black game frame — `rgba(12,12,24,.88)` over `#000000` | `#0b0b15` | 0.0035 |
| D | shipped fill over a **white** game frame — same over `#ffffff` | `#292934` | 0.0232 |
| E | opaque approximation of the prototype fill — `#2b2438` | `#2b2438` | 0.0206 |

A/B bracket `--fill` (`PROTOTYPE-directions.html:36`); C/D bracket the shipped
`background: rgba(12,12,24,.88)` (`90-render.js:166`). **B is the worst case** and every verdict is
stated against it.

Text is 15px (`PROTOTYPE-directions.html:88`), below WCAG's large-text floor of 24px, so **4.5:1 is
the applicable threshold**. 3:1 is reported as the graphical floor under SC 1.4.11.

For CIEDE2000, one scale throughout, calibrated for a 14px glyph on a moving background judged from
memory rather than side by side:

| ΔE00 | verdict | what it looks like |
|---|---|---|
| < 5 | **plainly the same** | one ink. The reader never suspects a distinction was intended. |
| 5 – 20 | **the uncanny middle** | different enough to see, not enough to mean. Reads as one ink rendered inconsistently — as a bug, not a distinction. |
| > 20 | **plainly different** | two inks. |

CVD is Brettel, Viénot & Mollon (1997) two-half-plane simulation at severity 1.0 in linear sRGB,
libDaltonLens parameters. Every matrix row sums to 1.000, and `#f8f8f8`, `#a0a0a0` and `#929292` do
come back unchanged under all three deficiencies — the sanity check.

---

## Finding 1 — the new shadow is a real improvement, and it changes no WCAG ratio

`#181818` is **darker** than the fill, which none of the eight it replaced were. Against the five
backdrops:

| | colour | relative luminance | vs the shadow |
|---|---|---|---|
| the shadow | `#181818` | 0.0091 | — |
| A prototype fill over black game | `#292235` | 0.0188 | shadow is 2.06× darker |
| B prototype fill over white game | `#362f42` | 0.0320 | shadow is 3.50× darker |
| C shipped fill over black game | `#0b0b15` | 0.0035 | **shadow is LIGHTER** |
| D shipped fill over white game | `#292934` | 0.0232 | shadow is 2.54× darker |
| E opaque approximation | `#2b2438` | 0.0206 | shadow is 2.26× darker |

So on four of the five it is a genuine halo — the first time in this note's history that the shadow
darkens the ground rather than sitting between ink and ground. **On backdrop C it inverts**: the
shipped panel over a dark game frame is darker than `#181818`, so there the shadow is a *light* fringe
and the old problem returns. C is the shipped panel's normal case, not an edge case.

**But the WCAG figures do not move.** Contrast is measured between the text and its background, and a
1px offset shadow does not become the background: it covers down-and-right of each stroke, not around
it. So:

| ink | on A | on B | on C | on D | on E | AA on fill B | on `#181818` | AA on the shadow |
|---|---|---|---|---|---|---|---|---|
| law ours `#40c8f8` | 7.87 | 6.61 | 10.12 | 7.40 | 7.67 | pass | 9.16 | pass |
| law theirs `#f89890` | 7.18 | 6.03 | 9.23 | 6.75 | 7.00 | pass | 8.36 | pass |
| **law later `#e331c5`** | 4.00 | **3.36** | 5.15 | 3.77 | 3.90 | **FAIL** | 4.66 | pass |
| law neither `#a0a0a0` | 5.83 | 4.90 | 7.50 | 5.49 | 5.69 | pass | 6.79 | pass |
| gutter good `#78c850` | 7.39 | 6.21 | 9.51 | 6.95 | 7.21 | pass | 8.60 | pass |
| **gutter bad `#e13d3d`** | 3.59 | **3.01** | 4.61 | 3.37 | 3.50 | **FAIL** | **4.17** | **FAIL** |
| gutter neutral `#a0a0a0` | 5.83 | 4.90 | 7.50 | 5.49 | 5.69 | pass | 6.79 | pass |
| **quoted weak-to `#4AA500`** | 4.85 | **4.07** | 6.23 | 4.56 | 4.73 | **FAIL** | 5.64 | pass |
| quoted resisted `#FE8E00` | 6.60 | 5.54 | 8.49 | 6.21 | 6.43 | pass | 7.68 | pass |
| **quoted immune `#929292`** | 4.90 | **4.12** | 6.30 | 4.61 | 4.78 | **FAIL** | 5.71 | pass |
| chrome gold `#f8b050` | 8.22 | 6.90 | 10.57 | 7.73 | 8.01 | pass | 9.57 | pass |
| body `#f8f8f8` | 14.36 | 12.06 | 18.47 | 13.51 | 14.00 | pass | 16.72 | pass |

**Direct answer to the question asked: no, `later` and `gutter red` do not now pass.** Against the
fill they are unchanged at 3.36 and 3.01, because nothing about the background changed. Against the
shadow itself `later` reaches 4.66 and clears AA, but `gutter red` is 4.17 and **fails even there** —
it is the one ink in the palette that fails against both its background and its own halo.

The honest reading is that the shadow change bought real perceived legibility and bought no
conformance. A 1px offset is not an outline; were it a four-direction 1px outline, the glyph would sit
in `#181818` on all sides and the case for reading the halo as the effective background would be much
stronger. It still would not be a WCAG pass — the standard has no provision for crediting a shadow —
but the perceptual claim would be defensible in a way it currently is not.

## Finding 2 — the fix relocated the gutter's failure rather than removing it

Gold leaving the gutter retires `#78c850` vs `#f8b050`, which measured **ΔE00 2.14 under protanopia**
(both going olive-khaki). That pair no longer co-occurs in a column and is **closed by the change**.
`#f8b050` remains as chrome, where it meets the law's inks instead — see Finding 5.

But the column it left is not clean, because the quoted inks arrived in it. **The new pair, and the
one the ticket now turns on:**

| pair | what they mean | normal | protan | deutan | tritan | worst | verdict |
|---|---|---|---|---|---|---|---|
| **`#78c850` vs `#FE8E00`** | **good news vs resisted** | 46.65 | 9.68 | **8.17** | 43.28 | **8.17** | **uncanny middle** |

**Plainly: the uncanny middle, worst under deuteranopia.** The hypothesis behind the question was
right — green against orange is on the axis red-green deficiency eats, and ΔE00 46.65 in normal vision
collapses to 8.17 under deuteranopia and 9.68 under protanopia. It is a **substantial improvement on
the pair it replaced** (8.17 against 2.14, out of "plainly the same" and into the middle band) and it
is **not a resolution**: a deuteranopic reader sees two similar yellow-greens where the panel intends
*this is good* and *this move is resisted*.

The whole gutter, every within-column pair, sorted by worst case:

| pair | normal | protan | deutan | tritan | worst | verdict at worst |
|---|---|---|---|---|---|---|
| weak-to #4AA500 vs resisted #FE8E00 | 48.13 | 0.71 | 12.54 | 45.85 | 0.71 | plainly the same |
| neutral #a0a0a0 vs immune #929292 | 4.47 | 4.47 | 4.47 | 4.47 | 4.47 | plainly the same |
| bad #e13d3d vs weak-to #4AA500 | 69.80 | 26.83 | 4.61 | 49.80 | 4.61 | plainly the same |
| good #78c850 vs resisted #FE8E00 | 46.65 | 9.68 | 8.17 | 43.28 | 8.17 | UNCANNY MIDDLE |
| good #78c850 vs weak-to #4AA500 | 11.02 | 10.37 | 11.46 | 10.76 | 10.37 | UNCANNY MIDDLE |
| good #78c850 vs bad #e13d3d | 69.81 | 33.98 | 13.56 | 50.60 | 13.56 | UNCANNY MIDDLE |
| weak-to #4AA500 vs immune #929292 | 28.60 | 27.18 | 25.26 | 14.92 | 14.92 | UNCANNY MIDDLE |
| good #78c850 vs neutral #a0a0a0 | 27.74 | 26.60 | 23.47 | 15.02 | 15.02 | UNCANNY MIDDLE |
| neutral #a0a0a0 vs weak-to #4AA500 | 28.99 | 27.02 | 26.04 | 15.75 | 15.75 | UNCANNY MIDDLE |
| bad #e13d3d vs resisted #FE8E00 | 29.97 | 27.19 | 16.53 | 16.59 | 16.53 | UNCANNY MIDDLE |
| good #78c850 vs immune #929292 | 29.02 | 28.36 | 24.70 | 17.20 | 17.20 | UNCANNY MIDDLE |
| bad #e13d3d vs immune #929292 | 29.06 | 23.71 | 22.89 | 28.67 | 22.89 | plainly different |
| bad #e13d3d vs neutral #a0a0a0 | 30.65 | 27.42 | 24.21 | 30.28 | 24.21 | plainly different |
| neutral #a0a0a0 vs resisted #FE8E00 | 29.18 | 26.81 | 28.88 | 25.24 | 25.24 | plainly different |
| resisted #FE8E00 vs immune #929292 | 29.98 | 27.07 | 29.94 | 26.14 | 26.14 | plainly different |

**Only 4 of the 15 gutter pairs are plainly different.** Three are plainly the same — the quoted
inks against each other at **0.71** (protanopia), neutral against immune at **4.47** (all
conditions, both achromatic), and bad-news red against weak-to green at **4.61** (deuteranopia),
which is *good news and bad news as one ink*. Eight more sit in the uncanny middle. The column now
carries six inks and separates reliably on none of the three axes a deficiency attacks.

The three verdicts asked for, together:

| pair | what they mean | normal | worst | under | verdict |
|---|---|---|---|---|---|
| `#78c850` vs `#FE8E00` | good news vs resisted | 46.65 | **8.17** | deuteranopia | **uncanny middle** |
| `#78c850` vs `#4AA500` | good news vs weak-to | 11.02 | **10.37** | protanopia | **uncanny middle** |
| `#a0a0a0` vs `#929292` | nobody acting vs immune | 4.47 | **4.47** | all four | **plainly the same** |

`#78c850` vs `#4AA500` has the flattest profile in the report — 11.02 / 10.37 / 11.46 / 10.76. Same
hue at different lightness, so no deficiency separates them and none collapses them: a normal-vision
problem that colour blindness does not make worse. `#a0a0a0` vs `#929292` is 4% of lightness between
two achromatic greys, identical in every condition by construction.

## Finding 3 — the law, and the one pair inside it that fails

| pair | normal | protan | deutan | tritan | worst | verdict at worst |
|---|---|---|---|---|---|---|
| theirs `#f89890` vs neither `#a0a0a0` | 23.94 | **9.63** | 16.62 | 24.21 | **9.63** | uncanny middle |
| ours `#40c8f8` vs later `#e331c5` | 58.77 | 32.13 | **12.37** | 66.31 | 12.37 | uncanny middle |
| theirs `#f89890` vs later `#e331c5` | 31.05 | 44.25 | 37.59 | **15.32** | 15.32 | uncanny middle |
| later `#e331c5` vs neither `#a0a0a0` | 31.10 | 33.75 | **18.73** | 27.01 | 18.73 | uncanny middle |
| ours `#40c8f8` vs neither `#a0a0a0` | 23.19 | **20.22** | 21.17 | 23.44 | 20.22 | plainly different |
| ours `#40c8f8` vs theirs `#f89890` | 52.49 | **30.06** | 38.10 | 58.99 | 30.06 | plainly different |

`theirs` vs `neither` at **9.63 under protanopia** is the law's failure: salmon desaturates to
`#ada691`, a khaki-grey beside `#a0a0a0`. *Something is coming at us* and *nobody is acting* converge,
and unlike the gutter the law has no shape to fall back on — it is text ink and a frame.

**`later` re-measured at `#e331c5`.** The reassuring result from the first pass survives the
correction: `theirs` vs `later` scores 31.05 normal, **44.25 protan, 37.59 deutan**, 15.32 tritan.
`#e331c5` goes `#0065c6` under protanopia and `#758fc2` under deuteranopia — it is a blue-side magenta
whose blue component red-green deficiency leaves intact, so it *diverges* from the salmon rather than
converging. The pair #345 was written to catch is still the safest in the law, and its worst case is
tritanopia, which is not what the ticket feared. What `#e331c5` costs is contrast: 3.36 on the fill,
a fail, marginally better than `#e020c0`'s 3.13.

## Finding 4 — candidate values for `theirs`, scored

A replacement for `theirs` has to hold apart from more than the two things named. It shares the **law
column** with `ours`, `later` and `neither`; it inks a row's text, so it shares that **text stream**
with body `#f8f8f8`; the **chrome gold** is on screen beside it; and the gutter's **bad-news red** is
the confusable axis. Six gates, plus AA on the fill. Scores are the worst ΔE00 across all four vision
conditions.

**The incumbent:**

| candidate | AA on fill B | vs neither | vs ours | vs later | vs body | vs chrome | vs bad-news | worst gate |
|---|---|---|---|---|---|---|---|---|
| `#f89890` (current) | 6.03 | 9.63 | 30.06 | 15.32 | 21.37 | **3.69** | 18.03 | **3.69** |

Note what that surfaces: **the incumbent's worst problem is not the grey.** It is chrome gold, at
**ΔE00 3.69 under tritanopia** — both `#f89890` and `#f8b050` go pink (`#fa95a1` / `#ffa5af`). The
9.63 against `#a0a0a0` is its second-worst.

**Every colour the game defines that clears AA 4.5 on the fill, best worst-gate first** (30 of 85
qualify; top 12 shown):

| candidate | AA on fill B | vs neither | vs ours | vs later | vs body | vs chrome | vs bad-news | worst gate |
|---|---|---|---|---|---|---|---|---|
| `#ded6b5` | 8.78 | 16.06 | 33.14 | 31.40 | 10.68 | 15.87 | 25.90 | **10.68** |
| `#d0d0c8` | 8.26 | 12.82 | 22.94 | 28.76 | 9.02 | 22.44 | 29.29 | **9.02** |
| `#ff7400` | 4.73 | 26.34 | 50.11 | 8.78 | 34.64 | 8.93 | 12.10 | **8.78** |
| `#00a4ff` | 4.73 | 23.11 | 8.30 | 9.56 | 32.06 | 51.99 | 48.11 | **8.30** |
| `#e8e8a8` | 10.09 | 18.73 | 39.03 | 34.03 | 8.22 | 12.57 | 26.67 | **8.22** |
| `#81a6be` | 4.96 | 11.31 | 10.76 | 8.08 | 23.43 | 38.38 | 36.58 | **8.08** |
| `#f88880` | 5.38 | 10.89 | 32.54 | 12.02 | 24.37 | 7.38 | 14.94 | **7.38** |
| `#a0a060` | 4.69 | 7.05 | 38.61 | 22.85 | 23.78 | 9.73 | 8.97 | **7.05** |
| `#fe8e00` | 5.54 | 25.24 | 49.70 | 12.44 | 31.23 | 6.54 | 16.53 | **6.54** |
| `#ada594` | 5.24 | 6.48 | 28.52 | 24.42 | 20.91 | 18.94 | 19.12 | **6.48** |
| `#bda55a` | 5.30 | 15.22 | 43.42 | 19.03 | 24.86 | 6.37 | 11.27 | **6.37** |
| `#4bb400` | 4.78 | 16.12 | 11.49 | 47.60 | 27.64 | 6.34 | 8.13 | **6.34** |

**No value in the game's palette clears ΔE00 20 on all six gates.** The best available worst-gate is
`#ded6b5` at 10.68 and `#d0d0c8` at 9.02 — both near-whites that trade the grey collision for a body
collision. Twenty candidates beat the incumbent's 3.69, but the ceiling across the whole 85-colour
palette is about 10.7, which is the middle of the uncanny band. **This is a structural result, not a
tuning problem:** the law column plus body plus chrome plus the gutter's red already occupy too much
of the space the game's own palette covers for a seventh ink to be plainly different from all of them.

**Which gate is doing the work.** Dropping one gate at a time and re-counting the candidates that
clear ΔE00 20 on every remaining gate:

| gate set | candidates clearing 20 | which |
|---|---|---|
| **all six gates** | 0 | _none_ |
| all but `vs neither #a0a0a0` | 0 | _none_ |
| all but `vs ours #40c8f8` | 0 | _none_ |
| all but `vs later #e331c5` | 0 | _none_ |
| all but `vs body #f8f8f8` | 1 | `#ffffff` |
| all but `vs chrome #f8b050` | 3 | `#f8d038` `#ffbd73` `#ffc631` |
| all but `vs bad-news #e13d3d` | 0 | _none_ |

**Chrome gold is the binding constraint.** Drop it and three golds open up — `#f8d038`, `#ffbd73`,
`#ffc631`. Drop the body gate and only `#ffffff` opens, which is body's own near-neighbour. Drop any
of the other four and nothing opens at all. So the question "what else could `theirs` be" is, within
the game's palette, mostly the question "is chrome gold allowed to move".

These are scores, not a shortlist. Choosing among them — or deciding that the gate set itself is wrong,
or that the palette must leave the game's 85 colours — is a decision, and this ticket is findings only.

## Finding 5 — the two red problems are one problem, and no red solves it

The panel has two unsolved reds that pull in opposite directions. **gutter bad `#e13d3d`** fails AA at
3.01 on the fill while carrying `↯ ✗ ✦ ⚠`. **law theirs `#f89890`** sits ΔE00 9.63 from `#a0a0a0` under
protanopia, on a group *frame*, where there is no shape to fall back on. Saturate to fix the second and
you darken toward failing the first; lighten to fix the first and you desaturate toward grey again.

The two incumbents against grey, and against the green they share a panel with:

| red | role | normal | protan | deutan | tritan | worst | worst under |
|---|---|---|---|---|---|---|---|
| `#e13d3d` | gutter bad | 30.65 | 27.42 | 24.21 | 30.28 | **24.21** | deuteranopia |
| `#f89890` | law theirs | 23.94 | **9.63** | 16.62 | 24.21 | **9.63** | protanopia |

| pair | normal | protan | deutan | tritan | worst |
|---|---|---|---|---|---|
| the two reds, `#e13d3d` vs `#f89890` | 20.33 | 25.54 | 18.03 | 20.01 | 18.03 |
| gutter bad vs gutter green, `#e13d3d` vs `#78c850` | 69.81 | 33.98 | **13.56** | 50.60 | 13.56 |
| law theirs vs gutter green, `#f89890` vs `#78c850` | 56.29 | 19.15 | **9.83** | 40.65 | 9.83 |

### The three axes, and the named game reds against them

A single red serving both columns must clear all three at once: **contrast ≥ 4.5 on the worst-case
fill**, **ΔE00 ≥ 20 from `#a0a0a0`** and **ΔE00 ≥ 20 from `#78c850`**, the last two under both
protanopia and deuteranopia. 20 is this note's "plainly different" line.

| candidate | what it is | contrast | AA | ΔE grey p/d | grey ≥20 | ΔE green p/d | green ≥20 | all three |
|---|---|---|---|---|---|---|---|---|
| `#e13d3d` | `Color.RED` — gutter bad today | **3.01** | **FAIL** | 27.42 / 24.21 | pass | 33.98 / **13.56** | **FAIL** | **fail** |
| `#f89890` | `Color.PINK` — law theirs today | 6.03 | pass | **9.63** / 16.62 | **FAIL** | 19.15 / **9.83** | **FAIL** | **fail** |
| `#f88880` | `SETTINGS_SELECTED` | 5.38 | pass | **10.89** / 17.59 | **FAIL** | 19.87 / **7.51** | **FAIL** | **fail** |
| `#e70808` | `Color.RED2` | **2.71** | **FAIL** | 36.35 / 29.18 | pass | 38.79 / **16.56** | **FAIL** | **fail** |
| `#d64b00` | `Color.REDORANGE` | **2.97** | **FAIL** | 31.58 / 28.63 | pass | 29.85 / **15.51** | **FAIL** | **fail** |
| `#fb3041` | HP-low atlas, light | **3.42** | **FAIL** | 25.98 / 24.01 | pass | 32.82 / **9.61** | **FAIL** | **fail** |
| `#922030` | HP-low atlas, dark | **1.51** | **FAIL** | 39.34 / 34.26 | pass | 55.81 / 35.83 | pass | **fail** |
| `#d52929` | `ModifierTier.ROGUE` | **2.55** | **FAIL** | 33.58 / 27.29 | pass | 39.21 / **17.84** | **FAIL** | **fail** |
| `#e64a18` | `Color.LUXURY` | **3.27** | **FAIL** | 29.45 / 27.35 | pass | 28.28 / **12.60** | **FAIL** | **fail** |
| `#f83018` | `ShadowColor.BRIGHT_RED` | **3.31** | **FAIL** | 30.81 / 27.60 | pass | 31.16 / **11.91** | **FAIL** | **fail** |

**None of the ten passes.** The table also shows the shape of the trap cleanly. Every saturated red —
`#e70808`, `#d52929`, `#f83018`, `#922030` — clears the grey axis easily and fails contrast on a dark
fill. Every light red — `#f89890`, `#f88880` — clears contrast and fails the grey axis. `#922030` is
the only one that clears both ΔE axes, and its contrast is **1.51**, nearly the fill's own luminance.

### Nothing in the game's vocabulary is a red that works

Seven of the 87 colours in the game's vocabulary clear all three axes:

| candidate | contrast | ΔE grey p/d | ΔE green p/d |
|---|---|---|---|
| `#00a4ff` | 4.73 | 24.27 / 24.93 | 55.74 / 53.62 |
| `#2db4ff` | 5.54 | 22.69 / 23.44 | 52.59 / 51.31 |
| `#40c8f8` | 6.61 | 20.22 / 21.17 | 46.95 / 47.30 |
| `#9cadf7` | 5.94 | 21.63 / 21.31 | 51.23 / 47.95 |
| `#ef70ef` | 5.02 | 25.87 / 20.34 | 58.13 / 47.15 |
| `#f8f8f8` | 12.06 | 21.55 / 21.55 | 28.33 / 28.80 |
| `#ffffff` | 12.81 | 22.91 / 22.91 | 28.99 / 29.64 |

**Four blues, a magenta and two whites. Not one red, and three of the seven are inks the panel has
already spent** — `#40c8f8` is *ours*, `#f8f8f8` is body, `#2db4ff` is upstream's high-contrast
weak-to. The constraint is satisfiable; it is not satisfiable by a red.

### And no red anywhere in sRGB works either

Sweeping the whole colour space rather than the game's vocabulary — an 8-step grid over all 32,768
sRGB values for the unconstrained search, a 4-step grid restricted to chromatic reds (chroma ≥ 60,
hue 330°–25°) for the red search:

| | value | contrast | worst ΔE of the four | all three |
|---|---|---|---|---|
| best anywhere in sRGB | `#6898f8` | 4.54 | **24.29** | **PASS** |
| best separation among reds clearing AA | `#fcd4c0` | 9.35 | **17.48** | **fail** |
| best contrast among reds clearing ΔE 20 | `#9c6c54` | **2.86** | 20.18 | **fail** |

**The red family cannot satisfy the three axes at any value.** The best a red can do while clearing AA
is ΔE00 17.48 — and `#fcd4c0` is a pale peach at the very edge of the red family, not a red anyone
would call red. The best red that clears the ΔE bar is `#9c6c54`, a muted brown at contrast 2.86.

The geometry behind it: **on a dark panel, a red bright enough to read must be a light red — and light
reds are exactly the ones protanopia and deuteranopia collapse onto light greys**, because what
distinguishes them from grey is the red-channel contribution the deficiency removes. Saturation buys
back the grey separation but costs the luminance the contrast needs. The two requirements are opposed
along the one dimension a red has to spend.

**The best non-game value, flagged as an invention: `#6898f8`** — contrast 4.54, ΔE00 24.56 / 24.29
from grey, 56.40 / 52.82 from green. It is a periwinkle blue, invented, and it is not a red. It is
reported only to establish that the axes are satisfiable in principle, and that what makes them
unsatisfiable here is the requirement that the answer be red.

### Plainly

**No, one red cannot serve both columns, and no red serves either column fully.** Not in the game's
vocabulary and not anywhere in sRGB. The closest reds are `#fcd4c0` (17.48 worst ΔE, clears AA) and
`#922030` (clears both ΔE axes, contrast 1.51) — one too pale to be red, the other too dark to read.
Whatever is done here, it will not be "pick a better red": either an axis gives, or the carrier stops
being colour.


## Finding 6 — what each ink becomes

| ink | normal | protan | deutan | tritan |
|---|---|---|---|---|
| ours #40c8f8 | `#40c8f8` | `#a8c1f8` | `#96b7f9` | `#37caef` |
| theirs #f89890 | `#f89890` | `#ada691` | `#c5b78d` | `#fa95a1` |
| later #e331c5 | `#e331c5` | `#0065c6` | `#758fc2` | `#da586c` |
| neither #a0a0a0 | `#a0a0a0` | `#a0a0a0` | `#a0a0a0` | `#a0a0a0` |
| good #78c850 | `#78c850` | `#d9be4f` | `#c5ae55` | `#8fbacc` |
| bad #e13d3d | `#e13d3d` | `#6d623f` | `#978433` | `#e23759` |
| neutral #a0a0a0 | `#a0a0a0` | `#a0a0a0` | `#a0a0a0` | `#a0a0a0` |
| weak-to #4AA500 | `#4aa500` | `#b59b00` | `#a18b18` | `#6797a9` |
| resisted #FE8E00 | `#fe8e00` | `#b79d08` | `#cdaf00` | `#ff8293` |
| immune #929292 | `#929292` | `#929292` | `#929292` | `#929292` |
| chrome gold #f8b050 | `#f8b050` | `#d0b751` | `#dcc04c` | `#ffa5af` |
| body #f8f8f8 | `#f8f8f8` | `#f8f8f8` | `#f8f8f8` | `#f8f8f8` |

---

## Plain statement of what fails

**The three verdicts asked for:**

- `#78c850` vs `#FE8E00` (good news vs resisted, one column): **the uncanny middle** — ΔE00 46.65
  normal, **8.17 under deuteranopia**, 9.68 under protanopia. The green/orange axis is the one
  red-green deficiency eats, so the failure moved rather than left. Better than the 2.14 pair it
  replaced; not resolved.
- `#78c850` vs `#4AA500` (good news vs weak-to, one column): **the uncanny middle**, ΔE00 11.02
  normal and 10.37 at worst, essentially flat across all four conditions. Not a colour-blindness
  failure — a normal-vision one that colour blindness does not worsen.
- `#a0a0a0` vs `#929292` (nobody acting vs immune): **plainly the same**, ΔE00 4.47, identical in all
  four conditions because both are achromatic.

**Also failing in the gutter, unasked:**

- weak-to `#4AA500` vs resisted `#FE8E00`: **ΔE00 0.71 under protanopia**, the worst number in this
  note. The quoted pair against itself, one column, opposite meanings.
- bad-news `#e13d3d` vs weak-to `#4AA500`: **ΔE00 4.61 under deuteranopia** — good news and bad news
  as one ink.
- Only **4 of the 15** gutter pairs are plainly different in every condition.

**In the law:** `theirs #f89890` vs `neither #a0a0a0` at **ΔE00 9.63 under protanopia**, with no shape
to fall back on. `ours` vs `later` is marginal at 12.37 (deuteranopia). `theirs` vs `later` — the pair
#345 was written to catch — **passes at 15.32 and diverges under red-green deficiency**, confirmed
against the corrected `#e331c5`.

**Contrast:** four inks fail AA against the fill — `later #e331c5` 3.36, `gutter red #e13d3d` 3.01,
`weak-to #4AA500` 4.07, `immune #929292` 4.12 — and the single shadow does not change any of these,
because WCAG measures against the background and a 1px offset shadow is not the background. Against
the shadow itself `later` clears AA at 4.66; **`gutter red` fails even there, at 4.17**, the only ink
that fails against both its background and its own halo. On the shipped fill over a dark game frame
(backdrop C) `#181818` is *lighter* than the panel, so the halo inverts.

**For `theirs`, no value in the game's 85 colours clears ΔE00 20 on all six gates.** Ceiling is 10.68
(`#ded6b5`). Chrome gold is the binding constraint: dropping it opens three golds, dropping any of the
four other law/gutter gates opens nothing.

**The red, both of it.** `gutter bad #e13d3d` fails AA at 3.01 while carrying the heaviest mark load;
`law theirs #f89890` sits ΔE00 9.63 from `#a0a0a0` under protanopia on a frame with no shape to fall
back on. **No single red serves both, and no red serves either fully** — not among the ten named game
reds, not among the 87 colours in the game's vocabulary, and not anywhere in sRGB. The best red that
clears AA reaches ΔE00 17.48 (`#fcd4c0`, a pale peach at the edge of the family); the best that clears
ΔE00 20 has contrast 2.86 (`#9c6c54`, a muted brown). The axes *are* satisfiable — seven game colours
clear all three, and the best value in sRGB is `#6898f8` at worst-ΔE 24.29 — but every one of them is
a blue, a magenta or a white. On a dark panel a red bright enough to read is a light red, and light
reds are exactly what protanopia and deuteranopia collapse onto light greys. The two requirements are
opposed along the one dimension a red has to spend.

**Closed by the change, not by measurement** — recorded because they were real: the eight per-style
shadows, all brighter than the fill; and `#78c850` vs `#f8b050` at ΔE00 2.14 under protanopia, retired
when gold left the gutter.

No palette changes proposed — findings only.

## Sources

- Palette as settled and its three amendments: [#337](https://github.com/IIxauII/coachemon/issues/337).
- Game inks: `.cache/pokerogue/v1.12.0.11/src/enums/color.ts`; `src/ui/text.ts` (`getTextColor`
  539-657, `getModifierTierTextTint` 683-698). The 85-colour candidate pool is every distinct hex in
  `enums/color.ts`, `ui/text.ts` and `data/type.ts`.
- Effectiveness inks: `src/data/type.ts:296-320` (`getTypeDamageMultiplierColor`, offense side);
  `src/enums/type-hints.ts`; `src/system/settings/settings.ts:636-654`; called with the high-contrast
  flag at `src/ui/handlers/fight-ui-handler.ts:403`.
- Type badges as sprites: `skills/coachemon/scripts/hud/90-render.js:54-55`, fallback at `:40-45`.
- Panel fill: `PROTOTYPE-directions.html:36-42`, text-shadow at `:88-96`; shipped panel at
  `90-render.js:166`.
- WCAG 2.2 SC 1.4.3, 1.4.6, 1.4.11 and the relative-luminance and contrast-ratio definitions — W3C
  Recommendation, 5 October 2023.
- CIEDE2000: CIE 142-2001, as given by Sharma, Wu & Dalal (2005), *Color Research & Application* 30(1).
- Dichromat simulation: Brettel, Viénot & Mollon (1997), *JOSA A* 14(10) 2647-2655; Viénot, Brettel &
  Mollon (1999), *Color Research & Application* 24(4) 243-252. Precomputed linear-sRGB parameters from
  libDaltonLens (public domain).

## Appendix A: the main script

Throwaway, no dependencies. `node palette.mjs` reproduces every table above.

```js
// Throwaway: contrast + CVD for the settled Coachemon palette (#345), third pass.
// One shadow (#181818), gold out of the gutter, the effectiveness table quoted.
// No dependencies. Run: node palette.mjs

/* ---------- colour plumbing ---------- */
const hex = h => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lin = c => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const unlin = v => { const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return s * 255; };
const relLum = rgb => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
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
const WP = [95.047, 100.000, 108.883];
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
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
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

/* ---------- CVD: Brettel/Vienot/Mollon 1997, libDaltonLens parameters ---------- */
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
  return [0, 1, 2].map(i => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]).map(unlin);
}

/* ---------- the palette, third pass ---------- */
const SHADOW = '#181818';          // one shadow for the whole panel, 1px offset
const LAW = {
  'ours #40c8f8': '#40c8f8',
  'theirs #f89890': '#f89890',
  'later #e331c5': '#e331c5',
  'neither #a0a0a0': '#a0a0a0',
};
const GUTTER = {
  'good #78c850': '#78c850',
  'bad #e13d3d': '#e13d3d',
  'neutral #a0a0a0': '#a0a0a0',
  'weak-to #4AA500': '#4AA500',
  'resisted #FE8E00': '#FE8E00',
  'immune #929292': '#929292',
};
const OTHER = { 'chrome gold #f8b050': '#f8b050', 'body #f8f8f8': '#f8f8f8' };
const ALL = { ...LAW, ...GUTTER, ...OTHER };

const BACKDROP = {
  'A prototype fill over black game': over(hex('#2b2438'), 0.95, hex('#000000')),
  'B prototype fill over white game': over(hex('#2b2438'), 0.95, hex('#ffffff')),
  'C shipped fill over black game': over(hex('#0c0c18'), 0.88, hex('#000000')),
  'D shipped fill over white game': over(hex('#0c0c18'), 0.88, hex('#ffffff')),
  'E opaque approximation #2b2438': hex('#2b2438'),
};
const B = BACKDROP['B prototype fill over white game'];

// every colour the game defines, for the candidate search
const GAME = ('#006090 #0093ff #00a4ff #1c4e80 #2d5c74 #2db4ff #306850 #313874 #323d5b #352166 #3890f8 '
  + '#392725 #399cff #404040 #40c8f8 #415c5f #484848 #4aa500 #4bb400 #4e637c #4f6729 #52c200 #572d1e '
  + '#574f4a #5acee7 #5f442d #5f5010 #632929 #636363 #6363b5 #663878 #69402a #6b5a73 #6e672c #707070 '
  + '#735a4a #782155 #78c850 #7b63e7 #7bce52 #7c1818 #804618 #81a6be #9141cb #929292 #984038 #9cadf7 '
  + '#a0a060 #a0a0a0 #a55239 #a68e17 #ada594 #adbd21 #ae7a3b #b1b100 #bda55a #c07800 #ccbe00 #d0d0c8 '
  + '#d52929 #d64b00 #ded6b5 #e020c0 #e13d3d #e64a18 #e70808 #e8e8a8 #ebd773 #ef4179 #ef70ef #f75231 '
  + '#f7b18b #f83018 #f88880 #f89890 #f8b050 #f8d038 #f8f8f8 #fca2a2 #fe8e00 #ff5500 #ff7400 #ffbd73 '
  + '#ffc631 #ffffff').split(' ');

/* ---------- report ---------- */
const f2 = n => n.toFixed(2);
const row = c => '| ' + c.join(' | ') + ' |';
const sep = n => '|' + Array(n).fill('---').join('|') + '|';
const P = console.log;
const kinds = ['normal', 'protan', 'deutan', 'tritan'];
const verdict = d => d < 5 ? 'plainly the same' : d <= 20 ? 'UNCANNY MIDDLE' : 'plainly different';
const dEs = (x, y) => kinds.map(k => ciede2000(simulate(hex(x), k), simulate(hex(y), k)));
const floor = (x, y) => Math.min(...dEs(x, y));

P('### 1. The single shadow against the fill it sits on\n');
P(row(['', 'colour', 'relative luminance', 'vs fill B']));
P(sep(4));
P(row(['the new shadow', '`' + SHADOW + '`', relLum(hex(SHADOW)).toFixed(4), f2(contrast(hex(SHADOW), B))]));
for (const [k, v] of Object.entries(BACKDROP)) {
  P(row([k, '`' + toHex(v) + '`', relLum(v).toFixed(4),
    relLum(hex(SHADOW)) < relLum(v) ? `shadow is ${f2(relLum(v) / relLum(hex(SHADOW)))}x darker` : 'shadow is LIGHTER']));
}

P('\n### 2. Contrast: ink on the fill (the WCAG figure) and ink on the shadow (the halo)\n');
P(row(['ink', 'on A', 'on B', 'on C', 'on D', 'on E', 'AA on B', 'on shadow #181818', 'AA on shadow']));
P(sep(9));
for (const [name, h] of Object.entries(ALL)) {
  const cb = contrast(hex(h), B), cs = contrast(hex(h), hex(SHADOW));
  P(row([name, ...Object.values(BACKDROP).map(b => f2(contrast(hex(h), b))),
    cb >= 4.5 ? 'pass' : '**FAIL**', f2(cs), cs >= 4.5 ? 'pass' : '**FAIL**']));
}

P('\n### 3. The new gutter, every within-column pair\n');
const gn = Object.keys(GUTTER);
P(row(['pair', ...kinds, 'worst', 'verdict at worst']));
P(sep(kinds.length + 3));
const grows = [];
for (let i = 0; i < gn.length; i++) for (let j = i + 1; j < gn.length; j++) {
  const ds = dEs(GUTTER[gn[i]], GUTTER[gn[j]]);
  grows.push([`${gn[i]} vs ${gn[j]}`, ds]);
}
grows.sort((x, y) => Math.min(...x[1]) - Math.min(...y[1]));
for (const [p, ds] of grows) P(row([p, ...ds.map(f2), f2(Math.min(...ds)), verdict(Math.min(...ds))]));

P('\n### 4. The law, every within-column pair\n');
const ln = Object.keys(LAW);
P(row(['pair', ...kinds, 'worst', 'verdict at worst']));
P(sep(kinds.length + 3));
const lrows = [];
for (let i = 0; i < ln.length; i++) for (let j = i + 1; j < ln.length; j++) {
  const ds = dEs(LAW[ln[i]], LAW[ln[j]]);
  lrows.push([`${ln[i]} vs ${ln[j]}`, ds]);
}
lrows.sort((x, y) => Math.min(...x[1]) - Math.min(...y[1]));
for (const [p, ds] of lrows) P(row([p, ...ds.map(f2), f2(Math.min(...ds)), verdict(Math.min(...ds))]));

P('\n### 5. The pairs with a verdict asked for\n');
const ASK = [
  ['#78c850', '#FE8E00', 'good news vs resisted -- THE NEW PAIR'],
  ['#78c850', '#4AA500', 'good news vs weak-to'],
  ['#a0a0a0', '#929292', 'neutral vs immune'],
  ['#4AA500', '#FE8E00', 'weak-to vs resisted (the quoted pair against itself)'],
  ['#e13d3d', '#4AA500', 'bad news vs weak-to'],
  ['#e13d3d', '#FE8E00', 'bad news vs resisted'],
  ['#78c850', '#f8b050', 'good news vs gold -- NO LONGER CO-OCCURS'],
];
P(row(['pair', 'what they mean', ...kinds, 'worst', 'verdict']));
P(sep(kinds.length + 4));
for (const [a, b, mean] of ASK) {
  const ds = dEs(a, b);
  P(row([`${a} vs ${b}`, mean, ...ds.map(f2), f2(Math.min(...ds)), verdict(Math.min(...ds))]));
}

P('\n### 6. Candidate values for `theirs`, scored\n');
// A candidate must hold apart from the other three law inks (same column) and from the
// gutter's bad-news red (the confusable axis the lead named), and clear AA on the fill.
// Gates: the three other law inks (same column), the body ink it shares a row's text
// stream with, the chrome gold, and the gutter's bad-news red -- the confusable axis.
const GATES = {
  'vs neither #a0a0a0': '#a0a0a0', 'vs ours #40c8f8': '#40c8f8', 'vs later #e331c5': '#e331c5',
  'vs body #f8f8f8': '#f8f8f8', 'vs chrome #f8b050': '#f8b050', 'vs bad-news #e13d3d': '#e13d3d',
};
const scored = GAME.filter(c => !Object.values(GATES).includes(c)).map(c => {
  const gates = Object.fromEntries(Object.entries(GATES).map(([k, v]) => [k, floor(c, v)]));
  return { c, aa: contrast(hex(c), B), gates, worstGate: Math.min(...Object.values(gates)) };
});
const incumbent = scored.find(s => s.c === '#f89890');
P('the incumbent, for reference:\n');
P(row(['candidate', 'AA on fill B', ...Object.keys(GATES), 'worst gate']));
P(sep(Object.keys(GATES).length + 3));
P(row(['`#f89890` (current)', f2(incumbent.aa), ...Object.keys(GATES).map(k => f2(incumbent.gates[k])), f2(incumbent.worstGate)]));
P('\nevery game colour that clears AA 4.5 on the fill, ranked by its worst gate:\n');
P(row(['candidate', 'AA on fill B', ...Object.keys(GATES), 'worst gate']));
P(sep(Object.keys(GATES).length + 3));
const pass = scored.filter(s => s.aa >= 4.5).sort((a, b) => b.worstGate - a.worstGate);
for (const s of pass.slice(0, 20)) {
  P(row(['`' + s.c + '`', f2(s.aa), ...Object.keys(GATES).map(k => f2(s.gates[k])), '**' + f2(s.worstGate) + '**']));
}
P(`\n${pass.length} of ${GAME.length} game colours clear AA 4.5 on the fill; top 20 by worst gate shown.`);
P(`candidates beating the incumbent's worst gate of ${f2(incumbent.worstGate)}: ${pass.filter(s => s.worstGate > incumbent.worstGate).length}`);
P(`candidates whose worst gate exceeds 20 ("plainly different" on every gate): ${pass.filter(s => s.worstGate > 20).length}`);

P('\n**Sensitivity — which gates are doing the work.** Dropping one gate at a time and re-counting');
P('the candidates that clear dE00 20 on every remaining gate:\n');
P(row(['gate set', 'candidates clearing 20 on all gates', 'which']));
P(sep(3));
const gk = Object.keys(GATES);
for (const drop of [null, ...gk]) {
  const keep = gk.filter(k => k !== drop);
  const win = GAME.filter(c => !Object.values(GATES).includes(c) && contrast(hex(c), B) >= 4.5)
    .filter(c => keep.every(k => floor(c, GATES[k]) > 20));
  P(row([drop ? 'all but `' + drop + '`' : '**all six gates**', win.length,
    win.length ? win.map(w => '`' + w + '`').join(' ') : '_none_']));
}

P('\n### 7. What each ink becomes\n');
P(row(['ink', ...kinds]));
P(sep(kinds.length + 1));
for (const [name, h] of Object.entries(ALL)) {
  P(row([name, ...kinds.map(k => '`' + toHex(simulate(hex(h), k)) + '`')]));
}
```

## Appendix B: the red sweep

Throwaway, no dependencies. `node red.mjs` reproduces Finding 5.

```js
// Throwaway: can one red serve both columns? (#345, addendum)
// Axes: contrast on the panel fill; dE00 from #a0a0a0; dE00 from gutter green #78c850.
// No dependencies. Run: node red.mjs

const hex = h => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lin = c => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const unlin = v => { const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return s * 255; };
const relLum = rgb => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (rgb, a, bk) => rgb.map((c, i) => c * a + bk[i] * (1 - a));

const XYZ = rgb => { const [r, g, b] = rgb.map(lin); return [
  (0.4124564*r+0.3575761*g+0.1804375*b)*100, (0.2126729*r+0.7151522*g+0.0721750*b)*100, (0.0193339*r+0.1191920*g+0.9503041*b)*100]; };
const WP = [95.047, 100.000, 108.883];
const lab = rgb => { const f = t => t > 216/24389 ? Math.cbrt(t) : (841/108)*t + 4/29;
  const [x,y,z] = XYZ(rgb).map((v,i) => f(v/WP[i])); return [116*y-16, 500*(x-y), 200*(y-z)]; };
const deg = r => r*180/Math.PI, rad = d => d*Math.PI/180;
function ciede2000(rgb1, rgb2) {
  const [L1,a1,b1] = lab(rgb1), [L2,a2,b2] = lab(rgb2);
  const C1 = Math.hypot(a1,b1), C2 = Math.hypot(a2,b2), Cb = (C1+C2)/2;
  const G = 0.5*(1-Math.sqrt(Cb**7/(Cb**7+25**7)));
  const ap1 = (1+G)*a1, ap2 = (1+G)*a2;
  const Cp1 = Math.hypot(ap1,b1), Cp2 = Math.hypot(ap2,b2);
  const hpf = (a,b) => { if (a===0&&b===0) return 0; const h = deg(Math.atan2(b,a)); return h<0?h+360:h; };
  const hp1 = hpf(ap1,b1), hp2 = hpf(ap2,b2);
  const dL = L2-L1, dC = Cp2-Cp1;
  let dh = 0;
  if (Cp1*Cp2 !== 0) { dh = hp2-hp1; if (dh>180) dh -= 360; else if (dh<-180) dh += 360; }
  const dH = 2*Math.sqrt(Cp1*Cp2)*Math.sin(rad(dh)/2);
  const Lb = (L1+L2)/2, Cpb = (Cp1+Cp2)/2;
  let hb;
  if (Cp1*Cp2 === 0) hb = hp1+hp2;
  else if (Math.abs(hp1-hp2) <= 180) hb = (hp1+hp2)/2;
  else hb = hp1+hp2 < 360 ? (hp1+hp2+360)/2 : (hp1+hp2-360)/2;
  const T = 1 - 0.17*Math.cos(rad(hb-30)) + 0.24*Math.cos(rad(2*hb)) + 0.32*Math.cos(rad(3*hb+6)) - 0.20*Math.cos(rad(4*hb-63));
  const dTheta = 30*Math.exp(-(((hb-275)/25)**2));
  const Rc = 2*Math.sqrt(Cpb**7/(Cpb**7+25**7));
  const SL = 1 + (0.015*(Lb-50)**2)/Math.sqrt(20+(Lb-50)**2);
  const SC = 1 + 0.045*Cpb, SH = 1 + 0.015*Cpb*T;
  const RT = -Math.sin(rad(2*dTheta))*Rc;
  return Math.sqrt((dL/SL)**2 + (dC/SC)**2 + (dH/SH)**2 + RT*(dC/SC)*(dH/SH));
}
const BRETTEL = {
  protan: { m1:[0.14980,1.19548,-0.34528,0.10764,0.84864,0.04372,0.00384,-0.00540,1.00156],
            m2:[0.14570,1.16172,-0.30742,0.10816,0.85291,0.03892,0.00386,-0.00524,1.00139], n:[0.00048,0.00393,-0.00441] },
  deutan: { m1:[0.36477,0.86381,-0.22858,0.26294,0.64245,0.09462,-0.02006,0.02728,0.99278],
            m2:[0.37298,0.88166,-0.25464,0.25954,0.63506,0.10540,-0.01980,0.02784,0.99196], n:[-0.00281,-0.00611,0.00892] },
  tritan: { m1:[1.01277,0.13548,-0.14826,-0.01243,0.86812,0.14431,0.07589,0.80500,0.11911],
            m2:[0.93678,0.18979,-0.12657,0.06154,0.81526,0.12320,-0.37562,1.12767,0.24796], n:[0.03901,-0.02788,-0.01113] },
};
function simulate(rgb, kind) {
  if (kind === 'normal') return rgb;
  const p = BRETTEL[kind], v = rgb.map(lin);
  const dot = v[0]*p.n[0] + v[1]*p.n[1] + v[2]*p.n[2];
  const m = dot >= 0 ? p.m1 : p.m2;
  return [0,1,2].map(i => m[i*3]*v[0] + m[i*3+1]*v[1] + m[i*3+2]*v[2]).map(unlin);
}

const kinds = ['normal','protan','deutan','tritan'];
const B = over(hex('#2b2438'), 0.95, hex('#ffffff'));   // worst-case fill
const GREY = '#a0a0a0', GREEN = '#78c850';
const sims = c => Object.fromEntries(kinds.map(k => [k, simulate(hex(c), k)]));
const dE = (sa, sb, k) => ciede2000(sa[k], sb[k]);
const gS = sims(GREY), grS = sims(GREEN);

// thresholds
const AA = 4.5, DE = 20;   // "above the teens" = out of the uncanny middle
const f2 = n => n.toFixed(2);
const row = c => '| ' + c.join(' | ') + ' |';
const sep = n => '|' + Array(n).fill('---').join('|') + '|';
const P = console.log;

P('### A. The two incumbent reds against grey `#a0a0a0`, all four conditions\n');
P(row(['red', 'role', ...kinds, 'worst', 'worst under']));
P(sep(kinds.length + 4));
for (const [c, role] of [['#e13d3d','gutter bad'], ['#f89890','law theirs']]) {
  const s = sims(c), ds = kinds.map(k => dE(s, gS, k));
  const w = Math.min(...ds);
  P(row(['`'+c+'`', role, ...ds.map(f2), f2(w), kinds[ds.indexOf(w)]]));
}
P('\nand against each other, and against gutter green:\n');
P(row(['pair', ...kinds, 'worst']));
P(sep(kinds.length + 2));
for (const [a,b,l] of [['#e13d3d','#f89890','the two reds'], ['#e13d3d','#78c850','gutter bad vs gutter green'], ['#f89890','#78c850','law theirs vs gutter green']]) {
  const sa = sims(a), sb = sims(b), ds = kinds.map(k => dE(sa, sb, k));
  P(row([l + ' `'+a+'` vs `'+b+'`', ...ds.map(f2), f2(Math.min(...ds))]));
}

// ---- the three axes ----
const axes = c => {
  const s = sims(c);
  return {
    aa: contrast(hex(c), B),
    greyP: dE(s, gS, 'protan'), greyD: dE(s, gS, 'deutan'),
    grnP: dE(s, grS, 'protan'), grnD: dE(s, grS, 'deutan'),
  };
};
const pf = (v, t) => v >= t ? 'pass' : '**FAIL**';
const allPass = a => a.aa >= AA && Math.min(a.greyP, a.greyD) >= DE && Math.min(a.grnP, a.grnD) >= DE;

const NAMED = [
  ['#e13d3d', 'Color.RED — gutter bad today'],
  ['#f89890', 'Color.PINK — law theirs today'],
  ['#f88880', 'SETTINGS_SELECTED'],
  ['#e70808', 'Color.RED2'],
  ['#d64b00', 'Color.REDORANGE'],
  ['#fb3041', 'HP-low atlas, light'],
  ['#922030', 'HP-low atlas, dark'],
  ['#d52929', 'ModifierTier.ROGUE'],
  ['#e64a18', 'Color.LUXURY'],
  ['#f83018', 'ShadowColor.BRIGHT_RED'],
];
P('\n### B. The named game reds on all three axes\n');
P(row(['candidate', 'what it is', 'contrast on fill', `AA ${AA}`, 'ΔE grey protan', 'ΔE grey deutan', `grey ≥${DE}`, 'ΔE green protan', 'ΔE green deutan', `green ≥${DE}`, 'all three']));
P(sep(11));
for (const [c, what] of NAMED) {
  const a = axes(c);
  P(row(['`'+c+'`', what, f2(a.aa), pf(a.aa, AA), f2(a.greyP), f2(a.greyD), pf(Math.min(a.greyP,a.greyD), DE),
    f2(a.grnP), f2(a.grnD), pf(Math.min(a.grnP,a.grnD), DE), allPass(a) ? '**PASS**' : '**fail**']));
}

// ---- whole game palette ----
const GAME = ('#006090 #0093ff #00a4ff #1c4e80 #2d5c74 #2db4ff #306850 #313874 #323d5b #352166 #3890f8 '
  + '#392725 #399cff #404040 #40c8f8 #415c5f #484848 #4aa500 #4bb400 #4e637c #4f6729 #52c200 #572d1e '
  + '#574f4a #5acee7 #5f442d #5f5010 #632929 #636363 #6363b5 #663878 #69402a #6b5a73 #6e672c #707070 '
  + '#735a4a #782155 #78c850 #7b63e7 #7bce52 #7c1818 #804618 #81a6be #9141cb #929292 #984038 #9cadf7 '
  + '#a0a060 #a0a0a0 #a55239 #a68e17 #ada594 #adbd21 #ae7a3b #b1b100 #bda55a #c07800 #ccbe00 #d0d0c8 '
  + '#d52929 #d64b00 #ded6b5 #e020c0 #e13d3d #e64a18 #e70808 #e8e8a8 #ebd773 #ef4179 #ef70ef #f75231 '
  + '#f7b18b #f83018 #f88880 #f89890 #f8b050 #f8d038 #f8f8f8 #fca2a2 #fe8e00 #ff5500 #ff7400 #ffbd73 '
  + '#ffc631 #ffffff').split(' ').concat(['#fb3041', '#922030']);
const winners = GAME.filter(c => allPass(axes(c)));
P(`\n### C. Every colour in the game's vocabulary that clears all three axes\n`);
if (!winners.length) {
  P('**None.** Not one of the ' + GAME.length + " colours the game defines (plus the two HP-low atlas samples) clears");
  P(`contrast ≥${AA} on the fill AND ΔE00 ≥${DE} from \`#a0a0a0\` AND ΔE00 ≥${DE} from \`#78c850\`, under both`);
  P('protanopia and deuteranopia.\n');
  // how close does the palette get?
  const scored = GAME.map(c => { const a = axes(c); return { c, a, slack: Math.min(a.aa/AA, Math.min(a.greyP,a.greyD)/DE, Math.min(a.grnP,a.grnD)/DE) }; })
    .sort((x, y) => y.slack - x.slack);
  P('The closest it gets, by the worst axis expressed as a fraction of its threshold:\n');
  P(row(['candidate', 'contrast', 'ΔE grey (p/d)', 'ΔE green (p/d)', 'worst axis', 'as % of threshold']));
  P(sep(6));
  for (const s of scored.slice(0, 8)) {
    const worst = [[s.a.aa/AA, 'contrast'], [Math.min(s.a.greyP,s.a.greyD)/DE, 'grey'], [Math.min(s.a.grnP,s.a.grnD)/DE, 'green']].sort((x,y)=>x[0]-y[0])[0];
    P(row(['`'+s.c+'`', f2(s.a.aa), `${f2(s.a.greyP)} / ${f2(s.a.greyD)}`, `${f2(s.a.grnP)} / ${f2(s.a.grnD)}`, worst[1], (worst[0]*100).toFixed(0) + '%']));
  }
} else {
  P(row(['candidate', 'contrast', 'ΔE grey (p/d)', 'ΔE green (p/d)']));
  P(sep(4));
  for (const c of winners) { const a = axes(c); P(row(['`'+c+'`', f2(a.aa), `${f2(a.greyP)} / ${f2(a.greyD)}`, `${f2(a.grnP)} / ${f2(a.grnD)}`])); }
}

// ---- synthetic sweep ----
P('\n### D. Sweeping all of sRGB — is the constraint satisfiable at all?\n');
const hue = ([r,g,b]) => { const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn; if (!d) return 0;
  let h; if (mx===r) h=((g-b)/d)%6; else if (mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; return h<0?h+360:h; };
// A hue only counts as a hue if the colour is actually chromatic: an achromatic
// value has hue 0 by convention, which would otherwise read as "red".
const chroma = c => { const r = hex(c); return Math.max(...r) - Math.min(...r); };
const isRed = c => chroma(c) >= 60 && (hue(hex(c)) >= 330 || hue(hex(c)) <= 25);
let best = null, bestRed = null;
for (let r = 0; r < 256; r += 8) for (let g = 0; g < 256; g += 8) for (let b = 0; b < 256; b += 8) {
  const c = toHex([r, g, b]);
  const a = axes(c);
  if (a.aa < AA) continue;
  const slack = Math.min(Math.min(a.greyP, a.greyD), Math.min(a.grnP, a.grnD));
  if (!best || slack > best.slack) best = { c, a, slack };
  if (isRed(c) && (!bestRed || slack > bestRed.slack)) bestRed = { c, a, slack };
}
P(row(['', 'value', 'contrast on fill', 'ΔE grey protan', 'ΔE grey deutan', 'ΔE green protan', 'ΔE green deutan', 'worst ΔE', 'all three']));
P(sep(9));
for (const [label, s] of [['best anywhere in sRGB', best], ['best in the red family (hue 330–25)', bestRed]]) {
  P(row([label, '`'+s.c+'`', f2(s.a.aa), f2(s.a.greyP), f2(s.a.greyD), f2(s.a.grnP), f2(s.a.grnD), f2(s.slack),
    allPass(s.a) ? '**PASS**' : '**fail**']));
}
P(`\n(8-step grid over all of sRGB, ${(32**3).toLocaleString()} candidates, filtered to those clearing AA ${AA} on the fill.)`);
// Is the red family satisfiable at all, and what is binding if not?
let redAA = null, redDE = null;
for (let r = 0; r < 256; r += 4) for (let g = 0; g < 256; g += 4) for (let b = 0; b < 256; b += 4) {
  const c = toHex([r, g, b]);
  if (!isRed(c)) continue;
  const a = axes(c);
  const de = Math.min(a.greyP, a.greyD, a.grnP, a.grnD);
  if (a.aa >= AA && (!redAA || de > redAA.de)) redAA = { c, a, de };      // best dE among reds clearing AA
  if (de >= DE && (!redDE || a.aa > redDE.a.aa)) redDE = { c, a, de };    // best contrast among reds clearing dE
}
P('\nInside the red family only (4-step grid, chroma >= 60, hue 330-25):\n');
P(row(['', 'value', 'contrast on fill', 'worst dE of the four', 'all three']));
P(sep(5));
P(row(['best separation among reds that clear AA', redAA ? '`'+redAA.c+'`' : '-', redAA ? f2(redAA.a.aa) : '-', redAA ? f2(redAA.de) : '-', redAA && allPass(redAA.a) ? '**PASS**' : '**fail**']));
P(row(['best contrast among reds that clear dE ' + DE, redDE ? '`'+redDE.c+'`' : '_none exists_', redDE ? f2(redDE.a.aa) : '-', redDE ? f2(redDE.de) : '-', redDE && allPass(redDE.a) ? '**PASS**' : '**fail**']));
P('\nThe incumbents for comparison:\n');
P(row(['', 'value', 'contrast on fill', 'ΔE grey protan', 'ΔE grey deutan', 'ΔE green protan', 'ΔE green deutan', 'worst ΔE']));
P(sep(8));
for (const c of ['#e13d3d', '#f89890']) {
  const a = axes(c);
  P(row([c === '#e13d3d' ? 'gutter bad today' : 'law theirs today', '`'+c+'`', f2(a.aa),
    f2(a.greyP), f2(a.greyD), f2(a.grnP), f2(a.grnD), f2(Math.min(a.greyP, a.greyD, a.grnP, a.grnD))]));
}
```
