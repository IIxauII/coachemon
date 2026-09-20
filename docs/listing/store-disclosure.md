# Store disclosure

Every answer the Chrome Web Store and AMO forms want, in the words they get filed in. This is §6 of
[the extension distribution spec](../spec/extension-distribution.md), written out for the hand-made 1.0.0 listings;
every later release is submitted by CI against listings that already carry these answers (§14.4).

The disclosure covers the extension and its hop to the local program, not what that program does next.

Shared facts:

| Field | Value |
|---|---|
| Privacy policy URL | <https://iixauii.github.io/coachemon/PRIVACY> |
| Support email | `xauyxau+coachemon@gmail.com` |
| Homepage | <https://github.com/IIxauII/coachemon> |
| Permissions requested | none; the whole permission set is one content script on `https://pokerogue.net/*` |

## Chrome Web Store

| Field | What to file |
|---|---|
| **Single purpose** | A coaching overlay for PokéRogue. The agent link is an optional way for the player's own AI assistant to use the same coach. |
| **Host access** (`https://pokerogue.net/*`) | Runs the coach overlay on pokerogue.net and nowhere else. |
| **Remote code** | **Yes**. Justification: the overlay loads pokerogue.net's own JavaScript modules, from pokerogue.net, inside pokerogue.net's page, to read the game's tables. No code is loaded from anywhere else. |
| **Data usage** | *Website content* only: the game state on the page. Processed on the device, and optionally passed to a program on the same computer. Not sold, not transferred to third parties, not used for anything but the single purpose, not used for creditworthiness or lending. |
| **Data certifications** | All three boxes are true and get ticked: not sold to third parties, not used or transferred for a purpose unrelated to the single purpose, not used or transferred to determine creditworthiness. |
| **Privacy policy URL** | as above |
| **Category / language** | Workflow & Planning; English. |

Remote code is **Yes** because the HUD `import()`s the game's own modules. Filing *No* would be a false statement
about code the reviewer can see running; the justification is the honest answer and has no `eval`, no fetched logic
and no remote data table behind it (§1.2).

## AMO

| Field | What to file |
|---|---|
| **Licence** | GNU Affero General Public License v3.0 only |
| **Data collection** | The manifest declares it: `data_collection_permissions` is `{ required: ["none"], optional: ["websiteContent"] }`. Required: none. Optional: website content, and only when the player turns the agent link on by clicking the toolbar icon. |
| **Privacy policy URL** | as above |
| **Source code submission** | Required, because the artifact is bundled: upload `coachemon-<version>-sources.zip` from the same GitHub Release. Build instructions are `SOURCES.md` inside that zip, and the form gets the same three lines: Node >= 23.6 and npm; `cd extension && npm ci && npx wxt build -b firefox --mode store`; output `extension/.output/firefox-mv3-store/`. |
| **Notes to reviewer** | The extension requests no permissions. The overlay imports pokerogue.net's own modules inside that page to read the game's tables; nothing is fetched from any other origin. The toolbar button is the consent click that enables the optional local-agent link on Firefox; without a local program listening on `127.0.0.1:47147` it does nothing. |
| **Categories / tags** | Games; `coach`, `overlay`, `turn advice`, `battle helper`, `roguelite`. |

## Safari

No store disclosure exists: the build is a Developer ID-signed, notarized download from the GitHub Release. The
release notes link the privacy policy above.

---

Unofficial. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.
