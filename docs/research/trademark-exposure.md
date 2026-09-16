# Trademark exposure for a public listing

Research for [#104](https://github.com/IIxauII/pokerogue-mcp/issues/104), a child of map [#98 "Map: HUD as a browser extension"](https://github.com/IIxauII/pokerogue-mcp/issues/98). Feeds the name decision in [#105](https://github.com/IIxauII/pokerogue-mcp/issues/105).

All sources retrieved **2026-09-16**. Store policy pages carry their own "last updated" dates where shown; those are quoted.

> **This is a risk assessment, not legal advice.** Nothing here is a legal opinion, and none of it was written by or reviewed by a lawyer. It is a survey of what three stores have written down, what The Pokémon Company International (TPCi) and Nintendo have demonstrably done, and what comparable listings currently get away with. It tells you where the pressure comes from and what is cheap to avoid. It does not tell you what is lawful. If the listing ever attracts a real complaint, that is the point to get advice, not this document.

Every claim is labelled:

- **[primary]** — the store's own policy text, a filed DMCA notice, a court opinion, or a live listing I fetched and read.
- **[reported]** — dated coverage from a named outlet; the underlying notice was not published.
- **[observed]** — something I checked directly in a store or on a site today; a snapshot, not a rule.
- **[inference]** — follows from the above but nobody says it in those words.

---

## 1. Answer in one paragraph

**The name is the exposed surface, but not for the reason you would guess, and the artwork is a bigger one.** Across the whole recorded history of TPCi and Nintendo enforcement I could find, the lever they actually pull is **copyright in the sprites, the character art and the logo** — not trademark in a project's name. TPCi's only two DMCA notices in GitHub's public archive both target *tools*, not games — a Chrome extension (`pokereact`, 2016) and a Pokémon GO companion app (`PokiiMap`, 2017) — and in both cases the complained-of material is an enumerated list of **character image files**, with PokiiMap's notice also demanding removal of the **screenshots** that showed them. Nintendo's own 2026 notice against `animal-island-ui`, a UI component library that is not a game at all, likewise hangs on Animal Crossing imagery plus "a logo designed to mimic" the franchise logo — and that repo had *already* sanitised its name. Meanwhile the name-only risk is real but comes from a different direction: stores do not police third-party trademarks proactively, they react to complaints, and brand-monitoring vendors do scan store listings — a Chrome extension called *Windows Timeline Support* was pulled in August 2018 on an AppDetex complaint purely for the word "Windows" in its title, and a rename fixed it. Chrome's Impersonation & IP policy is six bullets with no nominative-use carve-out and the discretionary line "the visibility of your Product may be impacted if we believe it potentially infringes"; AMO's written policy has **no** third-party trademark rule at all beyond a general "don't infringe" clause in the Acceptable Use Policy; Apple's is by far the strictest, flatly barring another developer's "icon, brand, or product name in your app's icon or name" (4.1(c)) and separately requiring, under 5.2.2, that you be "specifically permitted" by a third-party service whose content you display, with "authorization must be provided upon request" — which is a problem PokéRogue cannot solve, because PokéRogue's own repo says its `assets/` files "should be considered to have _no_ licensing / copyright information." Empirically the ecosystem is permissive: four PokéRogue extensions are live on the Chrome Web Store today with "PokeRogue" in the title and one of them uses a **Poké Ball as its icon**, and a Firefox add-on's store screenshots show Pikachu, Charizard and Mewtwo sprites under the PokéRogue logo. So: **a name that references the game is survivable and routine; store-listing art that reproduces Pokémon or PokéRogue assets is the single change that converts a nuisance complaint into a copyright takedown with a paper trail.**

**Verdict: name the extension with an original word, refer to the game only in prose, and ship listing art that contains nothing but the extension's own panel.**

---

## 2. The risk surface, element by element

Ranked by *how much trouble it can cause per unit of benefit*. Highest first.

| Element | Real risk | Why |
|---|---|---|
| **Icon** | **Highest** | Two of the three enforcement precedents I found turn on artwork, and one names a *logo* specifically. An icon is small, permanent, and indexed by image-matching brand monitors. It also buys almost nothing. |
| **Screenshots / promo tiles** | **High** | A distinct risk from the name: TPCi's PokiiMap notice demands removal of "Screenshots from the Infringing App containing Pokémon copyrighted work" as its own enumerated item. No store forbids third-party content in screenshots; copyright does the work instead. |
| **Listing name** | **Medium** | Nominative "for X" naming is ordinary and widespread, but the *Windows Timeline Support* case shows a trademark word in a title is the cheapest thing for a monitoring vendor to flag, and Apple bans it outright. Cost of avoiding it: one word. |
| **Description text** | **Low–medium** | Cheap to make safe. The only genuine landmines are an affiliation/endorsement claim and using the marks as the product's identity rather than as a reference. Both are avoidable in one sentence each. |
| **Developer name** | **Low** | Covered by Chrome's metadata rule and Apple's 5.2.1; just don't put a franchise word in it. |

Crucially, **"Pokémon" and "PokéRogue" are different risks and should be treated separately.**

- **Pokémon** is TPCi's franchise mark and their character art is registered copyright — the notices quote registration numbers (`VA 1-907-954` for Squirtle, etc.). **[primary]**
- **PokéRogue** is an unlicensed fan project's own name. Pagefault Games has no visible registration and, more to the point, could not license you the sprites even if it wanted to: its README says so. **[primary]**

That asymmetry matters: referencing *PokéRogue* borrows a fan project's name; showing *a Pikachu sprite* borrows TPCi's copyright. Only the second has a documented enforcement history against browser extensions.

---

## 3. What each store has actually written down

### 3.1 Chrome Web Store

The **Impersonation & Intellectual Property** policy is short. Its whole substance, as published at [developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property) **[primary]**:

- "Don't pretend to be someone else, and don't represent that your product is authorized by, endorsed by, or produced by another company or organization, if that is not the case."
- Don't mimic operating-system or browser functionality or warnings.
- Don't divert users to sites mimicking the Chrome Web Store.
- No metadata that misrepresents the extension's or developer's status or performance.
- "Don't infringe on the intellectual property rights of others," covering patent, trademark, trade secret and copyright; a DMCA request tool is linked for copyright.
- "The visibility of your Product may be impacted if we believe it potentially infringes" on those rights.

That is the entire policy. Note what is **not** in it:

- **No nominative-use or compatibility carve-out.** Nothing says "for <Product>" naming is acceptable, and nothing says it isn't. The policy is silent. **[primary]**
- **No screenshot-specific IP rule.** The image guidance at [/docs/webstore/images](https://developer.chrome.com/docs/webstore/images) is dimensions, formatting, and "Screenshots should demonstrate the actual user experience"; it does not address third-party branding in screenshots at all. **[primary]**
- **No definition of "clear" infringement** or any threshold — the standard is "if we believe it potentially infringes," which is discretionary by construction. **[primary]**

Two adjacent policies bite on the listing:

- **Listing Requirements** (last updated 2024-07-10): "We don't allow extensions with misleading, inaccurate, incomplete, improperly formatted, non-descriptive, out of date, or inappropriate metadata, including but not limited to the extension's description, category, developer name, title, icon, screenshots, and promotional images." **[primary]** — this is the hook by which a *name* problem becomes a *metadata* problem.
- The **Spam** policy treats lists of sites, brands or keywords without substantial added value as keyword spam — relevant if the description stuffs franchise terms. **[primary]**

**Takedown mechanism.** Two routes, and they behave differently:

1. *Copyright* → Google's DMCA tool, linked from the policy itself. **[primary]**
2. *Trademark / other* → Google Legal's general content-removal process, which is product-by-product ("If the content you are reporting appears in multiple Google products, please submit a separate notice for each relevant product") and results in Google deciding whether to "block, limit, or remove access." There is no Chrome-Web-Store-specific trademark form documented. **[primary]**

What happens next is documented in the [complaint handling FAQ](https://developer.chrome.com/docs/webstore/complaint-faq/) **[primary]**: enforcement is graded — **rejection** (submission blocked, listing unchanged), **warning** (published item, 7–30 days to fix, stays live meanwhile), **takedown** (removed from the store, a corrected version may be resubmitted), and, for extreme cases, permanent removal *with no notification email to the publisher*. Appeals go through the developer dashboard's Appeal button; support typically responds within three days. Separately: "Any attempt to circumvent intended limitations or enforcement actions will result in the immediate termination of your developer account, and possibly related developer accounts." **[primary]**

**Read:** Chrome is complaint-driven in practice, graded rather than instant-death for a first listing offence, and a rename is a normal remedy. The developer-account termination language is the reason not to try to route around a verdict.

### 3.2 Mozilla Add-ons (AMO)

AMO's [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) contain **no third-party trademark or impersonation rule**. The entire trademark paragraph is about Mozilla's own marks **[primary]**:

> "Add-ons that make use of Mozilla trademarks must comply with the Mozilla Trademark Guidelines. If the add-on uses 'Firefox' in its name, the naming standard the add-on is expected to follow is '<Add-on name> for Firefox'."

The rest of the Content section covers the Acceptable Use Policy, payment disclosure, conformance to US law, fork naming, promo-only add-ons, and theme image quality. Nothing about other companies' brands. **[primary]**

It is worth noticing that Mozilla's own naming rule for its own mark is precisely the nominative "**<Name> for Firefox**" form — the store itself treats "X for <Trademark>" as the *correct* way to reference a mark you don't own. That is not a rule about third-party marks, but it is the strongest signal any of the three stores gives about what safe reference looks like. **[primary]** for the rule; **[inference]** for reading it as general guidance.

The general IP obligation is one clause in the [Acceptable Use Policy](https://www.mozilla.org/en-US/about/legal/acceptable-use/), which forbids users to "Violate the copyright, trademark, patent, or other intellectual property rights of others," and states "Mozilla reserves the right to remove any content or suspend any users that it deems in violation of these conditions." **[primary]**

**Takedown mechanism.** [Report Infringement](https://www.mozilla.org/en-US/about/legal/report-infringement/) handles both. For copyright: "If the Notice complies with the requirements of the DMCA, we will remove or disable access to the content that is allegedly infringing," with notification to the alleged infringer and possible publication to Lumen. For trademark, Mozilla says it "will handle reports of trademark violations in Trademark Notices similarly to the process described above for copyright violations." **[primary]**

**Read:** AMO is the most permissive in writing and the most purely notice-driven of the three. There is nothing for a reviewer to enforce proactively, so the risk there is entirely "did a rights holder complain."

### 3.3 Apple App Store (Safari web extensions ship as apps)

Strictest by a wide margin. From the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) **[primary]**:

- **5.2.1 Generally** — "Don't use protected third-party material such as trademarks, copyrighted works, or patented ideas in your app without permission, and don't include misleading, false, or copycat representations, names, or metadata in your app bundle or developer name. Apps should be submitted by the person or legal entity that owns or has licensed the intellectual property and other relevant rights."
- **5.2.2 Third-Party Sites/Services** — "If your app uses, accesses, monetizes access to, or displays content from a third-party service, ensure that you are specifically permitted to do so under the service's terms of use. **Authorization must be provided upon request.**"
- **4.1(c) Copycats** — "You cannot use another developer's icon, brand, or product name in your app's icon or name, without approval from the developer."
- **2.3.7 Metadata** — "Choose a unique app name, assign keywords that accurately describe your app, and don't try to pack any of your metadata with trademarked terms, popular app names, pricing information, or other irrelevant phrases just to game the system." App names are capped at 30 characters; subtitles "should not… reference other apps."
- **2.3.3 Screenshots** — "Screenshots should show the app in use, and not merely the title art, login page, or splash screen." No IP rule; the constraint on screenshots comes from 5.2.1's blanket "don't use protected third-party material."

Three consequences worth stating plainly:

1. **4.1(c) reads as a flat bar on the game's name in the app's name or icon.** Taken literally it does not matter whether the use is nominative; the exception is "approval from the developer" — which here means Pagefault Games, who are reachable, but whose approval covers *their* name at best and not TPCi's marks or art at all. **[primary]** for the text; **[inference]** for the reading.
2. **5.2.2 is the sharpest edge in the whole document for this project.** The extension displays and reads content from `pokerogue.net`, a third-party service. Apple can ask for authorization at any time, and "authorization must be provided upon request" is not qualified. **[primary]**
3. Note also **4.7**, which makes an app "responsible for all such software offered in your app" — not our case (we do not offer the game) but adjacent, and the reason Apple's 2024 allowance for retro-emulator apps came with responsibility attached rather than as a blanket permission. **[primary]**

**Takedown mechanism.** Apple routes rights-holder claims through [apple.com/legal/intellectual-property/dispute-forms](https://www.apple.com/legal/intellectual-property/dispute-forms/): "If you believe that content available on an Apple service infringes your intellectual property rights, you can use the forms below to submit a claim to Apple Legal," requiring identification of the alleged infringement and a representation under penalty of perjury; "In most cases, we will respond via email with a reference number." Apple's page does **not** document what it then does to the app, whether the developer is notified, or any counter-notice path. **[primary]** — and the silence is itself a finding: on the App Store you have the least visibility into the process.

### 3.4 Side-by-side

| | Chrome Web Store | AMO | App Store |
|---|---|---|---|
| Third-party trademark in the **name** | Not addressed; caught only via "misleading metadata" or a complaint | Not addressed at all | **Barred by 4.1(c)** absent the other developer's approval |
| "for &lt;Trademark&gt;" framing | Not addressed | Mozilla mandates exactly this shape for its *own* mark | Not addressed; 2.3.7 warns against trademark-packed metadata |
| Third-party content in **screenshots** | Not addressed | Not addressed | Covered by 5.2.1's general bar |
| **Affiliation claims** in the description | "don't represent that your product is authorized by, endorsed by, or produced by another company" | AUP only | 5.2.1 "misleading, false, or copycat representations… or metadata" |
| Enforcement posture | Complaint-driven + discretionary ("if we believe it potentially infringes") | Purely complaint-driven | Proactive at review, plus complaint-driven |
| Developer notified / appeal | Yes, graded, dashboard appeal | Yes (DMCA-style notification) | Not documented |

---

## 4. What TPCi and Nintendo actually do

I searched [GitHub's public DMCA notice archive](https://github.com/github/dmca) — every notice GitHub has processed since 2011, published verbatim. This is the highest-quality primary record available for this question.

### 4.1 The headline numbers

- **89 notices** in the archive come from Nintendo of America / Nintendo Co., Ltd. **[primary, counted 2026-09-16]**
- Of those, exactly **one** is framed as a trademark claim: the 2026-09-03 notice, whose subject line reads "DMCA and Trademark Infringement Notice." The remaining ~88 are copyright and DMCA §1201 anti-circumvention claims about emulators, ROMs, decompilations and asset dumps. **[primary]**
- **The Pokémon Company International appears twice in the entire archive**, in 2016 and 2017. Both target **fan tools**, not fan games. **[primary]**
- There is **no notice of any kind mentioning PokéRogue** from TPCi, Nintendo, or Pagefault Games. The only PokéRogue-adjacent notices in the archive are two fan-versus-fan complaints in January 2025 over a copied `PokeRogue-Pokedex` site — one fan-tool author DMCA-ing another's rehost of his unlicensed code. **[primary]**

### 4.2 The two TPCi notices — read them closely, they are the most on-point evidence there is

**`pokereact` — a Google Chrome extension. Notice filed 2016-03-07.** **[primary]**

> "This notice is in regards to the infringing Google Chrome extension 'pokereact' uploaded to GitHub… The extension includes images of Pokémon characters copyrighted by TPCi, specifically Charizard, Meowth, Haunter, Pikachu, Togepi, Jigglypuff, Wobbuffet and Squirtle, which are being displayed and distributed via GitHub without permission."

The notice then enumerates each infringing image file by path and gives the US copyright registration number for each character. **It says nothing about the extension's name.** `pokereact` puts "poke" in its own title and that is not what TPCi complained about — the complaint is eight PNG/JPG/GIF files.

`https://github.com/jamesyc/pokereact` returns **HTTP 451 Unavailable For Legal Reasons** today. **[observed 2026-09-16]** The takedown is a decade old and still in force.

**`PokiiMap` — a Pokémon GO companion app. Notice filed 2017-03-09, letter dated 2017-03-01, and it is the *third* cease-and-desist in the sequence.** **[primary]**

> "The Infringing App reproduces and displays some of these copyrighted images, including but not limited to the following Pokémon: Eevee… Nidoran… Pidgey… Weedle…"

and the demand list is the part that answers this ticket's screenshot question directly:

> "Pokémon demands that all infringing content be immediately removed… including: **Screenshots from the Infringing App containing Pokémon copyrighted work**; The following repository files: README.md, Pokeball.png, Screen1.png, The 'app' folder…"

**TPCi enumerates screenshots as their own category of infringing material, separately from the app.** They also name `Pokeball.png` — the ball design itself — as an infringing file. This is as close to a direct answer as the record provides: **yes, screenshots showing the game's own art are a distinct risk from the name, and TPCi has said so in writing.**

Note also that TPCi escalated: they emailed the developer on 2017-02-10, waited, and filed only after no reply. **[primary]** The pattern is contact-then-notice, not ambush.

### 4.3 Nintendo's one trademark claim — and why it matters here

2026-09-03, against `guokaigdg/animal-island-ui`, filed by Wildwood Law Group for Nintendo of America. **[primary]**

> "The reported repository displays Nintendo's intellectual property without permission on its main page, including Nintendo's Animal Crossing characters and imagery **and a logo designed to mimic Nintendo's Animal Crossing logo designs**, in connection with the distribution of a UI component library. The component library itself contains multiple instances of unauthorized copies of Nintendo's copyright-protected Animal Crossing characters and imagery. This unauthorized display and distribution of Nintendo's intellectual property violates Nintendo's rights under the Copyright Act (17 USC § 501) **and the Lanham Act (15 USC § 1125)**."

Three things to take from it:

1. The target is **not a game**. It is a UI component library — a *tool*. Being a tool is no shelter.
2. The project had already **sanitised its name** — "animal-island-ui" contains no Nintendo mark. It got hit anyway, because of the imagery and the logo. **This is the single clearest datum that renaming does not protect artwork.**
3. The trademark half of the claim is about a **logo design**, not a word mark. Nintendo's trademark theory here is visual identity.

### 4.4 Fan tools vs fan games — the dated record

| Date | Target | What it was | Basis | Source |
|---|---|---|---|---|
| 2016-03-07 | `pokereact` | **Chrome extension** | Copyright in 8 character images | GitHub DMCA archive **[primary]** |
| 2016-08-13 | Pokémon Uranium | Fan game | DMCA notices to hosts; devs pulled all download links. The developers stated they had **not** personally received a cease-and-desist — "While we have not personally been contacted, it's clear what their wishes are" | Nintendo Life / Kotaku, Aug 2016 **[reported]** |
| 2016-12 | Pokémon Prism | Fan ROM hack | Shut down pre-release | Nintendo Life, Dec 2016 **[reported]** |
| 2017-03-01/09 | PokiiMap | **Pokémon GO companion app** | Copyright in character images; screenshots and `Pokeball.png` named | GitHub DMCA archive **[primary]** |
| 2018-08-06 | *Windows Timeline Support* | Chrome extension (not Pokémon) | **Trademark in the listing name** — "Windows". Complaint by AppDetex, a trademark-monitoring firm. Developer's fix was to rename it "Timeline Support" | BleepingComputer, 2018-08-06 **[reported]** |
| 2018-08-29 | Pokémon Essentials | **Fan-game dev toolkit** — a tool, not a game | Copyright; the kit bundled "full tile sets, maps, music and sprites from various 2D Pokémon video games." Fandom complied; PokeCommunity removed downloads | TechSpot, 2018-08-29 **[reported]** |
| 2024→ | Ryujinx, yuzu forks etc. | Emulators | DMCA §1201 anti-circumvention / TPM | GitHub DMCA archive, many notices **[primary]** |
| 2026-09-03 | `animal-island-ui` | **UI component library** | Copyright + Lanham Act (logo mimicry) | GitHub DMCA archive **[primary]** |

**Answer to "has a fan *tool* ever been taken down?"** — **Yes, four times, and every single one bundled or displayed the franchise's own artwork.** `pokereact` (character PNGs), PokiiMap (character sprites + a Poké Ball), Pokémon Essentials (ripped tilesets, sprites and music), `animal-island-ui` (character imagery + a mimic logo).

**Answer to "has a fan tool ever been taken down for its *name alone*?"** — **I found no such case.** Not one TPCi or Nintendo notice in the GitHub archive complains about a project name in isolation. I am stating this as an absence of evidence in a specific, high-quality corpus, not as proof that it cannot happen; GitHub's archive does not cover store listings, email C&Ds that never reached a host, or the App Store. **The record here is genuinely thin and should not be over-read.**

### 4.5 What has survived, and for how long

**[observed 2026-09-16]** unless noted:

- **Pokémon Showdown** — battle simulator using every Pokémon name, stat and mechanic. Repo `smogon/pokemon-showdown` created **2011-12-23**, MIT-licensed, ~15 years live. Its credits page lists named contributors under "Art (battle graphics, sprites)" — **its sprites are its own community art, not ripped game assets.** That distinction is the likely reason it has survived while asset-bundling projects have not. **[primary]** for the repo and credits; **[inference]** for the causal reading.
- **Bulbapedia, Serebii, Smogon, pokemondb** — franchise-named reference sites running 20+ years, none subject to any notice I could find.
- **`PokeRogue-Pokedex`** — a third-party PokéRogue tool with the game's name in its title, publicly hosted; the only DMCA action against it in 2025 came from *another fan* over copied source, not from TPCi. **[primary]**

Nintendo's own published position ([Intellectual Property Policy](https://en-americas-support.nintendo.com/app/answers/detail/a_id/50035/), [IP & Piracy FAQ](https://en-americas-support.nintendo.com/app/answers/detail/a_id/55888/)) is entirely about piracy, ROMs, emulators and circumvention. It says nothing about fan tools, wikis or companion apps, and offers no fan-work guidelines or safe harbour. **[primary]** — the absence of a fan-content policy means there is no permission to rely on, and equally no published tripwire.

---

## 5. What the ecosystem actually ships, today

This is the empirical half: what store review has demonstrably let through. All fetched **2026-09-16**. **[observed]**

### 5.1 PokéRogue extensions live on the Chrome Web Store

| Name as published | Users | Icon | Notes |
|---|---|---|---|
| **Pokerogue ARCHITECT** | 611 | Original omega/eye mark, no game art | "The ultimate Pokerogue Companion." The screenshot I opened shows only the extension's own settings panel, no game art. I did not open every image on the listing. |
| **Pokerogue Game Speed** | 162 | **A Poké Ball, pixel-art style** | "You can freely control the pokerogue game speed. Only works on 'pokerogue.net'." |
| **PokeRogue Move Effectiveness** | 53 | **A Poké Ball with multipliers drawn on it** | "Adds an overlay that shows the effectiveness of each move against the enemy's types in PokeRogue…" |
| **TypeRogue** | 9 | Original | Korean description referencing PokeRogue |

All four put the game's name in the **title**. None uses "for". Two use a **Poké Ball** as the store icon and are live.

Adjacent Pokémon Showdown extensions, same store: **Showdex** (80,000 users — invented name, franchise only in the description), **Pokemon Showdown Type Helper** (10,000), **Team Analyzer for Pokemon Showdown** (1,000 — the "for X" form), **Pokemon Showdown Replay Recorder**, **Pokemon Showdown Lapras Theme**. The naming conventions in the wild split roughly: *<Trademark> <Noun>* is the most common, *invented name* is what the largest listing uses, and *"for <Trademark>"* is a minority form.

One promo tile served on those Showdown listing pages is worth recording because it is the maximal case of what Chrome review has passed: a banner reading **"POKÉMON EXTENSION — Your Showdown Copilot"**, with a Poké Ball logo, a Pikachu silhouette, an Eevee silhouette, and a Pokémon Showdown screenshot full of creature sprites. **[observed]** I could not pin it to a single listing — the same image URL appears on more than one Showdown extension's page, so it may be a related-item tile — but it is live on the Chrome Web Store either way.

### 5.2 PokéRogue add-ons live on AMO

| Name | Listed since | Users | Listing art |
|---|---|---|---|
| **PokeRogueMOD** | 2026-01-22 | 47 | Original fox/PR icon, no screenshots |
| **TypDex – English version** | 2025-05-02 | 3 | **3 screenshots showing the PokéRogue logo, and Pikachu, Raichu, Charizard, Mewtwo, Squirtle and Mega-Alakazam sprites with Pokédex flavour text** |
| **TypDex – Deutsche Version** | 2025-04-29 | 1 | Same |
| **TypeRogue** | 2026-08-18 | 1 | 1 screenshot |

I downloaded and looked at the TypDex screenshots. They show the game's logo, its sprites and Pokédex entry text, and they have been publicly listed on AMO for 16 months. **AMO review does not police third-party game art in screenshots.** **[observed]**

### 5.3 What that survey is and is not evidence of

It is strong evidence that **store review will not stop you**. It is **not** evidence that you are safe — every one of these listings is small (the largest PokéRogue one has 611 users), and the enforcement precedents above show TPCi acting on *visible, indexed, asset-bearing* projects. A listing that grows is a listing that gets noticed. **[inference]**

---

## 6. The legal doctrine behind "for X" naming — context only

Included because the naming decision leans on it, and flagged hard as background, not advice.

US federal courts recognise **nominative fair use**: using someone's mark to refer to their own product. The Ninth Circuit's three-factor test asks whether (1) the product was readily identifiable without the mark, (2) more of the mark was used than necessary, and (3) the user falsely suggested sponsorship or endorsement — *Toyota Motor Sales v. Tabari*, 610 F.3d 1171 (9th Cir. 2010), restating *New Kids on the Block v. News America Publishing*, 971 F.2d 302 (9th Cir. 1992). **[primary — read from the court's own opinion PDF, `cdn.ca9.uscourts.gov/datastore/opinions/2010/07/08/07-55344.pdf`]**

*Tabari* is unusually on point, because it is about putting someone else's mark in your **name**. Kozinski, C.J.:

> "The Tabaris are using the term Lexus to describe their business of brokering Lexus automobiles; when they say Lexus, they mean Lexus. We've long held that such use of the trademark is a fair use, namely nominative fair use. And fair use is, by definition, not infringement."

But the opinion also draws the line that matters for an extension name:

> "When a domain name consists only of the trademark followed by .com, or some other suffix like .org or .net, it will typically suggest sponsorship or endorsement by the trademark holder."

and, in striking down an over-broad injunction, notes that names which "on their face dispel any confusion as to sponsorship or endorsement" — the court's own examples are `independent-lexus-broker.com` and `we-are-definitely-not-lexus.com` — should not be prohibited at all.

The EU analogue is Article 14(1)(c) of Regulation (EU) 2017/1001, which limits a trade mark's effects against use "for the purpose of identifying or referring to goods or services as those of the proprietor of that trade mark, in particular, where the use of that trade mark is necessary to indicate the intended purpose of a product or service," subject to 14(2): the use must be "in accordance with honest practices in industrial or commercial matters." **[primary — text as published by EUR-Lex / legislation.gov.uk; I was not able to fetch EUR-Lex's HTML directly and relied on mirrored statutory text, so treat the exact wording as near-verbatim rather than certified.]**

**The practical translation, and it is the whole reason the doctrine appears here:** the shapes that read as *reference* are `<Original Name> for PokéRogue` and `<Original Name> — a PokéRogue companion`. The shape that reads as *identity* is `PokéRogue Coach`, because there the mark **is** the product name. Both shapes are common in the stores today; only one of them is the one a court has described approvingly. **None of this is a defence you want to have to run, and none of it is advice.**

---

## 7. Two wrinkles specific to this project

**7.1 PokéRogue cannot give you permission, and its own repo says so.**

`pagefaultgames/pokerogue` is AGPL-3.0 for code, CC-BY-NC-SA-4.0 for docs and for "the assets we provide… to the extent that [they] are licensable and applicable" — and then, explicitly **[primary]**:

> "⚠️ Files in `assets/` that are not explicitly licensed via `REUSE.toml` files should be considered to have _no_ licensing / copyright information."

So the game's own maintainers decline to claim rights in the sprites. There is no upstream licence to point at, no permission to obtain, and Apple's 5.2.2 "authorization must be provided upon request" has no answer. **[primary]** for the README; **[inference]** for the consequence.

Note also that the HUD reads and reasons over the game's state — species names, move names, type effectiveness. **Names and game mechanics are not the same asset class as sprites**, and the survival of Bulbapedia, Serebii, Smogon and Showdown for 15–20 years is the strongest available evidence that reproducing *data* has not drawn enforcement while reproducing *art* has. That is an empirical pattern, not a rule. **[inference]**

**7.2 The extension is a transport as well as a HUD.**

The map locks "one extension, transport opt-in." Nothing in this research touches that — no store's IP policy cares about native messaging — but Apple's 5.2.2 does care that the app "uses, accesses… or displays content from a third-party service," and the transport makes that access more explicit, not less. Worth carrying into the Apple submission decision rather than the naming one. **[inference]**

---

## 8. Constraints the spec can adopt, in priority order

Each is phrased so it can be pasted into `docs/spec/extension-distribution.md` as a listing rule.

### Must — these are where the documented enforcement actually lands

1. **The store icon contains no Pokémon or PokéRogue artwork.** No Poké Ball, no creature silhouette, no fragment of the PokéRogue logo, no pixel-art pastiche of either. An original mark only. *(Two of four documented TPCi/Nintendo tool takedowns name a logo or ball image; `animal-island-ui` proves a clean name does not save a dirty logo.)*
2. **Every store screenshot and promo tile shows only the extension's own panel.** Crop or mask the game canvas; do not show sprites, the game's logo, or Pokédex text. If a screenshot needs context, use a neutral grey placeholder behind the panel. *(TPCi's PokiiMap notice enumerates screenshots as their own infringing category.)*
3. **No claim of affiliation, endorsement, authorisation or partnership anywhere in the listing.** This is the one rule all three stores write down, and Chrome's is nearly verbatim: don't "represent that your product is authorized by, endorsed by, or produced by another company."
4. **Ship a one-line disclaimer in the description and in the extension's own UI**, e.g. *"Not affiliated with, endorsed by, or associated with The Pokémon Company, Nintendo, Game Freak, or Pagefault Games."* Costs nothing; it is the third *Tabari* factor in a sentence.
5. **The extension bundles no game assets.** Whatever it renders comes from the live page at runtime, never from a file in the package. *(Every documented tool takedown involved bundled or redistributed art.)*

### Should — cheap, and they remove the name as an attack surface

6. **The listing name is an original word that stands alone.** Not `PokéRogue <Noun>`. The game is named in the *subtitle/description*, not the title. *(Windows Timeline Support, 2018: a brand-monitoring vendor's complaint over one word in a title; the rename was the fix. Do the rename first.)*
7. **If the game must appear in the name, use the referential form — `<Original Name> for PokéRogue` — never the possessive-identity form.** And note it is "PokéRogue", the fan project's name, that would appear — **never "Pokémon"**, which is TPCi's registered mark and the one with a decade of enforcement behind it.
8. **On Apple, the name carries no third-party product name at all.** 4.1(c) is flat, App Review is proactive, and Apple documents no counter-notice path. Take the strictest store's rule as the single cross-store name, so one name ships everywhere — which the map already requires via day-one parity.
9. **The developer name contains no franchise term.** Covered by Chrome's metadata rule and Apple 5.2.1.
10. **The description does not stuff franchise keywords.** One natural reference to PokéRogue plus the domain `pokerogue.net` is enough; lists of Pokémon names or franchise terms trip Chrome's spam policy and Apple 2.3.7.

### Contingency — decide now, execute later

11. **Pre-agree the rename path.** Chrome and Mozilla both notify and both allow a corrected resubmission; Chrome grants 7–30 days on a warning. Pick the fallback name at spec time so a complaint costs a day, not a re-decision. *(Feeds #98's open "rejection recovery" item.)*
12. **Never circumvent a verdict.** Chrome terminates the developer account, "and possibly related developer accounts," for attempts to work around enforcement. Appeal or comply; do not re-publish under a second account.
13. **Contactability is the cheap insurance.** TPCi's PokiiMap sequence was email, wait, email, wait, *then* file. An email address on the listing that someone reads turns a takedown into a conversation. This aligns with the map's "support is email only" decision. **[inference]**

---

## 9. What I could not establish

Stated plainly rather than papered over:

- **No documented case of any store pulling a listing over a *Pokémon* trademark specifically.** The only name-based store removal I could evidence is the Microsoft/"Windows" one. Whether TPCi files store complaints at all is unknown to me.
- **No visibility into TPCi's or Nintendo's store-complaint behaviour.** GitHub's archive covers GitHub. Lumen covers what its contributors publish. Neither Chrome, AMO nor Apple publishes a comparable corpus of IP complaints against listings, so the store-listing half of the threat model is inferred from a general pattern, not measured.
- **Trademark registration numbers for "Pokémon" were not verified.** USPTO's search APIs were not reachable from here. Ownership is asserted by TPCi in their own filed notices and by Nintendo on their legal pages, which is good enough to act on but is not a register check.
- **Whether Pagefault Games claims any rights in the name "PokéRogue"** — no trademark claim appears anywhere in their repo or site metadata that I found. If the spec wants to use "PokéRogue" in the name, asking them directly is both cheap and the thing Apple 4.1(c) would want to see.
- **EUR-Lex's own HTML for Article 14 would not fetch**; the quoted wording came from mirrored statutory text and should be re-checked against EUR-Lex before anyone relies on the exact phrasing.
- **The survey in §5 is a snapshot.** A listing that is live today proves review passed it; it does not prove it will still be there next year, and small listings are weak evidence about what happens at scale.
