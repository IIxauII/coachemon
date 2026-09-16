# AGPL-3.0 against the Apple Developer Program License Agreement

Research for [#116](https://github.com/IIxauII/pokerogue-mcp/issues/116), a child of map [#98 "Map: HUD as a browser extension"](https://github.com/IIxauII/pokerogue-mcp/issues/98).

All sources retrieved **2026-09-16**.

> **This is a risk assessment, not legal advice.** It reads the licence and the agreements as written and reports what they say, where they collide, and what the public enforcement record shows. Before a listing ships, a lawyer should look at it, especially at §7 below (third-party code in the bundle).

Every claim is labelled:

- **[primary]**: the licence, the agreement, the policy or the source file itself, quoted.
- **[inference]**: follows from primary sources, but no source says it in those words.
- **[community]**: secondary or anecdotal. Treat it as weak.

---

## 1. Answer

**AGPL-3.0 and a Mac App Store listing can both stand only if the person who submits the listing owns the copyright in every line of the bundle. This bundle does not meet that test today.**

The collision is real, and it is in the text. Apple's end-user terms turn a store download into a "nontransferable license" that forbids redistribution and is bound to Apple's Usage Rules. A developer's own EULA may not override them (Standard EULA (a); Schedule 1 Exhibit B ¶1–2; Apple Media Services Terms §F). AGPL-3.0 §10 says "You may not impose any further restrictions on the exercise of the rights granted", and §12 says that when you cannot meet both sets of terms you "may not convey it at all". That is the argument the FSF made in 2010, and it removed GNU Go and VLC from the App Store. The 2026 texts have not changed its substance. **[primary]**

The AGPL only binds a *licensee*, though. The copyright holder is not bound by their own licence (FSF GPL FAQ #DeveloperViolate), and can give Apple and App Store users a separate non-exclusive grant while the public keeps the AGPL grant. Signal does this today: its iOS app is AGPL-3.0, it is on the App Store, and a CLA gives Signal sublicensable rights over every contribution. **[primary]**

So everything depends on who holds the copyright:

- **The human author is the only human author.** Every commit and all 41 PRs come from one person's identities. The other authors are a release bot and one trivial commit by an agent. **[primary]**
- **But the HUD carries code copied from PokéRogue**, which is `AGPL-3.0-only` with about 370 contributors and no CLA. `10-damage.js` holds a function the comment itself calls "verbatim", and `20-enemy-ai.js` re-implements the enemy AI "from the live build". For that material the project is a licensee. It cannot give Apple the extra grant, and under the VLC precedent **any one PokéRogue contributor could have the listing pulled**. **[primary]** for the facts, **[inference]** for the exposure.
- **The repo has no LICENSE file at all.** `package.json` has no `license` field, and GitHub reports `licenseInfo: null` on a public repo. The map's "AGPL-3.0" decision has never been applied, so today the code is all-rights-reserved by default. **[primary]**

Per channel:

| Channel | AGPL-3.0 conflict? |
|---|---|
| **Mac App Store** (and iOS App Store) | **Yes for any code you don't own.** None for your own code. |
| **Developer ID + notarization** | **No.** No Schedule 1, no Standard EULA, no Usage Rules. The only PLA touchpoints are signing (§5.1), notarization (§5.3) and Attachment 7, and none of them restricts what end users may do. |
| **Chrome Web Store** | **No.** Developer Agreement §5.2 lets your own licence replace Google's default grant, and the user ToS §3.5 and §3.7 defer to "a separate agreement with the developer". |
| **AMO** | **No.** Distribution Agreement §6 encourages open-source licences, and the AMO submission form offers "GNU Affero General Public License v3.0 only" as a built-in choice. |

**AGPL §13 (network use) has no effect here** (§6 below). It binds modifiers, never the holder. It needs users "interacting with it remotely through a computer network", and native messaging over stdio or a loopback socket to a local process is not that.

**The "matching the game the HUD reads" rationale does not require the AGPL.** The HUD and PokéRogue are combined only at runtime, in the player's own browser, and AGPL §2 lets anyone "make, run and propagate covered works that you do not convey, without conditions". The only PokéRogue material the extension *conveys* is the copied code. Remove it and the licence is a free choice again. **[inference]**

**The login-gate premise was wrong.** The PLA is a public PDF. And the JavaScriptCore carve-out that #102 expected to find in PLA §3.3.2 **is not in the current PLA either**. §3.3.2 is now "Regulatory Compliance", and the executable-code rule, §3.3.1(B), names no engine at all (§10).

---

## 2. The documents read

| Document | Version read | Access |
|---|---|---|
| Apple Developer Program License Agreement (PLA), English | Footer "LYL255 / August 18, 2026". HTTP `Last-Modified: Tue, 18 Aug 2026`. 130 pages | **Public, no login.** PDF linked from [developer.apple.com/support/terms](https://developer.apple.com/support/terms/): [Apple-Developer-Program-License-Agreement-English.pdf](https://developer.apple.com/support/downloads/terms/apple-developer-program/Apple-Developer-Program-License-Agreement-English.pdf). Also HTML at [/support/terms/apple-developer-program-license-agreement/](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/) |
| Licensed Application End User License Agreement ("Standard EULA") | Undated page | [apple.com/legal/internet-services/itunes/dev/stdeula](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/) |
| Apple Media Services Terms and Conditions (Usage Rules) | "Last Updated: September 14, 2026" | [apple.com/legal/internet-services/itunes/us/terms.html](https://www.apple.com/legal/internet-services/itunes/us/terms.html) |
| App Store Review Guidelines | "Last Updated: June 8, 2026" | [developer.apple.com/app-store/review/guidelines](https://developer.apple.com/app-store/review/guidelines/) |
| GNU AGPL v3 | Canonical text | [gnu.org/licenses/agpl-3.0.txt](https://www.gnu.org/licenses/agpl-3.0.txt) |
| GNU GPL FAQ | Live page | [gnu.org/licenses/gpl-faq.html](https://www.gnu.org/licenses/gpl-faq.html) |
| FSF on GNU Go / App Store | 25 and 26 May 2010 | [fsf.org/news/2010-05-app-store-compliance](https://www.fsf.org/news/2010-05-app-store-compliance), [fsf.org/blogs/licensing/more-about-the-app-store-gpl-enforcement](https://www.fsf.org/blogs/licensing/more-about-the-app-store-gpl-enforcement) |
| FSF on VLC | 29 Oct 2010 | [fsf.org/blogs/licensing/vlc-enforcement](https://www.fsf.org/blogs/licensing/vlc-enforcement) |
| VideoLAN news and press | 2011-01-09, 2011-09-07, 2011-12-21 | [videolan.org/news.html](https://www.videolan.org/news.html), [press/lgpl.html](https://www.videolan.org/press/lgpl.html), [press/lgpl-libvlc.html](https://www.videolan.org/press/lgpl-libvlc.html) |
| VLC for iOS `COPYING` | `master` | [github.com/videolan/vlc-ios/blob/master/COPYING](https://github.com/videolan/vlc-ios/blob/master/COPYING) |
| Chrome Web Store Developer Agreement | "updated on May 4, 2021" | [developer.chrome.com/docs/webstore/program-policies/terms](https://developer.chrome.com/docs/webstore/program-policies/terms) |
| Chrome Web Store user Terms of Service | Live | [ssl.gstatic.com/chrome/webstore/intl/en/gallery_tos.html](https://ssl.gstatic.com/chrome/webstore/intl/en/gallery_tos.html) |
| Chrome Web Store Program Policies | Live | [developer.chrome.com/docs/webstore/program-policies/policies](https://developer.chrome.com/docs/webstore/program-policies/policies) |
| Firefox Add-on Distribution Agreement | "Effective December 1, 2021" | [extensionworkshop.com/…/firefox-add-on-distribution-agreement](https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/) |
| AMO Add-on Policies | Live | [extensionworkshop.com/…/add-on-policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) |
| AMO licence choices | `addons-server` `master` | [src/olympia/constants/licenses.py](https://github.com/mozilla/addons-server/blob/master/src/olympia/constants/licenses.py) |
| PokéRogue licensing | `beta` | [REUSE.toml](https://github.com/pagefaultgames/pokerogue/blob/beta/REUSE.toml), [CONTRIBUTING.md](https://github.com/pagefaultgames/pokerogue/blob/beta/CONTRIBUTING.md) |
| Historic PLA / iOS Program agreement | 2014-09-09 PDF and the Jan-2024 PLA page, via the Wayback Machine | See §10 |

---

## 3. Where exactly they conflict

### 3.1 What Apple imposes on the person who downloads the app

**Standard EULA, clause (a) Scope of License [primary]:**

> "Licensor grants to you a nontransferable license to use the Licensed Application on any Apple-branded products that you own or control and as permitted by the Usage Rules. … You may not transfer, redistribute or sublicense the Licensed Application … You may not copy (except as permitted by this license and the Usage Rules), reverse-engineer, disassemble, attempt to derive the source code of, modify, or create derivative works of the Licensed Application, any updates, or any part thereof (except as and only to the extent that any foregoing restriction is prohibited by applicable law or to the extent as may be permitted by the licensing terms governing use of any open-sourced components included with the Licensed Application)."

The open-source carve-out has been added since the FSF's 2010 analysis, and it matters. But it is attached **only to the last sentence**: copy, reverse-engineer, modify, derivative works. The sentences "nontransferable" and "may not transfer, redistribute or sublicense" carry no carve-out. **[primary]** for the text, **[inference]** for its scope.

**A custom EULA cannot fix this.** PLA Schedule 1 §3.2 allows a developer's own EULA, "provided, however, that Your EULA must include and may not be inconsistent with the minimum terms and conditions specified on Exhibit B". Exhibit B (to Schedule 1) says **[primary]**:

> ¶1 "The EULA may not provide for usage rules for Licensed Applications that are in conflict with, the Apple Media Services Terms and Conditions …"
>
> ¶2 "The license granted to the end-user for the Licensed Application must be limited to a non-transferable license to use the Licensed Application on any Apple-branded Products that the end-user owns or controls and as permitted by the Usage Rules set forth in the Apple Media Services Terms and Conditions …"

**The Usage Rules apply however the app is licensed.** Apple Media Services Terms §F **[primary]**:

> "Your use of the Services and Content must follow the rules set forth in this section ("Usage Rules"). Any other use of the Services and Content is a material breach of this Agreement."
>
> "You may use the Services and Content only for personal, noncommercial purposes (except as set forth in the App Store Content section below or as otherwise specified by Apple)."
>
> "You may not tamper with or circumvent any security technology included with the Services or Content."

And §O: "Any App that you acquire is governed by the Licensed Application End User License Agreement ("Standard EULA") … unless Apple or the App Provider provides an overriding custom license agreement ("Custom EULA")". Apple is also "a third-party beneficiary" who "may therefore enforce such agreement".

### 3.2 What the AGPL forbids

AGPL-3.0 **[primary]**:

- **§10 ¶3**: "You may not impose any further restrictions on the exercise of the rights granted or affirmed under this License. For example, you may not impose a license fee, royalty, or other charge for exercise of rights granted under this License …"
- **§12**: "If conditions are imposed on you (whether by court order, agreement or otherwise) that contradict the conditions of this License, they do not excuse you from the conditions of this License. If you cannot convey a covered work so as to satisfy simultaneously your obligations under this License and any other pertinent obligations, then as a consequence you may not convey it at all."
- **§2 ¶3**: "Sublicensing is not allowed; section 10 makes it unnecessary."
- **§8**: conveying outside the licence "is void, and will automatically terminate your rights under this License".
- **§3 ¶2**: "When you convey a covered work, you waive any legal power to forbid circumvention of technological measures to the extent such circumvention is effected by exercising rights under this License with respect to the covered work".

### 3.3 The clause-by-clause map

| AGPL-3.0 | Apple text it collides with | Severity |
|---|---|---|
| **§10 ¶3** no further restrictions | Standard EULA (a) "nontransferable … may not transfer, redistribute or sublicense". Exhibit B ¶1–2 (a custom EULA must stay "non-transferable" and "as permitted by the Usage Rules"). AMS §F Usage Rules ("personal, noncommercial purposes", device and account limits, "material breach"). | **The core conflict.** This is the FSF's 2010 argument and still reads the same way. |
| **§12** convey only if both can be satisfied | Everything above. A licensee who accepts Schedule 1 has agreed to terms that contradict §10. | Turns the conflict into "may not convey it at all". |
| **§2** no sublicensing / **§10** automatic licence | PLA Schedule 1 §1.1–1.2 appoints Apple as "agent" to "make copies of, format, and otherwise prepare Licensed Applications … including adding the Security Solution". PLA §3.1(e): you "represent and warrant that You own or control the necessary rights in order to appoint Apple". | A licensee cannot warrant rights they don't have. For the holder this is fine. |
| **§3** anti-circumvention waiver | PLA definition of "Security Solution" (FairPlay, "to administer Apple's standard usage rules"). PLA §3.2(e) (no code that would "interfere with the Security Solution"). AMS §F ("may not tamper with or circumvent any security technology"). | The FSF's DRM argument in the VLC case. It is secondary to §10. |
| **§6** Installation Information | PLA **§5.1, final paragraph**: "the licensing terms governing Your Application, Your Safari Extension … or governing any third-party code or FOSS included … will be consistent with and not conflict with the digital signing or content protection aspects of the Program … In particular, such licensing terms will not purport to require Apple (or its agents) to disclose or make available any of the keys, authorization codes, methods, procedures, data or other information related to the Security Solution, digital signing or digital rights management mechanisms". Apple "may immediately cease distribution of any affected Licensed Applications". | **Low here.** The wording mirrors GPLv3/AGPLv3 §6 ("methods, procedures, authorization keys"). But §6 requires Installation Information only when object code is conveyed "as part of a transaction in which the right of possession and use of the User Product is transferred", and an app download does not transfer a device. **[inference]** Note that §5.1 applies to *every* Apple-signed build, **including Developer ID**. |
| (compliance duty) | PLA **§3.3.4(A)(v)**: "If Your Application … includes any FOSS, You agree to comply with all applicable FOSS licensing terms." The PLA defines FOSS as "including without limitation software distributed under the GNU General Public License". PLA §3.2(d): no infringement of "third-party copyrights". Guideline **5.2.1**: "Apps should be submitted by the person or legal entity that owns or has licensed the intellectual property". | A licensee who ships third-party AGPL code to the App Store breaches the AGPL *and* the PLA. |
| (removal lever) | PLA Schedule 1 **§6.3**: Apple may stop distribution "if Apple reasonably believes … that: … (ii) those Licensed Applications … infringe … copyright … of any third party; … (iv) You have violated the terms of the Agreement". | Removal is how Apple resolved GNU Go and VLC (§8). |

---

## 4. Why none of this binds the holder

GPL FAQ **#DeveloperViolate** **[primary]**:

> "Strictly speaking, the GPL is a license from the developer for others to use, distribute and change the program. The developer itself is not bound by it, so no matter what the developer does, this is not a "violation" of the GPL."

GPL FAQ **#ReleaseUnderGPLAndNF** **[primary]**:

> "If you are the copyright holder for the code, you can release it under various different non-exclusive licenses at various times."

AGPL §10 ¶1 frames the grant the same way: "the recipient automatically receives a license from the original licensors". So a sole holder can:

1. publish the source under AGPL-3.0 on GitHub, and
2. separately license the same code to Apple under Schedule 1 and to App Store users under the Standard EULA.

These are two non-exclusive grants from one licensor, and neither breaches the other. **[inference]** from the two FAQ entries. It is also exactly what the FSF criticised in 2010: its objection was to Apple distributing *other people's* GPL code.

**Precedent that this works on the App Store today [primary]:** `signalapp/Signal-iOS` reports `AGPL-3.0` on GitHub, and the app is on the App Store as "Signal - Private Messenger" from "Signal Messenger, LLC" ([apps.apple.com/…/id874139669](https://apps.apple.com/us/app/signal-private-messenger/id874139669)). Its `CONTRIBUTING.md` requires contributors to "sign the [CLA](https://signal.org/cla)". §2 of the CLA grants "a perpetual, worldwide, non-exclusive … copyright license … as well as the right to sublicense and have sublicensed all of the foregoing rights, through multiple tiers of sublicensees". Signal collects the rights that make the store listing lawful.

**What the holder route costs [inference]:**

- **The listing is one-way.** A fork, or a contributor's modified build, is a licensee, so §3 applies to them in full and they cannot lawfully ship to the App Store. The copyleft stays intact for Chrome, Firefox and Developer ID only.
- **Every contribution that lands in the shipped bundle needs an inbound grant.** A CLA, or an explicit sublicensable grant, is the price of keeping the listing. The map already rules out community contribution ("Support is email only", "no public issue intake"), so today this costs almost nothing. It becomes a hard gate the day an outside PR is merged.
- **Moral standing.** The FAQ adds that a developer who does what would violate the GPL if someone else did it "will surely lose moral standing in the community". This is a reputational cost, not a legal one.

---

## 5. Per channel

### 5.1 Mac App Store (and iOS App Store)

Everything in §3 applies. Schedule 1 §1.1(c) confirms the scope: "the term "Licensed Application" shall include any content, functionality, extensions, stickers, or services offered in the software application". The web extension inside the containing app is covered. The AMS Terms say the same from the user side: "Apps" includes "extensions". **[primary]**

**Verdict: no conflict for code the submitter owns. Fatal conflict for third-party AGPL/GPL code.**

### 5.2 Developer ID + notarization (macOS, outside the store)

What the PLA says about this route **[primary]**:

- §3.2(g): "Applications for macOS may be distributed outside of the App Store using Apple Certificates and/or tickets as set forth in Section 5.3 and 5.4". Also: "Safari Extensions signed with an Apple Certificate may be distributed to Your end users in accordance with the terms of this Agreement, including Attachment 7."
- §3.3 (Program Requirements) applies to "Any Application that will be submitted to the App Store, Custom App Distribution, or TestFlight, or that will be distributed through Ad Hoc distribution". **Developer ID is not on that list**, so §3.3.4(A)(v) and §3.3.1(B) do not reach it by their own terms. **[inference]** from the list.
- §5.3 (notarization): Apple scans the upload, may "retain and use Your Application for subsequent security checks", and may revoke Tickets.
- Attachment 7 §1.1 (Safari Extensions signed with an Apple Certificate): no malware; no tracking "without their express consent"; "single purpose"; no "obfuscated code"; "must not script or automate turning on Your Safari Extension"; must not interfere with Safari. §1.2: Apple "may block Your Safari Extension".
- §5.1, final paragraph (the licensing-terms warranty in §3.3) **does** apply, because it covers Apple-signed code of any kind.

What is **absent**: Schedule 1, the Standard EULA, Exhibit B and the AMS Usage Rules. Apple is not the distributor, and the user never accepts Apple's terms for this download. The developer's licence is the only licence the end user receives. **[inference]** from the scope of Schedule 1 §1.1 and AMS §O.

**Verdict: AGPL-compatible, including for third-party AGPL code**, provided the Corresponding Source is offered (AGPL §6(d): "clear directions next to the object code saying where to find the Corresponding Source"). The one residual is §5.1's warranty, which is low-risk for the reason in §3.3.

### 5.3 Chrome Web Store

Developer Agreement **[primary]**:

- §5.1: "You grant to Google and its affiliates a worldwide, nonexclusive, and royalty-free license to: (a) host, link to, copy, … distribute and otherwise use the Products …"
- §5.2: "You grant to the user a non-exclusive, worldwide, and perpetual license to perform, display, and use the Products … **If you choose, you may include a separate end user license agreement (EULA) in your Product that will govern the user's rights to the Products in lieu of the previous sentence.**"
- §5.4: "You represent and warrant that you have all and will maintain all necessary rights to grant the licenses".

User Terms of Service **[primary]**:

- §3.5: "You agree that you will not reproduce, duplicate, copy, sell, trade or resell any Product from the Web Store for any purpose, **unless you have been specifically permitted to do so in a separate agreement with the developer of such Product.**"
- §3.7: users will not "copy, sell, license, distribute, transfer, modify … or otherwise attempt to derive source code from the Products, **unless otherwise permitted**".

Both user-side restrictions give way to the developer's own licence, and the AGPL is exactly such a "separate agreement". Unlike Apple's Exhibit B, nothing requires your licence to keep Google's usage rules. **[inference]** The Program Policies ban obfuscation but allow minification: "Developers must not obfuscate code or conceal functionality of their extension." This fits a published-source project. uBlock Origin (`gorhill/uBlock`, GitHub reports `GPL-3.0`) is the long-standing precedent. **[primary]** for the licence field.

**Verdict: no conflict.** Put a source link on the listing to satisfy AGPL §6(d) for any third-party AGPL material.

### 5.4 AMO (addons.mozilla.org)

Firefox Add-on Distribution Agreement §6 "Licenses; proprietary rights" **[primary]**:

> "Mozilla encourages You to make Your Add-ons available under open source licenses such as the MPL for source code and a Creative Commons license for creative works."
>
> "You hereby grant to Mozilla a non-exclusive, worldwide, royalty-free, sublicensable license under all of Your rights necessary to review Your Add-ons (including the source code, if required); create Signed Add-ons; and publish, distribute, and promote Listed Add-ons …"

The grant is "under all of **Your** rights", so it grants nothing for code you don't own. For third-party AGPL code, Mozilla's recipients receive their licence directly from the original licensors under AGPL §10, so no sublicence is needed. **[inference]** AMO's own licence list includes `LICENSE_AGPL3`, "GNU Affero General Public License v3.0 only", `slug = 'AGPL-3.0-only'` (addons-server `constants/licenses.py`). Add-on Policies §3.1: submitted source "is reviewed by an administrator and is not redistributed in any way". **[primary]**

**Verdict: no conflict.** AMO treats AGPL-3.0-only as a first-class listing licence.

---

## 6. Does AGPL §13 reach this extension?

§13 **[primary]**:

> "Notwithstanding any other provision of this License, if you modify the Program, your modified version must prominently offer all users interacting with it remotely through a computer network (if your version supports such interaction) an opportunity to receive the Corresponding Source of your version …"

GPL FAQ **#AGPLv3InteractingRemotely** **[primary]**:

> "If the program is expressly designed to accept user requests and send responses over a network, then it meets these criteria. … If a program is not expressly designed to interact with a user through a network, but is being run in an environment where it happens to do so, then it does not fall into this category. For example, an application is not required to provide source merely because the user is running it over SSH, or a remote X session."

**It has no effect here, for three independent reasons [inference]:**

1. **It binds modifiers, not the holder.** "If you modify the Program" is a condition on licensees, and the holder is not bound by their own licence (§4 of this doc). The project's own builds never trigger it.
2. **The user is local.** The HUD runs in the player's own browser. The transport is native messaging on Chrome and Firefox, which is stdin/stdout pipes to a process on the same machine, not a network. #103 and #100 name a loopback `127.0.0.1` socket as the only Safari candidate. That is a network API on one host, which is the "happens to" case in the FAQ, not a design for remote users.
3. **The remote party is not a "user interacting with" this program.** The model behind Claude Code is reached by Claude Code, the MCP client, which is a separate program. The extension talks only to local processes.

It *would* start to matter if a fork exposed the MCP transport as a hosted, remote MCP endpoint for other people. That is the case §13 was written for, and it would bind that fork, not this project.

Nor does §13 of *PokéRogue's* licence reach us. The HUD's runtime patching (for example, `48-preview.js` swapping `s.currentBattle`) modifies a copy running privately in the player's browser. AGPL §0 excludes "executing it on a computer or modifying a private copy" from "propagate". **[primary]** for the definition, **[inference]** for its application.

---

## 7. Who holds the copyright here

### 7.1 Git history (`git log --all --format='%an %ae'` on 2026-09-16)

| Author identity | Commits | Who |
|---|---|---|
| `xau <xau@xau.xau>` | 131 | The repo owner's local identity |
| `Felix <33882825+IIxauII@users.noreply.github.com>` | 40 | The repo owner's GitHub account (IIxauII) |
| `semantic-release-bot` | 19 | Release chores (version bump, changelog). Not authorship |
| `Claude <noreply@anthropic.com>` | 1 | `d89bd1e`, untracking a `node_modules` symlink. Trivial |

`gh pr list --state all`: **all 41 PRs authored by `IIxauII`**. About 28 commits carry a `Co-Authored-By: Claude …` trailer. There are **no outside human contributors**. **[primary]**

**Holder: one individual.** This rests on the premise that "xau" and "Felix/IIxauII" are the same person, which the account linkage supports. **[inference]**

Caveat on agent-written code **[inference]**: an AI system is not an author or rightsholder. But the US Copyright Office's [*Copyright and Artificial Intelligence, Part 2: Copyrightability*](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf) (January 2025) holds that AI output is protected "only where a human author has determined sufficient expressive elements", and EU/German law also requires human creation. Heavily agent-written files may therefore carry **thin copyright**. That creates no second holder. It weakens how far *any* licence on those files can be enforced, AGPL included, and it matters equally under every option in §9.

### 7.2 No licence has been applied

There is no `LICENSE` file on this branch. `package.json` has `"private": true` and no `license` field. `gh repo view` returns `"licenseInfo": null, "visibility": "PUBLIC"`. **[primary]** Until a licence is committed, the AGPL decision exists only on the map, and the public repo is all-rights-reserved. The holder can still choose freely, without anyone's consent.

### 7.3 Third-party code already in the HUD. This is the binding fact.

PokéRogue's `REUSE.toml` covers `src/**/*.ts` with `SPDX-License-Identifier = "AGPL-3.0-only"` and `SPDX-FileCopyrightText = "2024-2025 Pagefault Games"`. `CONTRIBUTING.md` has no CLA: "any contributions made to this repository will be licensed under this repository's terms", per GitHub's inbound=outbound terms. The GitHub contributors API paginates to **370** entries. **[primary]** Nobody at Pagefault Games can grant Apple an App Store licence to all of it, and neither can this project.

What this repo takes from it **[primary]**, file:line at `4eb4d76`:

- `skills/coach-pokerogue/scripts/hud/10-damage.js:86`: "EnemyPokemon's module-private calculateBossSegmentDamage, **verbatim**." The function follows.
- `skills/coach-pokerogue/scripts/hud/20-enemy-ai.js:1-3`: switch and move prediction "are **re-implemented from the live build**". `skills/coach-pokerogue/references/game-code.md:228` ("Module-private (re-implement verbatim; pure)") and `:350` ("`EnemyPokemon.getNextMove()` (verbatim logic)") are the notes they were written from.
- `src/enums/generated.ts`, generated by `scripts/gen-enums.ts` from `pagefaultgames/pokerogue` enum files. These are integer tables and probably facts rather than expression. The file is also server-side and may not ship in the extension at all.
- `hud/05-randbats.js` on `master`: a "trimmed pkmn/randbats snapshot (MIT)". MIT is compatible with every channel and needs only attribution.

**Exposure [inference]:**

- The verbatim function is small, pure arithmetic, which is a plausible case for "too small or too functional to be protected". The enemy-AI re-implementation is larger, and nobody has diffed it against upstream to tell a non-literal re-implementation of an algorithm (not protected) from a translation of its expression (protected).
- Either way, **as long as it sits in the bundle, the project is a licensee of PokéRogue for that material**, and §3 applies in full to the App Store listing.
- The VLC record (§8) shows the trigger needs only *one* holder among many. The complaint path is Schedule 1 §6.3(ii).
- The HUD's dominant pattern, calling the game's own functions at runtime in the MAIN world, avoids all of this. Only module-private logic that cannot be reached was copied.

---

## 8. Enforcement record

**GNU Go, 2010 [primary].** FSF, 25 May 2010: "Apple imposes numerous legal restrictions on use and distribution of GNU Go through the iTunes Store Terms of Service, which is forbidden by section 6 of GPLv2." Update on the same page: "instead of amending their terms of service to work with the GNU GPL, Apple have decided to remove GNU Go from the App Store."

In the follow-up (26 May 2010, Brett Smith), the FSF says "this analysis would apply to all versions of the GNU GPL and AGPL". It names the Usage Rules as the "further restrictions", and adds: "Some people have pointed out that the App Store Terms of Service say that a separate license to the software is provided to you by the developer, and that's true. But the Usage Rules are imposed on you no matter how the software is licensed." The 2026 Exhibit B ¶1–2 keeps that structure intact.

**VLC, 2010–2011 [primary], with [community] detail.**

- FSF, 29 Oct 2010: VLC developer Rémi Denis-Courmont "wrote to Apple to complain that his work was being distributed through their App Store, under terms that contradict the GPL's conditions and prohibit users from sharing the program."
- VideoLAN news, **2011-01-09**, "VLC for iOS removed from the AppStore": "the build of VLC for iOS that was submitted on the AppStore by the company Applidium has been removed by Apple". VideoLAN called itself "a 3rd party in this matter".
- The submitter (Applidium) was a licensee, and the complainant was one copyright holder among many. **This is the exact shape of the PokéRogue exposure in §7.3.** **[inference]**
- Press coverage quotes Apple's notice as "We regret that the dispute regarding your application named 'VLC Media Player' could not be resolved amicably between the parties" ([Fierce Network](https://www.fierce-network.com/developer/apple-removes-vlc-media-player-from-app-store), [CDM](https://cdm.link/as-apple-pulls-gpl-licensed-vlc-the-developers-version-of-events-what-it-means-for-free-video/)). **[community]**

**How VLC came back [primary]:**

- 2011-09-07: relicensing of libVLC from GPLv2+ to LGPLv2.1+. VideoLAN "does not require copyright assignment … the authors keep their copyright", and "more than 80% of the copyright holders on VLC's core have agreed". Completed 2011-12-21.
- Today, `vlc-ios/COPYING` reads: "This software is bi-licensed under the GPLv2 (or later) and the MPLv2. Any commit to this repository implicitely allows VideoLAN to relicense this software to any OSI-approved license, without prior consent."
- **The fix was holder control (an inbound relicensing grant) plus a store-compatible second licence.** MPL-2.0 §3.2(b) allows exactly this: "You may distribute such Executable Form under the terms of this License, or sublicense it under different terms, provided that the license for the Executable Form does not attempt to limit or alter the recipients' rights in the Source Code Form under this License."

---

## 9. Options

The two decisions **cannot both stand as the code is today**. The collision is caused by the PokéRogue-derived code, not by the AGPL on the project's own code. The options, cheapest first:

| # | Option | What it takes | What it costs |
|---|---|---|---|
| **A** | **Restructure what ships** + keep AGPL + App Store (holder route) | Remove the PokéRogue-derived code from the extension bundle: call game functions at runtime where they are reachable, and clean-room the rest from observed behaviour and a written spec, not from source. Commit a `LICENSE`. Require an inbound grant (CLA, or a CONTRIBUTING clause like VLC's) before merging any outside contribution. | An audit of `20-enemy-ai.js` against upstream. Forks can never ship to the App Store (§4). Parity risk if some prediction can't be rebuilt without copying. |
| **B** | **Developer ID only** on Safari | Distribute the containing app outside the Mac App Store (§5.2). | Loses iOS and App Store discovery. **But it also resolves** #103's 2.4.5(vii) update-channel problem and the DSA trader-address disclosure, and it is the only macOS route where the containing app can supervise a long-running process (#103). Third-party AGPL code becomes lawful to ship. |
| **C** | **Change licence** | For example, dual AGPL-3.0 + MPL-2.0 (the VLC model), or a permissive licence, for the extension. | **Does not fix the PokéRogue-derived code**, which stays AGPL-3.0-only whatever this project picks. So C needs A's removal work anyway, and buys nothing A doesn't unless the goal is to let forks ship to Apple too. |
| **D** | Add a §7 "additional permission" for app-store distribution | A licence exception letting anyone distribute through stores whose terms add restrictions. | AGPL §7: permissions may be placed only on "material … for which you have or can give appropriate copyright permission". So, like C, it cannot cover the PokéRogue code. It weakens the copyleft for everyone and gains little over A. |
| — | Split builds (App Store build without the copied features) | Two bundles. | Breaks "one extension, single listing" and HUD parity. Listed for completeness. |

Which to pick is a map decision, but the dependencies are: **A is required under every App Store option (A, C, D).** **B is the only option that removes nothing**, and it lines up with three other Safari findings already on the map.

---

## 10. Capture for #102: PLA §3.3.2 and runtime code evaluation

**The current PLA has no JavaScriptCore carve-out, and §3.3.2 is not the executable-code clause.** In the 18 Aug 2026 PLA, §3.3.2 is headed "Regulatory Compliance". The rule is **§3.3.1(B) "Executable Code"** **[primary]**:

> "Except as set forth in the next paragraph, an Application may not download or install executable code. Interpreted code may be downloaded to an Application but only so long as such code: (a) does not change the primary purpose of the Application by providing features or functionality that are inconsistent with the intended and advertised purpose of the Application (b) does not bypass signing, sandbox, or other security features of the OS; and (c) for Applications distributed on the App Store, does not create a store or storefront for other Applications."

The next paragraph is the learn-to-code exception (80% screen cap, conspicuous indicator, no storefront, source "completely viewable and editable by the user"). §3.3.1(C): an Application may not "provide, unlock or enable additional features or functionality through distribution mechanisms other than the App Store, Custom App Distribution or TestFlight" without Apple's approval or IAP.

**History, so nobody chases the old wording again:**

- **iOS Developer Program License Agreement, 2014-09-09, §3.3.2** ([Wayback, captured 2016-11-11](https://web.archive.org/web/20161111231903/https://developer.apple.com/programs/terms/ios/standard/ios_program_standard_agreement_20140909.pdf)) **[primary, archived]**: "An Application may not download or install executable code. Interpreted code may only be used in an Application if all scripts, code and interpreters are packaged in the Application and not downloaded. The only exception to the foregoing is scripts and code downloaded and run by Apple's built-in WebKit framework, provided that such scripts and code do not change the primary purpose of the Application …" That is WebKit only, no JavaScriptCore.
- **By December 2015** the clause read "…run by Apple's built-in WebKit framework or JavascriptCore, provided that…", as quoted by a non-Apple user on [Apple Developer Forums thread 23094](https://developer.apple.com/forums/thread/23094). **[community]** on Apple's forum. This is the version everyone remembers.
- **June 2017**: The Register reports Apple relaxed the ban and added the learn-to-code terms ([theregister.com, 2017-06-07](https://www.theregister.com/2017/06/07/apple_relaxes_developer_rules/)). **[community]**
- **January 2024** ([Wayback capture of the PLA page, 2024-01-05](https://web.archive.org/web/20240105013401/https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)): already §3.3.1(B) with no engine named, and §3.3.2 = "Regulatory Compliance". **[primary, archived]**
- **2026**: the same substance. Clauses (b) and (c) have swapped places, "as submitted to the App Store" has gone from (a), and (c) is now limited to App Store apps. **[primary]**

**What this means for the extension [inference]:**

- **The PLA is engine-agnostic and more permissive than the Guidelines.** Downloaded interpreted code is allowed by the PLA if it keeps the primary purpose, doesn't bypass OS security and isn't a storefront. The stricter App Store rules are the **Guidelines**: 2.5.2 "may not download, install, or execute code which introduces or changes features or functionality of the app", and 2.4.5(iv) on resources (#102). For App Store review the Guidelines decide, so #102's "data may move, logic may not" still stands.
- **4.7 does not help.** It permits "HTML5 and JavaScript mini apps and mini games … and plug-ins" offered *inside* an app to users, with a content index (4.7.4) and age gating (4.7.5). That is a different product shape, not a loophole for remote HUD logic.
- **§3.3 does not apply to Developer ID builds** (its preamble lists App Store, Custom App, TestFlight and Ad Hoc only). Attachment 7 still does ("single purpose", no "obfuscated code"). #102's constraint therefore binds the App Store route; Developer ID is looser on runtime code as well as on licensing.
- The HUD calling the page's *own* JavaScript in the MAIN world is not code "downloaded to an Application". It is the website's code, loaded by Safari. Nothing in §3.3.1(B) reaches it.

---

## 11. Other PLA findings this ticket surfaced

- **Attachment 7 §1.1: "You must not script or automate turning on Your Safari Extension or enable others to do so".** This applies to any Apple-signed Safari extension, **including Developer ID**. It bounds what a Safari pairing or setup command may do. The map's "Pairing is an explicit setup command" must not flip Safari's extension toggle for the user. **[primary]**
- **Attachment 7 §1.1: "Your Safari Extension must not be bundled with an app that has a different purpose than the Safari Extension."** This is a PLA-level backstop to #103's near-shell containing app. A containing app that grew into a general MCP host UI could collide with it. **[primary]** for the text, **[inference]** for its application.
- **PLA §3.1(f)**: "no agreement previously entered into by You will interfere with Your performance of Your obligations under this Agreement". A licensee bound by the AGPL is, on its face, in that position. **[primary]**

---

## 12. Open questions (candidate fog for #98)

1. **How much of `20-enemy-ai.js` (and the verbatim `calculateBossSegmentDamage`) is copied expression versus re-implemented algorithm?** No one has diffed it against `pagefaultgames/pokerogue` at the pinned tag. This blocks every App Store option.
2. **Can the copied logic be reached at runtime instead?** For example, by importing the game's own Vite chunk the way `47-biome.js` already does for biome data, which would take it out of the bundle entirely.
3. **Which licence gets committed, and when?** The repo is public with no licence. Choose between AGPL-3.0-only, AGPL-3.0-or-later and a dual licence before the first listing, since the choice decides whether forks can ever use Apple channels.
4. **An inbound-contribution grant**, whether a CLA or a VLC-style CONTRIBUTING clause. It is trivial while there are no outside contributors and impossible to add retroactively without everyone's consent.
5. **Whether "matching the game" still carries weight** once it is clear the AGPL is not inherited through runtime combination (§1, §6).
6. **Thin copyright in agent-written files** (§7.1). It affects enforceability under every licence choice. Worth knowing before relying on copyleft as a protection.
7. **Attachment 7's "must not script or automate turning on Your Safari Extension"** as a constraint on Safari onboarding and pairing (§11).
