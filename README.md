# Coachemon

**Unofficial coach overlay for [PokéRogue](https://pokerogue.net).**

## What the overlay shows

It coaches every decision a run puts in front of you:

- **Battles** — which move on which target, how many hits it takes, what the enemy does back, and whether the fight is winnable as it stands.
- **Learning a move** — what the new move is worth, which move to forget, and what your team loses if you do.
- **Rewards** — which reward is the best one, who should hold it, and whether a reroll is worth the money.
- **Biome choice** — where the next path leads and what it costs you.
- **Mystery Encounters** — what each option really does, and which one is worth it.
- **The next big fight** — what is coming, and whether your team is ready for it.

## Install the extension

- [Chrome Web Store](https://chromewebstore.google.com/detail/coachemon/gmlfjnjhmapjelkciiipiccpbmmcknfe)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/coachemon/)

## Optional: let an AI agent coach you

If you use Claude Code, Coachemon can connect it to your live game over MCP, so you can ask things the panel can't answer — long-term team building, tricky trade-offs, "what would you do here?" The agent reads your game and advises; you keep playing.

```bash
claude plugin marketplace add IIxauII/coachemon
claude plugin install coachemon@coachemon
```

## Optional: let the agent play

The same plugin also ships a `play-pokerogue` skill that lets Claude drive the game itself — button presses and all. It's a fun demo of the text-first control loop (structured state in, button presses out, no screenshots), but it's a gimmick, not the point of the project. The overlay above is.

## License

[AGPL-3.0-only](LICENSE)
