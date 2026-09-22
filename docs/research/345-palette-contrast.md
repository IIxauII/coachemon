# Contrast and colour-vision-deficiency safety of the settled panel palette

Research for [#345](https://github.com/IIxauII/coachemon/issues/345), measuring the palette
[#337](https://github.com/IIxauII/coachemon/issues/337) settled. **Findings only.** Whether to change
an ink in response is a decision and belongs to its own ticket.

> **Fourth pass.** Two decisions since the third pass changed the ground under the measurement:
> **the panel fill is now opaque `#362d3e`** (the game's own window interior — the three-backdrop
> chase is gone, one number per ink), and **the gates in the `theirs` sweep are now ranked by
> prevalence rather than held equal** (protanopia/deuteranopia ~8% of males against tritanopia ~0.01%
> of people). Findings 1 and 4 are rewritten against those. Findings 2, 3, 5 and 6 are unaffected: a
> ΔE00 between two inks does not depend on what they are drawn on.
>
> The third pass's claim that a darker shadow might carry the contrast case is **withdrawn**. A 1px
> offset shadow covers down-and-right of a stroke; it never becomes the background, so it never
> changes a WCAG ratio. The ink-on-halo column below is reported for perceived legibility only.
>
> **Fifth pass** re-gates by element rather than by palette: WCAG 1.4.3's 4.5:1 governs a row's
> prose, but a gutter mark and a group frame are non-text under SC 1.4.11 and take **3:1**. Finding 6
> reports that; Findings 1 and 4 keep the 4.5:1 figures, which remain correct for prose and remain
> the binding role wherever an ink is text.
>
> The palette has moved four times while this note was being written. What is current:
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

The panel fill is opaque. **`#362d3e`** is the window interior sampled from `window_1..5`; a second
interior, **`#414141`** (`window_5`), is measured alongside it because a separate ticket is weighing
whether the panel should follow the player's chosen window skin. The single 1px offset shadow is
`#181818`.

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

## Finding 1 — contrast on the opaque fill, and what the opacity decision costs

The panel fill is now opaque `#362d3e` — the window interior sampled from `window_1..5`. The game's
own windows do not show the battle through them, and neither does ours, so the three-backdrop chase of
earlier passes is gone. **One number per ink.**

The decision is not free, and it is worth recording which way it cuts. `#362d3e` has relative luminance
0.0301 — almost exactly the old worst case (backdrop B, 0.0320) and far lighter than the shipped
`rgba(12,12,24,.88)` over a dark frame (0.0035). So **the opaque fill locks in what used to be the
worst case.** Nothing gets better; what was contingent on a bright game frame is now permanent.

What it buys instead: **the halo no longer inverts.** `#181818` is 3.29× darker than `#362d3e` and
5.79× darker than `#414141`, so on every interior it is a genuine darkening behind the glyph. The
inversion reported in the third pass — where the shipped fill over a dark frame was darker than the
shadow — cannot happen on an opaque fill.

| ink | on `#362d3e` | AA 4.5 | 3:1 floor | on halo `#181818` | AA on halo |
|---|---|---|---|---|---|
| law ours `#40c8f8` | 6.76 | pass | pass | 9.16 | pass |
| law theirs `#f89890` | 6.17 | pass | pass | 8.36 | pass |
| **law later `#e331c5`** | **3.44** | **FAIL** | pass | 4.66 | pass |
| law neither `#a0a0a0` | 5.01 | pass | pass | 6.79 | pass |
| gutter good `#78c850` | 6.35 | pass | pass | 8.60 | pass |
| **gutter bad `#e13d3d`** | **3.08** | **FAIL** | pass | **4.17** | **FAIL** |
| gutter neutral `#a0a0a0` | 5.01 | pass | pass | 6.79 | pass |
| **quoted weak-to `#4AA500`** | **4.17** | **FAIL** | pass | 5.64 | pass |
| quoted resisted `#FE8E00` | 5.67 | pass | pass | 7.68 | pass |
| **quoted immune `#929292`** | **4.21** | **FAIL** | pass | 5.71 | pass |
| chrome gold `#f8b050` | 7.07 | pass | pass | 9.57 | pass |
| body `#f8f8f8` | 12.34 | pass | pass | 16.72 | pass |

**Four inks fail AA on the opaque fill**: `later` 3.44, `gutter bad` 3.08, `weak-to` 4.17, `immune`
4.21. All four clear the 3:1 graphical floor. The set is unchanged from the translucent worst case,
because `#362d3e` and backdrop B are within 6% of each other in luminance.

**`gutter bad #e13d3d` is the one to watch, and the answer is plain: it fails.** 3.08 against the
fill, below AA, and **4.17 against the halo, below AA there too.** It is the only ink in the palette
that fails against both its background and its own shadow, and it now carries the heaviest mark load
in the gutter (`↯ ✗ ✦ ⚠`, and `▼` if the quotation reverts). Finding 5 establishes that no red in
sRGB fixes this while also holding apart from grey and green — so "it has to move" is correct, and
where it moves to is not a red.

The ink-on-halo column is reported separately and deliberately. **It is not a WCAG number.** A 1px
offset shadow covers down-and-right of a stroke; it does not surround the glyph and does not become
the background. The halo column says where perceived legibility is better than the conformance figure
suggests, nothing more.

### The second interior: `#414141`, and whether following the player's skin is free

| ink | on `#362d3e` | on `#414141` | verdict |
|---|---|---|---|
| law ours `#40c8f8` | 6.76 AA | 5.27 AA | same |
| law theirs `#f89890` | 6.17 AA | 4.81 AA | same |
| **law later `#e331c5`** | 3.44 floor | **2.68** | **floor → below floor** |
| **law neither `#a0a0a0`** | 5.01 AA | **3.90** | **AA → floor** |
| gutter good `#78c850` | 6.35 AA | 4.95 AA | same |
| **gutter bad `#e13d3d`** | 3.08 floor | **2.40** | **floor → below floor** |
| **gutter neutral `#a0a0a0`** | 5.01 AA | **3.90** | **AA → floor** |
| quoted weak-to `#4AA500` | 4.17 floor | 3.24 floor | same |
| **quoted resisted `#FE8E00`** | 5.67 AA | **4.42** | **AA → floor** |
| quoted immune `#929292` | 4.21 floor | 3.28 floor | same |
| chrome gold `#f8b050` | 7.07 AA | 5.50 AA | same |
| body `#f8f8f8` | 12.34 AA | 9.61 AA | same |

**Four distinct inks change verdict between the two interiors**, and none of them improves:

- `later #e331c5` and `gutter bad #e13d3d` fall **below the 3:1 floor** on `#414141` — 2.68 and 2.40.
  On `#362d3e` they merely fail AA; on `#414141` they fail everything.
- `neither / gutter neutral #a0a0a0` drops out of AA to 3.90. It is one value serving two columns, so
  the single change costs both.
- `quoted resisted #FE8E00` drops out of AA to 4.42.

`#414141` is 76% brighter than `#362d3e` (0.0529 against 0.0301), and every ink in the palette is
lighter than both, so every ratio falls. **For the ticket considering following the player's window
skin: the palette's verdicts are not stable across interiors, and that decision is therefore not
free.** A palette tuned on `#362d3e` loses two inks below the graphical floor and two more out of AA
on `#414141` alone — and `window_5` is one skin of five, not the extreme of the range.

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

## Finding 4 — candidate values for `theirs`, gates ranked by prevalence

Protanopia and deuteranopia affect roughly 8% of males; tritanopia roughly 0.01% of people. Weighting
them equally, as the third pass did, let a 0.01% condition veto candidates that an 8% condition
accepted. This pass ranks them.

**Hard gates** — disqualifying, evaluated under normal vision, protanopia and deuteranopia: the three
other inks in the **law column** (`neither`, `ours`, `later`), and **body `#f8f8f8`**, whose text
stream `theirs` shares. A failure inside one column has no shape to fall back on — the law is text ink
and a group frame — so these stay hard. Plus AA on `#362d3e`.

**Weighted considerations** — reported, not disqualifying: **chrome gold**, which differs from row text
by position, font and case as well as colour; **bad-news red**, which is a different column; and
**tritanopia on any gate**.

**The incumbent, scored the new way:**

| candidate | AA | vs neither | vs ours | vs later | vs body | hard min | hard gates | vs chrome | vs bad-news | worst tritan |
|---|---|---|---|---|---|---|---|---|---|---|
| `#f89890` | 6.17 | **9.63** | 30.06 | 31.05 | 21.37 | **9.63** | **fail** | 13.12 | 18.03 | 3.69 |

Re-weighting clarifies what is actually wrong with it. The third pass reported its worst gate as chrome
gold at 3.69 — but that is a **tritanopia-only** failure, and against chrome it scores 13.12 under the
conditions that carry prevalence. **Its real disqualifier is `neither #a0a0a0` at 9.63 under
protanopia** — inside one column, on a frame, at 8%.

**Candidates clearing AA and ΔE00 ≥ 20 on every hard gate under normal, protanopia and deuteranopia —
13 of 79 unspent game colours**, where equal weighting gave none:

| candidate | what it already is | AA | hard min | vs chrome | vs bad-news | worst tritan | worst vs quoted |
|---|---|---|---|---|---|---|---|
| `#ffc631` | `TypeColor.ELECTRIC` | 8.35 | **29.48** | 5.50 | 23.45 | 4.40 | 8.20 |
| `#ccbe00` | `Color.YELLOW` | 6.83 | 29.07 | 4.50 | 18.49 | 10.28 | **2.72** |
| `#f8d038` | `Color.ULTRA` | 8.78 | 29.01 | 5.94 | 24.19 | 7.05 | 9.15 |
| `#b1b100` | effectiveness 0×, defense side | 5.72 | 27.45 | 5.76 | 13.90 | 10.77 | **2.75** |
| `#adbd21` | `TypeColor.BUG` | 6.29 | 27.21 | 4.73 | 15.38 | 7.11 | **2.84** |
| `#fe8e00` | **the quoted resisted ½×** | 5.67 | 26.81 | 6.54 | 16.53 | 7.93 | **0.00** |
| `#ff7400` | **the quoted resisted ¼×** | 4.84 | 26.59 | **8.93** | 13.74 | 8.78 | **3.27** |
| `#52c200` | **the quoted super 8×** | 5.67 | 26.43 | 5.91 | 11.75 | 8.66 | 4.96 |
| `#4bb400` | **the quoted super 4×** | 4.89 | 25.93 | 6.34 | 8.13 | 11.49 | **3.83** |
| `#ebd773` | `ShadowColor.YELLOW` | 9.05 | 24.92 | 5.67 | 23.35 | **11.64** | **11.99** |
| `#7bce52` | `TypeColor.GRASS` | 6.74 | 24.06 | 3.63 | 15.00 | 9.78 | 7.85 |
| `#ffbd73` | `ShadowColor.LIGHT_ORANGE` | 7.98 | 24.01 | 4.47 | 21.10 | 3.30 | 10.94 |
| `#bda55a` | `TypeColor.ROCK` | 5.43 | 21.56 | 6.37 | 11.27 | 11.70 | 7.95 |

**What opened up, and what did not.** Demoting tritanopia and chrome from hard gates turns 0 candidates
into 13. But **none of the 13 clears the weighted gates as well** — and the reason is structural rather
than incidental:

> Every one of the 13 has a hue between **27° and 100°** — orange through yellow-green. The best chrome
> separation available anywhere in the set is **8.93** (`#ff7400`), squarely in the uncanny middle.

Under protanopia and deuteranopia the colour space collapses onto a single blue–yellow axis. The law
column already occupies the blue end (`ours #40c8f8`), more blue (`later #e331c5`, which red-green
deficiency renders blue), the neutral middle (`neither #a0a0a0`) and the white end (body `#f8f8f8`).
**The only position left on that axis is yellow — and yellow is where chrome gold lives.** So the
chrome collision is not a gate that some candidate avoids; it is the price of the only free seat.

**Ranked shortlist, with the trade named.** Four of the 13 are excluded outright because they *are*
inks the panel already spends in the gutter — `#fe8e00` is the quoted resisted ½× at ΔE00 **0.00**,
and `#ff7400`, `#52c200`, `#4bb400` are the other quoted tiers. Three more (`#ccbe00`, `#b1b100`,
`#adbd21`) sit under ΔE00 3 from the quoted resisted ink. That leaves:

| rank | candidate | the trade |
|---|---|---|
| 1 | **`#ebd773`** (`ShadowColor.YELLOW`) | Best balance in the set: hard min 24.92, the best tritan score (11.64) and the best separation from the quoted inks (11.99), at the highest contrast of any candidate (9.05). Pays 5.67 against chrome gold under red-green — the unavoidable price — and is a shadow colour in the game, so it carries no borrowed tier meaning. |
| 2 | **`#f8d038`** (`Color.ULTRA`) | Second-best hard margin (29.01) and strong against bad-news red (24.19). Costs the same borrowed-tier meaning #337 knowingly accepted for `later`: a player who knows the game reads it as *ultra tier* before *theirs*. Chrome 5.94, tritan 7.05. |
| 3 | **`#ffc631`** (`TypeColor.ELECTRIC`) | Best hard margin of all (29.48) and best against bad-news red (23.45). Trades that for the worst tritan score of the top three (4.40) and for being a type colour — it would read as an Electric badge's ink on a panel that draws type sprites. |
| 4 | **`#ffbd73`** (`ShadowColor.LIGHT_ORANGE`) | Good hard margin (24.01) and good separation from the quoted inks (10.94), but **the worst tritan score in the entire set at 3.30** — it trades the 0.01% case hardest of any candidate. |
| 5 | **`#bda55a`** (`TypeColor.ROCK`) | The best tritan score of any candidate (11.70), but the weakest hard margin (21.56, barely clearing) and the lowest contrast (5.43). Buys the rare condition by spending the common one. |

These are scores and trades, not a pick. **And the honest summary is that the re-weighting changes the
answer from "impossible" to "possible at a known price" rather than to "solved":** every route out
of the `theirs`/`neither` collision runs through chrome gold's territory, and the best available
separation from chrome is 8.93 — a number this note has called the uncanny middle throughout.

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


## Finding 6 — the gate is per-element, and it reopens less than it looks like

Every threshold up to this pass was WCAG 1.4.3's **4.5:1**, which governs *text*. Two of the three
things the palette's inks carry are not text:

| element | what it is under WCAG 2.2 | threshold |
|---|---|---|
| a row's prose | text — SC 1.4.3 Contrast (Minimum) | **4.5:1** |
| a gutter mark | graphical object conveying meaning — SC 1.4.11 Non-text Contrast | **3:1** |
| a group frame | visual information identifying a component's state — SC 1.4.11 | **3:1** |

Re-gating on that basis changes which inks are eligible for which job. It changes the *answers* much
less, and the reason is the useful part.

### Gutter bad as a mark: the relaxation reopens the wrong axis

Gates for a mark: contrast ≥ 3 on `#362d3e`, ΔE00 ≥ 20 from gutter green `#78c850` and from gutter
grey `#a0a0a0`, under normal vision, protanopia and deuteranopia.

**Ten colours clear. None of them is a red.**

| candidate | contrast | on `#414141` | ΔE vs green | ΔE vs grey |
|---|---|---|---|---|
| `#0093ff` | 4.13 | 3.22 | 55.78 | 26.44 |
| `#3890f8` | 4.07 | 3.17 | 55.07 | 26.12 |
| `#399cff` | 4.60 | 3.58 | 54.17 | 25.08 |
| `#00a4ff` | 4.84 | 3.77 | 53.62 | 24.27 |
| `#ffffff` | 13.11 | 10.21 | 28.99 | 22.91 |
| `#2db4ff` | 5.67 | 4.42 | 51.31 | 22.69 |
| `#f8f8f8` | 12.34 | 9.61 | 28.33 | 21.55 |
| `#9cadf7` | 6.08 | 4.73 | 47.95 | 21.31 |
| `#ef70ef` | 5.14 | 4.00 | 47.15 | 20.34 |
| `#40c8f8` | 6.76 | 5.27 | 46.95 | 20.22 |

Six blues, two whites, a lavender and a magenta. And the reason is exact:

| candidate | contrast | 3:1 | ΔE vs green | ΔE vs grey | why it fails |
|---|---|---|---|---|---|
| `#e13d3d` | 3.08 | **pass** | **13.56** | 24.21 | **green 13.56** |
| `#f83018` | 3.39 | **pass** | **11.91** | 27.60 | **green 11.91** |
| `#f75231` | 3.87 | **pass** | **8.45** | 25.47 | **green 8.45** |
| `#fb3041` | 3.50 | **pass** | **9.61** | 24.01 | **green 9.61** |
| `#e64a18` | 3.34 | **pass** | **12.60** | 27.35 | **green 12.60** |
| `#d64b00` | 3.04 | **pass** | **15.51** | 28.63 | **green 15.51** |
| `#e70808` | **2.77** | FAIL | **16.56** | 29.18 | contrast *and* green |
| `#d52929` | **2.61** | FAIL | **17.84** | 27.29 | contrast *and* green |
| `#922030` | **1.54** | FAIL | 35.83 | 34.26 | contrast 1.54 |

**The relaxation to 3:1 does exactly what was expected and it does not help.** Six reds that failed AA
now clear the contrast gate — `#e13d3d` at 3.08, `#f83018` at 3.39, `#f75231` at 3.87. But contrast
was never their only failure. **Every one of them fails the green gate**, and the green gate did not
move. The best red on that axis that also clears 3:1 is `#d64b00` at **15.51**, inside the uncanny
middle; `#922030` clears green at 35.83 and has contrast **1.54**.

This is the same squeeze Finding 5 established, now confirmed at the relaxed threshold: under
deuteranopia red and green both collapse onto the yellow axis, so a red must separate from `#78c850`
by *lightness* — and a red light enough to do that has stopped being saturated enough to stay far from
grey, while a red dark enough to stay saturated cannot clear even 3:1 on a fill of luminance 0.0301.
**Relaxing the text threshold reopened the axis that was not binding.**

### Gutter bad is still the ink most at risk, and 3:1 does not save it

`#e13d3d` clears 3:1 by **0.08** — 3.08 against a 3.00 floor — and **fails 3:1 on `#414141` at 2.40**.
So even its contrast pass holds only on one interior, and only barely. Its green separation is 13.56
under deuteranopia, against a gate of 20. **Plainly: even at 3:1, gutter red is not saved.** It is
still the ink most at risk in the palette, and the finding is now stronger rather than weaker, because
the relaxed gate removes the last explanation that was not about colour-vision.

### Law theirs: one value is unchanged, but a split is newly available

**As a single value, nothing changes.** `theirs` is a row's text ink as well as a frame, so the text
role binds at 4.5:1 and it never had the 3:1 option. The sweep returns the same **13 candidates,
0 of them red, hue 27°–100°** as Finding 4 — the yellow seat, for the reason given there.

**Split into its two roles, the picture opens.** A frame shares no text stream with body prose, so it
drops the body gate and takes 3:1; text keeps 4.5:1 but its ΔE-from-grey gate is weaker, because —
this note's own argument, applied in reverse — *a frame has no shape to fall back on and a line of
text has words beside it*.

- **As a frame** (3:1, law-mate gates, no body gate): **25 candidates, 6 of them red.**
- **As text** (4.5:1, law-mate and body gates, grey relaxed): **18 candidates, 3 of them red.**

| role | candidate | contrast | ΔE vs grey | ΔE vs ours | ΔE vs later | worst tritan |
|---|---|---|---|---|---|---|
| frame | `#d64b00` `Color.REDORANGE` | 3.04 | **28.63** | 53.91 | 43.09 | 4.65 |
| frame | `#ff5500` effectiveness ⅛× | 4.09 | **28.11** | 51.44 | 43.55 | 6.58 |
| frame | `#f83018` `ShadowColor.BRIGHT_RED` | 3.39 | **27.60** | 52.56 | 37.34 | 7.04 |
| frame | `#e64a18` `Color.LUXURY` | 3.34 | **27.35** | 51.80 | 39.91 | 4.09 |
| frame | `#f75231` `TypeColor.FIRE` | 3.87 | **25.47** | 48.00 | 36.90 | 5.24 |
| frame | `#fb3041` HP-low atlas | 3.50 | **24.01** | 46.06 | 29.71 | 6.81 |
| text | `#f7b18b` legacy PP-low shadow | 7.25 | 17.63 | 36.67 | 42.28 | — |
| text | `#f88880` `SETTINGS_SELECTED` | 5.51 | 10.89 | 32.54 | 30.12 | — |
| text | `#f89890` `Color.PINK` (incumbent) | 6.17 | 9.63 | 30.06 | 31.05 | — |

**The split solves the actual problem.** Every red frame candidate clears the grey gate at 24–29,
which is the collision that disqualified `theirs` in the first place — and it is precisely the frame,
the element with no shape, that gets the strong separation. The text half then buys contrast with a
weaker grey score, which is defensible because words sit beside it.

### But a split has to read as one ink, and only two pairs do

A split is only coherent if the two values read as **one ink in two weights** rather than as two
different claims. Scoring each frame/text pair by ΔE00 between them in normal vision:

| frame | text | frame contrast | frame ΔE grey | text contrast | text ΔE grey | ΔE between them | what they are |
|---|---|---|---|---|---|---|---|
| `#f75231` | `#f88880` | 3.87 | **25.47** | 5.51 | 10.89 | **14.33** | `TypeColor.FIRE` / `SETTINGS_SELECTED` |
| `#fb3041` | `#f88880` | 3.50 | **24.01** | 5.51 | 10.89 | **14.99** | HP-low atlas / `SETTINGS_SELECTED` |

**Two of the 18 red frame/text pairs read as one ink.** The rest are 18–26 ΔE apart, which is two
colours, not one in two weights.

And the honest caveat on both: **14.33 and 14.99 sit inside the band this note has called the uncanny
middle** — different enough to see, not different enough to mean. For every other pair in this
research that was a failure; here it is the goal, and the risk inverts with it. A reader who notices
that the frame and the text are not quite the same red may read it as the panel being inconsistent
rather than as one law in two weights. What mitigates it is the same thing that mitigates the
two-column rule: the two values never appear in the same role, so there is no place where a reader
sees them side by side answering the same question. That mitigation is an argument, not a measurement,
and it is the decision ticket's to weigh.

## Finding 7 — what each ink becomes

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

**Contrast, on the opaque fill `#362d3e`:** four inks fail AA — `later #e331c5` 3.44, `gutter bad
#e13d3d` 3.08, `weak-to #4AA500` 4.17, `immune #929292` 4.21 — all of them clearing the 3:1 floor. The
opaque decision locks in what used to be the worst case: `#362d3e` is within 6% of the old bright-frame
backdrop in luminance, so nothing improved and nothing is contingent any more. **`gutter bad #e13d3d`
fails against the halo too, at 4.17**, the only ink failing against both its background and its own
shadow — and Finding 5 shows no red fixes that. What the opacity buys is that the halo no longer
inverts: `#181818` is darker than every interior measured.

**On the second interior `#414141`, four distinct inks change verdict and none improves:** `later` and
`gutter bad` fall **below the 3:1 floor** (2.68 and 2.40), and `neither/gutter neutral #a0a0a0` and
`quoted resisted #FE8E00` drop out of AA (3.90 and 4.42). **The palette's verdicts are not stable
across window interiors, so following the player's skin is not free.**

**For `theirs`, ranking the gates by prevalence changes the answer from "impossible" to "possible at a
known price".** Equal weighting gave 0 candidates; ranking protanopia and deuteranopia above
tritanopia, and treating chrome gold as a weighted consideration rather than a hard gate, gives **13
of 79 unspent game colours**. But all 13 have hues between 27° and 100°, and the best chrome
separation in the set is **8.93** — because under red-green deficiency the space collapses to a
blue–yellow axis whose blue, neutral and white ends the law already occupies, leaving only yellow,
which is chrome's. Re-weighting also corrects what is wrong with the incumbent: `#f89890`'s 3.69
against chrome is **tritan-only** (13.12 under red-green), and its real disqualifier is **`neither
#a0a0a0` at 9.63 under protanopia**, inside one column, on a frame. Shortlist with trades in Finding 4.

**The red, both of it — and the per-element gate does not rescue it.** Re-gating a gutter mark and a
group frame to SC 1.4.11's 3:1 lets six reds clear contrast that failed AA, `#e13d3d` among them at
3.08. **None of them clears the green gate**, which did not move: `#e13d3d` 13.56, `#f83018` 11.91,
`#f75231` 8.45, and the best red that clears 3:1 is `#d64b00` at 15.51 against a gate of 20. The
relaxation reopened the axis that was not binding. `#e13d3d` also clears 3:1 by 0.08 on `#362d3e` and
**fails it outright on `#414141`** at 2.40. **Plainly: even at 3:1, gutter red is not saved**, and it
remains the ink most at risk in the palette.

**For `theirs`, a single value is unchanged — 13 candidates, none red, hue 27°–100°, because as a
row's text ink it never had the 3:1 option. Splitting it by role does open the reds**: as a frame
(3:1, no body gate) six reds clear, every one of them separated from grey by 24–29, which is exactly
the collision that disqualified `theirs` and exactly the element that has no shape to fall back on. As
text (4.5:1, grey relaxed because words sit beside it) three reds clear. **Only two of the 18 possible
pairs read as one ink in two weights**: `#f75231`/`#f88880` at ΔE00 14.33 and `#fb3041`/`#f88880` at
14.99 — both inside the band this note has called the uncanny middle, which here is the goal rather
than the failure, with the corresponding risk that a reader reads the difference as inconsistency.

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

Throwaway, no dependencies. This is the third-pass script. Its CVD tables — Findings 2, 3 and 6 —
are current, because a ΔE00 between two inks does not depend on what they are drawn on. **Its
contrast tables are superseded by Appendix C**, which measures the opaque fill.

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

## Appendix C: the opaque-fill and weighted-gate run

Throwaway, no dependencies. `node final.mjs` reproduces Findings 1 and 4.

```js
// Throwaway: opaque fill + prevalence-weighted gates (#345, final run).
// No dependencies. Run: node final.mjs

const hex = h => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = ([r,g,b]) => '#' + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
const lin = c => { const s = c/255; return s <= 0.04045 ? s/12.92 : ((s+0.055)/1.055)**2.4; };
const unlin = v => { const s = v <= 0.0031308 ? v*12.92 : 1.055*v**(1/2.4)-0.055; return s*255; };
const relLum = rgb => { const [r,g,b] = rgb.map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
const contrast = (a,b) => { const [x,y] = [relLum(a), relLum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };

const XYZ = rgb => { const [r,g,b] = rgb.map(lin); return [
  (0.4124564*r+0.3575761*g+0.1804375*b)*100, (0.2126729*r+0.7151522*g+0.0721750*b)*100, (0.0193339*r+0.1191920*g+0.9503041*b)*100]; };
const WP = [95.047, 100.000, 108.883];
const lab = rgb => { const f = t => t > 216/24389 ? Math.cbrt(t) : (841/108)*t + 4/29;
  const [x,y,z] = XYZ(rgb).map((v,i)=>f(v/WP[i])); return [116*y-16, 500*(x-y), 200*(y-z)]; };
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

/* ---------- the palette ---------- */
const FILL = '#362d3e';      // window_1..5 interior, the new opaque panel fill
const FILL5 = '#414141';     // window_5 interior, for the skin-following question
const HALO = '#181818';      // the single 1px offset shadow
const AA = 4.5, FLOOR = 3.0, DE = 20;

const INK = {
  'law ours #40c8f8': '#40c8f8',
  'law theirs #f89890': '#f89890',
  'law later #e331c5': '#e331c5',
  'law neither #a0a0a0': '#a0a0a0',
  'gutter good #78c850': '#78c850',
  'gutter bad #e13d3d': '#e13d3d',
  'gutter neutral #a0a0a0': '#a0a0a0',
  'quoted weak-to #4AA500': '#4AA500',
  'quoted resisted #FE8E00': '#FE8E00',
  'quoted immune #929292': '#929292',
  'chrome gold #f8b050': '#f8b050',
  'body #f8f8f8': '#f8f8f8',
};
const kinds = ['normal','protan','deutan','tritan'];
const RG = ['normal','protan','deutan'];        // the conditions that carry prevalence
const sims = c => Object.fromEntries(kinds.map(k => [k, simulate(hex(c), k)]));
const cache = new Map();
const S = c => { if (!cache.has(c)) cache.set(c, sims(c)); return cache.get(c); };
const dE = (a, b, k) => ciede2000(S(a)[k], S(b)[k]);
const worstOver = (a, b, ks) => Math.min(...ks.map(k => dE(a, b, k)));

const f2 = n => n.toFixed(2);
const row = c => '| ' + c.join(' | ') + ' |';
const sep = n => '|' + Array(n).fill('---').join('|') + '|';
const P = console.log;
const pf = (v,t) => v >= t ? 'pass' : '**FAIL**';

P('### 1. The two opaque fills, and the halo against them\n');
P(row(['', 'colour', 'relative luminance', 'halo `#181818` vs it']));
P(sep(4));
P(row(['halo', '`'+HALO+'`', relLum(hex(HALO)).toFixed(4), '—']));
for (const [l, f] of [['new panel fill (window_1..5)', FILL], ['window_5 interior', FILL5]]) {
  P(row([l, '`'+f+'`', relLum(hex(f)).toFixed(4),
    relLum(hex(HALO)) < relLum(hex(f)) ? `darker by ${f2(relLum(hex(f))/relLum(hex(HALO)))}x` : '**LIGHTER — inverts**']));
}
P('\nfor comparison, the backdrops this replaces:\n');
P(row(['old backdrop', 'composited', 'relative luminance']));
P(sep(3));
for (const [l, c, a, bk] of [['A prototype over black','#2b2438',0.95,'#000000'], ['B prototype over white','#2b2438',0.95,'#ffffff'],
                              ['C shipped over black','#0c0c18',0.88,'#000000'], ['D shipped over white','#0c0c18',0.88,'#ffffff']]) {
  const v = hex(c).map((x,i) => x*a + hex(bk)[i]*(1-a));
  P(row([l, '`'+toHex(v)+'`', relLum(v).toFixed(4)]));
}

P('\n### 2. Contrast on the opaque fill — one number per ink\n');
P(row(['ink', `on \`${FILL}\``, `AA ${AA}`, `${FLOOR}:1 floor`, `on \`${FILL5}\``, `AA on ${FILL5}`, `${FLOOR}:1 on ${FILL5}`, 'verdict differs?', `on halo \`${HALO}\``, 'AA on halo']));
P(sep(10));
const differ = [];
for (const [name, h] of Object.entries(INK)) {
  const c1 = contrast(hex(h), hex(FILL)), c2 = contrast(hex(h), hex(FILL5)), ch = contrast(hex(h), hex(HALO));
  const v1 = c1 >= AA ? 'AA' : c1 >= FLOOR ? 'floor' : 'below floor';
  const v2 = c2 >= AA ? 'AA' : c2 >= FLOOR ? 'floor' : 'below floor';
  if (v1 !== v2) differ.push([name, v1, v2, c1, c2]);
  P(row([name, f2(c1), pf(c1,AA), pf(c1,FLOOR), f2(c2), pf(c2,AA), pf(c2,FLOOR),
    v1 === v2 ? 'no' : `**yes — ${v1} → ${v2}**`, f2(ch), pf(ch,AA)]));
}
P('\n**Inks whose verdict differs between the two interiors:** ' +
  (differ.length ? differ.map(d => `\`${d[0]}\` (${d[1]} → ${d[2]}, ${f2(d[3])} → ${f2(d[4])})`).join('; ') : '_none_'));

P('\n### 3. The `theirs` sweep, gates ranked by prevalence x consequence\n');
// HARD: inside the law column, and against the body ink it shares a text stream with,
// under normal/protan/deutan -- the conditions that carry real prevalence.
// SOFT: tritanopia on any gate (~0.01%), and chrome gold, which also differs by
// position, font and case.
const HARD = { 'neither #a0a0a0': '#a0a0a0', 'ours #40c8f8': '#40c8f8', 'later #e331c5': '#e331c5', 'body #f8f8f8': '#f8f8f8' };
const SOFT = { 'chrome #f8b050': '#f8b050', 'bad-news #e13d3d': '#e13d3d' };
const GAME = ('#006090 #0093ff #00a4ff #1c4e80 #2d5c74 #2db4ff #306850 #313874 #323d5b #352166 #3890f8 '
  + '#392725 #399cff #404040 #40c8f8 #415c5f #484848 #4aa500 #4bb400 #4e637c #4f6729 #52c200 #572d1e '
  + '#574f4a #5acee7 #5f442d #5f5010 #632929 #636363 #6363b5 #663878 #69402a #6b5a73 #6e672c #707070 '
  + '#735a4a #782155 #78c850 #7b63e7 #7bce52 #7c1818 #804618 #81a6be #9141cb #929292 #984038 #9cadf7 '
  + '#a0a060 #a0a0a0 #a55239 #a68e17 #ada594 #adbd21 #ae7a3b #b1b100 #bda55a #c07800 #ccbe00 #d0d0c8 '
  + '#d52929 #d64b00 #ded6b5 #e020c0 #e13d3d #e64a18 #e70808 #e8e8a8 #ebd773 #ef4179 #ef70ef #f75231 '
  + '#f7b18b #f83018 #f88880 #f89890 #f8b050 #f8d038 #f8f8f8 #fca2a2 #fe8e00 #ff5500 #ff7400 #ffbd73 '
  + '#ffc631 #ffffff').split(' ');
const score = c => {
  const hardE = Object.fromEntries(Object.entries(HARD).map(([k,v]) => [k, worstOver(c, v, RG)]));
  const softE = Object.fromEntries(Object.entries(SOFT).map(([k,v]) => [k, worstOver(c, v, RG)]));
  const tritE = Object.fromEntries([...Object.entries(HARD), ...Object.entries(SOFT)].map(([k,v]) => [k, dE(c, v, 'tritan')]));
  return { c, aa: contrast(hex(c), hex(FILL)), hardE, softE, tritE,
    hardMin: Math.min(...Object.values(hardE)), softMin: Math.min(...Object.values(softE)),
    tritMin: Math.min(...Object.values(tritE)) };
};
const taken = new Set(['#a0a0a0','#40c8f8','#e331c5','#f8f8f8','#e13d3d','#78c850','#f8b050']);
const all = GAME.filter(c => !taken.has(c)).map(score);
const inc = score('#f89890');
P('**The incumbent**, scored the new way:\n');
P(row(['candidate', 'AA on fill', ...Object.keys(HARD).map(k=>'vs '+k), 'hard min (n/p/d)', 'hard gates', ...Object.keys(SOFT).map(k=>'vs '+k), 'worst tritan']));
P(sep(Object.keys(HARD).length + Object.keys(SOFT).length + 4));
const line = s => row(['`'+s.c+'`', f2(s.aa), ...Object.keys(HARD).map(k=>f2(s.hardE[k])), f2(s.hardMin),
  (s.aa>=AA && s.hardMin>=DE) ? '**PASS**' : '**fail**', ...Object.keys(SOFT).map(k=>f2(s.softE[k])), f2(s.tritMin)]);
P(line(inc));
const pass = all.filter(s => s.aa >= AA && s.hardMin >= DE).sort((a,b) => b.hardMin - a.hardMin);
P(`\n**Candidates clearing AA on \`${FILL}\` and ΔE00 ≥ ${DE} on every HARD gate under normal, protanopia and deuteranopia:**\n`);
if (!pass.length) P('_none_\n');
else { P(row(['candidate', 'AA on fill', ...Object.keys(HARD).map(k=>'vs '+k), 'hard min (n/p/d)', 'hard gates', ...Object.keys(SOFT).map(k=>'vs '+k), 'worst tritan']));
  P(sep(Object.keys(HARD).length + Object.keys(SOFT).length + 4));
  for (const s of pass) P(line(s)); }
P(`\n${pass.length} of ${all.length} unspent game colours clear the hard gates.`);
const bothHardAndSoft = pass.filter(s => s.softMin >= DE);
P(`of those, clearing the soft gates too (still under normal/protan/deutan): ${bothHardAndSoft.length}` +
  (bothHardAndSoft.length ? ' — ' + bothHardAndSoft.map(s=>'`'+s.c+'`').join(' ') : ''));
const alsoTritan = pass.filter(s => s.tritMin >= DE);
P(`of those, also clearing every gate under tritanopia: ${alsoTritan.length}` +
  (alsoTritan.length ? ' — ' + alsoTritan.map(s=>'`'+s.c+'`').join(' ') : ' — none'));
P('\nwhat the equal-weight run reported, for comparison: 0 candidates cleared all six gates in all four conditions.');
// What each shortlisted candidate already is in the game, and whether it collides with
// an ink the panel spends elsewhere (the quoted effectiveness inks).
const WHAT = {
  '#ffc631':'TypeColor.ELECTRIC', '#ccbe00':'Color.YELLOW', '#f8d038':'Color.ULTRA',
  '#b1b100':'effectiveness 0x, defense side', '#adbd21':'TypeColor.BUG', '#fe8e00':'**quoted resisted 1/2x**',
  '#ff7400':'**quoted resisted 1/4x**', '#52c200':'**quoted super 8x**', '#4bb400':'**quoted super 4x**',
  '#ebd773':'ShadowColor.YELLOW', '#7bce52':'TypeColor.GRASS', '#ffbd73':'ShadowColor.LIGHT_ORANGE',
  '#bda55a':'TypeColor.ROCK',
};
const QUOTED = { 'weak-to #4AA500':'#4AA500', 'resisted #FE8E00':'#FE8E00', 'immune #929292':'#929292' };
P('\n**What each is already, and how it sits against the quoted gutter inks** (worst of normal/protan/deutan):\n');
P(row(['candidate', 'what it already is in the game', ...Object.keys(QUOTED).map(k=>'vs '+k), 'worst quoted', 'best chrome sep']));
P(sep(Object.keys(QUOTED).length + 4));
for (const s of pass) {
  const q = Object.values(QUOTED).map(v => worstOver(s.c, v, RG));
  P(row(['`'+s.c+'`', WHAT[s.c] || '-', ...q.map(f2), f2(Math.min(...q)), f2(s.softE['chrome #f8b050'])]));
}
P('\nbest chrome separation available among the ' + pass.length + ' hard-gate passers: '
  + f2(Math.max(...pass.map(s => s.softE['chrome #f8b050'])))
  + ' (`' + pass.slice().sort((a,b)=>b.softE['chrome #f8b050']-a.softE['chrome #f8b050'])[0].c + '`)');
// Why they are all yellows: what survives on the blue-yellow axis under red-green loss.
P('\n**Hue of every hard-gate passer** (normal vision), to show what the constraint selects:\n');
const hue = ([r,g,b]) => { const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn; if(!d) return 0;
  let h; if(mx===r) h=((g-b)/d)%6; else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; return h<0?h+360:h; };
P(pass.map(s => '`'+s.c+'` ' + hue(hex(s.c)).toFixed(0) + '°').join(' · '));
P('\nall ' + pass.length + ' fall between ' + Math.min(...pass.map(s=>hue(hex(s.c)))).toFixed(0)
  + '° and ' + Math.max(...pass.map(s=>hue(hex(s.c)))).toFixed(0) + '° — orange through yellow-green.');

```

## Appendix D: the per-element re-gate

Throwaway, no dependencies. `node regate.mjs` reproduces Finding 6.

```js
// Throwaway: per-element gates (#345, fifth pass).
// Text 4.5:1 (SC 1.4.3); gutter marks and group frames 3:1 (SC 1.4.11).
// No dependencies. Run: node regate.mjs

const hex = h => { const n = parseInt(h.replace('#',''),16); return [n>>16&255, n>>8&255, n&255]; };
const lin = c => { const s = c/255; return s <= 0.04045 ? s/12.92 : ((s+0.055)/1.055)**2.4; };
const unlin = v => { const s = v <= 0.0031308 ? v*12.92 : 1.055*v**(1/2.4)-0.055; return s*255; };
const relLum = rgb => { const [r,g,b] = rgb.map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
const contrast = (a,b) => { const [x,y] = [relLum(a),relLum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
const XYZ = rgb => { const [r,g,b] = rgb.map(lin); return [
  (0.4124564*r+0.3575761*g+0.1804375*b)*100,(0.2126729*r+0.7151522*g+0.0721750*b)*100,(0.0193339*r+0.1191920*g+0.9503041*b)*100]; };
const WP = [95.047,100.000,108.883];
const lab = rgb => { const f = t => t > 216/24389 ? Math.cbrt(t) : (841/108)*t + 4/29;
  const [x,y,z] = XYZ(rgb).map((v,i)=>f(v/WP[i])); return [116*y-16, 500*(x-y), 200*(y-z)]; };
const deg = r=>r*180/Math.PI, rad = d=>d*Math.PI/180;
function ciede2000(rgb1, rgb2) {
  const [L1,a1,b1]=lab(rgb1), [L2,a2,b2]=lab(rgb2);
  const C1=Math.hypot(a1,b1), C2=Math.hypot(a2,b2), Cb=(C1+C2)/2;
  const G=0.5*(1-Math.sqrt(Cb**7/(Cb**7+25**7)));
  const ap1=(1+G)*a1, ap2=(1+G)*a2;
  const Cp1=Math.hypot(ap1,b1), Cp2=Math.hypot(ap2,b2);
  const hpf=(a,b)=>{ if(a===0&&b===0) return 0; const h=deg(Math.atan2(b,a)); return h<0?h+360:h; };
  const hp1=hpf(ap1,b1), hp2=hpf(ap2,b2);
  const dL=L2-L1, dC=Cp2-Cp1;
  let dh=0; if (Cp1*Cp2!==0){ dh=hp2-hp1; if(dh>180)dh-=360; else if(dh<-180)dh+=360; }
  const dH=2*Math.sqrt(Cp1*Cp2)*Math.sin(rad(dh)/2);
  const Lb=(L1+L2)/2, Cpb=(Cp1+Cp2)/2;
  let hb;
  if (Cp1*Cp2===0) hb=hp1+hp2;
  else if (Math.abs(hp1-hp2)<=180) hb=(hp1+hp2)/2;
  else hb = hp1+hp2<360 ? (hp1+hp2+360)/2 : (hp1+hp2-360)/2;
  const T=1-0.17*Math.cos(rad(hb-30))+0.24*Math.cos(rad(2*hb))+0.32*Math.cos(rad(3*hb+6))-0.20*Math.cos(rad(4*hb-63));
  const dTheta=30*Math.exp(-(((hb-275)/25)**2));
  const Rc=2*Math.sqrt(Cpb**7/(Cpb**7+25**7));
  const SL=1+(0.015*(Lb-50)**2)/Math.sqrt(20+(Lb-50)**2);
  const SC=1+0.045*Cpb, SH=1+0.015*Cpb*T;
  const RT=-Math.sin(rad(2*dTheta))*Rc;
  return Math.sqrt((dL/SL)**2+(dC/SC)**2+(dH/SH)**2+RT*(dC/SC)*(dH/SH));
}
const BRETTEL = {
  protan:{m1:[0.14980,1.19548,-0.34528,0.10764,0.84864,0.04372,0.00384,-0.00540,1.00156],
          m2:[0.14570,1.16172,-0.30742,0.10816,0.85291,0.03892,0.00386,-0.00524,1.00139],n:[0.00048,0.00393,-0.00441]},
  deutan:{m1:[0.36477,0.86381,-0.22858,0.26294,0.64245,0.09462,-0.02006,0.02728,0.99278],
          m2:[0.37298,0.88166,-0.25464,0.25954,0.63506,0.10540,-0.01980,0.02784,0.99196],n:[-0.00281,-0.00611,0.00892]},
  tritan:{m1:[1.01277,0.13548,-0.14826,-0.01243,0.86812,0.14431,0.07589,0.80500,0.11911],
          m2:[0.93678,0.18979,-0.12657,0.06154,0.81526,0.12320,-0.37562,1.12767,0.24796],n:[0.03901,-0.02788,-0.01113]},
};
function simulate(rgb, kind) {
  if (kind === 'normal') return rgb;
  const p = BRETTEL[kind], v = rgb.map(lin);
  const dot = v[0]*p.n[0]+v[1]*p.n[1]+v[2]*p.n[2];
  const m = dot >= 0 ? p.m1 : p.m2;
  return [0,1,2].map(i=>m[i*3]*v[0]+m[i*3+1]*v[1]+m[i*3+2]*v[2]).map(unlin);
}

/* ---------- setup ---------- */
const FILL = '#362d3e', FILL5 = '#414141';
const TEXT = 4.5, NONTEXT = 3.0, DE = 20;
const kinds = ['normal','protan','deutan','tritan'];
const RG = ['normal','protan','deutan'];
const cache = new Map();
const S = c => { if(!cache.has(c)) cache.set(c, Object.fromEntries(kinds.map(k=>[k,simulate(hex(c),k)]))); return cache.get(c); };
const dE = (a,b,k) => ciede2000(S(a)[k], S(b)[k]);
const w = (a,b,ks=RG) => Math.min(...ks.map(k=>dE(a,b,k)));
const C = (c, f=FILL) => contrast(hex(c), hex(f));
const hue = ([r,g,b]) => { const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn; if(!d) return 0;
  let h; if(mx===r)h=((g-b)/d)%6; else if(mx===g)h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; return h<0?h+360:h; };
const chroma = c => { const r=hex(c); return Math.max(...r)-Math.min(...r); };
const isRed = c => chroma(c) >= 60 && (hue(hex(c)) >= 330 || hue(hex(c)) <= 25);

const GAME = ('#006090 #0093ff #00a4ff #1c4e80 #2d5c74 #2db4ff #306850 #313874 #323d5b #352166 #3890f8 '
  + '#392725 #399cff #404040 #40c8f8 #415c5f #484848 #4aa500 #4bb400 #4e637c #4f6729 #52c200 #572d1e '
  + '#574f4a #5acee7 #5f442d #5f5010 #632929 #636363 #6363b5 #663878 #69402a #6b5a73 #6e672c #707070 '
  + '#735a4a #782155 #78c850 #7b63e7 #7bce52 #7c1818 #804618 #81a6be #9141cb #929292 #984038 #9cadf7 '
  + '#a0a060 #a0a0a0 #a55239 #a68e17 #ada594 #adbd21 #ae7a3b #b1b100 #bda55a #c07800 #ccbe00 #d0d0c8 '
  + '#d52929 #d64b00 #ded6b5 #e020c0 #e13d3d #e64a18 #e70808 #e8e8a8 #ebd773 #ef4179 #ef70ef #f75231 '
  + '#f7b18b #f83018 #f88880 #f89890 #f8b050 #f8d038 #f8f8f8 #fca2a2 #fe8e00 #ff5500 #ff7400 #ffbd73 '
  + '#ffc631 #ffffff').split(' ').concat(['#fb3041','#922030']);

const f2 = n => n.toFixed(2);
const row = c => '| ' + c.join(' | ') + ' |';
const sep = n => '|' + Array(n).fill('---').join('|') + '|';
const P = console.log;
const pf = (v,t) => v >= t ? 'pass' : '**FAIL**';

P('### 1. The gate, per element\n');
P(row(['element','what it is under WCAG 2.2','threshold']));
P(sep(3));
P(row(["a row's prose",'text — SC 1.4.3 Contrast (Minimum)','**4.5:1**']));
P(row(['a gutter mark','graphical object conveying meaning — SC 1.4.11 Non-text Contrast','**3:1**']));
P(row(['a group frame',"visual information identifying a component's state — SC 1.4.11",'**3:1**']));

/* ---- 1. gutter bad, re-gated as a MARK ---- */
P('\n### 2. Gutter bad, gated as a mark (3:1)\n');
P('Gates: contrast >= 3 on `' + FILL + '`, dE00 >= ' + DE + ' from `#78c850` and `#a0a0a0`, under normal/protan/deutan.\n');
const markPass = GAME.filter(c => C(c) >= NONTEXT && w(c,'#78c850') >= DE && w(c,'#a0a0a0') >= DE);
P(row(['candidate','red?','contrast on fill','3:1','on `'+FILL5+'`','3:1 there','dE vs green (n/p/d)','dE vs grey (n/p/d)','worst tritan of the two']));
P(sep(9));
for (const c of markPass.sort((a,b)=>Math.min(w(b,'#78c850'),w(b,'#a0a0a0'))-Math.min(w(a,'#78c850'),w(a,'#a0a0a0')))) {
  P(row(['`'+c+'`', isRed(c)?'**red**':'-', f2(C(c)), pf(C(c),NONTEXT), f2(C(c,FILL5)), pf(C(c,FILL5),NONTEXT),
    f2(w(c,'#78c850')), f2(w(c,'#a0a0a0')), f2(Math.min(dE(c,'#78c850','tritan'), dE(c,'#a0a0a0','tritan')))]));
}
P(`\n${markPass.length} clear the mark gates, of which ${markPass.filter(isRed).length} are reds.`);
P('\nthe incumbent and the near misses, for reference:\n');
P(row(['candidate','contrast on fill','3:1','dE vs green','dE vs grey','why it fails, if it does']));
P(sep(6));
for (const c of ['#e13d3d','#f83018','#e70808','#d52929','#f75231','#fb3041','#d64b00','#e64a18','#922030']) {
  const why = [];
  if (C(c) < NONTEXT) why.push('contrast ' + f2(C(c)));
  if (w(c,'#78c850') < DE) why.push('green ' + f2(w(c,'#78c850')));
  if (w(c,'#a0a0a0') < DE) why.push('grey ' + f2(w(c,'#a0a0a0')));
  P(row(['`'+c+'`', f2(C(c)), pf(C(c),NONTEXT), f2(w(c,'#78c850')), f2(w(c,'#a0a0a0')), why.length ? why.join(', ') : '**clears**']));
}

/* ---- 2. theirs: single value vs split ---- */
P('\n### 3. Law theirs — one value, or a split?\n');
const LAWMATES = { 'neither #a0a0a0':'#a0a0a0', 'ours #40c8f8':'#40c8f8', 'later #e331c5':'#e331c5' };
const BODY = '#f8f8f8';
const taken = new Set(['#a0a0a0','#40c8f8','#e331c5','#f8f8f8','#e13d3d','#78c850','#f8b050']);
const pool = GAME.filter(c => !taken.has(c));
// single value: text role binds at 4.5, and every law gate plus body at DE
const single = pool.filter(c => C(c) >= TEXT && Object.values(LAWMATES).every(v => w(c,v) >= DE) && w(c,BODY) >= DE);
P('**As a single value** the text role binds at 4.5:1, and every law gate plus body applies.\n');
P(`Candidates: **${single.length}** — ${single.length ? single.map(c=>'`'+c+'`').join(' ') : '_none_'}`);
P(`Of those, reds: **${single.filter(isRed).length}**. Hue range: ` +
  (single.length ? Math.min(...single.map(c=>hue(hex(c)))).toFixed(0)+'-'+Math.max(...single.map(c=>hue(hex(c)))).toFixed(0)+' deg' : 'n/a'));
P('\nThis is unchanged by the re-gating: as text, `theirs` never had the 3:1 option.\n');

// frame role: 3:1, no body gate (a frame shares no text stream), law mates still apply
const frame = pool.filter(c => C(c) >= NONTEXT && Object.values(LAWMATES).every(v => w(c,v) >= DE));
// text role: 4.5:1, law mates + body, but grey relaxed (words sit beside it) -- report grey achieved
const text = pool.filter(c => C(c) >= TEXT && w(c,'#40c8f8') >= DE && w(c,'#e331c5') >= DE && w(c,BODY) >= DE);
P(`**As a frame** (3:1, no body gate — a frame shares no text stream): **${frame.length}** candidates, of which **${frame.filter(isRed).length}** are reds.`);
P(`**As text** (4.5:1, grey gate relaxed because words sit beside it): **${text.length}** candidates, of which **${text.filter(isRed).length}** are reds.\n`);
P('the frame candidates that are reds:\n');
P(row(['candidate','contrast on fill','3:1','dE vs grey','dE vs ours','dE vs later','worst tritan']));
P(sep(7));
for (const c of frame.filter(isRed).sort((a,b)=>w(b,'#a0a0a0')-w(a,'#a0a0a0'))) {
  P(row(['`'+c+'`', f2(C(c)), pf(C(c),NONTEXT), f2(w(c,'#a0a0a0')), f2(w(c,'#40c8f8')), f2(w(c,'#e331c5')),
    f2(Math.min(...Object.values(LAWMATES).map(v=>dE(c,v,'tritan'))))]));
}
P('\nthe text candidates that are reds, with the grey separation each actually achieves:\n');
P(row(['candidate','contrast on fill','4.5:1','dE vs grey (n/p/d)','grey >= '+DE+'?','dE vs ours','dE vs later','dE vs body']));
P(sep(8));
for (const c of text.filter(isRed).sort((a,b)=>w(b,'#a0a0a0')-w(a,'#a0a0a0'))) {
  P(row(['`'+c+'`', f2(C(c)), pf(C(c),TEXT), f2(w(c,'#a0a0a0')), pf(w(c,'#a0a0a0'),DE), f2(w(c,'#40c8f8')), f2(w(c,'#e331c5')), f2(w(c,BODY))]));
}

/* ---- 3. the best split pair ---- */
P('\n### 4. The best split pair\n');
P('A split only works if the two values read as **one ink in two weights**. So alongside the gates,');
P('the pair itself is scored: dE00 between frame and text value in normal vision, small is good.\n');
const pairs = [];
for (const fr of frame.filter(isRed)) for (const tx of text.filter(isRed)) {
  if (fr === tx) continue;
  pairs.push({ fr, tx, sameInk: dE(fr,tx,'normal'), frGrey: w(fr,'#a0a0a0'), txGrey: w(tx,'#a0a0a0'),
    frC: C(fr), txC: C(tx) });
}
pairs.sort((a,b) => (b.frGrey - a.frGrey) || (a.sameInk - b.sameInk));
P(row(['frame value','text value','frame contrast','text contrast','frame dE vs grey','text dE vs grey','dE between the two (normal)','reads as one ink?']));
P(sep(8));
for (const p of pairs.slice(0, 12)) {
  P(row(['`'+p.fr+'`','`'+p.tx+'`', f2(p.frC), f2(p.txC), f2(p.frGrey), f2(p.txGrey), f2(p.sameInk),
    p.sameInk < 15 ? 'yes' : p.sameInk < 25 ? 'marginal' : '**no — two inks**']));
}
P(`\n${pairs.length} red frame/text pairs in total; top 12 by frame grey-separation shown.`);
const coherent = pairs.filter(p => p.sameInk < 15);
P('\n**The pairs that read as one ink** (dE00 < 15 in normal vision) — the only splits that are');
P('visually coherent:\n');
P(row(['frame','text','frame contrast','frame dE grey','text contrast','text dE grey','dE between them','what they are']));
P(sep(8));
const WHAT2 = { '#f75231':'TypeColor.FIRE', '#f88880':'SETTINGS_SELECTED', '#f89890':'Color.PINK (the incumbent)',
  '#f7b18b':'MOVE_PP_NEAR_EMPTY shadow, legacy', '#fb3041':'HP-low atlas', '#d64b00':'Color.REDORANGE',
  '#ff5500':'effectiveness 1/8x', '#f83018':'ShadowColor.BRIGHT_RED', '#e64a18':'Color.LUXURY' };
for (const p of coherent) {
  P(row(['`'+p.fr+'`','`'+p.tx+'`', f2(p.frC), f2(p.frGrey), f2(p.txC), f2(p.txGrey), f2(p.sameInk),
    (WHAT2[p.fr]||'?') + ' / ' + (WHAT2[p.tx]||'?')]));
}

P(`pairs that also read as one ink (dE < 15 in normal vision): **${coherent.length}**` +
  (coherent.length ? ' — best is `' + coherent[0].fr + '` / `' + coherent[0].tx + '` at dE ' + f2(coherent[0].sameInk) : ''));
```
