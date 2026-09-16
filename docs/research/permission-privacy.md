# Permission set and privacy disclosure

Research for [#110](https://github.com/IIxauII/pokerogue-mcp/issues/110), a child of map [#98 "Map: HUD as a browser extension"](https://github.com/IIxauII/pokerogue-mcp/issues/98).

All sources read **2026-09-16**. Where a page shows a "last updated" date it is given, because store policy text changes. Each claim is tagged:

- **[primary]**: the vendor's own docs, policy, source code or compat data, quoted.
- **[inferred]**: a conclusion drawn here that no source states. Check it before relying on it.
- **not documented**: looked for and not found. Nothing was guessed.

This builds on four earlier research docs and does not repeat them:

- `research/native-messaging` (#100): nativeMessaging warning strings, Firefox optional nativeMessaging, Safari's containing-app-only messaging.
- `research/store-policy` (#102): review latency, minimum-permissions rule, per-permission justification field, remote-code rule, AMO "policies apply to data sent to the native application".
- `research/page-world-execution` (#99): `world: "MAIN"` version floors, Safari content scripts waiting for a site grant.
- `research/safari-shipping` (#103): the two Safari routes (App Store, or Developer ID plus notarization), guideline 4.4.

What the extension does: a HUD content script with `world: "MAIN"`, declared in the manifest for `https://pokerogue.net/*` only. It has an opt-in `runtime.connectNative` transport to a local Node MCP process on Chrome and Firefox. Safari has no transport. There is no telemetry, no remote server, and no eval path in the store build.

---

## 0. Short answer

| | Chrome Web Store | AMO (Firefox) | Apple (Safari) |
|---|---|---|---|
| `nativeMessaging` as optional | **Yes.** Not on Chrome's "can't be optional" list. Chromium source has never flagged it that way (checked back to Chrome 40). BCD says Chrome 29 | **Yes, Firefox 87** (desktop only) | Only needed to talk to the containing app. Can be left out of the Safari build |
| Manifest `content_scripts.matches` | Counts as a host grant on its own and causes an install warning. No `host_permissions` entry needed | Firefox 127+: shown and granted at install. The user can revoke it | Nothing runs until the user grants the site: one use, one day, or always |
| `world: "MAIN"` needs `scripting`? | **No.** `scripting` only unlocks the `chrome.scripting` namespace | Not documented as needing it | Not documented as needing it |
| Privacy policy required? | **Yes.** The extension "handles" website content, and local-only handling still counts (FAQ Q3, Q14) | **The docs contradict each other.** The submission page says required if data leaves the device. The FAQ and best-practices page say not required | **Yes on the App Store**: 5.1.1(i) covers "All apps". Developer ID: not documented |
| "No data collected" possible? | **Not safely.** Local-only data still has to be disclosed | **Only with the transport off.** Data sent to a native app must be declared | **Yes.** On-device processing is not "collected" |
| Local AI agent / LLM rule | None specific. Limited Use limits on third-party transfers apply | Native-messaging data counts as transmitted data. "Leaking … to … other applications (e.g. through native messaging) is prohibited" | 5.1.2(i) requires consent before sharing personal data with "third-party AI". No Safari transport, so it doesn't bite |

---

## 1. Chrome (MV3)

### 1.1 `nativeMessaging` as an optional permission

Chrome's docs list the permissions that can't be optional, and `nativeMessaging` is not on it. **[primary]**

> "Most Chrome extension permissions can be specified as optional, with the following exceptions." Listed: `"debugger"`, `"declarativeNetRequest"`, `"devtools"`, `"geolocation"`, `"mdns"`, `"proxy"`, `"tts"`, `"ttsEngine"`, `"wallpaper"`.
>
> Source: [chrome.permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions) (last updated 2026-09-11)

**Chromium source [primary].** Current `main` declares `{APIPermissionID::kNativeMessaging, "nativeMessaging", APIPermissionInfo::kFlagDoesNotRequireManagedSessionFullLoginWarning}`, with no `kFlagCannotBeOptional`: [extensions_api_permissions.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/permissions/extensions_api_permissions.cc). The same entry has no cannot-be-optional flag at tags `120.0.6099.62`, `110.0.5481.77`, `100.0.4896.60`, `90.0.4430.72`, `80.0.3987.87` and `70.0.3538.67`. At `40.0.2214.91` it lived in `chrome/common/extensions/permissions/chrome_api_permissions.cc` with `kFlagNone`.

**BCD [primary]:** `webextensions/manifest/optional_permissions.json` → `nativeMessaging`: chrome `29`, firefox `87`, firefox_android `false`, safari `14` ([source](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/optional_permissions.json)).

**Chrome version:** Chrome's docs don't give one. BCD and the source both point to "always" in practice. #100 left this open; it is now closed.

`permissions.request` must be called from a user gesture:

> "Permissions must be requested from inside a user gesture, like a button's click handler."
>
> Source: [chrome.permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)

Chrome prompts only when the request would add new warnings. **[primary]**

> "Chrome prompts the user if adding the permissions results in different warning messages than the user has already seen and accepted."
>
> Source: same page

### 1.2 `content_scripts.matches` vs `host_permissions`

Chrome treats manifest content-script matches as their own permission category, with their own install warning. **[primary]**

> "`"content_scripts.matches"` Contains one or more match patterns that allows content scripts to inject into one or more hosts. Changes may trigger a warning."
>
> "Adding or changing match patterns in the `"host_permissions"` and `"content_scripts.matches"` fields of the manifest file will also trigger a warning."
>
> Source: [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) (last updated 2024-02-05)

> "The `"matches"` key will trigger a warning."
>
> Source: [Manifest - content scripts](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts) (last updated 2023-08-10)

> `Permissions.origins`: "The list of host permissions, including those specified in the optional_permissions or permissions keys in the manifest, and those associated with Content Scripts."
>
> Source: [chrome.permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)

Chrome's docs tie `host_permissions` to *programmatic* injection:

> "To inject a content script programmatically, your extension needs host permissions for the page it's trying to inject scripts into."
>
> Source: [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

**[inferred]** A manifest content script on `https://pokerogue.net/*` needs no matching `host_permissions` entry. The match pattern grants the access and causes the warning. `host_permissions` for pokerogue.net would only be needed for `fetch` from the service worker, `tabs` URL reads, or `scripting.executeScript`.

### 1.3 Does `world: "MAIN"` need `scripting`?

**No [primary].** The `scripting` permission unlocks the `chrome.scripting` namespace, and nothing else is documented. Manifest `content_scripts` are not part of that namespace.

- Chromium [`_api_features.json`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/api/_api_features.json): `"scripting": { "dependencies": ["permission:scripting"], "contexts": ["privileged_extension"] }`.
- [chrome.scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting): "To use the `browser.scripting` API, declare the `"scripting"` permission in the manifest plus the host permissions for the pages to inject scripts into."
- The manifest doc's entry for `world` names no permission: "`"world"` - ISOLATED | MAIN. Optional. … Choosing the "MAIN" world means the script will share the execution environment with the host page's JavaScript." ([Manifest - content scripts](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts))

### 1.4 `optional_host_permissions`

It exists. **[primary]**

> "`"optional_host_permissions"` Granted by the user at runtime, instead of at install time."
>
> Source: [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)

BCD `optional_host_permissions` gives Chrome 102, Firefox 128 and Safari 15.5, MV3 only ([source](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/optional_host_permissions.json)). Chrome's own docs give no version.

### 1.5 Install-time warning strings

- `nativeMessaging`: "Warning displayed: Communicate with cooperating native applications." ([Permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list), last updated 2026-09-09). Also Chromium [`generated_resources.grd`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/app/generated_resources.grd) `IDS_EXTENSION_PROMPT_WARNING_NATIVE_MESSAGING` = "Communicate with cooperating native applications". **[primary]**
- A single host: `IDS_EXTENSION_PROMPT_WARNING_1_HOST` = "Read and change your data on `$1`" (example `www.google.com`), in the same `.grd`. **[primary]** For our pattern the prompt would read "Read and change your data on pokerogue.net". **[inferred]** How Chrome turns `https://pokerogue.net/*` into the `$1` host string is not documented.
- `scripting` has no warning string in the permissions list. **[primary]**

### 1.6 Does a permission added in an update disable the extension?

**Yes, for a *required* permission that has a warning. No, for an optional one.** **[primary]**

> "When a new permission that triggers a warning is added, the extension will be disabled until the user accepts the new permission."
>
> Source: [Permission warning guidelines](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings) (last updated 2024-02-05)

> "Easier upgrades: When you upgrade your extension, Chrome won't disable it for your users if the upgrade adds optional rather than required permissions."
>
> Source: [chrome.permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)

> "When an update requires additional permissions, end users will be prompted to accept them or disable the extension."
>
> Source: [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

**[inferred]** Put `nativeMessaging` in `optional_permissions` from v1. If the transport ships later as a required permission, every existing user's extension gets disabled.

---

## 2. Chrome Web Store privacy

### 2.1 The Privacy practices tab

All quotes below are from [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) (last updated 2020-06-12). **[primary]**

- **Single purpose:** "Single purpose description Fill out this field to help the reviewers understand the focus of your extension."
- **Permission justification:** already covered in #102.
- **Remote code:** "Remote Code Use this field to tell reviewers whether your extension executes remote code and, if so, why this is necessary. If your extension doesn't need to execute remote code, make sure that it does not and select "No, I am not using remote code.""
- **Data usage:** "You must disclose how your extension collects and uses user data. These disclosures include: The nature of the data that the extensions collects from users; Your certification that the extension complies with the policy on limited use." And: "Use the first group of checkboxes to disclose which types of data your extension collects. Use the second group of checkboxes to certify that you comply with each of the disclosure statements."
- **Privacy policy:** "Add a link to the privacy policy for your extension. The policy should include how data is collected, used, and disclosed."

**Category names such as "Website content" and "User activity": not documented** on developer.chrome.com. They appear only inside the dashboard. The nearest published list is the User Data FAQ's "examples of user data": "Personally identifiable information … Financial and payment information, Health information, Authentication information …, **Website content and resources**, Form data, **Web browsing activity** …, Personal communications, and User-generated content." ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq))

### 2.2 When a privacy policy is mandatory

> "If your Product handles any user data, then you must post an accurate and up to date privacy policy."
>
> Source: [Privacy Policies](https://developer.chrome.com/docs/webstore/program-policies/privacy) (last updated 2022-11-01)

The FAQ defines "handle", and our HUD fits the definition. **[primary]**

> "Generally, by "handle" we mean collecting, transmitting, using, or sharing user data. Here are some examples … Clipping or scraping content from a website that the user visits, such as taking screenshots or capturing data from a web page"
>
> Source: [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

### 2.3 Does on-device data count?

**Yes, it has to be disclosed.** Chrome explicitly rejects the local-only exemption. **[primary]**

> "3. Does an extension need to disclose user data handling if the data is only processed or stored locally on a user's device? Yes. Extensions are required to disclose how they handle user data, even when data is processed or stored locally on a user's device and is not transmitted to external servers or third parties."

> "14. My extension or app handles user data, but only stores information locally … Do I still need to post a privacy policy? Yes. This policy requires all Products that handle user information to post a privacy policy. … Your privacy policy, however, may not need to be long or complicated."

> "16. Does data transmitted between a Chrome app or extension and native programs on the same computer need to be encrypted? No. The requirement to handle the user data securely … does not apply to transmissions between a Chrome extension or app and a native program on the same computer."

All three: [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq). The footer says last updated 2016-04-23, but the page includes 2021+ text, so that date is stale.

Inconsistencies are enforced across the whole publisher account. **[primary]**

> "Any discrepancies between the developer dashboard disclosures, your privacy policy, and the behavior of your item would be a violation … This can result in the suspension of all the items owned by the publisher"
>
> Source: same FAQ

> "If the information listed in your privacy fields contradicts the information provided in your privacy policy, or the behavior of your extension, your extensions may be removed from the Store."
>
> Source: [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) (last updated 2025-05-22)

**[inferred]** Tick "Website content" (game state read from the page), host a short privacy policy, and certify Limited Use. "Collects nothing" contradicts FAQ Q3.

### 2.4 Limited Use wording

From [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) (last updated 2022-11-01). **[primary]**

> "Extensions may only collect, use, or transmit user data that is necessary for the extension's disclosed single purpose, including related operational purposes …"
>
> "Only transfer user data to third parties: If necessary to providing or improving your single purpose; to comply with applicable laws; to protect against malware, spam, phishing, or other fraud or abuse; or, as part of a merger, acquisition or sale of assets …"
>
> "An affirmative statement that your use of the data complies with the Limited Use restrictions must be disclosed on a website belonging to your extension; for example … "The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.""

The FAQ adds that the Limited Use disclosure goes "on your project's homepage or on a page one click away from the homepage; for example, in your privacy policy."

**Upcoming tightening.** The [CWS policy updates blog](https://developer.chrome.com/blog/cws-policy-updates-2026) (2026-07-01) says: "Any user data collected by an extension must now be strictly necessary to the extension's disclosed single purpose", and "require that all data collection be prominently disclosed to the user—regardless of whether the data is closely related to the extension's single purpose". Enforcement starts August 1, 2026. The policies page (last updated 2025-05-22) did **not** yet contain the new text when read.

---

## 3. Firefox (MV3)

### 3.1 `nativeMessaging` as optional

**Yes, since Firefox 87.** **[primary]**

> "nativeMessaging is now an optional permission (Firefox bug 1630415)."
>
> Source: [Firefox 87 release notes for developers](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/87)

MDN lists it among optional API permissions, and Firefox does *not* grant it silently ([optional_permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions), modified 2026-06-11). BCD: firefox_android `false`. `permissions.request` has the same gesture rule as Chrome: "The extension can only make the request inside the handler for a user action." ([permissions.request](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request))

### 3.2 Host permissions and content-script matches on MV3

**Firefox 127+: shown and granted at install. The user can revoke them later.** **[primary]**

> "In Firefox 126 and earlier, Manifest V3 host permissions were not granted during installation and were not displayed to the user. From Firefox 127, host permissions listed in `host_permissions` and `content_scripts` are displayed in the install prompt and granted on installation. However, if an extension update grants new host permissions, these are not shown to the user (see Firefox bug 1893232). Users can grant or revoke any host permission on an ad-hoc basis. Therefore, your extension should check whether any required host permissions are available and request them if necessary."
>
> Source: [Manifest V3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)

[Firefox 127 release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/127) say the same (bug 1889402). The MAIN-world floor of Firefox 128 (#99) is above 127, so the install-time grant always applies to us. **[inferred]**

### 3.3 `data_collection_permissions`

**Mandatory for new AMO extensions since 2025-11-03.** **[primary]**

> "As of November 3rd 2025, all new Firefox extensions will be required to specify if they collect or transmit personal data in their manifest.json file using the `browser_specific_settings.gecko.data_collection_permissions` key. This will apply to new extensions only, and not new versions of existing extensions. Extensions that do not collect or transmit any personal data are required to specify this by setting the `none` required data collection permission in this property."
>
> "Extensions that do not have this property set correctly, and are required to use it, will be prevented from being submitted to addons.mozilla.org for signing"
>
> "In the first half of 2026, Mozilla will require all extensions to adopt this framework. But don't worry, we'll give plenty of notice via the add-ons blog."
>
> Source: [Mozilla Add-ons Blog, 2025-10-23](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/)

As of 2026-09-16 the [blog index](https://blog.mozilla.org/addons/) shows no follow-up post making it mandatory for all extensions. Either way, Coachemon would be a *new* extension, so the rule applies.

Declaring no collection: `"data_collection_permissions": { "required": ["none"] }`. **[primary]** Sources: [Firefox built-in consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) (updated 2026-03-12), and [browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings), which says "Must be provided … for new extension submitted to addons.mozilla.org from November 3, 2025."

**The catch: native messaging counts as transmission.** **[primary]**

> "As a reminder, the policies state that data transmission refers to any data collected, used, transferred, shared, or handled outside the add-on or the local browser."
>
> Source: [Firefox built-in consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)

> "Data sent to native applications using NativeMessaging must be declared in the data collection consent and categorized in the appropriate consent model (whether opt-in or opt-out)."
>
> Source: [Best practices for collecting user data consents](https://extensionworkshop.com/documentation/develop/best-practices-for-collecting-user-data-consents/) (updated 2026-03-12)

The relevant category from the taxonomy: "Website content `websiteContent`: Covers anything visible on a website — such as text, images, videos, and links — and anything embedded …"

Optional data types "aren't presented during installation … and they aren't granted by default. The extension can request that the user opts in … by calling `permissions.request()` in a user-activated event handler", e.g. `browser.permissions.request({ data_collection: [...] })`. **[primary]**

**[inferred]** `required: ["none"]` is only accurate if the transport can never send page data. The honest manifest is `"required": ["none"], "optional": ["websiteContent"]`, requested alongside `nativeMessaging` when the user pairs. Two things here are **not documented**: whether `none` can be combined with a non-empty `optional` list, and whether a screenshot also needs `websiteActivity`. Test both with `web-ext lint` and a real submission.

### 3.4 AMO privacy policy

**The docs contradict each other. [primary]**

> "This add-on has a privacy policy: if any data is being transmitted from the user's device, a privacy policy explaining what is being sent and how it's used is required."
>
> Source: [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) (updated 2026-05-10)

> "A privacy policy is no longer required to be hosted on AMO. It is recommended that developers provide a link to their privacy policy on their AMO listing page."
>
> Source: [Add-on Policies FAQ](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/) (updated 2025-08-04)

> "(optional) create a privacy policy. While a privacy policy is not required, it can help users …"
>
> Source: [Best practices for collecting user data consents](https://extensionworkshop.com/documentation/develop/best-practices-for-collecting-user-data-consents/)

The [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) themselves (updated 2026-04-30) don't mention a privacy policy. **[inferred]** Ship one anyway: Chrome requires it, and the newest AMO page asks for one.

### 3.5 Source code for concatenated JS

**Yes, a concatenation step triggers the source upload.** **[primary]**

> "You must upload your extension's source code when its code was created using: code minifiers …; tools that generate a single file from other files, such as browserify or webpack; template engines …; any other custom tool that takes files, applies pre-processing, and generates file(s) to include in the extension."
>
> "The tools you use to minify, or concatenate your source code: must be open source … cannot be web-based"
>
> Source: [Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/) (footer says 2019-06-10, but the page names Ubuntu 24.04 and Node 24.14.0, so the footer is stale)

The intro qualifies this: "where build processes render your extension's code hard to read". The policy itself says: "Add-ons may contain transpiled, minified or otherwise machine-generated code, but Mozilla needs to review a copy of the source code before any of these steps have been applied." ([Add-on Policies §3.1](https://extensionworkshop.com/documentation/publish/add-on-policies/))

The default reviewer build environment is Ubuntu 24.04.4, ARM64, Node 24.14.0, npm 11.9.0. Include the lockfile, and "matching source code must be attached to every extension version."

For comparison, Chrome allows the same step without a source upload: "Minification is allowed, including the following forms: … Collapsing files together" ([Program Policies, Code Readability](https://developer.chrome.com/docs/webstore/program-policies/policies)).

**[inferred]** Upload source plus a README build script on every AMO version, or ship the HUD files unconcatenated to AMO.

---

## 4. Safari

### 4.1 Permission model

From [Managing Safari web extension permissions](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions). **[primary]**

> "Specify a `matches` array for desired URL patterns in the `content_script` key in `manifest.json` to request permission for your content script to work in matching websites."
>
> "When the user visits a page where they haven't granted access to your Safari web extension, Safari shows a badge next to your extension's item … In macOS, the user clicks the toolbar button and selects an option to grant permission for a single use, for the day, or for all websites, or to deny permission."
>
> "the user … can change the permission status for a selected website to Ask, Allow, or Deny."
>
> "In Safari 17 and later, when you grant access to an extension for a specific web site, that grants the extension access to the site across all profiles, private browsing, and browsing without a profile."

App Review guideline 4.4.2: "Safari extensions should not claim access to more websites than strictly necessary to function." ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), last updated 2026-06-08)

### 4.2 `nativeMessaging` on Safari

Apple's docs only require it for talking to the containing app. **[primary]**

> "To enable sending messages from JavaScript to the native app extension, add `nativeMessaging` to the list of `permissions` in the `manifest.json` file."
>
> Source: [Messaging between the app and JavaScript in a Safari web extension](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)

- Must it be declared even if unused? **Not documented.** Nothing says so.
- Is declaring it without a transport a problem? **Not documented** in Apple's guidelines. The only Safari scope rule (4.4.2) is about *websites*, not API permissions.

**[inferred]** Leave it out of the Safari manifest. Chrome's and AMO's minimum-permission rules (#102) show the direction reviewers lean, and an unused permission costs nothing to drop.

### 4.3 App Store privacy label

"Collect" means off-device. **[primary]**

> "“Collect” refers to transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time."
>
> "Data that is processed only on device is not “collected” and does not need to be disclosed in your answers."
>
> Source: [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)

In App Store Connect: "If the answer is no, select "No, we do not collect data from this app" and then click Save. You don't need to answer any further questions." ([Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)) **[primary]**

**[inferred]** Safari has no transport and no telemetry, so "No, we do not collect data" is accurate. That gives the product page's "Data Not Collected" label. The exact label string does not appear on the pages read.

### 4.4 Privacy policy URL

**Mandatory for every App Store app. [primary]**

> "5.1.1 (i) Privacy Policies: All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app in an easily accessible manner."
>
> Source: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

> "A privacy policy URL is required for all apps, while a user privacy choices URL is optional."
>
> Source: [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)

The same help page opens with "required to provide a privacy policy URL for your iOS app platform", which is narrower wording. The guideline says "All apps". [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) says "Privacy Policy (Required)". Note that 5.1.1(i) also wants the link **inside the app**, which here means the containing app.

### 4.5 Developer ID route

**No privacy disclosure is documented. [primary, by scope]**

The Developer Program License Agreement scopes its Program Requirements, including §3.3.3 Data and Privacy with its "You must provide a privacy policy" clause, to other channels:

> "Any Application that will be submitted to the App Store, Custom App Distribution, or TestFlight, or that will be distributed through Ad Hoc distribution, must be developed in compliance with the Documentation and this Agreement, including the Program Requirements set forth below in this Section 3.3."
>
> Source: [Apple Developer Program License Agreement §3.3](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)

Developer ID apps go out under §5.3 ("Notarized Applications for macOS"), which covers "automated scanning, testing, and analysis of Your Application by Apple for malware". It says nothing about privacy. #103 already covers that notarization "is not App Review". Privacy manifests (`PrivacyInfo.xcprivacy`) matter for required-reason APIs on iOS and related platforms and for listed SDKs ([Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)). No Developer ID requirement to file one is documented.

**[inferred]** Nothing from Apple is required for Developer ID beyond applicable law. Link the same privacy policy anyway.

---

## 5. Local AI agents, LLMs, and data handed to a native app

No store has a rule about *local* AI agents or MCP. What applies:

**Chrome [primary]:**

- Local transfer is recognised only for the encryption exemption (FAQ Q16, §2.3).
- Limited Use allows third-party transfers "If necessary to providing or improving your single purpose" (§2.4).
- The FAQ's closest analogy is user-chosen endpoints: "When the Product is a client for an internet protocol with user-specified servers, like an FTP or IRC client, the Limited Use section does not apply to the Product's collection of data for, or transmission of data with, the user-specified server." ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) Q15)
- Chrome's AI page: "If you're using AI in the cloud or otherwise sharing user input with a server, update your privacy policy to include what information is shared." ([Extensions and AI](https://developer.chrome.com/docs/extensions/ai))
- The 2026 update adds a ban on circumventing "safety guardrails … implemented by AI-powered services" ([blog](https://developer.chrome.com/blog/cws-policy-updates-2026)). That doesn't apply to us.
- **Whether a user-installed native host, or the LLM provider it forwards to, counts as a "third party" of the extension: not documented.**

**Firefox [primary]:** the most explicit of the three. The extension's disclosure covers data sent to the native app.

> "If the add-on uses native messaging, the Add-on Policies (including those related to user consent and control) apply to any data sent to the native application as well."
>
> "6.3 … Leaking local or user-specific information to websites or other applications (e.g. through native messaging) is prohibited."
>
> Source: [Add-on Policies §6](https://extensionworkshop.com/documentation/publish/add-on-policies/)

Also "Data sent to native applications using NativeMessaging must be declared in the data collection consent" (§3.3). Whether a *downstream* hop (MCP client → LLM provider) has to be named is **not documented**. **[inferred]** Consented, disclosed, purpose-bound game state is not "leaking". A HUD that pushes data unprompted would be.

**Apple [primary]:**

> "5.1.2 (i) … You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so."
>
> Source: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

With no Safari transport, nothing is shared. **[inferred]**

**Who is responsible, the extension or the native app?** No store assigns responsibility to the separately installed native app. Firefox explicitly puts it on the add-on. Chrome and Apple are silent. **[inferred]** Write one privacy policy covering both halves, since both ship from this repo: "game state goes to your local MCP process only after you pair, and your MCP client may send it to the LLM provider you configured."

---

## 6. Screenshots: `tabs.captureVisibleTab`

**Chrome: needs `<all_urls>` or `activeTab`. A pokerogue.net host permission is not enough. [primary]**

> "In order to call this method, the extension must have either the `<all_urls>` permission or the `activeTab` permission."
>
> Source: [chrome.tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs) (last updated 2026-09-16)

`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` = `2` (Chrome 92+).

Chromium [`permissions_data.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/permissions/permissions_data.cc) `CanCaptureVisiblePage` sets `has_all_urls` only when `pattern.match_all_urls()`. Then: `if (!has_active_tab && !has_all_urls) { *error = manifest_errors::kAllURLOrActiveTabNeeded; return false; }`. A narrower host pattern does not pass.

Gesture: the API itself is not documented as needing one. `activeTab` does need one: "The following user gestures enable the "activeTab" permission: Executing an action; Executing a context menu item; Executing a keyboard shortcut from the commands API; Accepting a suggestion from the omnibox API" ([activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)).

**Firefox: `<all_urls>` or `activeTab`, the latter from Firefox 126. [primary]**

> "You must have the `<all_urls>` or `activeTab` permission. Note: In Firefox 125 and earlier, this method was only available with the `<all_urls>` permission."
>
> Source: [tabs.captureVisibleTab](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/captureVisibleTab)

Source [`ext-tabs.js`](https://github.com/mozilla-firefox/firefox/blob/main/browser/components/extensions/parent/ext-tabs.js):

```js
if (!extension.hasPermission("<all_urls>") && !tab.hasActiveTabPermission) {
  throw new ExtensionError("Missing activeTab permission");
}
```

[`ext-tabs-base.js`](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/parent/ext-tabs-base.js) `hasActiveTabPermission` is `(this.extension.originControls || this.extension.hasPermission("activeTab")) && this.activeTabWindowID === this.innerWindowID`. A granted host permission is **not** checked. **[inferred]** The `originControls` branch appears to give MV3 extensions the activeTab path after a user invokes the extension, even without declaring `activeTab`. This isn't documented, so declare `activeTab` anyway.

**Safari: supported since 14 (macOS) and 15 (iOS). [primary]** BCD notes "`<all_urls>` permission is optional." ([tabs.json](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/tabs.json)) Apple's own permission requirement for this call is **not documented**.

**[inferred]** `activeTab` (no warning on Chrome) plus a user click is the only screenshot path that doesn't need `<all_urls>`. A background or agent-triggered screenshot needs `<all_urls>`, which brings the "Read and change all your data on all websites" warning and fails "minimum permissions" for a one-site HUD. `<all_urls>` in `optional_host_permissions`, requested at pairing, passes the Chrome source check once granted: `active_permissions_unsafe_` includes runtime-granted permissions. That part is inferred from source.

---

## 7. Is a MAIN-world `import()` of the site's own chunks "remote code"?

**Not documented.** No Chrome page covers an extension calling or importing the *host page's own* first-party modules.

The closest primary wording:

> "Remotely hosted code, or RHC, is what the Chrome Web Store calls anything that is executed by the browser that is loaded from someplace other than the extension's own files. Things like JavaScript and WASM. It does not include data or things like JSON or CSS."
>
> Source: [Deal with remote hosted code violations](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) (last updated 2023-12-13)

> "the full functionality of an extension must be easily discernible from its submitted code … The extension may reference and load data and other information sources that are external to the extension, but these external resources must not contain any logic. Some common violations include: Including a `<script>` tag that points to a resource that is not within the extension's package; Using JavaScript's eval() method … ; Building an interpreter to run complex commands fetched from a remote source …"
>
> Source: [Program Policies, Additional Requirements for Manifest V3](https://developer.chrome.com/docs/webstore/program-policies/policies); also [Troubleshooting, "Blue Argon"](https://developer.chrome.com/docs/webstore/troubleshooting) (last updated 2026-07-20)

> "Extensions that call remote code and do not declare and justify it using the field shown above will be rejected."
>
> Source: [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)

**[inferred], read both ways:**

- **Against:** taken literally, `import("https://pokerogue.net/assets/foo-hash.js")` is JavaScript "loaded from someplace other than the extension's own files" and executed. A reviewer grepping for `https://`, which the RHC page recommends, will find it.
- **For:** the extension's *logic* stays fully in the package. The imported module is the page's own code, which the page has already run. Per the HTML module map, importing an already-loaded URL returns the cached module rather than re-running it. That is spec behaviour, not store policy. The extension reads its exports; it does not pull in new behaviour.

Recommendation: avoid the question. Obtain handles from objects the page already exposes, not by `import()`-ing hashed chunk URLs. If `import()` stays, answer "Yes" in the Remote code field with a one-line justification ("reads exports of pokerogue.net's own already-loaded modules to render a HUD; no extension logic is fetched"). Chrome's rejection wording punishes *undeclared* remote code, not declared code. AMO's equivalent rule ("self-contained and not load remote code for execution", #102) is equally silent on this case.

---

## 8. Consequences for the permission set

**[inferred]**, summarising the above:

| Manifest entry | Chrome | Firefox | Safari |
|---|---|---|---|
| `content_scripts[{matches:["https://pokerogue.net/*"], world:"MAIN"}]` | yes; warning "Read and change your data on pokerogue.net" | yes; granted at install on 127+ | yes; needs a per-site grant |
| `host_permissions` | none needed | none needed | none needed |
| `scripting` | not needed | not needed | not needed |
| `optional_permissions: ["nativeMessaging"]` | yes | yes (87+) | omit |
| `activeTab` (click-to-screenshot) | yes, no warning | yes (126+) | not documented |
| `gecko.data_collection_permissions` | n/a | `required:["none"]` + `optional:["websiteContent"]`, **untested combination** | n/a |
| Privacy policy URL | required | ship one (docs conflict) | required (App Store) |
| Store privacy answer | "Website content" + Limited Use certification | as above | "No, we do not collect data" |
| AMO source upload | n/a | required if HUD JS is concatenated | n/a |

## Open questions

1. Does AMO accept `required: ["none"]` together with a non-empty `optional` list? Verify with `web-ext lint` and a real submission.
2. Does a CWS reviewer treat `import()` of pokerogue.net chunks as remote code? Better to remove the pattern than to find out.
3. What does Safari's `captureVisibleTab` actually require on macOS? Test on a real Safari, alongside #119.
