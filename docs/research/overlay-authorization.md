# Authorization to overlay PokéRogue

Research for [#117](https://github.com/IIxauII/pokerogue-mcp/issues/117), a child of map [#98 "Map: HUD as a browser extension"](https://github.com/IIxauII/pokerogue-mcp/issues/98). Builds on [Store cost, review latency and policy exposure (#102)](https://github.com/IIxauII/pokerogue-mcp/issues/102) and [Trademark exposure for a public listing (#104)](https://github.com/IIxauII/pokerogue-mcp/issues/104). Feeds the name and listing identity decision.

All sources retrieved **2026-09-16**. Where a page shows its own "last updated" date, that date is quoted.

> **This is a risk and feasibility assessment, not legal advice.** No lawyer wrote or reviewed it. It sets out what PokéRogue has published, what each store's own text requires, and what comparable listings have had to show. It does not say what is lawful, and it does not say what App Review will decide on any given day.

Every claim is labelled:

- **[primary]**: text from the rights holder's own repo, site or licence file, or a store's own policy, agreement or listing API.
- **[observed]**: something I checked directly today, such as an HTTP status, a store search or a live listing. It shows how things are today, not a rule.
- **[community]**: a third party's account of what someone else said, where the original can't be linked. Weak.
- **[inference]**: my reading of the above, which no source states in these words.

---

## 1. Answer in one paragraph

**Authorization is obtainable in principle, absent in fact, and only partly grantable.** Only one party can give it: **Pagefault Games**, which runs `pokerogue.net` and holds copyright in the client code, the docs and the PokéRogue logo. It has a public contact address. But **nothing public counts as authorization today.** `pokerogue.net` has **no terms of use at all**: no page, no link, no in-game text and no robots signal. The repo has no code of conduct and no policy on third-party tools. The one stance on overlays that I could find is a paraphrase of a Discord announcement on community pages, and I couldn't link to the original. Apple 5.2.2 asks that you be "specifically permitted to do so under the service's terms of use", with "authorization … provided upon request". When a service has no terms, only a written permission from Pagefault can satisfy that. **That permission would still only cover Pagefault's part.** PokéRogue's own licence file for Pokémon assets says "We do not claim to re-license nor hold any ownership over the asset". So nobody Pagefault can speak for can authorize the Pokémon layer, and The Pokémon Company International (TPCi) will not. That leftover is survivable only by showing data rather than art. A Safari extension that overlays type and move data on Pokémon Showdown has been live on the App Store since 2022. **This is an Apple App Review problem only.** The Chrome Web Store and AMO have no authorization gate, only a promise not to *knowingly* break a third party's terms. Developer ID with notarization has no authorization requirement either. **One trap is new:** asking can create the prohibition. Today there are no terms to break. A written "no" from Pagefault would make an App Store submission a knowing misstatement. It would also bring Chrome's "knowingly violates a third party's terms of service" clause into play.

**Verdict: treat the App Store listing, and with it iOS, as blocked until Pagefault Games has given written permission. Plan the spec so that "no" or silence still leaves a coherent product: Chrome, Firefox and a Developer ID Safari build on macOS.**

---

## 2. What PokéRogue has actually published

### 2.1 Licence

The repo `pagefaultgames/pokerogue` (default branch `beta`) reports `AGPL-3.0` **[primary]**. The README's licensing section splits the repo into four parts **[primary]**:

- "All source code belonging to the project, unless otherwise noted, is licensed under AGPL-v3.0-only."
- "All forms of documentation … are licensed under CC-BY-NC-SA-4.0."
- "To the extent that the assets we provide are licensable and applicable, they are licensed under CC-BY-NC-SA-4.0 unless otherwise noted."
- "⚠️ Files in `assets/` that are not explicitly licensed via `REUSE.toml` files should be considered to have _no_ licensing / copyright information."

Assets live in a separate repo, `pagefaultgames/pokerogue-assets`, which uses per-path `REUSE.toml` annotations. Three custom licence texts decide what we may and may not do **[primary]**:

| Licence ref | Applied to | Text |
|---|---|---|
| `LicenseRef-NO-REUSE` | `logo128.png`, `logo512.png`, `images/logo.png`, `images/logo_fake.png`, `images/intro_dark.mp4`. The annotation reads: "Pagefault / Pokerogue logo should not be reused without permission as it would imply endorsement" | "All rights reserved. No reuse, modification, or redistribution is permitted without explicit permission, excluding uses to access, provide access to, or directly refer to PokéRogue." |
| `LicenseRef-FAIR-USE` | e.g. `images/pb.png` (the Poké Ball), `items.png`, `categories.png`, plus some audio | "The asset is the intellectual property of Nintendo, Creatures, inc., and GAME FREAK, inc. … The authors of this repository believe its inclusion is covered under Fair Use. **We do not claim to re-license nor hold any ownership over the asset.**" |
| `CC-BY-NC-SA-4.0` | Many contributor sprites and tracks, plus `favicon.ico` ("Created by Gonstar (Paid Commission)") | Standard CC licence |

In-game, the tutorial intro says: "This game is not monetized and we claim no ownership of Pokémon nor of the copyrighted assets used." (`pokerogue-locales/en/tutorial.json`) **[primary]**

What this means for authorization **[inference]**:

- **The client code is AGPL-3.0.** That licence lets anyone run, study and modify the program. It is the strongest written thing we could point to. But it licenses *code*, not *use of the hosted service*, and Apple asks about the service's terms of use. An App Review reader is unlikely to accept "the game is open source" as "specifically permitted".
- **Pagefault is explicit that it cannot license the Pokémon layer.** Any authorization it gives stops at its own code, its own name, its own logo and the service it runs.

### 2.2 Terms of use, privacy, policies

- `https://pokerogue.net/terms`, `/privacy`, `/tos`, `/terms-of-service` and `/privacy-policy` all return **404**. **[observed]**
- The homepage HTML links no terms or privacy page. It contains the game container and touch controls, and nothing else. **[observed]**
- `https://pagefault.games/` and every path under it redirect **301** to `https://github.com/pagefaultgames`. The studio has no website of its own. **[observed]**
- `pokerogue.net/robots.txt` holds only Cloudflare's content-signal preamble, with **no signals and no `User-agent` rules**. By its own wording, that means the operator "neither grants nor restricts permission via content signal". **[observed]**
- The game repo's community profile shows **no code of conduct** and **no issue template**. The only policy files are `CONTRIBUTING.md` and `README.md`. **[primary]**
- No text in `src/`, `docs/` or the English locales contains "terms of use", "terms of service" or "privacy policy". **[observed]**
- Search results turn up "PokéRogue Terms of Service" pages on `pokerogue-wiki.com`, `pokeroguegame.org`, `pokerogue.lol` and `pokerogue.cc`. **None of these is `pokerogue.net`, and Pagefault's repo and org link to none of them.** Treat them as unaffiliated lookalike sites, not as PokéRogue's terms. **[observed]**

**Conclusion: PokéRogue has no terms of use.** Nothing prohibits a third-party overlay, and nothing "specifically permits" one either. **[inference]**

### 2.3 Stated stance on third-party tools, overlays and automation

The primary record is thin:

- **CONTRIBUTING.md** is about contributions, not tools. It is worth reading anyway because of its tone on AI, which matters when we ask for permission (§5.3). It says: "If you are using any kind of AI assistance to contribute to PokéRogue, it must be disclosed". Also: "Please do not use AI to write pull request descriptions or contributor communication for this project". And: "we do not and will not ever accept AI art or music contributions". **[primary]**
- **Maintainers on client-side cheating, 2024.** Issue [#1914](https://github.com/pagefaultgames/pokerogue/issues/1914), about creating vouchers through dev tools, got this reply from `flx-sta`, then a contributor and now listed in CREDITS as a former dev team member: "the general idea right now is: There is no multiplayer. You are only cheating yourself (except the scoreboard, but there is worse)." In [#1173](https://github.com/pagefaultgames/pokerogue/issues/1173), collaborator `CodeTappert` wrote: "Still you only ruin your own fun when doing so. This game has no PVP only PVE." Issue [#2203](https://github.com/pagefaultgames/pokerogue/issues/2203) was closed as "It is known and wont be fixed for now." **[primary]** These are individual developers commenting on issues. None of it is a policy.
- **The overlay/API distinction.** It is reported only second-hand:
  - A community summary: "All other clients that use the game's API are considered unauthorized, though some whose only purpose is as a custom visual overlay are still fine … RogueDex is the only extension that the devs do not mind the players using, since it does not modify player data". The same summary says cheating accounts are restricted "from online interactions" (Daily Run leaderboards), and are wiped only for attacks on the servers. This comes from a TV Tropes Trivia page, seen in search results only; the page returned HTTP 403 to direct fetch. **[community]**
  - A tool author's README, [`PokeRogueMOD/PyPoRoMOD`](https://github.com/PokeRogueMOD/PyPoRoMOD), says: "Any usage of the PokéRogue API outside of the official site (pokerogue.net) is forbidden". It adds that "The game developers have explicitly stated that using the API externally is **not allowed**". The author moved to an overlay that "interacts directly with the in-browser game object … since mods were not explicitly forbidden". **[community]**
  - Neither source links to the original announcement, which is presumably on the official Discord (`discord.gg/pokerogue`). **I could not find a linkable primary statement.**

So what exists **[inference]** is apparent tolerance of read-only overlays that don't modify saves and don't call the API directly. It lives in Discord and is reported second-hand. That is the right shape for our HUD, which reads the page-world game object and never calls `api.pokerogue.net` itself. But you can't attach it to an App Review submission, and it says nothing about an **AI agent pressing buttons** or about **previews** of upcoming waves.

---

## 3. What each distribution route actually requires

### 3.1 Apple App Store: 5.2.2, 5.2.1, 4.1(c)

Current text, from the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) ("Last Updated: June 8, 2026") **[primary]**:

> **5.2.2 Third-Party Sites/Services:** If your app uses, accesses, monetizes access to, or displays content from a third-party service, ensure that you are specifically permitted to do so under the service's terms of use. Authorization must be provided upon request.

> **5.2.1 Generally:** Don't use protected third-party material such as trademarks, copyrighted works, or patented ideas in your app without permission, and don't include misleading, false, or copycat representations, names, or metadata in your app bundle or developer name. Apps should be submitted by the person or legal entity that owns or has licensed the intellectual property and other relevant rights.

> **4.1(c)** You cannot use another developer's icon, brand, or product name in your app's icon or name, without approval from the developer.

Also relevant **[primary]**:

- The **Content Rights** declaration in App Store Connect ([reference](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/)): "Apps that contain, show, or access third-party content must have all the necessary rights to that content or be otherwise permitted to use it under the laws of each App Store country or region in which they're available." This is a declaration made on every submission. Its "or be otherwise permitted … under the laws" is softer than 5.2.2's "specifically permitted … under the service's terms of use".
- The **PLA §3.2** warranty. It applies to every "Covered Product", Safari Extensions included: "To the best of Your knowledge and belief, Your Covered Products … do not and will not violate, misappropriate, or infringe any Apple or third-party copyrights, trademarks … or other proprietary or legal rights". ([Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/), which is publicly readable without a login.)

**Does 5.2.2 apply to us? Yes.** [inference] The HUD *accesses* `pokerogue.net`, reading live game state from the page, and *displays content from* it: species, moves, HP and the upcoming waves in a preview. The transport lets an agent *use* the service. Any one of the guideline's verbs is enough.

**What "authorization upon request" looks like in practice.** A documented Apple rejection under 5.2 reads **[primary, Apple-issued text quoted on the Apple Developer Forums, [thread 696695](https://developer.apple.com/forums/thread/696695), Dec 2021]**:

> "Your app contains content or features that may violate the rights of one or more third parties. … To resolve this issue, please attach documentary evidence in the App Review Information section in App Store Connect evidencing that you have all necessary rights or permissions …"

So the deliverable is **a document attached in App Review Information**. For a service without terms, that can only be a written permission from the operator. Apple doesn't request it of every app; the request comes when a reviewer flags one. [inference]

**What comparable listings had to show:**

| Listing | What it overlays | What it had to show | Label |
|---|---|---|---|
| **Refined GitHub** (Sindre Sorhus), Mac + iOS App Store since 2021-04-09 | github.com | Maintainer, 2021-01-08: "**Apple rejected the extension because "GitHub" is a trademarked name.** We are working with GitHub on getting it approved." Then 2021-04-10: "GitHub … got their lawyers to draft up a **trademark license agreement** for the name REFINED GITHUB". The listing now reads: "The GITHUB and REFINED GITHUB trademarks are owned by GitHub, Inc. and used under license." About **three months** from rejection to listing. ([issue #3686](https://github.com/refined-github/refined-github/issues/3686)) | [primary] |
| **Protego for Reddit**, Safari extension | reddit.com | Rejected November 2024 **under 2.3.7** "for using 'Reddit' in the name/subtitle", even though many live "for Reddit" apps existed. The developer appealed ([forum thread 768704](https://developer.apple.com/forums/thread/768704)). The name is live on the App Store today, released 2024-11-09. | [primary] rejection text as posted; [observed] live listing |
| **Enhanced Tooltips for Showdown**, Mac App Store since 2022-03-05, v2.15 updated 2026-07-14 | Pokémon Showdown, a fan battle simulator | Shows "Type weaknesses and respective multipliers … Move type and category … Move base power" over a Pokémon fan site. No licence line in the listing. **The closest comparable to our HUD, and it has survived four years of updates.** Whether App Review ever asked for authorization isn't public. | [observed] |
| **Sink It for Reddit**, **Vinegar – Tube Cleaner** (YouTube), **SponsorBlock for Safari** (YouTube), **DeArrow for YouTube** | Big third-party platforms | Live for years. No authorization or licence line in any of their descriptions. | [observed] |

What the comparables show **[inference]**:

1. **The name is what reliably draws Apple's request.** Both documented rejections were over a third-party *name* in the title (4.1(c), 2.3.7). Neither was over the overlay itself.
2. **The overlay function is routinely approved without a public licence.** That includes a Pokémon-data overlay. 5.2.2 is enforced when a reviewer flags something, not on every app.
3. **A name licence took Refined GitHub three months and a lawyer-drafted agreement, with a well-staffed legal department on the other side.** Pagefault Games has no website and no visible legal entity.

**No PokéRogue extension exists on the App Store today.** An App Store search for "pokerogue" returns only poker games and TPCi's own titles. **[observed]** So there is no precedent either way for this specific site.

### 3.2 Chrome Web Store

**No authorization requirement.** The [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) have no clause asking a developer to hold a site's permission. The nearest rules are "Do not facilitate unauthorized access to content on websites, such as circumventing paywalls or login restrictions" and the Impersonation & IP rule against claiming "your product is authorized by, endorsed by, or produced by another company … if that is not the case". **[primary]**

The [Developer Agreement](https://developer.chrome.com/docs/webstore/program-policies/terms) ("updated on May 4, 2021") **[primary]**:

- §4.4.1: you won't publish a Product that "**knowingly violates a third party's terms of service**", "infringes on the intellectual property rights of others", or "accesses in an unauthorized manner the … services … of any third party".
- §5.4: "You represent and warrant that you have all and will maintain all necessary rights to grant the licenses to the Products and any content contained in, accessed by, or transmitted through the Products".

These are warranties, enforced on complaint, not documents that review asks for. **[inference]** With no PokéRogue terms, §4.4.1 has nothing to catch. **That changes the moment Pagefault publishes a prohibition or refuses in writing** (§5.2).

Observed: four PokéRogue extensions are live on CWS (per #104), and so is **Rogue Dex**, with 7,000 users. **[observed]**

### 3.3 AMO (Firefox)

**No authorization requirement.** The [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) ("Last Updated: April 30, 2026") contain no clause about third-party site permission. **[primary]** The [Firefox Add-on Distribution Agreement](https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/) (effective December 1, 2021) is a rights warranty: "You have and will maintain all necessary copyright, trademark, patent or other proprietary or legal rights to post, display, perform, use, reproduce, distribute and transmit Your Add-on". **[primary]** The [Acceptable Use Policy](https://www.mozilla.org/en-US/about/legal/acceptable-use/) bars using a Mozilla service in a way that "violates … any other binding terms, including any license or terms of service". **[primary]**

Observed on AMO **[observed, AMO API]**:

- **Rogue Dex**, listed since 2024-05-06, requests host permissions for `https://pokerogue.net/*` **and `https://api.pokerogue.net/*`**.
- **PokeRogueMOD**, listed since 2026-01-22.
- **TypDex**, listed since 2025-05-02, with PokéRogue logo and sprite screenshots (per #104).

AMO doesn't gate on this.

### 3.4 Developer ID and notarization (macOS, outside the App Store)

**No authorization requirement.** The App Review Guidelines don't apply, because notarization "is not App Review". Apple's own words ([Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)): "The Apple notary service is an automated system that scans your software for malicious content, checks for code-signing issues". **[primary]**

What does apply **[primary, PLA]**:

- **§5.3**: Apple "may revoke Tickets at any time in its sole discretion in the event that Apple has reason to believe … that Your Application contains malware or malicious, suspicious or harmful code". The grounds are about security, not rights.
- **§3.2**: "Safari Extensions signed with an Apple Certificate may be distributed to Your end users in accordance with the terms of this Agreement, including Attachment 7. Applications for macOS may be distributed outside of the App Store using Apple Certificates and/or tickets as set forth in Section 5.3 and 5.4".
- **Attachment 7, "Additional Terms for Safari Extensions"**: no malware; no harassment or "violating the legal rights … of others"; single purpose; no ad injection; and "Apple may block Your Safari Extension … if it does not comply with the requirements … or otherwise adversely affects users". Nothing about third-party site permission.
- **The §3.2 non-infringement warranty** ("to the best of Your knowledge and belief") still applies, as it does to every Covered Product.

**So on the Developer ID route, the exposure is a warranty, and the only enforcement is a complaint. There is no document anyone asks for.** [inference]

### 3.5 Aside: iOS notarization outside the App Store

The guidelines page offers "Highlight Notarization Review Guidelines Only", marking each guideline that also applies to notarized iOS apps from alternative distribution. **5.2.1, 5.2.2 and 4.1(c) are *not* marked.** 4.1(b) (impersonation), 5.2.4(a) and 5.2.5 are. **[primary, `data-nr` markers in the guidelines page markup]** The PLA limits that route to specific regions: it names "Alternative App Marketplaces (Japan, Brazil)", and the EU route sits under separate terms. **Whether a Safari web extension's containing app can ship to iOS this way, and what an individual developer must meet to do so, is unverified.** It is at best a regional escape hatch, not a way back to iOS in general.

### Summary

| Route | Authorization document required? | Exposure |
|---|---|---|
| **App Store (macOS + iOS)** | **Yes, on request** (5.2.2), plus **approval for "PokéRogue" in the name/icon** (4.1(c)) | Rejection, or removal after a complaint |
| Chrome Web Store | No | Warranty. §4.4.1 bites only on *knowing* violation of a third party's terms |
| AMO | No | Warranty and AUP. Complaint-driven |
| Developer ID + notarization (macOS) | No | §3.2 warranty, Attachment 7 conduct rules; revocation is security-grounded |
| iOS notarization (alt. distribution) | No (5.2.2 is not a Notarization Review Guideline) | Regional; feasibility for Safari extensions unverified |

---

## 4. Who can grant authorization, and what they can't grant

**Pagefault Games** is the only party that can authorize use of `pokerogue.net`, the PokéRogue name and the PokéRogue logo. **[primary]** It is the SPDX copyright holder across the repos, the operator of the site and API (`pagefaultgames/rogueserver`, "Game server backend and API for PokéRogue"), and the stated owner of the logo under `LicenseRef-NO-REUSE`.

Identifiable contacts **[primary]**:

| Channel | Source |
|---|---|
| **`contact@pagefault.games`** | Public `email` field of the [`pagefaultgames` GitHub org](https://github.com/pagefaultgames) (location "United States of America", X handle `pagefaultgames`) |
| Discord `discord.gg/pokerogue` | README and CONTRIBUTING, where "#pokerogue-dev" is the named dev channel |
| GitHub issues on `pagefaultgames/pokerogue` | README, which invites asset-credit contact there. It is a bug tracker, not a licensing desk |

People with apparent authority, from `CREDITS.md` **[primary]**: **Head of Development `SirzBenjie`**; **Server Developer and Maintainer `pancakes` (patapancakes)**, who runs the service a 5.2.2 permission would be about; Senior Devs `Madmadness65` and `NightKev`. The original developer, "Sam (aka Flashfyre) (initial developer, started PokéRogue)", is listed under *Former* Development Team Members. Public org members: `Madmadness65`, `patapancakes`, `SirzBenjie`, `xsn34kzx`.

**What Pagefault cannot grant.** [primary + inference] Any rights in Pokémon: names, sprites, the Poké Ball, the fonts in `pokemon-emerald-pro.ttf`, and the like. Its licence file says outright, "We do not claim to re-license nor hold any ownership over the asset." It also can't clearly grant rights in contributor art under CC-BY-NC-SA without those contributors, and no one should need those rights anyway. **No party we can realistically reach can authorize the Pokémon layer.** TPCi's record in #104 shows enforcement, not licensing, for fan tools. The only answer to a 5.2.1 challenge about Pokémon content is **not to ship or display Pokémon art at all**. Mechanics and names in text are the pattern that has survived (Showdown tooltips on the App Store; Bulbapedia, Serebii and Smogon on the web).

**Unknowns about the grantor.** [observed] Pagefault Games has no website, and no registered entity is visible from its public footprint. So it isn't clear who can sign for "Pagefault Games", or whether App Review would accept a permission from an individual maintainer's address. A reply from `@pagefault.games` is the strongest form available.

---

## 5. If we ask: the route, the content, and the trap

### 5.1 Route

**One written request to `contact@pagefault.games`**, which gives a dated reply from the studio's own domain that can be attached in App Store Connect. A Discord DM or a message in #pokerogue-dev can't be attached and can't be attributed to the studio. Decide the name *before* asking (§6), so that one reply covers everything.

### 5.2 What the permission must cover for App Review to accept it

[inference, modelled on the Apple wording in §3.1]

1. **The service:** that a browser extension may read game state from `pokerogue.net` pages and overlay information on them, on Safari (macOS and iOS), Chrome and Firefox.
2. **Automation:** that the extension's opt-in transport may let the user's own AI agent send input to the user's own tab. **Disclose this.** It is the part most likely to be refused, and a permission that leaves it out doesn't cover the product.
3. **Previews:** that the HUD shows what the run seed already decides about upcoming waves. Say whether this touches the Daily Run leaderboards.
4. **The name, only if the chosen name contains "PokéRogue":** approval under 4.1(c). If the name is original, don't ask for this.
5. **An explicit non-endorsement line**, which the permission should confirm: the extension is not affiliated with or endorsed by Pagefault Games. This lines up with the logo annotation ("would imply endorsement").

### 5.3 Likelihood

[inference; weak evidence either way]

- **For:** apparent tolerance of read-only overlays (Rogue Dex, reported); a "you're only cheating yourself" attitude; an AGPL, community-run project.
- **Against:** CONTRIBUTING's strong line on AI in contributor communication and AI art; a reported ban on external API clients; a volunteer team with no legal desk (Refined GitHub needed GitHub's lawyers and three months); and a product whose headline feature is an AI agent playing the game. **The request must be written by a human, not by an agent.** CONTRIBUTING asks for exactly that, and an AI-drafted request to this team is likely to be refused on sight.
- **Silence is the most likely single outcome** for a volunteer project reached by email. Silence is not authorization.

### 5.4 The trap: asking can create the prohibition

[inference] Today, `pokerogue.net` has no terms, so:

- a Chrome/AMO listing can't be "knowingly violating" anything;
- an App Store submission can answer the Content Rights declaration and make the PLA §3.2 "to the best of Your knowledge and belief" warranty in good faith. It just has nothing to attach if asked.

**A written refusal changes all three.** It turns an App Store submission into a knowing misstatement, which is a PLA problem and not just a rejection. It gives Chrome's §4.4.1 something to bite on. And it gives Pagefault a documented basis for a store complaint. **Only ask if the project is willing to abide by a "no" everywhere, not just on Apple.** If the answer to that is no, the honest course is not to ask, and to drop the App Store.

---

## 6. What this means for the name and the icon

### Icon: settled regardless of authorization

- **The PokéRogue logo is off-limits by its own licence.** `LicenseRef-NO-REUSE` says "No reuse, modification, or redistribution is permitted without explicit permission", and the annotation gives the reason: "it would imply endorsement". **[primary]** Its carve-out, "uses to access, provide access to, or directly refer to PokéRogue", might cover a small link badge inside the HUD. [inference] It doesn't cover *our product's icon*, which is exactly the "implies endorsement" case.
- **The Poké Ball (`images/pb.png`) is Nintendo/Game Freak/Creatures IP** that Pagefault expressly doesn't relicense (`LicenseRef-FAIR-USE`). **[primary]**
- **The PokéRogue favicon** is a paid commission by Gonstar under CC-BY-NC-SA-4.0. Attribution plus share-alike plus the endorsement reading makes it unusable as a product icon. [primary + inference]
- **Apple 4.1(c)** covers the *icon* as well as the name: "another developer's icon, brand …".

**Rule: the icon is an original mark with no PokéRogue logo, no favicon derivative, no Poké Ball, no creature silhouette, and no red/white split-circle motif that reads as a ball.** Even full authorization from Pagefault wouldn't change this for the Poké Ball.

### Name: decide as if authorization will not come

- **Without Pagefault's approval**, "PokéRogue" can't be in the App Store *name* (4.1(c)). The Protego case shows App Review also objects to a third-party name in the **subtitle** (2.3.7). Parity requires one name across stores, so **the listing name everywhere is an original word with no "PokéRogue" and no "Pokémon"**. The game is named in the **description** only. On Chrome and AMO, the description can say "for PokéRogue" plainly. On Apple, keep it out of name and subtitle.
- **With approval**, `<Original> for PokéRogue` becomes available on Apple. But the listing would then depend on a permission that can be withdrawn, and the name would have to change if it were. Refined GitHub shows the owner can require a formal licence for that pattern. **Recommendation: don't make the name depend on the permission.** An original standalone name costs one word and removes a whole question from the ask (§5.2 item 4).
- **"Pokémon" never appears in the name, anywhere.** TPCi is not a party that will approve it (#104).
- **Every listing and the HUD's about screen carry a non-affiliation line.** Name Pagefault Games alongside TPCi, Nintendo, Game Freak and Creatures. This matches the endorsement concern PokéRogue's own logo licence raises.

---

## 7. If authorization is unobtainable: the cost, plainly

If Pagefault refuses, never answers, or the project decides not to ask (§5.4):

1. **No App Store listing.** Mac App Store and iOS both go.
2. **iOS is gone entirely** for practical purposes. iOS Safari extensions reach users only through the App Store. The alternative-distribution route in §3.5 is regional, unverified for Safari extensions, and not a general path.
3. **Developer ID is the only Apple route left:** a direct-download, notarized macOS app with no product page, no store discovery and no App Review. It does sidestep the EU DSA trader-address disclosure the map flags.
4. **"All three engines day one" survives only in its narrowest reading.** Chrome and Firefox get store listings. Safari gets a macOS-only direct download. That falls short of the locked **"Audience: public PokéRogue players. Real store listings, not sideload"** for Safari, and a Developer ID download is close to the sideload the charter excluded.
5. **It hangs on an open question.** The map's fog includes "Can a Safari web extension ship with Developer ID outside the Mac App Store today?" The PLA's §3.2 and Attachment 7 contemplate distributing Safari Extensions signed with an Apple Certificate, but the definition doesn't separate legacy `.safariextz` extensions from web extensions. **If the answer is no, an unobtainable authorization means no Safari at all, and "all three engines day one" fails outright.** That question is now load-bearing and should be settled before the spec locks.

This compounds with #103/#100, which found the MCP transport already can't reach a local process on Safari. Without authorization, Safari is macOS-only and HUD-only.

---

## 8. Not established

- **No linkable primary statement from Pagefault** on overlays, extensions or automation. The only stance is paraphrased Discord content (§2.3). Discord announcements weren't checked directly.
- **Whether App Review has ever asked a Pokémon-fan-site overlay for 5.2.2 documentation.** The Showdown tooltips listing shows approval, not whether a question was asked.
- **Pagefault's legal form**, and so who can sign a permission App Review would accept.
- **Whether AGPL-3.0 on the client plus the absence of terms would satisfy a reviewer** who asked. No precedent found either way.
- **Whether PokéRogue's Daily Run or leaderboard rules** (reported account restrictions) treat agent-driven runs or seed previews as cheating.
- **iOS alternative-distribution eligibility** for an individual developer's Safari web extension (§3.5).
- **Developer ID for Safari web extensions** (§7 item 5), already fog on the map and now load-bearing.
