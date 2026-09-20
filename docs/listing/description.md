# Listing copy

What goes into the Chrome Web Store and AMO listing forms, ready to paste. The order of the body and its fixed lines
are §3.1 of [the extension distribution spec](../spec/extension-distribution.md); the wording is free, and this file
is the wording. `src/listing.test.ts` pins the parts that are not free.

The store disclosure answers — single purpose, host access, remote code, data usage, licence — are
[`store-disclosure.md`](store-disclosure.md). The assets are [`assets/`](assets), listed in `scripts/listing/listing.ts`.

## Title and keywords

| Field | Value |
|---|---|
| Name (CWS, AMO, manifest, Safari app) | `Coachemon` |
| Slug | `coachemon` |
| Category | CWS: *Workflow & Planning*. AMO: *Games*. |
| Keywords / tags | `coach`, `overlay`, `turn advice`, `battle helper`, `roguelite` |
| Publisher | `IIxauII` |
| Language | English only |
| Homepage | <https://github.com/IIxauII/coachemon> |
| Support | email only, the address in [`store-disclosure.md`](store-disclosure.md) |

The game is never named in the title or the keywords, and no keyword is a franchise word.

## Summary

The one-line form field. Identical to the manifest's `description`, so an extension page and a listing say one thing:

> Unofficial coach overlay for PokéRogue. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.

## Description (CWS and AMO body)

Paste from here down, as plain text.

---

Coachemon is a coach overlay for PokéRogue: it reads the game you are playing and shows you what to do this turn.

It coaches every decision the run puts in front of you:

- **Battles** — which move on which target, how many hits it takes, what the enemy does back, and whether the fight is
  winnable as it stands.
- **Learning a move** — what the new move is worth, which move to forget, and what your team loses if you do.
- **Rewards** — which reward is the best one, and who should hold it.
- **Biome choice** — where the next path leads and what it costs you.
- **Mystery Encounters** — what each option really does, and which one is worth it.
- **The next big fight** — what is coming, and whether your team is ready for it.

It runs on pokerogue.net and nowhere else, in Chrome, Firefox or Orion. It does nothing on any other site, and asks
for no permission beyond that one.

Nothing leaves your computer. Coachemon has no server, no account, no tracking and no ads: everything it works out, it
works out in your own browser, from the game already on your screen.

It can also connect a local AI agent, such as Claude, over MCP, so the agent can follow the same game or play it with
you. That is optional, and it needs the Coachemon plugin installed on the same computer; without it, Coachemon is just
the overlay.

Coachemon is free software under the AGPL-3.0-only licence. The complete source for each version is the matching
`extension-v*` tag at <https://github.com/IIxauII/coachemon>.

Unofficial. Not affiliated with Pagefault Games, Nintendo or The Pokémon Company.

---

## Safari release notes

The Safari build is a signed download from the GitHub Release, not a listing, so it has no form to fill. Its release
notes carry the same body minus the browser line, plus the privacy policy link (§6).
