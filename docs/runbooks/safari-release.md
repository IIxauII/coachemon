# Safari release, by hand, every release

Chrome and Firefox are stores and CI submits to them. Safari is not: its build is a Developer ID-signed, notarized
download from the same GitHub Release, and it needs an Apple Developer Program membership, a signing identity in a
local keychain, and Xcode — none of which CI has. So every `extension-v*` release needs one manual pass on the dev's
Mac, and this is it.

`npm run release:safari -- <version>` is that pass. This page is the setup it assumes, and the failures it can hit.

Spec: [§14.6 of the extension distribution spec](../spec/extension-distribution.md). Ticket:
[#209](https://github.com/IIxauII/pokerogue-mcp/issues/209).

## Every release

```sh
npm run release:safari -- 0.1.0 --dry-run   # print the twelve steps, run none of them
npm run release:safari -- 0.1.0             # do it
```

It downloads `coachemon-safari-web-extension-<version>.zip` from `extension-v<version>`, checks the manifest inside is
the version asked for, packages it into the generated `Coachemon` app, archives it with the hardened runtime,
notarizes it, staples the ticket into the app, zips **the stapled app** and uploads
`Coachemon-safari-<version>.zip` back onto the same release.

Everything happens in a scratch directory under `/tmp`, removed when the run succeeds and kept when it does not.
Nothing is uploaded until the last step, so a failure anywhere leaves the release as it was.

Flags: `--identity "<full identity>"` when the keychain holds more than one Developer ID Application identity,
`--keychain-profile <name>` (default `coachemon`, or `$COACHEMON_NOTARY_PROFILE`), `--repo owner/name` when the
release is not on this checkout's `origin`, `--work <dir>` to pick the scratch directory (it must be empty; the
script deletes only a directory it made itself), `--keep` to leave the scratch behind, `--dry-run` to print the plan.

`--dry-run` works before any of the setup below exists: it warns about what is missing and prints the plan anyway.

## One-time setup

### 1. Apple Developer Program

An **individual** membership, enrolled at <https://developer.apple.com/programs/>, about €99 a year. Enrolment is
[off-map](https://github.com/IIxauII/pokerogue-mcp/issues/1) and nothing in this repo can do it. Without it there is
no Developer ID identity to sign with, and an unsigned `.app` is refused by Gatekeeper on every Mac but the one that
built it.

### 2. Xcode, selected

Xcode from the App Store, then:

```sh
sudo xcode-select -s /Applications/Xcode.app
xcrun --find safari-web-extension-converter   # must print a path
```

The Command Line Tools alone are not enough: `safari-web-extension-converter` ships with Xcode, and `xcrun` resolves
against whatever `xcode-select` points at. `xcode-select -p` is not the check — it prints the Command Line Tools path
just as happily — which is why the script asks `xcrun` for the converter itself.

The tool is the **converter**. §14.6 called it `safari-web-extension-packager`, after the title of Apple's page
("Packaging a web extension for Safari"); no such tool exists, and the spec is corrected.

### 3. The Developer ID Application certificate

In Xcode, **Settings → Accounts → (your Apple ID) → Manage Certificates → + → Developer ID Application**. Then:

```sh
security find-identity -v -p codesigning
```

One line must read `"Developer ID Application: <your name> (TEAMID1234)"`. The script reads the team id off that
string, so it is never configured twice. `Apple Development` and `Developer ID Installer` identities are in the same
listing and are not candidates: the first is not notarizable, the second signs installer packages rather than apps.

### 4. The notarytool credential profile

Notarization authenticates with an **app-specific password**, not the Apple ID password. Create one at
<https://appleid.apple.com> → Sign-In and Security → App-Specific Passwords, then store it in the keychain once:

```sh
xcrun notarytool store-credentials coachemon \
  --apple-id "<your apple id>" \
  --team-id "<TEAMID1234>" \
  --password "<app-specific password>"
```

The profile name is what `--keychain-profile` takes. Nothing after this passes a password on a command line, where
`ps` and the shell history would see it.

### 5. `gh`, authenticated

```sh
gh auth status
```

The release lives on the private `IIxauII/pokerogue-mcp`, so the download and the upload both need a token that can
read and write its releases.

## What each step is for

| Step | Why it is there |
|---|---|
| Download, unpack | The release's own artifact is the input, so what is signed is exactly what CI built and the guard (§5.5) checked. The manifest's version is compared with the version asked for: `gh release download` matching nothing leaves a stale unzip in place. |
| Package | `safari-web-extension-converter` wraps the extension in a containing app, because macOS has no other way to install a Safari extension. The app is the converter's generated near-shell and stays that way: Attachment 7 bars bundling the extension with an app of a different purpose. `--no-prompt` so it does not stop on its warning summary waiting for a human. |
| Archive, export | `developer-id` is the distribution route with no App Store review. The hardened runtime is on because notarization refuses a build without it, and `--timestamp` because the hardened runtime requires a secure timestamp. |
| Notarize, staple | `notarytool submit --wait` blocks until Apple returns a verdict; the ticket it issues lives on Apple's servers. `stapler` writes it into the app so a player who is offline on first launch is not refused. |
| Validate, `spctl` | The two questions a player's Mac asks on first launch, asked here, where an answer is still cheap. |
| Zip, upload | The asset is cut from the app **after** stapling. Notarization staples nothing into the zip it was handed, so uploading the submitted zip would ship an app that passes only while the player is online. |

## When it fails

- **`no Developer ID Application identity in the keychain`** — step 3 above, or the certificate expired. Certificates
  last five years; the notarization they authorise does not expire once stapled.
- **`the keychain holds N Developer ID identities`** — pass the one to use with `--identity`, spelled exactly as
  `security find-identity` prints it inside the quotes.
- **`the downloaded extension is X, not Y`** — the tag does not carry the artifact asked for. Check the release.
- **Notarization rejected** — `xcrun notarytool log <submission-id> --keychain-profile coachemon` prints what Apple
  objected to. The usual causes are a missing hardened runtime or a signature with no secure timestamp, both of which
  the archive step sets; a rejection past those two is new and worth a ticket.
- **`spctl` says `rejected`** — the app is signed but not notarized, or the ticket was not stapled. Rerun; nothing
  before the upload is destructive.

A failed run says where its scratch directory is. The logs are in there.

## What this deliberately does not do

No auto-update, no Homebrew tap, no Sparkle: players re-download from the release (§14.6). Nothing here turns the
extension on for the player — Safari's own Extensions preferences do, by hand, per Attachment 7 §1.1.
