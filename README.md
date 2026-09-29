# Coachemon

Coachemon lets Claude play [PokéRogue](https://pokerogue.net) — a browser roguelite where you fight wave after wave of Pokémon battles, shop between waves, and restart from wave 1 on a party wipe.

It does this with a **text-first** control loop: no pixel reading, no screenshot-per-action. A browser extension exposes the live game state as structured text, and an MCP server lets Claude read that state and press buttons. Claude sees the wave, the menu options and the party as data — and plays.

## Install

You need two things: the browser extension, and the Claude Code plugin (which bundles the MCP server and the skill that teaches Claude how to play).

### 1. Browser extension

Install the extension for your browser:

- [Chrome Web Store](https://chromewebstore.google.com/detail/coachemon/gmlfjnjhmapjelkciiipiccpbmmcknfe)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/coachemon/)

### 2. Claude Code plugin

```bash
claude plugin marketplace add IIxauII/coachemon
claude plugin install coachemon@coachemon
```

Update later with `claude plugin marketplace update coachemon && claude plugin update coachemon@coachemon`.

### Requirements

- Node ≥ 23.6
- Google Chrome
- A PokéRogue account

## Quick start

Open PokéRogue in your browser and, in any directory, ask Claude to play. On the first run, log in to your PokéRogue account by hand in the Chrome window that opens — the server never touches your credentials; the session rides on a persisted cookie. After that, Claude plays unattended: it reads the screen, picks options, and fights waves until the run wipes.

One agent per tab: if a second server tries to drive the same tab, it reports `tab_contended` and refuses to press.

## Tool surface

Claude gets seven tools — four read the game, three act on it.

| Tool | Type | What it does |
|---|---|---|
| `status()` | read | Are we attached? Is a run live? |
| `get_state(detail?)` | read | The settled snapshot: wave, turn, money, biome, active Pokémon, enemy, party; `party` / `items` / `full` widen it |
| `read_menu()` | read | Which screen is up, the option labels in cursor order, where the cursor is, the message text |
| `select_option(label)` | action | Move the cursor to that menu option and confirm it |
| `press(button)` | action | Press one raw button — the escape hatch |
| `start_run(species, slot?)` | action | Start a fresh run from the title screen with those starters |
| `screenshot()` | read | A PNG for the human watching |

Every result reports whether the call went `ok`, `timed_out`, got `stuck`, or the run ended. A timeout is not fatal — the next read resumes where it left off. When Claude is stuck, the server says so and hands over known escape routes instead of flailing.

## Non-goals

- Reimplementing game rules — the game is the source of truth.
- Multiplayer, ranking, or account farming. One account, one agent, playing as a player would.
- Playing *well*. The goal is surviving a run unattended, not score or wave depth.

## License

See [LICENSE](LICENSE).
