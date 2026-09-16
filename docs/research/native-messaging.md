# Native-messaging reach to a local Node process

Ticket: [#100](https://github.com/IIxauII/pokerogue-mcp/issues/100), child of map [#98 Map: HUD as a browser extension](https://github.com/IIxauII/pokerogue-mcp/issues/98). Question: can the extension carry traffic between the locally installed MCP server and the page, on Chrome, Firefox and Safari, replacing CDP and Apple Events?

**Short answer.** On **Chrome and Firefox, yes.** Classic native messaging reaches an arbitrary local Node process, a store-installed extension may use it, and pairing is a small, well-specified, per-user file write that needs no `sudo` — a JSON manifest plus one executable shim, fully reversible. On **Safari, no.** Safari has both `runtime.sendNativeMessage` and `runtime.connectNative`, but Apple redefines them: neither can name a host, and both terminate at the extension's own containing app. There is no host manifest, no `NativeMessagingHosts` directory, no stdio framing — and therefore **nothing for a pairing command to write.** Worse, the process that receives the message is a short-lived app-extension process that Apple documents as unable to "perform long-running background tasks" and which "terminates soon after it completes the request", and a sandboxed app "can't run programs in locations outside its app bundle, sandbox container, or app group containers" — so it can neither hold a session nor launch `node`. The one thing Apple *does* bless is a localhost TCP connection (`com.apple.security.network.client` covers "a server process running on another machine, **or on the same machine**"). So Safari's transport, if it exists, is a socket, not native messaging. The map's **"all three engines day one"** and **"pairing is an explicit setup command"** cannot both hold with native messaging as the transport.

All sources fetched **2026-09-16** unless dated otherwise. Findings assembled from three parallel primary-source passes (Chrome/Firefox, Safari, localhost-socket) plus direct verification; every UNCERTAIN marker below is deliberate and must survive into the spec.

## Sources and tags

| Tag | Source |
|---|---|
| [chrome-nm] | Chrome for Developers, *Native messaging* — https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging |
| [chrome-perm] | Chrome for Developers, *Permissions list* — https://developer.chrome.com/docs/extensions/reference/permissions-list |
| [chrome-csp] | Chrome for Developers, *manifest: content_security_policy* — https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy |
| [chrome-sw] | Chrome for Developers, *Extension service worker lifecycle* — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle |
| [chrome-ws] | Chrome for Developers, *WebSockets in extension service workers* — https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets |
| [chrome-net] | Chrome for Developers, *Cross-origin network requests* — https://developer.chrome.com/docs/extensions/develop/concepts/network-requests |
| [chrome-match] | Chrome for Developers, *Match patterns* — https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns |
| [chrome-key] | Chrome for Developers, *manifest: key* — https://developer.chrome.com/docs/extensions/reference/manifest/key |
| [chromium-faq] | Chromium source, `extensions/docs/security_faq.md` — https://chromium.googlesource.com/chromium/src/+/main/extensions/docs/security_faq.md |
| [cws-mv3] | Chrome Web Store, *Additional requirements for Manifest V3* — https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements |
| [cws-min] | Chrome Web Store, *Minimum functionality* — https://developer.chrome.com/docs/webstore/program-policies/minimum-functionality |
| [chrome-lna] | Chrome for Developers, *New permission prompt for Local Network Access* — https://developer.chrome.com/blog/local-network-access |
| [chrome-147] | Chrome for Developers, *Chrome 147 release notes* — https://developer.chrome.com/release-notes/147 |
| [lna-spec] | WICG, *Local Network Access* — https://wicg.github.io/local-network-access/ |
| [mdn-nm] | MDN, *Native messaging* — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging |
| [mdn-manifests] | MDN, *Native manifests* (**plural**; the singular URL 404s) — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests |
| [mdn-connectnative] | MDN, *runtime.connectNative* — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/connectNative |
| [mdn-bg] | MDN, *Background scripts* — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts |
| [mdn-optperm] | MDN, *manifest.json/optional_permissions* — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions |
| [mdn-match] | MDN, *Match patterns* — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns |
| [mdn-csp] | MDN, *Content Security Policy* (extensions) — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy |
| [mdn-cs] | MDN, *Content scripts* — https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts |
| [mdn-mixed] | MDN, *Mixed content* — https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content |
| [ew-id] | Extension Workshop, *Extensions and the add-on ID* — https://extensionworkshop.com/documentation/develop/extensions-and-the-add-on-id/ |
| [ew-perm] | Extension Workshop, *Request the right permissions* — https://extensionworkshop.com/documentation/develop/request-the-right-permissions/ |
| [amo] | Extension Workshop, *Add-on Policies* — https://extensionworkshop.com/documentation/publish/add-on-policies/ |
| [apple-msg] | Apple, *Messaging between the app and JavaScript in a Safari web extension* — https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension |
| [wwdc20] | Apple, WWDC20 session 10665, *Meet Safari Web Extensions* — https://developer.apple.com/videos/play/wwdc2020/10665/ |
| [apple-compat] | Apple, *Assessing your Safari web extension's browser compatibility* — https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility |
| [apple-run] | Apple, *Running your Safari web extension* — https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension |
| [apple-dist] | Apple, *Distributing your Safari web extension* — https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension |
| [apple-extpg] | Apple, *App Extension Programming Guide* (archive) — https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html |
| [apple-sandbox] | Apple, *App Sandbox* — https://developer.apple.com/documentation/security/app-sandbox |
| [apple-files] | Apple, *Accessing files from the macOS App Sandbox* — https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox |
| [apple-protect] | Apple, *Protecting user data with App Sandbox* — https://developer.apple.com/documentation/security/protecting-user-data-with-app-sandbox |
| [apple-netclient] | Apple, *Entitlements: com.apple.security.network.client* — https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.network.client |
| [apple-review] | Apple, *App Review Guidelines* — https://developer.apple.com/app-store/review/guidelines/ |
| [tn3179] | Apple, *TN3179: Understanding local network privacy* — https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy |
| [bcd] | MDN browser-compat-data, `webextensions/api/runtime.json` @ `main` — https://raw.githubusercontent.com/mdn/browser-compat-data/main/webextensions/api/runtime.json |
| [w3c-sc] | W3C, *Secure Contexts* — https://w3c.github.io/webappsec-secure-contexts/ |
| [w3c-mixed] | W3C, *Mixed Content* — https://w3c.github.io/webappsec-mixed-content/ |
| [rfc6455] | IETF, RFC 6455 *The WebSocket Protocol* — https://www.rfc-editor.org/rfc/rfc6455 |
| [wk-171934] | WebKit bug 171934, status **NEW** — https://bugs.webkit.org/show_bug.cgi?id=171934 |
| [wk-281149] | WebKit bug 281149, status **REOPENED** — https://bugs.webkit.org/show_bug.cgi?id=281149 |
| [forum-675233] | Apple Developer Forums thread 675233, **March 2021**, reply with an Apple staff badge — https://developer.apple.com/forums/thread/675233 |
| [forum-722876] | Apple Developer Forums thread 722876, **0 replies, no Apple response** — https://developer.apple.com/forums/thread/722876 |
| [forum-691389] | Apple Developer Forums thread 691389 — https://developer.apple.com/forums/thread/691389. **Community post, not Apple.** Cited only to debunk. |

Forum threads are labelled as such wherever they appear and are never treated as documentation.

---

## 1. Chrome — yes, and it is the cheapest route

### 1.1 Where the host manifest lives

[chrome-nm], verbatim on the lookup rule:

> "On macOS and Linux, the location of the native messaging host's manifest file varies by the browser (Google Chrome, Google Chrome for Testing or Chromium). The system-wide native messaging hosts are looked up at a fixed location, while the **user-level native messaging hosts are looked up in the `NativeMessagingHosts/` subdirectory of the user profile directory**."

**macOS — the load-bearing rows for this project.**

| Browser | Scope | Path |
|---|---|---|
| Google Chrome | **per-user** | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.my_company.my_application.json` |
| Google Chrome | system | `/Library/Google/Chrome/NativeMessagingHosts/com.my_company.my_application.json` |
| Chrome for Testing | per-user | `~/Library/Application Support/Google/ChromeForTesting/NativeMessagingHosts/…` |
| Chrome for Testing | system | `/Library/Google/ChromeForTesting/NativeMessagingHosts/…` |
| Chromium | per-user | `~/Library/Application Support/Chromium/NativeMessagingHosts/…` |
| Chromium | system | `/Library/Application Support/Chromium/NativeMessagingHosts/…` |

[chrome-nm]: "Note: In versions of Chrome earlier than Chrome 146, Google Chrome for Testing used the same locations as Google Chrome."

Linux, for completeness — and note the **casing split**, which is a live trap for an installer that normalises paths: system-wide is lowercase-hyphen `/etc/opt/chrome/native-messaging-hosts/`, per-user is CamelCase `~/.config/google-chrome/NativeMessagingHosts/`. Windows uses a registry key instead: "the manifest file can be located anywhere in the file system. The application installer must create a registry key, either `HKEY_LOCAL_MACHINE\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.my_company.my_application` or `HKEY_CURRENT_USER\…`, and set the default value of that key to the full path to the manifest file", and "When Chrome looks for native messaging hosts, first the 32-bit registry is queried, then the 64-bit registry."

**UNCERTAIN, and it matters here.** The doc heads the user-level macOS table "user-specific, **default path**", and states the lookup is "in the `NativeMessagingHosts/` subdirectory of the **user profile directory**". This project already launches Chrome with a dedicated profile at `~/.pokerogue-mcp/chrome-profile` (README, #5). Whether a non-default `--user-data-dir` moves the native-messaging lookup is **not settled by the documentation** and must be probed before #107 fixes a path.

**Also UNCERTAIN:** Chrome Canary, Beta and Dev are **not listed** by [chrome-nm] — only Chrome, Chrome for Testing and Chromium. By the profile-directory rule Canary would be `~/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts/`, but that is inference, not documentation. **Microsoft Edge, Brave, Arc and Vivaldi are not covered by this doc at all.**

### 1.2 Manifest shape

[chrome-nm]'s canonical example:

```json
{
  "name": "com.my_company.my_application",
  "description": "My Application",
  "path": "C:\\Program Files\\My Application\\chrome_native_messaging_host.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://knldjmfmopnpolahpmmgbagdohdnhkik/"]
}
```

- **`name`** — Chrome: "This name can only contain **lowercase** alphanumeric characters, underscores and dots. The name can't start or end with a dot, and a dot can't be followed by another dot." Firefox's rule ([mdn-manifests]) is the regex `^\w+(\.\w+)*$`, which additionally allows uppercase. **The intersection is lowercase reverse-DNS** — `net.pokerogue.mcp` is valid in both; `pokerogue-mcp` is valid in neither (hyphens are illegal on both sides).
- **`path`** — "On Linux and macOS the path must be absolute." And a detail that bites a Node host: "**The host process is started with the current directory set to the directory that contains the host binary.**" Do not rely on `process.cwd()`.
- **`type`** — `"stdio"`, the only value.
- **Executable bit** — [mdn-nm]'s error list includes `"File at path <path> does not exist, or is not executable"`; [chrome-nm]'s includes "Failed to start native messaging host. → Check whether you have sufficient permissions to execute the native messaging host file."

**UNCERTAIN / undocumented:** neither browser's docs say anything about macOS code signing, notarization, or the `com.apple.quarantine` xattr on a native messaging host. No primary source found either way. This is practically relevant for a downloaded binary; it is sidestepped entirely by shipping an interpreted `#!/usr/bin/env node` shim with `chmod +x` rather than a binary, which is what MDN's own example host does.

### 1.3 How the extension is identified — and why that is not authentication

[chrome-nm]:

> "List of extensions that should have access to the native messaging host. `allowed-origins` values *can't* contain wildcards."

Exact-string match on the full origin, trailing slash included. The host also learns who called it: "The first argument to the native messaging host is the origin of the caller, usually `chrome-extension://[ID of allowed extension]`. This allows native messaging hosts to identify the source of the message when multiple extensions are specified in the `allowed_origins` key."

**`allowed_origins` is not a security boundary.** [chromium-faq], verbatim:

> "The Native Messaging API is not a secure communication channel and if required, secure communication between the extension and a native app must be established by the extension developer with an additional transport layer."

> "Chrome will not allow an extension to communicate with a host unless the extension ID is listed here. However, an extension from outside of the Chrome Web Store can easily use an arbitrary ID with the `key` field, and other binaries on a machine could launch the Native Messaging Host and communicate with it."

**This is direct input to #107.** Pairing cannot lean on `allowed_origins` for authentication; if the transport needs authentication, it needs its own secret. What `allowed_origins` *does* give — and a localhost socket does not — is that the browser launches the host over stdio, so there is no listening port for an arbitrary web page to find.

**Knowing the ID before publication — Chrome needs a dance.** [chrome-key]: the `key` field "maintains the unique ID of an extension, or theme when it is loaded during development". The documented procedure is to upload the `.zip` to the Developer Dashboard **without publishing**, take the public key from the Package tab, strip the newlines into `"key"` in `manifest.json` — "This way the extension will use the same ID" — and verify by "Compare the extension ID on the extensions management page to the Item ID in the Developer Dashboard. They should match."

So the Chrome ID is **fixed at first dashboard upload**, knowable before going public, and pinnable into a dev build. Without that step, a locally loaded unpacked build has a different ID from the published one and the pairing manifest is wrong for one of them. `allowed_origins` is an array, so writing both is legal.

### 1.4 Size limits — exact numbers, and a correction

[chrome-nm], verbatim:

> "Chrome starts each native messaging host in a separate process and communicates with it using standard input (`stdin`) and standard output (`stdout`). The same format is used to send messages in both directions; each message is serialized using JSON, UTF-8 encoded and is preceded with 32-bit message length in native byte order. **The maximum size of a single message from the native messaging host is 1 MB**, mainly to protect Chrome from misbehaving native applications. **The maximum size of the message sent to the native messaging host is 64 MiB.**"

The debug section restates the host→browser cap numerically: "The message length must not exceed **1024\*1024**."

> **Correction to a widely repeated figure.** Chrome's browser→host ceiling is **64 MiB, not 4 GB.** The 4 GB number belongs to Firefox (§2.3). The direction that constrains this project is the other one: **host → extension is capped at 1 MB on both engines**, and the host is the MCP server, which is the side sending snapshots. `screenshot()` returns a PNG and a PokéRogue canvas PNG can exceed 1 MB. **Chunking above 1 MB is a requirement, not an optimisation** — an input to #108.

Framing gotchas, all [chrome-nm]: "Make sure that the 32-bit message length is in the platform's native integer format (little-endian / big-endian)"; "The message size must be equal to the number of bytes in the message. This may differ from the 'length' of a string, because characters may be represented by multiple bytes"; and Windows-only, set `O_BINARY` or `\n` becomes `\r\n` and corrupts the frame. On the macOS targets here, `Buffer.readUInt32LE` / `writeUInt32LE` is correct — note that Node's unsuffixed default is big-endian, so this must be written explicitly.

### 1.5 Lifecycle, and the MV3 service worker

[chrome-nm]:

> "When a messaging port is created using `runtime.connectNative()` Chrome starts native messaging host process and keeps it running until the port is destroyed. On the other hand, when a message is sent using `runtime.sendNativeMessage()`, without creating a messaging port, Chrome starts a new native messaging host process for each message. In that case the first message generated by the host process is handled as a response to the original request, and Chrome will pass it to the response callback… **All other messages generated by the native messaging host in that case are ignored.**"

`sendNativeMessage` is therefore unusable for this transport — one process spawn per call, and server-initiated messages are discarded.

[chrome-sw] settles the obvious MV3 objection:

> **"Connecting to a native messaging host using `chrome.runtime.connectNative()` will keep a service worker alive."** (Chrome 105+)

against a baseline of "After 30 seconds of inactivity. Receiving an event or calling an extension API resets this timer" and "When a single request, such as an event or API call, takes longer than 5 minutes to process." Note the same page's Chrome 114 change — "Sending a message with long-lived messaging keeps the service worker alive. Opening a port no longer resets the timers" — which makes `connectNative` a named exception rather than a general port behaviour.

[chrome-nm] on where it can be called from:

> "These methods are not available inside content scripts, only inside your extension's pages and service worker. If you wish to communicate from a content script to the native application, send the message to your service worker to pass it along to the native application."

That is exactly the shape a page-driven MCP bridge needs: **content script → service worker → native host.**

### 1.6 stdio discipline — the most common way these break

[chrome-nm]:

> "Make sure that all output in `stdout` adheres to the native messaging protocol. **If you want to print some data for debugging purposes, write to `stderr`.**"

For a Node host this means **no `console.log` anywhere in the process** — not in the server, not in a dependency, not a version banner. Everything goes to stderr or a file.

The two engines then treat stderr differently. [mdn-nm]: "If the native application sends any output to stderr, the browser will redirect it to the browser console" — a live debugging channel. [chrome-nm] treats it as a failure signal: "When certain native messaging failures occur, output is written to the error log of Chrome. This includes when the native messaging host fails to start, **writes to stderr** or violates the communication protocol."

### 1.7 Store-installed extensions and Chrome Web Store policy

`nativeMessaging` is a normal declared permission. [chrome-perm]: "Gives access to the native messaging API. Warning displayed: *Communicate with cooperating native applications.*" That string is what a player sees at install — copy for #110.

**UNCERTAIN:** whether `nativeMessaging` can go in `optional_permissions` on Chrome. [chrome-perm] lists it among manifest-declared permissions and does not say either way. Firefox explicitly allows it (§2.5). Worth probing, because "transport opt-in" reads far better to a reviewer if the permission is requested at pairing rather than at install.

No CWS policy forbids native messaging, and Chromium's own FAQ blesses it, [chromium-faq]:

> "Extensions are allowed to open (and potentially communicate with) native applications in a variety of ways. One of the main ways is the `nativeMessaging` API… Using these methods to open a native application is not considered a security bug."

**UNCERTAIN:** whether `nativeMessaging` counts as a "dangerous permission request" that triggers deeper CWS review. Chrome's review-process doc names "dangerous permission requests" as a trigger but does not enumerate the set.

The binding policy is the MV3 remote-code rule — see §5.3, because it constrains the *protocol shape* on every channel, not just this one.

---

## 2. Firefox — yes, near-identical, different names and different numbers

### 2.1 Where the host manifest lives

[mdn-manifests]:

| OS | Global | Per-user |
|---|---|---|
| **macOS** | `/Library/Application Support/Mozilla/NativeMessagingHosts/<name>.json` | `~/Library/Application Support/Mozilla/NativeMessagingHosts/<name>.json` |
| Linux | `/usr/lib/mozilla/native-messaging-hosts/<name>.json` (or `/usr/lib64/…`) | `~/.mozilla/native-messaging-hosts/<name>.json` |
| Windows | `HKEY_LOCAL_MACHINE\SOFTWARE\Mozilla\NativeMessagingHosts\<name>` | `HKEY_CURRENT_USER\SOFTWARE\Mozilla\NativeMessagingHosts\<name>` |

**A material asymmetry in Firefox's favour:** the directory is keyed to **Mozilla, not to a browser or a profile**. One file serves Firefox release, Developer Edition and Nightly, regardless of profile. Chrome's is per-browser and (per §1.1) apparently per-profile-directory.

### 2.2 Manifest shape and identity

[mdn-manifests]: `name` matches `^\w+(\.\w+)*$`; `path` "On Windows, this may be relative to the manifest itself. On macOS and Linux, it must be absolute"; `type` "Takes the value `"stdio"` only"; `allowed_extensions` is "An array of Add-on ID values."

[mdn-nm] on the divergence: "The app manifest lists `allowed_extensions` as an array of app IDs, while Chrome lists `allowed_origins`, as an array of `"chrome-extension"` URLs." The ID is the one the extension declares in `browser_specific_settings.gecko.id`, email-style, e.g. `ping_pong@example.org`.

**The Firefox ID is author-chosen and stable from day one.** [ew-id]: "For Manifest V3 extensions you must add an ID to your extension's manifest.json file before it's submitted to AMO", and native messaging is listed among the features requiring an explicit ID. So Firefox pairing has **no chicken-and-egg**, unlike Chrome.

### 2.3 Size limits

[mdn-nm], verbatim:

> "The maximum size of a single message from the application is 1 MB. The maximum size of a message sent to the application is 4 GB."

MDN's example code comments reinforce it: "We want the most compact representation because the browser rejects messages that exceed 1 MB."

So app→extension **1 MB** (same as Chrome), extension→app **4 GB** (Chrome: 64 MiB). **The binding number is identical on both engines: 1 MB per message from the MCP server to the extension.**

### 2.4 Lifecycle and teardown — the architectural fact

[mdn-nm] / [mdn-connectnative]:

> "This launches the application if it is not already running and returns a `runtime.Port` object to the extension."

> "The native application will run until it exits itself, or the caller calls `Port.disconnect()`, or the page that created the `Port` is destroyed. **Once the `Port` is disconnected the browser will give the process a few seconds to exit gracefully, and then kill it if it has not exited.**"

> "On \*nix systems like macOS and Linux, the browser sends `SIGTERM` to the native application, then `SIGKILL` after the application has had a chance to exit gracefully. **These signals propagate to any subprocesses unless they break away into a new process group.**"

**The browser owns the host process lifetime.** Two shapes follow, and #107/#108 must pick one:

1. **Host = the MCP server.** Simple, but the server's life is the browser's to end: quitting Firefox, reloading the extension, or disabling it kills a server that a Claude Code session is holding open. A second connecting context spawns a second copy — which collides with this project's existing one-driver-per-tab rule and the `~/.pokerogue-mcp/driver.lock`.
2. **Host = a thin stdio↔IPC shim** in front of an independently managed long-lived MCP daemon. Survives browser restarts. **But** the quoted signal-propagation sentence is the reason this only works if the daemon breaks away into a new process group — `spawn(..., { detached: true })` plus `unref()` in Node. That MDN sentence is the primary-source justification for the detach, and it is easy to get wrong silently.

Shape 2 is the one the evidence supports.

### 2.5 Permission and AMO policy

[mdn-nm]: "The extension must request the `"nativeMessaging"` permission **or optional permission** in the `manifest.json` file", and [mdn-optperm] lists `nativeMessaging` explicitly. MDN adds: "When using optional permission, check that permission has been granted and, where necessary, request permission from the user with the permissions API before communicating with the native application." Install-time warning string, [ew-perm]: **"Exchange messages with programs other than Firefox"**.

[amo]: "If the add-on uses native messaging, the Add-on Policies (including those related to user consent and control) apply to any data sent to the native application as well." Permitted; the policies simply follow the data across the boundary.

**UNCERTAIN — forced manual AMO review.** No primary source confirms that `nativeMessaging` automatically forces manual review. [amo] says only that "All add-ons are subject to a manual code review at any time after submission" and that "potentially dangerous APIs may only be used in ways that are demonstrably safe." The widely-repeated claim is **not backed by a primary doc.** Plan for manual review; do not cite it as fact.

### 2.6 The Firefox MV3 risk — UNVERIFIED and high-value

[mdn-bg], on event pages:

> "Message ports cannot prevent an event page from shutting down. If an extension uses message passing, the ports are closed when the event page idles."

> "Background scripts unload after a few seconds of inactivity."

Combined with [mdn-connectnative]'s "the native application will run until… the page that created the `Port` is destroyed", the implication is that **a Firefox MV3 event page going idle tears down the native port and the host with it.** Chrome documents an explicit `connectNative` keepalive ([chrome-sw], §1.5); **no equivalent MDN statement was found for Firefox.**

> **UNVERIFIED.** MDN does not state this for native ports either way. Flagged as unverified rather than asserted — and it is the single highest-value thing to test empirically before committing to a persistent-port design on Firefox. It belongs in the map's fog.

---

## 3. Safari — no classic native messaging, and the containing-app route is closed

### 3.1 The APIs exist; the reach does not

[bcd] lists both `connectNative` and `sendNativeMessage` as `safari: "14"`, `safari_ios: "15"`. **That is correct and it is not evidence of host support.** Apple supports both names and redefines both.

[wwdc20], verbatim:

> "Native messaging allows apps and extensions to communicate. **Unlike in other browsers, your extension is only allowed to communicate with its container app.**"

> "You don't need to provide the application IDs to these APIs, as **Safari securely guarantees that the message will be relayed to your app extension.**"

[apple-msg], verbatim, on both calls:

> "**Safari ignores the `application.id` parameter** and only sends the message to the containing app's native app extension."

> "**Safari ignores the `application.id` parameter** and only allows the script to establish a port connection with the containing macOS app."

`connectNative` exists in Safari specifically to serve the *app → JavaScript* direction: [wwdc20], "To receive the message in the background page, you must have opened a port using `browser.runtime.connectnative`", with the app side calling `SFSafariApplication.dispatchMessage(withName:toExtensionWithIdentifier:userInfo:)`. **UNCERTAIN:** Apple shows `port.onMessage.addListener` but never `port.postMessage` for the JS→native direction; whether `port.postMessage` works JS→native in Safari is undocumented either way.

**Corroborating negative evidence.** [apple-compat] is Apple's exhaustive incompatibility list, itemising unsupported keys down to `tabs.move` and `scripting.executeScript`'s `injectImmediately`. It never mentions a `NativeMessagingHosts` directory, a host manifest or stdio framing — because that surface does not exist in Safari's model at all.

**Verdict: no host manifest, no directory, no `path` field, no stdio, no way to name an executable.** There is nothing a pairing command could write.

> **Do not cite an `SFExtensionMessageHandler` reference page.** `https://developer.apple.com/documentation/safariservices/sfextensionmessagehandler` returns **HTTP 404** in both casings. The protocol exists only in the Xcode-generated `SafariWebExtensionHandler` template; every documented behaviour attaches to `NSExtensionRequestHandling.beginRequest(with:)` and to `SFExtensionMessageKey` instead.

### 3.2 Two further Safari-only cuts

[apple-msg]:

> "You can send messages to the native app extension from a background script or from extension pages that provide a user interface for your Safari web extension. **Content scripts that are injected into web content cannot send messages to the native app extension.**"

Chrome has the same restriction ([chrome-nm], §1.5), so this is parity — but it does mean every engine routes page traffic through the background context, which interacts with whatever #99 concludes about injection.

[apple-run]:

> "If you're working in macOS, **you use a macOS app to deploy a Safari web extension.** Run the containing macOS app to install your web extension in Safari… **As soon as your app runs, your extension is ready for use in Safari.**"

The player must **launch an app once** before the extension exists in Safari's list. No Chrome/Firefox counterpart. This belongs in the map's open onboarding item.

### 3.3 The receiving process is short-lived and cannot hold a session

This is the finding that closes the containing-app route independently of the sandbox.

[apple-msg]:

> "A Safari web extension consists of **three parts that operate independently in their own sandboxed environments**: A macOS or iOS app that can have a user interface[;] JavaScript code and web files that work in the browser or Mac web app[;] **a native app extension that mediates between the macOS or iOS app and the JavaScript code.**"

> "**Because the macOS or iOS app and the native app extension each run in their own sandboxed environments, they cannot share data in their respective containers.**"

[apple-extpg]:

> "**There is no direct communication between an app extension and its containing app; typically, the containing app isn't even running while a contained extension is running.**"

> "**An extension typically terminates soon after it completes the request it received from the host app.**"

> "An app extension cannot: … **Perform long-running background tasks**"

**So the process that receives `sendNativeMessage` is not the containing app.** It is a separate, on-demand, short-lived app-extension process that Apple explicitly bars from long-running background work. **It cannot hold a persistent socket, a subprocess, or a session to an MCP server across calls.** Any connection must be re-established per message, or state must live in an app group container or in the Node process itself.

### 3.4 The sandbox forbids launching `node`

[apple-files], verbatim — this is the decisive sentence:

> "Your app has full read and write access to its sandbox container, and **can run programs located there** as well."

> "**Your app can't run programs in locations outside its app bundle, sandbox container, or app group containers** using the entitlements to access user-selected files."

A sandboxed app or app extension **cannot `posix_spawn` / `NSTask` / `Process` `/usr/local/bin/node`** or a user's npm-installed script. Read access to a user-selected file does not confer execute.

And bundling your own Node does not buy freedom, [apple-protect]:

> "**If your macOS app embeds a command-line tool, that tool must inherit the containing app's sandbox configuration.**"

The helper must carry `com.apple.security.inherit` and is embedded in `Contents/MacOS` — an inheriting child gets the parent's restrictions.

[apple-sandbox] on when this applies: "**To distribute a macOS app through the Mac App Store, you must enable the App Sandbox capability.**"

### 3.5 What the sandbox *does* allow: localhost TCP

[apple-netclient], verbatim, and this is Apple explicitly blessing loopback:

> "Use this key to allow your sandboxed app to connect to a server process running on another machine, **or on the same machine**."

> "For TCP sockets, the `com.apple.security.network.client` and `com.apple.security.network.server` entitlements **restrict only the initiation of a network connection, not the flow of data.** Outgoing and incoming connections can both send and receive data."

So `com.apple.security.network.client` alone suffices for the client side of a `127.0.0.1` TCP connection, with full bidirectional traffic once established. `com.apple.security.network.server` is needed only to listen.

**UNCERTAIN:** Apple does not document **Unix domain sockets** under the network entitlements — the text speaks only of TCP/UDP. A UDS path would also face the container-boundary rules. Prefer TCP on localhost; it is the only option Apple documents affirmatively. **Also UNCERTAIN:** the Mach-service lookup policy for a sandboxed process reaching a daemon outside its app group is not documented by Apple. Do not assert it either way.

**Dotfiles are effectively unreachable.** [apple-protect]: "When your sandboxed app launches for the first time, macOS creates a sandbox container on the file system (in `~/Library/Containers`)… **The sandboxed app doesn't have unrestricted access to the user's home folder.**" User-chosen paths work via open/save panels plus security-scoped bookmarks — but a user cannot select an invisible dotfile in a standard open panel, and "Your app **can't automatically gain full disk access through an entitlement or with code**". A `~/.pokerogue-mcp/` handshake file is not readable by a sandboxed Safari bridge.

### 3.6 Message size limits — Apple documents none

**Checked every plausible primary source** — [apple-msg], `SFExtensionMessageKey`, `NSExtensionRequestHandling`, `SFSafariApplication`, [apple-compat], [wwdc20]. **None states a size limit, a byte count, or even qualitative "keep messages small" guidance.**

The absence is meaningful rather than an artifact of sparse docs, because **Apple does document limits when they exist** — the same [apple-compat] page that omits any native-messaging number gives a precise storage figure: "`storage`: Local storage limit is **5 MB**. In Safari 15 or earlier, setting this to `unlimited` increases the extension's storage limit to **10 MB**."

> ⚠️ **On the circulating "6 MB" figure.** It traces to [forum-691389], where the **original poster** — a community member, not Apple staff — wrote "This was throwing an error because I was hitting the 6mb memory limit." That is one developer's inference from their own `SFErrorDomain Code=3` debugging. **It is not an Apple specification and must not be cited as one.**

[apple-extpg] explicitly declines to specify the transport: "Behind the scenes, the system uses interprocess communication… **In your code, you never have to think about this underlying communication mechanism.**"

**Treat the ceiling as unspecified and empirically determined.**

### 3.7 Distribution outside the Mac App Store — a documented conflict

[apple-dist], current, has a dedicated section:

> "If you provide your extension in macOS and don't want to use the Mac App Store for distribution, **you can sign and notarize your extension's app with a Developer ID to distribute it outside the Mac App Store.**"

> "**Safari only supports signed extensions**, but for beta testing, you can send beta testers an unsigned copy of the macOS app containing your extension."

> "For security purposes, **Safari ignores unsigned extensions by default**, so your extension won't show up in Safari Extensions preferences."

> ⚠️ **Conflicting primary-ish source.** [forum-675233] (**March 2021**), a reply carrying an **Apple staff badge**: *"Only Safari Web Extensions distributed through the App Store can be loaded without allowing unsigned extensions."* If still true, Developer ID distribution would be unusable in practice — every user would have to tick "Allow unsigned extensions", a setting that resets when Safari quits.
>
> These cannot both hold. The documentation is current and explicitly describes the Developer ID path; the forum reply is five years old and predates most of Safari's web-extension maturation. **My read is that the doc supersedes it and the restriction was lifted — but no Apple source addresses the change directly.** Treat Developer ID distribution as *documented-but-verify*, and test on a clean machine before committing the architecture to it.

**UNCERTAIN:** whether Safari independently requires the containing app be sandboxed **outside** the Mac App Store. [apple-sandbox] ties the requirement to the Mac App Store; Apple's Safari docs are silent. If Developer ID works *and* sandboxing is not independently required, §3.4 reopens — at the cost of the App Store listing the map assumes. **UNCERTAIN:** whether the app must live in `/Applications`. Apple documents no such requirement, and does not document its absence either.

### 3.8 App Review, for an app whose job is bridging

[apple-review], verbatim:

> **2.4.5(ii)** "They must also be **self-contained, single app installation bundles and cannot install code or resources in shared locations**."

> **2.4.5(iii)** "They may not auto-launch or have other code run automatically at startup or login without consent **nor spawn processes that continue to run without consent after a user has quit the app**."

> **2.4.5(iv)** "They may not **download or install standalone apps, kexts, additional code, or resources to add functionality** or significantly change the app from what we see during the review process."

> **2.5.2** "Apps should be **self-contained in their bundles**, and may not read or write data outside the designated container area, nor may they **download, install, or execute code which introduces or changes features or functionality of the app, including other apps**."

> **4.2.3(i)** "**Your app should work on its own without requiring installation of another app to function.**"

> **4.2** "Your app should include features, content, and UI that **elevate it beyond a repackaged website.** If your app is not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store."

A containing app that exists only to relay to an npm-installed Node MCP server collides on at least four independent counts — **4.2.3(i)** most directly, then **4.2**, **2.5.2** and **2.4.5(iii)**. This is a reading of the quoted text, not Apple's own words about this case. The honest mitigation is the map's own transport-opt-in framing: the app ships the HUD, which works standalone, and the transport lights up only if a server is present. That is a defensible story told to a reviewer, not a guarantee.

---

## 4. What a pairing step has to write on disk, per engine

The map locks: *"Pairing is an explicit setup command. No silent OS-level writes."* Here is what that command actually does. Every path is per-user and needs no `sudo`; the system-wide variants exist and should not be used.

### 4.1 Chrome (and each Chromium fork separately)

Per Chromium-family browser present on the machine, **one JSON file**:

```
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/net.pokerogue.mcp.json
```

```json
{
  "name": "net.pokerogue.mcp",
  "description": "PokéRogue MCP transport",
  "path": "/Users/<user>/.pokerogue-mcp/host/pokerogue-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<32-char-id>/"]
}
```

Plus **one executable shim** at that absolute `path` — mode `0755`, `#!/usr/bin/env node` — since `path` must name something the OS can execute and a bare `.js` is not, and since an interpreted shim sidesteps the undocumented quarantine/notarization question in §1.2. `~/.pokerogue-mcp/` already exists in this project (Chrome profile, `driver.lock`), so pairing adds no new top-level directory.

Cardinality: **N files, one per Chromium fork**, each in its own directory, only two of which [chrome-nm] documents (§1.1). Name must be **lowercase** reverse-DNS to satisfy both engines.

### 4.2 Firefox

**One JSON file**, covering every Mozilla channel and profile:

```
~/Library/Application Support/Mozilla/NativeMessagingHosts/net.pokerogue.mcp.json
```

```json
{
  "name": "net.pokerogue.mcp",
  "description": "PokéRogue MCP transport",
  "path": "/Users/<user>/.pokerogue-mcp/host/pokerogue-host",
  "type": "stdio",
  "allowed_extensions": ["pokerogue-mcp@pokerogue.net"]
}
```

Same shim, reused. The ID is author-chosen, so this file is writable before the extension has ever been submitted.

### 4.3 Safari

**Nothing. There is no file, no key, no directory.**

This is not "pairing is easier on Safari" — it is "the thing pairing exists to do cannot be expressed". And the alternatives are constrained: the receiving process is short-lived and barred from long-running background work (§3.3), it cannot launch `node` if sandboxed (§3.4), and it cannot read a dotfile handshake outside its container (§3.5). What it *can* do is open a TCP connection to `127.0.0.1` (§3.5) — which means Safari's pairing artifact, if any, is a port number and a token inside the **app group container**, not a manifest in a browser directory.

### 4.4 The write-set, summarised

| Engine | Files written | Location | sudo? | Removable by unpair? | ID known pre-publication? |
|---|---|---|---|---|---|
| Chrome (+ each fork) | 1 manifest per browser + 1 shared shim | `~/Library/Application Support/<Browser>/NativeMessagingHosts/` | no | yes | only after first dashboard upload (`key`) |
| Firefox (all channels/profiles) | 1 manifest + the same shim | `~/Library/Application Support/Mozilla/NativeMessagingHosts/` | no | yes | **yes, author-chosen** |
| Safari | **0 — impossible** | — | — | — | n/a |

---

## 5. The localhost socket alternative

### 5.1 Does it work, per engine?

**Chrome MV3 — yes, with a new caveat.** The extension CSP is not the obstacle: [chrome-csp] gives the minimum as `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';` — **no `connect-src`, no `default-src`**, so network destinations are unrestricted by the default policy; the documented immutability is only that "you cannot add other script sources to directives". The service worker can open a WebSocket ([chrome-net]: "A script executing in an extension service worker or foreground tab can talk to remote servers outside of its origin, as long as the extension requests host permissions"); a content script cannot, because "Content scripts initiate requests on behalf of the web origin that the content script has been injected into and therefore content scripts are also subject to the same origin policy."

**Service-worker lifetime is solved, and equal to native messaging.** [chrome-sw]: **"Active WebSocket connections now extend extension service worker lifetimes. Sending or receiving messages across a WebSocket in an extension service worker resets the service worker's idle timer."** (Chrome 116+). [chrome-ws] adds the operational detail: "a service worker could become inactive despite a WebSocket connection being active if no other extension events occurred for 30 seconds" and **"Set the interval to 20 seconds to prevent the service worker from becoming inactive."** So: an idle socket is not enough, a 20-second ping is. This **corrects an earlier assumption** that native messaging holds a lifetime advantage — it does not.

> **UNCERTAIN, important:** `ws://` and `wss://` **cannot be written into Chrome `host_permissions` at all.** [chrome-match] lists the permitted schemes as "`http`, `https`, A wildcard `*`, which matches only `http` or `https`, `file`". Neither [chrome-net] nor [chrome-ws] mentions WebSocket in connection with host permissions. **Whether an extension WebSocket is host-permission-gated is not documented either way.** Do not assert it. Declaring `http://127.0.0.1/*` and `http://localhost/*` anyway is the defensive move — and see §5.2 for why you want them regardless.

**Firefox — yes.** [mdn-csp] gives the MV3 default as `script-src 'self'; upgrade-insecure-requests;` — no `connect-src`, so WebSocket connections are not CSP-restricted. [mdn-match] confirms Firefox **does** accept `ws`/`wss` in match patterns, unlike Chrome. **UNCERTAIN:** no Firefox-specific confirmation was found that the MV3 default `upgrade-insecure-requests` leaves `ws://127.0.0.1` alone; the spec says WebSocket upgrading is a separate path, so it should, but this deserves a five-minute empirical check.

**Mixed content is not the blocker anywhere.** [w3c-sc], "Is origin potentially trustworthy?": "If origin's host matches one of the CIDR notations `127.0.0.0/8` or `::1/128` … return `Potentially Trustworthy`", and likewise for hosts `localhost` / `.localhost`. This is a **host** test, not a scheme test, so `ws://127.0.0.1:PORT` qualifies. [w3c-mixed]: "A request is mixed content if its URL is not a potentially trustworthy URL"; "Return allowed if … request's URL is a potentially trustworthy URL." [mdn-mixed] states it plainly: "Local resources are considered to be from secure origins, just like HTTPS origins. This includes `file:` URLs, and content accessed from loopback addresses such as `http://127.0.0.1/` or `http://localhost/`."

**Safari — reported broken, and this is the finding that matters.** WebKit does **not** implement the loopback carve-out. [wk-171934], "Don't treat loopback addresses (127.0.0.0/8, ::1/128, localhost, .localhost) as mixed content", status **NEW** — still open. [wk-281149], "WebKit is inconsistent about whether localhost is a secure origin or not", status **REOPENED**, notes `SecurityOrigin.cpp` treating localhost as potentially trustworthy while `MixedContentChecker.cpp` treats it as insecure. And there is a directly on-point developer report, [forum-722876]:

> "We have a browser extension where we are listening to websocket server at localhost. Inspecting background page I see the error 'Refused to connect to ws://localhost:port because it does not appear in the connect-src directive of the Content Security Policy'… In console logs there also appeared a warning suggesting that page is blocking to load content from the same websocket url ws://localhost:port as its insecure… **The same extension code works fine in Chrome and Firefox.**"

**Zero replies, no Apple response.** A second thread shows the same `connect-src` refusal for a plain `https://` fetch from a Safari extension background page, also unanswered. [apple-compat], Apple's exhaustive incompatibility list, says nothing about `connect-src` or localhost.

> **UNCERTAIN but strongly negative.** There is no Apple documentation stating `ws://localhost` is unsupported in Safari web extensions — and none stating it works, an open WebKit bug that predicts it won't, and unanswered developer reports that it doesn't. **Treat Safari as non-viable for a localhost-WS transport until proven otherwise by hands-on test.** The conventional workaround is `wss://` with a locally trusted certificate, which drags certificate provisioning onto a machine the project does not control.

### 5.2 The Chrome Local Network Access change — a live, moving risk

[chrome-lna] shipped a Local Network Access permission prompt in **Chrome 142**:

> "Local Network Access restricts the ability of websites to send requests to servers on a user's local network (**including servers running locally on the user's machine**), requiring the user grant the site permission before such requests can be made."

with loopback defined as "any destination that resolves to the local machine (i.e., 'loopback' interface)", covering `127.0.0.0/8` and `::1/128`. At the time that blog was written WebSockets were exempt. **That exemption is gone.** [chrome-147]:

> "Local Network Access (LNA) restrictions are expanding to include WebSockets. **WebSockets connections to local addresses now trigger permission prompts.**"

[lna-spec] confirms: `enum IPAddressSpace { "public", "local", "loopback" };` and "WebSockets connections should be subject to the same local network access permission requirements." It also carves out the originating side: "Requests originating from the loopback address should not be considered local network requests… since any software running on the user's device is already in the most privileged vantage point on the user's network."

> **UNCERTAIN, and this is the decisive unknown for the socket route:** neither [chrome-lna], [chrome-147] nor [lna-spec] says anything about **extensions**. Whether an extension service worker at a `chrome-extension://` origin counts as "public address space" — and therefore needs a user permission prompt to reach `ws://127.0.0.1` — is **not documented.** A Chrome engineer stated on the chromium-extensions list that "as long as an extension has the correct host permissions, then they will not be impacted by this", but that is a mailing-list reply, it predates the WebSocket expansion, and per §5.1 `ws://` **cannot be written as a host permission at all.** Do not plan on the carve-out. Chrome 138+ can test this today via `chrome://flags/#local-network-access-check` set to "Enabled (Blocking)". **Cheap, high-value probe; do it before #107 picks a channel.**

One more architectural wrinkle from [chrome-lna]: "If your application makes local network requests from a service worker, you will need to separately trigger a local network request from your application in order to trigger the permission prompt" — a worker cannot raise the prompt itself.

**macOS's own local-network prompt is probably not a factor.** [tn3179] defines scope as "A local network is an IP network associated with a **broadcast-capable** network interface. Such interfaces include Wi-Fi and Ethernet, but not cellular (WWAN) or VPN", and exempts "Traffic originating from WKWebView, SFSafariViewController, and **Safari**". **The word "loopback" does not appear anywhere in TN3179.** The conclusion that 127.0.0.1 is out of scope is an **inference** from the definition — sound, but unquoted, so flagged. [tn3179] does note that on macOS "Any daemon started by `launchd`" is automatically allowed but "The exception for `launchd` daemons doesn't apply to `launchd` **agents**" — relevant if the MCP daemon is ever run as a per-user agent.

### 5.3 The rule that constrains the protocol — on *every* channel

[cws-mv3] lists as violations "Using JavaScript's `eval()` method or other mechanisms to execute a string fetched from a remote source" and **"Building an interpreter to run complex commands fetched from a remote source"**, while permitting "Fetching a remote configuration file … where all logic for the functionality is contained within the extension package". [amo] says the same in one line: "Add-ons must be self-contained and not load remote code for execution."

**This is not a WebSocket-only problem. It applies identically to native messaging**, because it is about the *shape of the transport protocol*, not the channel. An extension that accepts `{press: 7}` or `{select_option: "Great Ball"}` has a closed vocabulary with all logic in the package. An extension that accepts a JavaScript string and evaluates it in the page is the violation, verbatim.

**This bears directly on the current codebase.** `scripts/eval.ts` and the `read.sh` probe injection work by shipping arbitrary JS into the page world. If the extension exposes anything of that shape over the channel, it is a policy problem on Chrome *and* on AMO. **The extension's protocol must be a closed, enumerated vocabulary.** Neither #108 nor #110 currently states this.

### 5.4 Security: a localhost server is reachable by every page the player visits

[rfc6455] §4.1: "The request MUST include a header field with the name |Origin| if the request is coming from a browser client." §10.2 makes clear that origin checking is the **server's** job, that servers choosing not to validate "will accept connections from anywhere", and that for non-browser clients the mechanism "provides limited value since dedicated applications can supply arbitrary origin strings." There is no CORS preflight for a WebSocket handshake.

So **`evil.com` can open `ws://127.0.0.1:PORT` and talk to the MCP server**, and the only thing in the way is the server's own `Origin` check. A random high port is not a defence; port scanning over WS from JS is fast and well known. And the loopback carve-out in §5.1 that makes the feature work is the same carve-out that makes the attack work — LNA (§5.2) is the only browser-side mitigation, it is Chrome-only, and its extension behaviour is undocumented.

Minimum bar, none of which the platform provides: strict `Origin` allowlist on the handshake; bind `127.0.0.1` only, never `0.0.0.0`; a per-session bearer token delivered out of band; treat everything arriving over the socket as untrusted.

**That last item is genuinely hard, and it is the strongest argument for native messaging.** An extension and a local process have no shared secret by construction. Native messaging removes the problem rather than solving it: the browser launches the host over stdio, so there is **no listening port and no forgeable Origin.** Note this cuts against [chromium-faq]'s warning in §1.3 — `allowed_origins` does not authenticate, but the absence of a port is still a materially smaller attack surface than an open one.

### 5.5 Raw TCP is not available

`chrome.sockets.tcp` carries Chrome's own deprecation banner — "This page is part of the documentation for the Chrome Apps platform, which was deprecated in 2020" — and lives under Apps, not Extensions. **Confirmed: extensions cannot open raw TCP sockets.** WebSocket (or `fetch`) is the only transport available to an extension short of native messaging.

### 5.6 Store policy on a local channel, per store

| Store | Explicit prohibition on talking to a local server? | The rule that actually applies |
|---|---|---|
| Chrome Web Store | none found | [cws-mv3] remote-code rule — the *protocol* must be a closed vocabulary (§5.3). Also [cws-min]: "Extensions with broken functionality—such as dead sites or non-functioning features—are not allowed", and "Do not post an extension with a single purpose of installing or launching another app". An extension that does nothing until the user installs an npm package could read as non-functional at review; ship a meaningful degraded state and an in-extension setup flow. |
| AMO | none found | [amo] "self-contained and not load remote code for execution"; native-messaging data inherits the add-on policies. **UNCERTAIN:** no AMO section addresses local servers as such; the §6 native-messaging sentence is the closest analogue. |
| Mac App Store | none found | [apple-review] 4.2.3(i), 4.2, 2.5.2, 2.4.5(iii)/(iv) — §3.8 |

Nothing in any store's policy forbids a local channel as such. The exposure is uniform across both routes and it is the same exposure: *this extension needs a separately installed program to do its main job.*

---

## 6. What this puts in question on the map

**Contradicts a locked decision.**

1. **"All three engines day one" + "the extension replaces CDP and Apple Events", with native messaging as the transport.** These cannot all hold. Chrome and Firefox get a real transport. Safari gets a channel to a short-lived app-extension process that cannot hold a session (§3.3) and cannot launch `node` if sandboxed (§3.4). Either the transport is native messaging and Safari ships HUD-only — breaking "payload: HUD + MCP transport" for one engine — or Safari's transport is a second, different mechanism, which breaks parity as a design constraint. There is no single mechanism that serves all three: native messaging excludes Safari, and the localhost socket is *reported broken* on Safari (§5.1) and newly permission-gated on Chrome (§5.2).
2. **"Pairing is an explicit setup command. No silent OS-level writes."** Sound and cheaply satisfied on Chrome and Firefox — a per-user JSON file plus an executable shim, no `sudo`, fully reversible (§4). **Undefined on Safari**, where there is nothing to write and the bridge cannot read a dotfile outside its container (§3.5). "Pairing" needs a second meaning there, or the word stops covering all three engines.
3. **"One extension, transport opt-in."** Survives on Chrome and Firefox. On Safari it meets [apple-review] 4.2.3(i) — "Your app should work on its own without requiring installation of another app to function" — plus 4.2, 2.5.2 and 2.4.5(iii) (§3.8). The opt-in framing is the defence, but it is a reviewer argument, not a guarantee.

**Qualifies a locked decision.** "The extension replaces CDP and Apple Events" also means the extension's protocol must be a **closed, enumerated command vocabulary** — [cws-mv3]'s "Building an interpreter to run complex commands fetched from a remote source" is a policy violation, and `scripts/eval.ts` and the `read.sh` probe injection are exactly that shape (§5.3). This constrains #108's migration and #110's disclosure, and neither states it.

**New fog.**

- Does a non-default `--user-data-dir` (this project uses `~/.pokerogue-mcp/chrome-profile`) move Chrome's per-user `NativeMessagingHosts` lookup? [chrome-nm] says the lookup is relative to "the user profile directory". Must be probed before #107 fixes a path.
- **Does a Firefox MV3 event page tear down the native port when it idles?** [mdn-bg] says ports don't hold an event page open; Chrome documents a `connectNative` keepalive and MDN documents no equivalent. **UNVERIFIED.** Highest-value Firefox probe.
- **Is an extension service worker "public address space" for Chrome's Local Network Access permission?** Undocumented, and Chrome 147 has just extended LNA to WebSockets. Testable today behind a flag. Highest-value Chrome probe.
- **Can a Safari web extension background page open `ws://127.0.0.1` at all?** Two unanswered forum reports say no, WebKit bug 171934 is still NEW, Apple is silent. If it cannot, Safari has no transport that does not go through the containing app. Highest-value Safari probe.
- Can a Safari web extension actually ship with Developer ID outside the Mac App Store today? Current Apple docs say yes; a March 2021 Apple-badged forum reply said no. If yes, is the containing app still required to be sandboxed? If not sandboxed, §3.4 reopens — at the cost of the App Store listing.
- What is Safari's native-message size limit? Apple publishes no number, and the circulating 6 MB figure is a forum poster's inference.
- Can `nativeMessaging` be an *optional* permission on Chrome? Firefox says yes explicitly; Chrome's list does not say. Bears on #110's "can any of it be optional".
- Does `nativeMessaging` trigger deeper CWS review or forced manual AMO review? Neither is confirmed by a primary source, despite both being widely claimed.
- Does macOS quarantine / notarization apply to a native messaging host binary? Undocumented by both browsers. Sidestepped by an interpreted shim.
- Host = MCP server, or host = thin shim in front of a detached daemon? [mdn-nm]'s "These signals propagate to any subprocesses unless they break away into a new process group" is the primary-source case for the shim plus `detached: true`.
- The **1 MB host→extension** cap is binding on both engines. `screenshot()` returns a PNG that can exceed it. #108 must decide chunk-or-drop.
- If a socket is ever chosen, the extension and the local process have no shared secret by construction (§5.4). That is a #107 problem with no platform answer.

---

## Note on where this file lives

Earlier research on this repo was committed to `.scratch/pokerogue-mcp-v1/research/NN-name.md`, a path scoped to map [#1](https://github.com/IIxauII/pokerogue-mcp/issues/1). This is map #98, whose spec lands at `docs/spec/extension-distribution.md`, so the findings go under `docs/research/` alongside `docs/spec/` and `docs/adr/` rather than under a v1-scoped scratch directory. The branch convention is unchanged: `research/native-messaging`, pushed and left unmerged.
