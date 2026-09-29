# Coachemon

**Unofficial coach overlay for [PokéRogue](https://pokerogue.net).** Coachemon reads the game you are playing and draws a panel on top of it that tells you what to do this turn — computed in your own browser, from the game already on your screen.

## What the overlay shows

It coaches every decision a run puts in front of you:

- **Battles** — which move on which target, how many hits it takes, what the enemy does back, and whether the fight is winnable as it stands.
- **Learning a move** — what the new move is worth, which move to forget, and what your team loses if you do.
- **Rewards** — which reward is the best one, who should hold it, and whether a reroll is worth the money.
- **Biome choice** — where the next path leads and what it costs you.
- **Mystery Encounters** — what each option really does, and which one is worth it.
- **The next big fight** — what is coming, and whether your team is ready for it.

The panel sits in the corner of the game tab and refreshes on its own. It runs on pokerogue.net and nowhere else, and asks for no permission beyond that one site. Nothing leaves your computer: no server, no account, no tracking, no ads.

## Install the extension

- [Chrome Web Store](https://chromewebstore.google.com/detail/coachemon/gmlfjnjhmapjelkciiipiccpbmmcknfe)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/coachemon/)

Install it, open PokéRogue, play. That's the whole setup — most players will never need anything else on this page.

## Optional: let an AI agent coach you

If you use Claude Code, Coachemon can connect it to your live game over MCP, so you can ask things the panel can't answer — long-term team building, tricky trade-offs, "what would you do here?" The agent reads your game and advises; you keep playing.

```bash
claude plugin marketplace add IIxauII/coachemon
claude plugin install coachemon@coachemon
```

Requires Node ≥ 23.6 and Chrome. Then, with PokéRogue open, just ask Claude what's going on or what it would recommend. Update later with `claude plugin marketplace update coachemon && claude plugin update coachemon@coachemon`.

## Optional: let the agent play

The same plugin also ships a `play-pokerogue` skill that lets Claude drive the game itself — button presses and all. It's a fun demo of the text-first control loop (structured state in, button presses out, no screenshots), but it's a gimmick, not the point of the project. The overlay above is.

## Non-goals

- Reimplementing game rules — the game is the source of truth.
- Multiplayer, ranking, or account farming. One account, playing as a player would.
- Playing *well* autonomously. The coach exists to help humans play better.

## License

Free software under [AGPL-3.0-only](LICENSE). Unofficial — not affiliated with Pagefault Games, Nintendo or The Pokémon Company.
