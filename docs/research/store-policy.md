# Store cost, review latency and policy exposure

Research for [#102](https://github.com/IIxauII/pokerogue-mcp/issues/102), a child of map [#98 — HUD as a browser extension](https://github.com/IIxauII/pokerogue-mcp/issues/98).

Researched 2026-09-16. Every claim below is sourced; where a page states a "last updated" date it is recorded, because store policy text drifts and a quote without a date is worthless six months on. Claims that are **not** from a first-party page are labelled **ANECDOTAL** inline.

## Why this matters

The coach HUD reads PokéRogue's internals — handlers, enum tables, scene fields. Those move with every PokéRogue release. So the question is not "can we ship to a store" but **how fast a fix reaches a user who already installed it**, and **whether any part of the HUD's behaviour can be corrected without a fresh review**.

The short answer is at the bottom (["Verdict"](#verdict)). The long answer is that all three stores draw the same line in almost the same words: **remote *data* is fine, remote *logic* is not** — and Chrome, uniquely, spells out the failure mode we would be most tempted by.

---

## 1. Summary table

| | Chrome Web Store | addons.mozilla.org (AMO) | Apple App Store (Safari Web Extension in a Mac app) |
|---|---|---|---|
| **Fee** | One-time registration fee. **Amount on no primary page**; USD 5 is anecdotal (§2.1). New publishers capped at 2 extensions | None — but by exhaustive absence, not by a quote (§3.1) | USD 99 **per membership year**, recurring. No primary EUR figure |
| **New listing latency** | "within a few days, but it can take up to a few weeks" | "up to 24 hours … or longer if your submission is selected for manual review" | "On average, 90% of submissions are reviewed in less than 24 hours" |
| **Update latency** | Same process as a new listing, explicitly — no fast lane | Same 24 h signing path; listed updates auto-publish once signed | Same review queue; expedited review available for a critical bug fix |
| **Reaches installed users** | Chrome update check "default … frequency is several hours" | Firefox handles updates automatically for listed add-ons | App Store / macOS app update |
| **Native messaging stance** | No specific ban. It is a permission, so minimum-permissions + written justification apply; "sensitive execution permissions" lengthen review | No ban. Policies explicitly extend to data sent to the native app | Supported and documented (`SafariWebExtensionHandler`); the native half must be inside the containing app |
| **Game-assist / overlay stance** | No cheat-specific clause. Exposure is IP/impersonation and "Misleading or Unexpected Behavior" | No cheat-specific clause. Exposure is "No Surprises" | **5.2.2** — must be "specifically permitted … under the service's terms of use", and "Authorization must be provided upon request" |
| **Remote code ban** | MV3: extension logic must be in the package; a remote **interpreter** is banned "even if those commands are fetched as data" | "Add-ons must be self-contained and not load remote code for execution." No written remote-data carve-out | **2.5.2** bans downloading code; **2.4.5(iv)** additionally bans downloaded "resources" that add functionality or significantly change the app |
| **Off-store escape hatch** | **Linux only** | Yes — unlisted self-distribution, still signed, still ~24 h | Yes — Developer ID + notarization. But a *Mac App Store* build may not self-update at all: **2.4.5(vii)**, see [#103](https://github.com/IIxauII/pokerogue-mcp/issues/103) |

---

## 2. Chrome Web Store

### 2.1 Fee

The official docs state that there is a one-time fee but **do not state the amount**:

> Before you can publish items on the Chrome Web Store, you must register as a CWS developer and pay a one-time registration fee.

— [Register your developer account](https://developer.chrome.com/docs/webstore/register) (last updated 2024-02-13)

> Once you pay the registration fee and agree to the terms, you will not see this registration page again.

— same page.

The fee's existence is contractual — it is established by §2.1 of the Chrome Web Store Developer Agreement, which also reserves Google's right to set the amount. **The USD 5 figure does not appear on any current primary page.** It is shown only on the signed-in developer dashboard registration screen (not publicly fetchable); the oldest traceable public statement of "$5" is a 2010 post to the chromium-extensions mailing list. It is further corroborated only by titles of threads in Google's own Help Community, e.g. ["Can't pay Developer Registration $5 fee"](https://support.google.com/chrome/thread/13959323/can-t-pay-developer-registration-5-fee?hl=en) and ["Can't find my country in the billing address to pay the $5 developer signup fee on Chrome store"](https://support.google.com/chrome/thread/24496459/can-t-find-my-country-in-the-billing-address-to-pay-the-5-developer-signup-fee-on-chrome-store?hl=en).

**Label: the one-time nature is primary-sourced; the number is ANECDOTAL and Google reserves the right to change it.** Budget for "small and one-time", not for "$5".

### 2.1a Publishing cap for new developers

Separate from the fee, and newly relevant: as of an August 2026 change, **new publishers are capped at two published extensions**, with increases granted based on engagement and account tenure. This is a first-listing constraint, not a latency one, but it means the account is a resource to spend deliberately — a throwaway test listing costs half the initial allowance.

### 2.2 Review latency — new listing vs update

Google publishes a range, not an SLA:

> For most extensions, review is completed within a few days, but it can take up to a few weeks. If you experience longer review times without making significant changes to your extension, this may be due to factors outside of your control including how many submissions we are handling at the time.

> Note: If your extension is pending review for more than three weeks, please contact developer support to request assistance.

— [Chrome Web Store review process](https://developer.chrome.com/docs/webstore/review-process)

**The decisive sentence for us** — there is no fast lane for updates:

> Note that all item submissions—whether for a new item or an update to an existing one—are subject to the same review process.

— same page.

Signals that lengthen review, verbatim:

> All submissions go through the same review system, regardless of the tenure of the developer or number of active users. However, some signals may cause the reviewer to examine an extension more closely, including:
> - new developers
> - new extensions
> - dangerous permission requests
> - significant code changes

> Reviews may take longer for extensions that request broad host permissions or sensitive execution permissions, or which include a lot of code or hard-to-review code.

— same page.

And specifically on remote code:

> Your extension should avoid using remote code except where absolutely necessary. Extensions that use remote code will need extra scrutiny, resulting in longer review times. Extensions that call remote code and do not declare and justify it using the field shown above will be rejected.

— [Privacy and security tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)

There is **no expedited-review path** documented for the Chrome Web Store. Nothing on the review-process page offers one.

### 2.3 Reaching an installed user after approval

Approval is not delivery. Chrome polls:

> The default update check frequency is several hours, but an update can be forced using the Update extensions now button on the Extensions Management Page.

— [Self-host for Linux](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux)

So the realistic worst case for a CWS fix is: *few days to few weeks of review* + *several hours of propagation*.

### 2.4 Native messaging

There is no Chrome Web Store policy clause naming `nativeMessaging`. The applicable policy is the general minimum-permissions rule:

> Request access to the narrowest permissions necessary to implement your Product's features or services. If more than one permission could be used to implement a feature, you must request those with the least access to data or functionality. Don't attempt to "future proof" your Product by requesting a permission that might benefit services or features that have not yet been implemented.

— [Use of Permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions) (last updated 2022-11-01)

Plus a written justification per permission at submission time:

> Permissions justification This section contains a list of permissions that your extension uses (as declared in your manifest), with a field for you to state the justification for each permission. Fill out these fields to tell the reviewers why your extension needs to use each permission.

— [Privacy and security tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)

Read together with "sensitive execution permissions … take more time to review" (§2.2), the practical stance is: **declaring native messaging is allowed, and it costs review time.** It is not a ban.

### 2.5 Game-assist and overlay

No Chrome Web Store policy names games, cheats, bots, or overlays. The clauses that could reach a PokéRogue HUD are:

> Don't misrepresent the functionality of your product or include non-obvious functionality that doesn't serve the primary purpose of the product. Descriptions of your product must directly state the functionality so that users have a clear understanding of the product they are adding.

— [Misleading or Unexpected Behavior](https://developer.chrome.com/docs/webstore/program-policies/unexpected-behavior) (last updated 2022-11-01)

> Don't pretend to be someone else, and don't represent that your product is authorized by, endorsed by, or produced by another company or organization, if that is not the case.

> Don't infringe on the intellectual property rights of others, including patent, trademark, trade secret, copyright, and other proprietary rights. We will respond to clear notices of alleged copyright infringement.

> The visibility of your Product may be impacted if we believe it potentially infringes on intellectual property rights.

— [Impersonation & Intellectual Property](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property) (last updated 2022-11-01)

The real exposure here is **trademark**, not cheating: PokéRogue is itself a Pokémon fan game, and a listing decorated with Pokémon names and sprites inherits that exposure. Notably Chrome, unlike Apple, has **no clause requiring permission from the third-party site**.

### 2.6 Remote code — the crux

Two documents matter. The **policy** (binding) and the **developer guide** (explanatory).

**Policy**, verbatim and in full:

> Extensions using Manifest V3 must meet additional requirements related to the extension's code. Specifically, the full functionality of an extension must be easily discernible from its submitted code, unless otherwise exempt as noted in Section 2. This means that the logic of how each extension operates should be self contained. The extension may reference and load data and other information sources that are external to the extension, but these external resources must not contain any logic. Some common violations include:
> - Including a `<script>` tag that points to a resource that is not within the extension's package
> - Using JavaScript's `eval()` method or other mechanisms to execute a string fetched from a remote source
> - **Building an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data**

> Execution of logic from a remote source is permissible only when accomplished through a documented API that explicitly allows this practice and the use is inline with the documented purpose of the API, as detailed in the API Use policy. The permitted APIs for such remote execution are:
> - Debugger API
> - User Scripts API

> Note that exemptions apply solely to the specific section of code covered by these APIs. Extensions may still be in violation of this policy if they employ alternative methods to execute logic from remote sources elsewhere in their code.

> Additionally, code run in contexts that are isolated from extension APIs (such as iframes and sandboxed pages) are exempt from the restriction on loading code from remote sources; however, these are treated similarly to our policy on communication with external servers. That is, it must still be possible to determine the full functionality of your extension and the interaction must still comply with our user data policies […]

> Communicating with remote servers for certain purposes is still allowed. For instance:
> - Syncing user account data with a remote server
> - **Fetching a remote configuration file for A/B testing or determining enabled features, where all logic for the functionality is contained within the extension package**
> - Fetching remote resources that are not used to evaluate logic, such as images
> - Performing server-side operations with data (such as for the purposes of encryption with a private key)

> If we are unable to determine the full functionality of your extension during the review process, we may reject your submission or remove it from the store.

— [Additional Requirements for Manifest V3](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) (last updated 2024-04-03). Emphasis added.

**Developer guide**, verbatim:

> In Manifest V3, all of your extension's logic must be part of the extension package. You can no longer load and execute remotely hosted files according to Chrome Web Store policy. Examples include:
> - JavaScript files pulled from the developer's server.
> - Any library hosted on a CDN.
> - Bundled third-party libraries that dynamically fetch remote hosted code.

Under the heading **"Configuration-driven features and logic"**:

> Your extension loads and caches a remote configuration (for example a JSON file) at runtime. The cached configuration determines which features are enabled.

Under the heading **"Externalized logic with a remote service"**:

> Your extension calls a remote web service. This lets you keep code private and change it as needed while avoiding the extra overhead of resubmitting to the Chrome Web Store.

Under **"Use external libraries in tab-injected scripts"**:

> You can still load data remotely at runtime.

— [Improve extension security](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security) (last updated 2023-03-08)

CSP is enforced mechanically as well, not only by review:

> Manifest V3 disallows certain content security policy values in the `"extension_pages"` field that were allowed in Manifest V2. Specifically Manifest V3 disallows those that allow remote code execution. The `script-src`, `object-src`, and `worker-src` directives may only have the following values: `self`, `none`, `wasm-unsafe-eval`, [and] Unpacked extensions only: any localhost source

— same page.

**Where the line falls, in our terms.** A version-keyed table of PokéRogue selectors, enum names and numeric constants, fetched as JSON and consumed by code that already ships in the package, is squarely inside "Fetching a remote configuration file … where all logic for the functionality is contained within the extension package". A *rule engine* — shipping a small evaluator and feeding it fetched expressions like `enemy.hp < 0.3 && move.type === 'fire'` — is squarely inside "Building an interpreter to run complex commands fetched from a remote source, **even if those commands are fetched as data**". Google anticipated exactly the trick.

**The `userScripts` exemption is not a loophole for us.** The MV3 policy lists the User Scripts API as one of two permitted routes to remote logic, but only "where […] the use is inline with the documented purpose of the API". That documented purpose is narrow:

> Unlike other extension features, such as Content Scripts and the `browser.scripting` API, the User Scripts API lets you run arbitrary code. This API is required for extensions that run scripts provided by the user that cannot be shipped as part of your extension package.

> After your extension receives the permission to use the userScripts API, users must enable a specific toggle to allow your extension to use the API.

— [`chrome.userScripts`](https://developer.chrome.com/docs/extensions/reference/api/userScripts)

Scripts *we* push are not "provided by the user", and the API is gated behind a user-flipped toggle (Allow User Scripts on Chrome 138+, Developer mode below). Using it to hot-patch HUD logic would be both a policy violation and an onboarding tax. Rule it out.

### 2.7 Off-store distribution

> Linux is the only platform where Chrome users can install extensions that are hosted outside of the Chrome Web Store.

— [Self-host for Linux](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux)

For a macOS/Windows user, there is no self-hosted Chrome escape hatch short of unpacked developer-mode loading or enterprise policy. Chrome is the store with the slowest review **and** the weakest bypass.

---

## 3. addons.mozilla.org (AMO)

### 3.1 Fee

There is no developer registration or listing fee for AMO.

**Flag this as formally negative evidence.** No primary Mozilla page affirmatively states that AMO is free. The conclusion rests on exhaustive absence: the Firefox Add-on Distribution Agreement, the developer-accounts page, and the step-by-step submission walkthrough ([Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)) contain no fee, no payment step and no price. That is strong but it is not a quote. Mozilla's policies mention payment only in the other direction, for add-ons that themselves charge:

> Listings must disclose when payment is required to enable any add-on functionality.

— [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)

### 3.2 Review latency, and the signing model

AMO's model is fundamentally different from Chrome's and Apple's: **automated validation gates publication, human review happens afterwards and continuously.**

> Regardless of distribution method, all add-ons undergo automated validation before they are signed. It can take up to 24 hours for your submission to be signed and published, or longer if your submission is selected for manual review.

> All add-ons are subject to a manual code review at any time after submission. The review criteria applied to add-ons are found in the Add-on Policies. Reviews may result in the rejection of current or previous versions of your add-on, or in your add-on being blocked.

— [Signing and distribution overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)

This "up to 24 hours" figure is the same for a new listing and for an update — the page draws no distinction. It is the only number Mozilla publishes.

Delivery to installed users:

> When an add-on is listed on AMO, updates to installed copies are handled automatically by Firefox each time a new version is listed on AMO.

— same page.

### 3.3 Self-distribution (unlisted)

> Self-distributed add-ons are sometimes referred to as "unlisted" extensions because they cannot be publicly viewed or installed from AMO. You may want to self-distribute your extension if it is a beta version or if it is intended to be used by a limited audience. All add-ons, including self-distributed ones, are subject to be manually reviewed at any time after submission to check for compliance with the Add-on Policies.

— same page.

Self-distributed builds still get signed (same up-to-24-h path) but skip listing review, and Firefox will still auto-update them:

> If you want Firefox to handle updates to your add-on, remember to include the `browser_specific_settings` key in your `manifest.json` with the `update_url` attribute set to point to an update manifest file.

— [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)

Install is a plain link to a signed `.xpi`:

> Using either method, Firefox installs the signed add-on file when the user downloads it.

— [Self-distribution](https://extensionworkshop.com/documentation/publish/self-distribution/) (last update Sep 12, 2022)

**This is the fastest shipping path of any of the three stores**, by a wide margin: a HUD fix is in front of users within a day, with no listing review at all.

### 3.4 Native messaging

Not prohibited. Policy extends *through* it:

> If the add-on uses native messaging, the Add-on Policies (including those related to user consent and control) apply to any data sent to the native application as well.

> Leaking local or user-specific information to websites or other applications (e.g. through native messaging) is prohibited.

— [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)

The second clause is the one to design against: a HUD that pipes game state to a local MCP server is fine; a HUD that pipes anything *from* the local machine back into the page is not.

### 3.5 Game-assist and overlay

No cheat-specific clause. The governing one is transparency:

> Users should be able to easily discern the functionality of your add-on based on the listing, and should not be presented with unexpected user experiences after installing it.

— [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/), "No Surprises"

Also relevant if the HUD ever injects anything into the page beyond its own chrome:

> An add-on injecting advertising into web page content must clearly identify the injected content as originating from the add-on.

— same page.

Mozilla has **no equivalent of Apple's 5.2.2** — no requirement to hold permission from the site being modified. Modifying third-party pages is the normal, expected business of a Firefox extension.

### 3.6 Remote code

Mozilla's clause is one sentence, and it is stricter in tone than Chrome's but narrower in scope:

> Add-ons must be self-contained and not load remote code for execution.

Adjacent technical requirements from the same list:

> Add-ons must only request those permissions that are necessary for them to function.
> Add-ons must not relax web page security headers, such as the Content Security Policy.
> Add-ons must use encryption when transporting data remotely.
> Only release versions of third-party libraries and/or frameworks may be included with an add-on. Modifications to these libraries/frameworks are not permitted.

— [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/), "Development Practices"

And on reviewability:

> If external resources are used in combination with add-on code, the functionality of the code must not be obscured.

— same page, Source Code Submission.

**Caveat, stated plainly:** Mozilla's policy text does **not** contain an explicit remote-data carve-out the way Chrome's does. It bans "remote code for execution" and requires that fetched external resources not obscure the code's functionality. The natural reading is the same line Chrome draws — fetched JSON that parameterises shipped logic is data, not code — but *that reading is inference, not a Mozilla quote.* Nothing in the Add-on Policies, the Add-on Policies FAQ, or the signing overview says so in as many words. Mozilla also does not have Chrome's explicit "even if those commands are fetched as data" interpreter clause, so the boundary is less precisely mapped in both directions. Also unlike Chrome, blocking is a live risk:

> Add-ons may be blocked if they: Intentionally violate policies. […] Obfuscate or contain unreadable code.

— [Add-on Policies FAQ](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/)

---

## 4. Apple App Store (Safari Web Extension)

A Safari web extension on macOS ships inside a containing Mac app:

> Safari supports distributing a web extension in a macOS app, a visionOS app, an iOS app, or a Mac app created using Mac Catalyst.

> Safari only supports signed extensions, but for beta testing, you can send beta testers an unsigned copy of the macOS app containing your extension, and then instruct them how to enable testing.

— [Distributing your Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)

### 4.1 Fee

> The Apple Developer Program is 99 USD per membership year. Prices may vary by region and are listed in local currency during the enrollment process. If you're a nonprofit organization, accredited educational institution, or government entity […]

— [Enrolling in the Apple Developer Program](https://developer.apple.com/programs/enroll/)

> To distribute your web extension, first join the Apple Developer Program.

— [Distributing your Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)

**Recurring, annually** — "per membership year", not one-time. This is the only recurring cost of the three, and it applies to the off-store path too, because Developer ID certificates and notarization both require program membership. Apple says prices "may vary by region" but **publishes no EUR figure on any primary page**; the local-currency amount is only shown during enrolment. Do not quote a euro number.

### 4.2 Review latency

> On average, 90% of submissions are reviewed in less than 24 hours. You'll be notified by email of status changes. You can also check the review status of your submission in the Apps section of App Store Connect or on the App Store Connect app for iPhone and iPad. If your submission is incomplete, review times may be delayed or your submission may not pass.

— [App Review](https://developer.apple.com/distribute/app-review/)

Apple draws **no new-listing/update distinction** in that figure; it is one number for all submissions. It does offer an escape valve Chrome does not:

> You can request the review of your app to be expedited if you face extenuating circumstances, such as fixing a critical bug in your app or releasing your app to coincide with an event you're directly associated with. Critical bug fix. When submitting an expedited review to fix a critical bug, include the steps to reproduce the bug on the current version of your app.

— same page.

And a lenience specific to bug-fix updates:

> If you're submitting a bug fix update for your app and we find additional issues during review, you have the option to resolve the additional issues with your next submission, as long as there are no legal or safety concerns.

— same page.

Apple's *stated* latency is the best of the three. Its *variance* is the worst, because a single guideline objection (see 5.2.2 below) restarts the clock.

### 4.3 Native messaging

Supported and first-party documented. Apple describes the extension as three sandboxed parts:

> A Safari web extension consists of three parts that operate independently in their own sandboxed environments: A macOS or iOS app that can have a user interface […]

> From a script running in the browser or Mac web app, use `browser.runtime.sendNativeMessage` to send a message to the native app extension

> To prepare the JavaScript script to receive messages from the macOS app, use `browser.runtime.connectNative` to establish a port connection to the containing app

— [Messaging between the app and JavaScript in a Safari web extension](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)

The native side is the **containing app**, not an arbitrary local binary. That is the constraint that matters for a HUD/MCP bridge: unlike Chrome and Firefox native messaging, which reach a host program registered separately on the machine, Safari's native messaging reaches only code Apple reviewed and shipped in the same bundle.

No App Store Review Guideline prohibits it. The adjacent constraints are:

> 2.5.1 Apps may only use public APIs and must run on the currently shipping OS. […] Apps should use APIs and frameworks for their intended purposes and indicate that integration in their app description.

> (iii) They may not auto-launch or have other code run automatically at startup or login without consent nor spawn processes that continue to run without consent after a user has quit the app. They should not automatically add their icons to the Dock or leave shortcuts on the user desktop.

— [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

That second clause is a live constraint for a HUD that wants a long-lived local server: **spawning a process that outlives the app requires consent.**

### 4.4 Game-assist and overlay — the sharpest exposure of the three

> 5.2.2 Third-Party Sites/Services: If your app uses, accesses, monetizes access to, or displays content from a third-party service, ensure that you are specifically permitted to do so under the service's terms of use. Authorization must be provided upon request.

— [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

> 5.2.1 Generally: Don't use protected third-party material such as trademarks, copyrighted works, or patented ideas in your app without permission, and don't include misleading, false, or copycat representations, names, or metadata in your app bundle or developer name.

— same page.

An overlay HUD for pokerogue.net displays content from a third-party service and decorates it with Pokémon trademarks. Apple can demand written authorization at any time, and "Authorization must be provided upon request" is not a defence you can argue — it is a document you either have or don't. **This is the single largest App Store risk, well ahead of the remote-code question.**

There is no App Store guideline that bans game-assist tools as such. The problem is not that the HUD helps; it is whose site and whose IP it helps with.

### 4.5 Remote code — guideline 2.5.2

Two guidelines matter here, and **2.4.5 is the harsher of the two for a Mac App Store build.**

**2.4.5, the Mac-App-Store-specific clauses**, verbatim:

> 2.4.5 Apps distributed via the Mac App Store have some additional requirements to keep in mind:

> (ii) They must be packaged and submitted using technologies provided in Xcode; no third-party installers allowed. They must also be self-contained, single app installation bundles and cannot install code or resources in shared locations.

> **(iv) They may not download or install standalone apps, kexts, additional code, or resources to add functionality or significantly change the app from what we see during the review process.**

> **(vii) They must use the Mac App Store to distribute updates; other update mechanisms are not allowed.**

— [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), §2.4.5. Emphasis added.

(vii) is established in [#103](https://github.com/IIxauII/pokerogue-mcp/issues/103) (findings on the `research/safari-shipping` branch) and is not re-derived here. It closes the sideload-your-own-updater door completely for a Mac App Store build.

(iv) is the one that bites this ticket, and it is **the strictest remote-content wording of any of the three stores**: it names "**resources**", not just code, and forbids downloading them "to add functionality or significantly change the app from what we see during the review process". Note carefully what it still permits: it bars downloaded resources that *add* functionality or *significantly change* the app. A fetched table that keeps an already-reviewed HUD doing the same job against a moved selector neither adds nor significantly changes — it repairs. That is a defensible reading, but it is a reading, and it is narrower ground than Chrome's explicit carve-out.

**2.5.2**, verbatim, in full, current wording:

> 2.5.2 Apps should be self-contained in their bundles, and may not read or write data outside the designated container area, nor may they download, install, or execute code which introduces or changes features or functionality of the app, including other apps. Educational apps designed to teach, develop, or allow students to test executable code may, in limited circumstances, download code provided that such code is not used for other purposes. Such apps must make the source code provided by the app completely viewable and editable by the user.

— [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), §2.5.2

Note what 2.5.2 does **not** say: it bans downloading *code*. It says nothing about downloading data. Apple's own 4.7 confirms that non-bundled software is a category Apple reasons about separately and permits under conditions:

> 4.7 Mini apps, mini games, streaming games, chatbots, plug-ins, and game emulators — Apps may offer certain software that is not embedded in the binary, specifically HTML5 and JavaScript mini apps and mini games, streaming games, chatbots, and plug-ins. […] You are responsible for all such software offered in your app, including ensuring that such software complies with these Guidelines and all applicable laws.

> 4.7.2 Your app may not extend or expose native platform APIs or technologies to the software without prior permission from Apple.

— same page.

**Caveat, stated plainly:** the WebKit/JavaScriptCore carve-out that older write-ups attribute to 2.5.2 is **not present in the current guideline text** quoted above. That exception lives in the Apple Developer Program License Agreement (§3.3.2), which is a login-gated PDF we did not verify first-hand. **Do not rely on a JavaScriptCore exception** — treat it as unverified.

**Where the line falls, in our terms.** Fetching a version-keyed JSON table of PokéRogue selectors and enum constants is downloading data, not code, and 2.5.2 does not reach it — but **2.4.5(iv) does reach "resources"**, so on the Mac App Store the defence is not "it isn't code", it is "it doesn't add functionality or significantly change the app". Keep the fetched table strictly repair-shaped — same features, relocated targets — and that defence holds. The moment the table can turn a feature on that review never saw, it fails 2.4.5(iv) on its own terms, regardless of 2.5.2.

Fetching JavaScript and evaluating it changes "features or functionality of the app" and 2.5.2 reaches it squarely. The grey zone Chrome closed explicitly (a shipped interpreter fed remote expressions) Apple has **not** addressed in writing; Apple review is discretionary, and 2.5.2's "introduces or changes features or functionality" is broad enough for a reviewer to read a rules engine as a functionality change. Assume the Chrome reading applies, because it is the strictest written line of the three and the only one that names the interpreter trick.

### 4.6 Off-store distribution

> If you provide your extension in macOS and don't want to use the Mac App Store for distribution, you can sign and notarize your extension's app with a Developer ID to distribute it outside the Mac App Store.

— [Distributing your Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)

Notarization is an automated malware scan, not a human review, and the App Store Review Guidelines (including 2.5.2 and 5.2.2) do not apply to it. Apple's App Review page even calls it out as a distinct outcome:

> Decide whether your app is reviewed for the App Store or Notarization only.

— [App Review](https://developer.apple.com/distribute/app-review/)

**ANECDOTAL:** notarization typically completes in minutes; Apple publishes no SLA for it that we could find on a primary page. Treat "minutes" as community knowledge, not a commitment.

---

## 5. Verdict

**Can overlay logic be updated without a fresh review?**

**No — not the logic. Yes — the data the logic reads, on all three stores, and that distinction is the whole design constraint.**

- Chrome states it outright: fetching "a remote configuration file … where all logic for the functionality is contained within the extension package" is permitted, and so is "fetching remote resources that are not used to evaluate logic". Chrome equally states that building "an interpreter to run complex commands fetched from a remote source, **even if those commands are fetched as data**" is a violation. Google closed the loophole before we got to it.
- Mozilla bans "remote code for execution" and is silent on remote data. The inference that data is fine is safe but it *is* an inference.
- Apple's 2.5.2 bans downloading *code* and is silent on data — but **2.4.5(iv) is not silent on data.** For a Mac App Store build the fetched table must not "add functionality or significantly change the app from what we see during the review process". Repair is fine; feature delivery is not. And by 2.4.5(vii) the app itself may not self-update by any route other than the Mac App Store ([#103](https://github.com/IIxauII/pokerogue-mcp/issues/103)) — so the config table is the *only* sub-review lever Apple leaves, and it is the narrowest of the three.

**Therefore the shipping strategy that follows from this ticket:**

1. **Everything version-fragile that can be expressed as data, must be data.** Selectors, UiMode-to-screen mappings, enum tables, `Button` int values, field paths, version-pinned constants — all of these belong in a fetched, version-keyed JSON table that the extension caches. That table can be corrected in minutes, for every installed user, on every store, with no review. This is legal on all three and it covers the *majority* of what breaks when PokéRogue ships a release. **Design it so the table can only re-point existing behaviour, never enable new behaviour** — that is what keeps it inside Apple's 2.4.5(iv) as well as Chrome's carve-out.
2. **Anything that requires new branching is a new build, and a new review.** There is no legal way around this. Budget: Firefox ~24 h, Apple ~24 h (90th percentile) plus an expedite lever, Chrome *days to weeks* with no expedite lever and no update fast lane.
3. **Firefox self-distribution is the fastest channel we have** — signed in up to 24 h, no listing review, auto-updating via `update_url`. If a same-day fix path matters, that is where it exists.
4. **Chrome is the slowest and least escapable.** Same review for updates as for new listings, no expedited path, and self-hosting is Linux-only. Any plan whose latency budget assumes "we can push a Chrome fix quickly" is wrong.
5. **Apple's binding risk is 5.2.2, not 2.5.2.** "Authorization must be provided upon request" from pokerogue.net's terms of use is a document we do not have. If the App Store is on the roadmap, that is the blocker to resolve first — the remote-code question is comparatively easy.

## 6. Open questions this leaves

- The exact Chrome Web Store registration fee is not in any public first-party page. Confirmed one-time (Developer Agreement §2.1); amount is anecdotal and Google reserves the right to change it.
- The August 2026 two-extension cap for new Chrome publishers is noted but its exact terms ("engagement and account tenure") are not quantified anywhere we found. If the plan involves a separate test listing, confirm the cap first.
- AMO being free rests on exhaustive absence rather than a quotable statement. Low risk, but it is negative evidence.
- Mozilla has no written remote-data carve-out. If the HUD's config-table approach is load-bearing for Firefox, it is worth asking AMO review directly rather than inferring.
- Apple's 2.4.5(iv) bans downloaded *resources* that "add functionality or significantly change the app". Whether a reviewer reads a selector-repair table as within that is untested. Nobody we found has litigated it publicly.
- The Apple Developer Program License Agreement §3.3.2 (JavaScriptCore exception) was not read first-hand; it is login-gated. Any plan depending on it needs that document.
- Nobody publishes a *median* review latency. Chrome gives a range, Mozilla a ceiling, Apple a 90th percentile. These are not comparable numbers and should not be put in the same column of a plan without saying so.
- Whether PokéRogue's own terms of use permit a third-party overlay at all is unexamined here and is a prerequisite for the App Store path (and a soft risk on the other two, via their IP clauses).
