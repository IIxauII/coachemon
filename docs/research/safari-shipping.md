# Safari shipping path

Research for [#103](https://github.com/IIxauII/pokerogue-mcp/issues/103), a child of map [#98 "Map: HUD as a browser extension"](https://github.com/IIxauII/pokerogue-mcp/issues/98).

All sources retrieved **2026-09-16**. Apple's documentation pages are undated; where Apple states a date in the text itself, that date is quoted. Apple's DocC pages render client-side, so the prose below was read from the underlying JSON (`https://developer.apple.com/tutorials/data/documentation/<slug>.json`), which is the same content the page renders.

Every claim is labelled:

- **[primary]** — Apple's own documentation, guidelines, or WWDC session.
- **[inference]** — follows from primary sources but Apple does not state it in those words.
- **[community]** — secondary or anecdotal; treat as weak.

---

## 1. Answer in one paragraph

Shipping a Safari web extension costs **99 USD per year** and nothing else in money: the Apple Developer Program is the only paywall, and individual enrolment needs a legal name, a two-factor Apple Account, a non-P.O.-box address and a government photo ID — **no legal entity and no D-U-N-S Number**, which are explicitly Organization-only requirements, so the map's "individual developer accounts" decision holds. As of WWDC26 (June 2026) **Xcode and a Mac are no longer mandatory** for the App Store route: App Store Connect hosts a web-based Safari Web Extension Packager that takes a ZIP of extension files and assembles the containing app on Xcode Cloud. The command-line tool still exists, is now called **`safari-web-extension-packager`** (renamed from `safari-web-extension-converter`), and emits an *Xcode project* — not a finished app — containing a macOS and/or iOS app plus the extension. The containing app may be close to a shell: guideline 4.4 asks only that extension-hosting apps "include some functionality, such as help screens and settings interfaces where possible", which is a far softer bar than 4.2's anti-webview-wrapper language, and Apple's own template and its own ASC packager both generate a near-shell app. macOS has a genuine second route — **Developer ID signing plus notarization**, which is an automated malware scan and explicitly "not App Review" — giving a direct download with no review, no product page, and no EU trader disclosure; **iOS has no such route**. The one hard blocker is architectural, not procedural: Safari's native messaging does not reach an arbitrary local executable. `browser.runtime.sendNativeMessage` is delivered only to the containing app's own **native app extension**, whose `application.id` argument Safari ignores outright, and an app extension "typically terminates soon after it completes the request" with "no direct communication between an app extension and its containing app". So **the containing app cannot be the MCP host process on Safari**, and the transport half of the extension needs a different bridge there than on Chrome and Firefox.

**Verdict: Safari day-one parity is feasible for the HUD and is not feasible as-designed for the MCP transport.** The cost floor is trivial; the transport floor is not.

---

## 2. Apple Developer Program enrolment

### Fee

> "The Apple Developer Program is 99 USD per membership year. Prices may vary by region and are listed in local currency during the enrollment process."

— [Apple Developer Program enrolment](https://developer.apple.com/programs/enroll/) **[primary]**

This is the **entire recurring monetary cost**. There is no separate Safari extension fee, no per-listing fee, and no notarization fee.

### What individual enrolment requires

From the same page **[primary]**:

- "you'll need an Apple Account with two-factor authentication turned on"
- "be the legal age of majority in your region"
- "Make sure to use your legal name in the first and last name fields of your Apple Account. Using an alias, nickname, or company name as your first or last name will cause a delay in the approval of your enrollment."
- "Legal name. Your personal legal name is needed so that you can enter into contracts with Apple."
- "Email, phone, and address. **P.O. boxes are not accepted.**"

Identity verification is by government photo ID — driver's licence, identity card or passport, plus possibly a selfie, depending on region; Apple checks authenticity and extracts name and address but states it does not keep the image, and offers an alternative verification method on request where not required by law. Enrolment and verification can be done in the Apple Developer app. — [Identity verification](https://developer.apple.com/help/account/membership/identity-verification/), [Enrolling with the Apple Developer app](https://developer.apple.com/help/account/membership/enrolling-in-the-app/) **[primary]**

### What individual enrolment does NOT require — map decision verified

The following are stated on the same page under **Organization** enrolment only:

- "Legal entity name and status. Your organization must be a legal entity that can enter into contracts with Apple. We do not accept DBAs, fictitious business names, trade names, or branches."
- "**D-U-N-S Number.** Your organization (excluding government entities) must have a D-U-N-S Number"
- "Your work email address needs to be associated with your organization's domain name."
- "Your organization's website must be publicly available and functional, and its domain name must be associated with your organization."

**The map's locked decision — "Individual developer accounts. No legal entity, no D-U-N-S." — holds for Apple.** **[primary]**

### The costs that are not money

Two consequences of enrolling as an individual are worth pricing separately, because neither appears on the $99 line:

1. **The developer name on the App Store product page is the individual's legal name.** App Store Connect's guidance is "If you're registered as a company, you have the option to set your developer name" — the option is conditioned on company registration. — [Packaging and distributing Safari Web Extensions with App Store Connect](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect) **[primary]**; that individuals therefore cannot set an alternative developer name is **[inference]**.

2. **EU distribution publishes a home address.** Under the Digital Services Act, every developer must declare a trader status, and a trader distributing on the EU App Store must supply an address (a P.O. Box is accepted here), phone number and email. "Once verified, Apple will publish this information on your App Store product page when your app is distributed in any of the 27 territories of the EU." Individuals are explicitly covered. Free apps are not automatically exempt — the test is whether the app is made in the course of a trade, business, craft or profession. — [Manage EU DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/) **[primary]**

   Whether a hobbyist AGPL extension with no revenue qualifies as trader activity is a judgement call Apple pushes onto the developer. **[inference]** The notarized direct-download route (§6) sidesteps this entirely, since there is no App Store product page.

---

## 3. Is Xcode mandatory? No longer — as of WWDC26

This is the single largest change since the map was charted, and it changes the feasibility answer.

### The web route: no Mac, no Xcode

> "The Safari web extension packager enables you to package and distribute your Safari extensions using App Store Connect from any web browser, without requiring a Mac or access to Xcode. After packaging your extension, you can use TestFlight to test your extension or submit it to the App Store for distribution."

— [Packaging and distributing Safari Web Extensions with App Store Connect](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect) **[primary]**

Announced in [WWDC26 session 216, "Create web extensions for Safari"](https://developer.apple.com/videos/play/wwdc2026/216/) **[primary]**:

> "App Store Connect is where you can upload, submit, and manage your extensions... And the best part? You can do this from any browser, without using a Mac."

> "Since Safari web extensions need to be packaged within a containing app, I can use App Store Connect to create this app for me."

The flow: create an app record in App Store Connect (choosing macOS, iOS, or both), go to the **Xcode Cloud** tab, and under **Safari Web Extension Packager** upload the full extension contents including the manifest. Builds appear on the Builds page; TestFlight and then App Store submission follow.

One metered cost: **[primary]**

> "The compute time needed to package web extensions is deducted from the 25 hours per month of Xcode Cloud included in your Apple Developer Program membership."

25 Xcode Cloud hours/month are included in the $99 membership, and packaging "a matter of minutes" per build will not approach that ceiling. **[inference]**

### When Xcode *is* still mandatory

- **Any native code at all.** The ASC packager takes only extension resources. If the containing app needs custom Swift — a real settings screen, or a native app extension that does anything beyond the template — that has to be built in Xcode. **[inference]**
- **The Developer ID / notarization route.** Notarization runs through Xcode's Organizer or `notarytool` on a Mac; there is no web equivalent. **[inference from §6]**
- **Local development and debugging**, including anything touching native messaging — the sample project's setup instructions are entirely Xcode target settings. **[primary]**

### Xcode and macOS versions, if you do use Xcode

| | Minimum macOS to run | SDKs |
|---|---|---|
| Xcode 26 | macOS Sequoia **15.6** – macOS Tahoe 26.x | iOS 26, macOS 26, visionOS 26, watchOS 26, tvOS 26, DriverKit 25 |
| Xcode 16 | macOS Sonoma 14.5 – macOS Sequoia 15.x | iOS 18, macOS 15, visionOS 2, … |

— [Xcode support / minimum requirements](https://developer.apple.com/support/xcode/) **[primary]**

Xcode 26 deployment targets reach back to **macOS 11** and **iOS 15**, so targeting old systems is not a reason to stay on an older Xcode. **[primary]**

And the submission floor: **[primary]**

> "Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26, iPadOS 26, tvOS 26, visionOS 26, or watchOS 26."

— [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/), in force since **28 April 2026**.

> ⚠️ **Uncertain:** that sentence enumerates iOS, iPadOS, tvOS, visionOS and watchOS — **macOS is absent from the SDK list**. Whether a macOS-only submission is exempt is not stated. Assume Xcode 26 is required for everything and the question is moot. **[inference]**

Practical floor for a Mac-based workflow: **a Mac running macOS 15.6 or later**. The ASC web route has no hardware floor at all.

---

## 4. What `xcrun safari-web-extension-packager` produces

**The tool has been renamed.** Apple's note: **[primary]**

> "This tool used to be named `safari-web-extension-converter`."

The ticket, the map and any spec text should say `safari-web-extension-packager`. `converting-a-web-extension-for-safari` now redirects to `packaging-a-web-extension-for-safari`.

What it emits — note it produces a **project**, not a shippable artifact: **[primary]**

> The packager:
> - Creates an Xcode project
> - Configures the Xcode project with a macOS app or iOS app that installs the extension in Safari
> - Configures a Safari web extension with your extension files in the Xcode project

```sh
xcrun safari-web-extension-packager /path/to/extension
```

Options **[primary]**: `--project-location`, `--rebuild-project`, `--app-name`, `--bundle-identifier`, `--swift`, `--objc`, `--ios-only`, `--macos-only`, `--copy-resources`, `--no-open`, `--no-prompt`, `--force`, `--help`.

Two that matter for this repo, given the map's "`skills/coach-pokerogue/scripts/hud/*.js` stays the single source":

- By default **the project references the original extension files in place** — "changes you make to the original extension update your packaged Safari web extension and vice versa". `--copy-resources` opts out into a copy. Referencing in place is the option that preserves single-source. **[primary]**
- `--rebuild-project` regenerates an existing macOS project with **both macOS and iOS** extensions: `xcrun safari-web-extension-packager --rebuild-project /path/to/myExtension/myExtension.xcodeproj`. So macOS-first then iOS-later is a supported migration, not a rewrite. **[primary]**

The packager also reports manifest keys Safari does not support, as warnings, at package time — a cheap early compatibility check against whatever manifest the Chrome/Firefox build uses. **[primary]**

---

## 5. Must the containing app be real, or may it be a shell?

### The guideline that actually applies is 4.4, not 4.2

[App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) **[primary]**:

> **4.4 Extensions.** Apps hosting or containing extensions must comply with the App Extension Programming Guide, the Safari app extensions documentation, or the Safari web extensions documentation and **should include some functionality, such as help screens and settings interfaces where possible**. You should clearly and accurately disclose what extensions are made available in the app's marketing text, and the extensions may not include marketing, advertising, or in-app purchases.

"Help screens and settings interfaces" is Apple naming, in its own guideline, the minimum an extension-containing app should do. That is a *much* lower bar than 4.2's "elevate it beyond a repackaged website". **[primary]**

For completeness, 4.2 itself **[primary]**:

> **4.2 Minimum Functionality.** Your app should include features, content, and UI that elevate it beyond a repackaged website. If your app is not particularly useful, unique, or "app-like," it doesn't belong on the App Store...
> **4.2.3 (i)** Your app should work on its own without requiring installation of another app to function.

4.2.3(i) reads badly for a containing app whose whole purpose is to install a Safari extension, but 4.2's sub-points are aimed at webview wrappers, link collections and template-generated apps, and 4.4 exists precisely to carve out extension hosts. **[inference]**

### The strongest evidence that a near-shell passes

1. **Apple's own Xcode template generates a near-shell.** The Safari Extension App template ships `manifest.json`, `background.js`, `content.js`, `popup.*`, `_locales` and `images` in a Resources group, and Apple explicitly notes "The other files in the Xcode project are for the iOS or macOS app the system needs to use your web extension in Safari" and "you may not need to make any native customizations at all because your extension uses the JavaScript, HTML, and CSS you provide." — [Creating a Safari web extension](https://developer.apple.com/documentation/safariservices/creating-a-safari-web-extension), [Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari) **[primary]**

2. **Apple's own App Store Connect packager generates the containing app for you**, from nothing but a ZIP of extension resources — meaning Apple ships a submission path in which the developer never authors a line of the containing app. It would be incoherent for App Review to then reject that app as too thin. **[inference, but strong]**

### Guideline 4.4.2 is the one with teeth

> **4.4.2** Safari extensions must run on the current version of Safari on the relevant Apple operating system. They may not interfere with System or Safari UI elements and must never include malicious or misleading content or code. **Violating this rule will lead to removal from the Apple Developer Program.** Safari extensions should not claim access to more websites than strictly necessary to function.

— **[primary]**. Three live risks for this effort:

- **"may not interfere with System or Safari UI elements."** The coach HUD is an overlay injected into the page, not into Safari chrome, so it should be clear — but this is the guideline any reviewer would reach for if the HUD looked like browser UI. **[inference]**
- **"should not claim access to more websites than strictly necessary."** `host_permissions` must be scoped to PokéRogue's origin. `<all_urls>` is a direct 4.4.2 hit. **[inference]**
- The **sanction is program removal, not just rejection** — the harshest penalty in the guidelines. Safari is the one engine where a bad listing costs the account.

### Community evidence on 4.2 rejections

Apple Developer Forums threads on 4.2/4.2.2 rejections ([108931](https://developer.apple.com/forums/thread/108931), [82714](https://developer.apple.com/forums/thread/82714), [114393](https://developer.apple.com/forums/thread/114393)) and third-party write-ups converge on the same pattern: 4.2 rejections cluster around **webview wrappers and link aggregators**, and the guideline is widely described as vaguely worded and inconsistently applied. **[community — weak]** I found **no primary or first-hand report of a Safari web extension's containing app being rejected under 4.2 for being a shell**. Absence of evidence, not evidence of absence.

### What the containing app should therefore do, concretely

To clear 4.4 with margin, a plausible minimum **[inference]**:

- A first-run screen that says whether the extension is currently enabled in Safari, with a button that opens Safari's Extensions settings — this is what Apple's own template does, and it maps to "help screens".
- A real settings surface for the HUD's options, persisted through an app group so both halves see it (§7).
- Pairing status for the MCP transport: is a local host registered, is it reachable.

That set is not a shell, is small, and — importantly — cannot be produced by the ASC web packager, so choosing it means choosing Xcode. **[inference]**

### One user-flow fact that bites shells specifically

> "You need to run the containing macOS or iOS app for your extension at least once to install it in Safari."

— [Troubleshooting your Safari web extension](https://developer.apple.com/documentation/safariservices/troubleshooting-your-safari-web-extension) **[primary]**

The user must launch the app, then separately enable the extension in Safari Settings > Extensions. Even a pure shell is a screen the user sees, so it may as well explain the two-step. On iOS, enabling is Safari's More menu > Extensions, or Settings > Safari > Extensions. **[primary]**

---

## 6. App Store review vs notarized direct download

Both are real for Safari. From [Distributing your Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension) **[primary]**:

> "Safari supports distributing a web extension in a macOS app, a visionOS app, an iOS app, or a Mac app created using Mac Catalyst."

> "You can test your unsigned macOS web extension in Safari during development and beta testing, but you need to sign your extension and containing macOS app to securely distribute it to users in the App Store."

> **"Distribute your Developer ID–signed and notarized extension outside the Mac App Store.** If you provide your extension in macOS and don't want to use the Mac App Store for distribution, you can sign and notarize your extension's app with a Developer ID to distribute it outside the Mac App Store."

### Notarization is not review

[Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) **[primary]**:

> "Notarization of macOS software is **not App Review**. The Apple notary service is an automated system that scans your software for malicious content, checks for code-signing issues, and returns the results to you quickly."

> "When the user first installs or runs your macOS software, the presence of a ticket (either online or attached to the executable) tells Gatekeeper that Apple notarized the software. Gatekeeper then places descriptive information in the initial launch dialog..."

Scanning "usually takes less than an hour". **[primary]**

Requirements **[primary]**:

- A **Developer ID** certificate — which requires Apple Developer Program membership, so the $99 is not avoided by going direct.
- **Hardened Runtime** enabled.
- A secure timestamp in the signature.
- No `com.apple.security.get-task-allow` entitlement set true.
- Link against the macOS 10.9 SDK or later.
- **`notarytool`, or Xcode 14 or later** — "Starting November 1, 2023, the Apple notary service no longer accepts uploads from `altool` or Xcode 13 or earlier."
- Signing is done by the **Account Holder**: "Before distributing your app directly to customers, your Account Holder must sign the app with your Developer ID." For an individual account, that is the same person.

### What the user has to do to install a direct download

Nothing unusual, because the app *is* signed — the "Allow unsigned extensions" dance is a development-only path (§below). The user downloads, moves the app to Applications, launches it once, sees a Gatekeeper dialog stating Apple checked it for malicious software, then opens Safari > Settings > Extensions and ticks the checkbox. **[inference from the primary quotes above]**

### The unsigned beta path, for completeness

For macOS beta testing Apple allows shipping an **unsigned** copy of the containing app, with testers enabling Safari > Settings > Developer > "Allow unsigned extensions" (Safari 17+; `Develop > Allow Unsigned Extensions` in Safari 16 and earlier). This setting **resets every time Safari quits**, so it is unusable as a distribution channel — it is a testing affordance only. There is also `Add Temporary Extension…`, which Safari discards "after 24 hours or when you quit Safari". — [Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension) **[primary]**

### Comparison

| | Mac App Store | Developer ID + notarized direct download |
|---|---|---|
| Cost | $99/yr | $99/yr |
| Human review | Yes — App Review, guidelines 4.2/4.4 apply | **No** — automated malware scan only |
| Turnaround | Days, variable | "usually less than an hour" |
| Mac + Xcode required | **No** (ASC web packager) | **Yes** |
| Sandbox required | Yes (2.4.5(i)) | **No** |
| Auto-update | Store handles it | You build it (2.4.5(vii) does not apply) |
| Public legal name | Yes | No |
| EU trader address published | Yes | No |
| Discoverability | Extensions category, charts, editorial | None — you drive all traffic |
| **iOS / iPadOS / visionOS** | Yes | **Not available** |

The direct-download route is where the sandbox constraints of §7 stop applying, which makes it the interesting one for the MCP transport.

---

## 7. What the containing app can do for the extension — and the #100 collision

### Platform availability

> "Safari web extensions are available in macOS with Safari 14 and later, visionOS 1 and later, and iOS 15 and later. Safari web extensions are available in Mac web apps in macOS 15 and later."

— [Safari web extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions) **[primary]**

### The three-part architecture

> "A Safari web extension consists of three parts that operate independently in their own sandboxed environments:
> - A macOS or iOS app that can have a user interface
> - JavaScript code and web files that work in the browser or Mac web app
> - **A native app extension that mediates between the macOS or iOS app and the JavaScript code**"

— [Messaging between the app and JavaScript in a Safari web extension](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension) **[primary]**

WWDC26 session 216 puts it plainly **[primary]**: "Think of it as three people passing notes. The JavaScript in my extension kicks things off. The App Extension in the middle catches that message and hands it to the native app."

### Safari's native messaging is NOT Chrome's native messaging

This is the finding that matters most. **[primary]**, same page:

> "Safari **ignores the `application.id` parameter** and only sends the message to the containing app's native app extension."

> "Safari ignores the `application.id` parameter and only allows the script to establish a port connection with the containing **macOS** app."

There is **no native messaging host manifest**, no registered path to an arbitrary local executable, no per-user JSON in `NativeMessagingHosts/`. `browser.runtime.sendNativeMessage` and `browser.runtime.connectNative` are hard-wired to the one app extension inside the one containing app bundle. Chrome's and Firefox's "register a local binary and talk to it over stdio" model has no Safari equivalent. **[inference from the two quotes]**

Three further constraints from the same page **[primary]**:

- `nativeMessaging` must be in `manifest.json` `permissions`.
- **"Content scripts that are injected into web content cannot send messages to the native app extension."** Only background scripts and extension pages can. The HUD lives in a content script, so any transport traffic has to route content script → background → native.
- **App → JavaScript messaging is macOS-only**: "You can't send messages from a containing iOS app to your web extension's JavaScript scripts." `SFSafariApplication.dispatchMessage(withName:toExtensionWithIdentifier:userInfo:)` is the macOS API.

### The app extension cannot be a long-running host

From Apple's [App Extension Programming Guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html) **[primary]**:

> "An extension typically terminates soon after it completes the request it received from the host app."

> "Shortly after the app extension performs its task (or starts a background session to perform it), the system terminates the extension."

> "**There is no direct communication between an app extension and its containing app; typically, the containing app isn't even running while a contained extension is running.**"

> "Any app extension and its containing app can access shared data in a privately defined shared container."

So: request-scoped, terminated by the system, cannot talk to its own containing app except through an app group container. An MCP server needs a stable, stateful, long-lived process. **The native app extension cannot be it, and the containing app is not even running when the extension is.** **[inference — but the primary quotes leave no room]**

> **Terminology warning for `CONTEXT.md`.** Apple already uses **"host app"** to mean *the app that hosts an app extension* — for a Safari web extension that is Safari itself. Map #98 plans to introduce **"host"** for the local native-messaging process. These are opposite referents in the same sentence space. Pick a different word (the WebExtensions spec's own term is "native application"; "local host" is worse, not better, because of `localhost`).

### Can the containing app run a long-running local process?

**On the Mac App Store: effectively no.** Guideline 2.4.5 **[primary]**:

- **(i)** "They must be appropriately sandboxed"
- **(ii)** "They must also be self-contained, single app installation bundles and **cannot install code or resources in shared locations**"
- **(iii)** "They **may not auto-launch or have other code run automatically at startup or login without consent** nor **spawn processes that continue to run without consent after a user has quit the app**"
- **(iv)** "They may not download or install standalone apps, kexts, **additional code**, or resources to add functionality"
- **(v)** "They may not request escalation to root privileges"
- **(vii)** "They must use the Mac App Store to distribute updates"

(iii) is conditioned on consent, so a login item with explicit user opt-in is not forbidden outright; (ii) and (iv) are the real killers, because the MCP host is a Node process that is not part of a self-contained single app bundle and would be "additional code... to add functionality". **[inference]** Note also that (vii) conflicts with the map's "own release channel so a store review never gates an MCP-server patch" — on MAS, updates *must* go through the store. **[primary + inference]**

**Outside the store, on Developer ID: yes.** `SMAppService` (macOS 13+) registers `LaunchAgents`, `LaunchDaemons` and `LoginItems` that live inside the app's own bundle rather than in `/Library/LaunchAgents`, "containing your LaunchDaemon and LaunchAgent property lists in a fully codesigned app bundle that neither the system nor a third party can modify without breaking the code signature", with the user able to see and revoke them in System Settings > General > Login Items. — [SMAppService](https://developer.apple.com/documentation/servicemanagement/smappservice), [Updating your app package installer to use the new Service Management API](https://developer.apple.com/documentation/servicemanagement/updating-your-app-package-installer-to-use-the-new-service-management-api) **[primary]**

**On iOS: no, categorically.** There is no user-launchable background daemon on iOS. **[inference — uncontroversial]**

### The bridge that probably does work

A sandboxed process may open connections to "a server process running on another machine, **or on the same machine**" with `com.apple.security.network.client`. — [`com.apple.security.network.client`](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.network.client) **[primary]**

So the realistic Safari transport is a **loopback socket**, not native messaging: the extension's background script (or its app extension) talks to a locally running MCP host over `http://127.0.0.1:<port>` or a WebSocket. This is a different transport from Chrome's and Firefox's stdio native messaging, so the extension carries two transports or an abstraction over them.

> ⚠️ **Not verified, and it should be prototyped before anything is locked:** whether Safari's extension CSP and host-permission model actually allow a background script to reach `127.0.0.1`, and whether a loopback host permission survives 4.4.2's "should not claim access to more websites than strictly necessary" at review. Both are cheap to test and expensive to be wrong about. **[inference]**

### What the containing app genuinely *can* do

- **Hold and present settings**, shared with the extension through an **app group** — "Because the macOS or iOS app and the native app extension each run in their own sandboxed environments, they cannot share data in their respective containers. You can store data in a shared space... by enabling app groups." **[primary]**
- **Push events into the extension's JavaScript**, macOS only, via `SFSafariApplication.dispatchMessage` with the extension listening on a `connectNative` port. **[primary]**
- **Read the extension's enabled state** — `SFSafariExtensionManager` / `SFSafariExtensionState` exist for exactly this. **[primary]**
- **Be the install vehicle and the onboarding screen.** It must be launched once before Safari sees the extension at all. **[primary]**
- **Outside the store only:** register and supervise a launch agent that runs the MCP host. **[primary]**

---

## 8. Cost and feasibility floor, stated plainly

| Item | Cost |
|---|---|
| Apple Developer Program, individual | **99 USD/year** |
| D-U-N-S, legal entity, business registration | **Not required** |
| Mac hardware | **Not required** for the App Store route; required for Developer ID |
| Xcode | **Not required** for the App Store route; required for any native code or notarization |
| macOS version, if using Xcode 26 | **15.6 or later** |
| Xcode Cloud packaging time | Within the 25 h/month included |
| Notarization | Included; ~1 hour turnaround |
| App Review | Days, and re-review on each update |
| Published legal name (App Store) | Yes |
| Published address (EU App Store) | Yes |

**Feasible day one:** the HUD as a Safari web extension, on macOS and iOS, on the App Store, from a Linux or Windows machine if necessary, for $99/year.

**Not feasible as currently designed:** the MCP transport, on any Safari platform, using the native messaging model the Chrome and Firefox builds will use. On macOS it needs a different bridge (loopback socket, host installed and updated separately from the extension). On iOS there is no local host process at all, so the transport is macOS-only regardless.

---

## 9. Consequences for map #98

### Contradicts a locked decision

- **"Same repo, own release channel"** — *"an independent version stream so a store review never gates an MCP-server patch."* On the Mac App Store, 2.4.5(vii) makes the store the only update channel for the containing app, and any change to the containing app or its native app extension is a store review. The decision survives only for the extension's own JavaScript resources if they are updated via the store too — which they are. **The premise that store review never gates a patch does not hold on Apple.** The Developer ID route restores it, at the price of the App Store listing.

### Strains a locked decision

- **"All three engines day one"** with *"parity is a constraint on every design decision"* — parity holds for the HUD and breaks for the transport. The map should decide explicitly whether "day one" means the HUD ships on all three and the transport ships on two-and-a-half, or whether the transport abstraction is built before first release.

- **"One extension, transport opt-in"** — the opt-in condition on Chrome and Firefox is "a local host is registered". On Safari there is nothing to register in that sense; the condition becomes "a local process answers on loopback". The single build still works, but the detection mechanism is engine-specific.

- **"The extension replaces CDP and Apple Events"** — the Orion AppleScript route is retired, and Orion is a WebKit browser that loads Safari and Chrome extensions. Whether an unlisted Orion install path exists is out of scope here but the retirement removes today's only Safari-family transport before the replacement is known to work.

### New fog

1. **Can a Safari extension background script reach `127.0.0.1`,** and does that host permission survive 4.4.2 review? Unresolved; prototype before locking the transport. *(Blocks the transport half of the spec.)*
2. **Who installs and updates the MCP host on macOS,** given the containing app cannot carry it on MAS and Safari has no native messaging manifest? This is #100's problem restated with Safari-specific constraints.
3. **Is iOS in scope at all?** The packager makes iOS nearly free for the HUD, and impossible for the transport. The map has not said.
4. **Does the containing app get built in Xcode or generated by App Store Connect?** Generated is free and cannot host a settings screen or a native app extension; Xcode costs a Mac and a maintained native target. This is a fork in the road, not a detail.
5. **Is the maintainer an EU trader** for DSA purposes, and is publishing an address acceptable? If not, the Safari route is Developer ID direct download only, which forfeits iOS.
6. **Does AGPL-3.0 co-exist with the Apple Developer Program License Agreement?** The known friction is the ADPLA's device-count and anti-copying terms versus copyleft; the FSF has historically objected. Not researched here — **raise as its own ticket**, because it is a licensing blocker that lands on Apple specifically and the map has AGPL-3.0 locked.

### Naming

- Say **`safari-web-extension-packager`**, not `converter`.
- **Do not use "host"** for the local MCP process. Apple has claimed the word for the app hosting an app extension.
- Apple's vocabulary to reuse as-is: **containing app**, **app extension** / **native app extension**, **web extension**, **app group**, **packager**, **notarization**.

---

## Sources

All retrieved 2026-09-16.

**Apple documentation (primary)**
- [Safari web extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)
- [Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
- [Packaging and distributing Safari Web Extensions with App Store Connect](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect)
- [Distributing your Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)
- [Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
- [Creating a Safari web extension](https://developer.apple.com/documentation/safariservices/creating-a-safari-web-extension)
- [Troubleshooting your Safari web extension](https://developer.apple.com/documentation/safariservices/troubleshooting-your-safari-web-extension)
- [Messaging between the app and JavaScript in a Safari web extension](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)
- [Messaging a Web Extension's Native App (sample)](https://developer.apple.com/documentation/safariservices/messaging-a-web-extension-s-native-app)
- [App Extension Programming Guide — Understand How an App Extension Works](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html)
- [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [SMAppService](https://developer.apple.com/documentation/servicemanagement/smappservice)
- [Updating your app package installer to use the new Service Management API](https://developer.apple.com/documentation/servicemanagement/updating-your-app-package-installer-to-use-the-new-service-management-api)
- [`com.apple.security.network.client`](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.network.client)

**Apple policy and program (primary)**
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — 2.4.5, 4.2, 4.4, 4.4.2
- [Apple Developer Program enrolment](https://developer.apple.com/programs/enroll/)
- [Identity verification](https://developer.apple.com/help/account/membership/identity-verification/)
- [Enrolling, verifying, and renewing with the Apple Developer app](https://developer.apple.com/help/account/membership/enrolling-in-the-app/)
- [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/) — Xcode 26 floor, 28 April 2026
- [Manage EU DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)
- [Xcode minimum requirements](https://developer.apple.com/support/xcode/)
- [Safari Extensions](https://developer.apple.com/safari/extensions/)

**WWDC (primary)**
- [WWDC26 session 216 — Create web extensions for Safari](https://developer.apple.com/videos/play/wwdc2026/216/)
- [WWDC20 session 10665 — Meet Safari Web Extensions](https://developer.apple.com/videos/play/wwdc2020/10665/)

**Community (weak)**
- Apple Developer Forums threads on guideline 4.2 rejections: [108931](https://developer.apple.com/forums/thread/108931), [82714](https://developer.apple.com/forums/thread/82714), [114393](https://developer.apple.com/forums/thread/114393)
