# The key probe: builds and press scripts

For [#1018 Build a probe build that offers every candidate route and logs each press on the panel](https://github.com/IIxauII/coachemon/issues/1018),
on the map [#1010](https://github.com/IIxauII/coachemon/issues/1010). The presses themselves are
[#1019 What each candidate route does on a physical key press, on Chrome, Firefox and Orion](https://github.com/IIxauII/coachemon/issues/1019);
its results go in §8 of the routes note on [`research/keyboard-routes`](https://github.com/IIxauII/coachemon/blob/research/keyboard-routes/docs/research/keyboard-routes.md).
This branch, `prototype/1010-keyboard-probe`, is throwaway and never merges.

**Every decisive press is made by hand.** CDP, BiDi and `osascript` keys skip the browser's shortcut layer, which is
the question. The automated smoke check below only shows the log draws.

## What the probe build is

The store flavour of the extension, with:

- **Every chord of the routes note's §6.1** as a `manifest.commands` entry, each named for its chord. The
  Chrome-flavoured build (Chrome, and Orion's first pass) suggests four keys, ⌥K ⌃K ⌘K ⇧⌘K, and declares the rest with
  no key, for binding by hand: Chrome refuses a fifth suggested key, or any ⌃⌥ / ⌘⌥ entry, and fails the whole
  manifest. The Firefox build suggests every chord it accepts. `extension/src/keyprobe/commands.ts` has the list.
- **A toolbar button** on both builds, so the click and `_execute_action` (⇧⌘U) are routes too. On Firefox the click
  still raises the data-consent prompt, as in the product.
- **A page listener**: a capture `keydown`/`keyup` on `window` for K J U L 1 and the modifiers, with a *log only* mode
  (the default) and a *prevent* mode that calls `preventDefault()` on K J U L 1. Prevent mode can also block a browser
  shortcut on those letters (⌘L on Firefox, for one), so switch it back after use.
- **An accesskey**: a `<button accesskey="k">` in the box, which the browser clicks on ⌃⌥K. It can be switched off,
  because on Firefox it shares ⌃⌥K with `probe-ctrl-opt-k`.
- **The probe box**, top right on pokerogue.net, beside the coach panel. One line per arrival, grouped into presses.
- **An options page** with a dummy `solving` switch and its cost. It writes no setting and never touches
  `settings.json`. It shows where it runs, whether the background hears it, and whether a dummy key binding survives in
  the page's `localStorage` and IndexedDB, and what the background can read of each.
- **No hub link.** The probe never dials the hub, so no Claude session can drive a probe tab.

### Reading the box

Each press has a heading, then one line per arrival:

```
press 3 · 19:59:35 · 2 grabs · game heard: ⌥ K
  +   0 ms  page keydown ⌥ (modifier) trusted=yes
  +  95 ms  page keydown ⌥K  code=KeyK key="˚" keyCode=75 trusted=yes  ← grab 1
  + 101 ms  command:probe-opt-k  (tab from event, background→page 3 ms)  ← grab 2
  + 180 ms  page keyup ⌥K  code=KeyK key="˚" keyCode=75 trusted=yes
```

- **The heading is gold for exactly one grab and red for none or two or more.** One grab per press is the goal.
- **Routes:** `page keydown` (the page listener), `command:<name>` (`commands.onCommand`), `action` (the toolbar click or
  ⇧⌘U), `accesskey click`.
- **game heard:** what reached the game's own listener (the bubble phase on `window`) with `defaultPrevented` unset.
  *prevented before the game* lists what the probe stopped. Look at the screen too: a Shift chord should open the
  game's stats.
- **A press with no line but modifiers** means the chord reached nothing. **0 grabs** in red, then.
- Below the presses: `commands.getAll()` (what the browser actually bound: *unassigned* means it never took the key)
  and the background's own log (`→ tab 12: delivered`, or `not delivered`, for a grab that fired into a tab with no
  content scripts).
- **copy log** puts all of it on the clipboard as text, for #1019.

## Where the builds are

| folder | load it in |
|---|---|
| `~/Downloads/coachemon-keyprobe-chrome` | Chrome (unpacked) |
| `~/Downloads/coachemon-keyprobe-firefox` | Firefox (temporary add-on: pick its `manifest.json`) |
| `~/Downloads/coachemon-keyprobe-orion` | Orion: load once, then swap builds into it (see Orion step 8) |

Each folder has a `KEYPROBE.txt` naming its build and flavour. Rebuild and re-place all three from this branch with
`cd extension && npm ci && node scripts/keyprobe.ts` (`--orion firefox` puts the Firefox build in Orion's folder).
Each folder is emptied and refilled in place, never replaced, since Orion keys an unpacked extension by its path.

## Before each browser

- **Turn the regular Coachemon off** in that browser. Two copies on one page fight over the coach panel. The probe box
  has its own id and does not care, but the panel will flicker.
- Open **Keyboard Viewer** with ⌥ held, on the layout you type with: K and J should not be outlined in orange (dead
  keys). U is a dead key on the US layout; that is what `probe-opt-u` tests.
- **VoiceOver off** (it uses ⌃⌥).
- Start a run and get to the first battle: the game's stats show there when Shift reaches it.
- **Click the game once** before pressing, and leave nothing text-focused. **Wait two seconds between presses**: a
  press is everything that arrives within 1.2 s of the last thing, so quicker presses merge into one heading (the
  Orion smoke check merged three ⌥K presses into one "6 grabs").
- Press each chord **once, slowly**. For ⌥K, ⇧⌘K and ⌃K, also **hold it for a second**, to see repeats.

## Chrome (156)

1. `chrome://extensions` → *Developer mode* on → *Load unpacked* → `~/Downloads/coachemon-keyprobe-chrome`.
2. `chrome://extensions/shortcuts` → *Coachemon key probe*. Four are already bound (⌥K ⌃K ⌘K ⇧⌘K). Bind the rest by
   pressing each chord into its box: `probe-ctrl-shift-k` ⌃⇧K, `probe-opt-shift-k` ⌥⇧K, `probe-cmd-ctrl-k` ⌃⌘K,
   `probe-opt-j` ⌥J, `probe-ctrl-j` ⌃J, `probe-opt-u` ⌥U, `probe-global` ⇧⌘1 **with its scope set to Global**,
   *Activate the extension* ⇧⌘U. Note any chord the page refuses.
3. Pin the probe's toolbar button (the puzzle menu → pin).
4. Open `https://pokerogue.net/` in a new tab. **Expect:** the probe box, top right, listing every command with what
   Chrome bound.
5. Press, in log-only mode: ⌥K, ⌃K, ⌘K, ⇧⌘K, ⌃⇧K, ⌥⇧K, ⌃⌘K, ⌥J, ⌃J, ⌥U, ⇧⌘U, ⌃⌥K, K.
   **Expect** (the routes note §5.1, from source): each command chord gives **1 grab**, a `command:` line and no
   `page keydown` for the letter, and the game hears only the modifiers. ⇧ chords also show the game's stats. ⇧⌘U gives
   an `action` line. ⌃⌥K gives a `page keydown` and then an `accesskey click`: 2 grabs. Bare K: 1 grab, from the page.
6. ⇧⌘1 with the game focused, then again with Chrome in the background (click the Finder first), then come back.
   **Expect:** a `command:probe-global` line both times.
7. Click the toolbar button. **Expect:** an `action` line.
8. *switch to prevent*, then press ⌥K and ⇧⌘K again. **Expect:** no change from step 5.
9. The options page, each way: `chrome://extensions` → the probe → *Details* → *Extension options* (a dialog);
   right-click the toolbar button → *Options*; the box's *openOptionsPage()* and *options in a tab*. **Expect:** the
   page draws. Note dialog or tab, and the *tabs.getCurrent* and *sender.tab* lines (unset in the dialog).
10. Close the options page and open it again: the table's *found when opened* column should show the earlier record.
    Quit Chrome, reopen it, open the options page again, and note what survived.
11. *copy log*, and paste it into #1019.

## Firefox (159)

1. `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* → `~/Downloads/coachemon-keyprobe-firefox/manifest.json`.
   A temporary add-on is gone when Firefox quits, so Firefox has no restart check.
2. `about:addons` → the gear → *Manage Extension Shortcuts*: note what Firefox shows for the probe (⌘K should be
   unassigned, since it is Firefox's web search).
3. Open `https://pokerogue.net/` in a new tab. **Expect:** the probe box. If it does not appear, the puzzle button →
   the probe → allow it on pokerogue.net, then open a new tab.
4. Click **accesskey off** in the box. Press, in log-only mode: ⌥K, ⌃K, ⇧⌘K, ⌃⇧K, ⌥⇧K, ⌃⌘K, ⌃⌥K, ⌥J, ⌃J, ⌥U, ⇧⌘U, K.
   **Expect** (§5.2): the `page keydown` first, then the `command:` line a few ms later: **2 grabs**, and the game
   hears the letter. ⌥U: a `page keydown` with `key="Dead"` and no command. ⇧⌘U: an `action` line and Firefox's
   data-consent prompt (cancel it).
5. *switch to prevent*, and press ⌥K, ⌃K, ⇧⌘K and ⌃⌥K again. **Expect:** `[probe prevented it]`, no `command:`
   line: 1 grab, and *prevented before the game: K*.
6. Click **accesskey on**. Press ⌃⌥K in prevent mode, then *switch to log only* and press it again. **Expect:** no
   `accesskey click` while preventing; with log only, the accesskey and the command may both arrive.
7. After ⇧⌘K and ⌃⌘K, look for the `page keyup` line: Firefox has an open bug that ⌘ swallows the keyup.
8. Click *commands.update probe-opt-j → ⌥L*, press ⌥L (**expect** `command:probe-opt-j`), click *commands.reset*,
   press ⌥J (**expect** the same).
9. The options page: `about:addons` → the probe → *Preferences* (embedded), and the box's two buttons. **Expect:** it
   draws. Close it, open it again, and check *found when opened*.
10. *copy log*, and paste it into #1019.

## Orion (1.1.3)

1. Orion › Tools › Extensions › **+** › *Install from Disk…* → the folder `~/Downloads/coachemon-keyprobe-orion` (it
   holds the Chrome-flavoured build). Allow it on pokerogue.net.
2. Its per-extension shortcuts panel: note what Orion registered. Add the chords Chrome's step 2 binds by hand, if the
   panel lets you, and note which it refuses.
3. Open `https://pokerogue.net/` in a **newly opened tab**, never a reloaded one: Orion gives a reloaded tab no
   content scripts. **Expect:** the probe box. **This is Orion's smoke check**; nothing could automate it. No box: open
   another new tab; still none, say so on #1018.
4. Press the list from Chrome's step 5. **Expect** (§5.3, from Orion's tracker): ⌘ and ⇧⌘ likeliest to fire, ⌃
   reported not to, ⌥ doubtful, and possibly two `command:` lines per press.
5. *switch to prevent*, and press again each chord that fired. A command that now stops means Orion lets the page
   go first (like Firefox); one that still fires with no `page keydown` for the letter means Orion takes it first (like
   Chrome).
6. *commands.update* / *commands.reset* as in Firefox's step 8 (Orion's support sheet claims both).
7. The options page: Tools › Extensions › Manage Extensions → the probe's settings; the box's two buttons; and the
   *options page:* URL from the box, pasted into a new tab. **Expect:** it draws (Orion's tracker has empty options
   pages). Note the *origin* line.
8. **Swap in the Firefox build.** Quit Orion, then in Terminal:

   ```sh
   rsync -a --delete ~/Downloads/coachemon-keyprobe-firefox/ ~/Downloads/coachemon-keyprobe-orion/
   ```

   Reopen Orion, check that the probe is still listed and allowed on pokerogue.net, and repeat steps 2–7 in a new
   tab. The options page's *found when opened* now says whether the dummy key survived the swap, and its *origin* line
   whether the scheme flipped. Swap back with the same command, `-chrome/` for `-firefox/`.
9. Quit and reopen Orion once more and open the options page: note what survived the restart.
10. *copy log* after each build, and paste both into #1019.

## The automated smoke check

`cd extension && node scripts/keyprobe-smoke.ts` loads the placed Chrome build into Chrome for Testing 148 (CDP,
headless) and the Firefox build into Firefox (WebDriver BiDi, headless), each in a throwaway profile. It opens
pokerogue.net, sends one CDP or BiDi key and one synthetic key, prints the probe box, tries `commands.update` and
`reset` on Firefox, and opens the options page twice. It needs the network. Run on 2026-11-08 against the
Chrome-flavoured build `0.1010.1+78ab4405f256` and the Firefox build `0.1010.1+7660ad306d9a` (the box and
`KEYPROBE.txt` show which one is loaded):

| | Chrome for Testing 148 | Firefox 159 |
|---|---|---|
| probe box draws | yes | yes |
| `commands.getAll()` | the 4 suggested keys assigned, the 8 others unassigned | all 11 suggested chords assigned as suggested (⌃⌥K and ⌃⌘K included); `probe-cmd-k`, declared with no key, unassigned |
| a CDP / BiDi key | `page keydown K trusted=yes` | `page keydown K trusted=yes` |
| a synthetic `dispatchEvent` | `trusted=no` | `trusted=no` |
| `commands.update` / `reset` | not present | ok: ⌥J → ⌥L → ⌥J |
| options page (as a tab) | draws; `sender.tab` set; dummy key survives a reopen in `localStorage` and IndexedDB | the same |
| background reads the dummy key | IndexedDB yes; no `localStorage` in the service worker | both |
| content scripts on pokerogue.net | ran | ran with no grant clicked: the MV3 temporary add-on had site access at install |

Also checked on these builds: `addons-linter` passes the Firefox build with 0 errors and 0 warnings. The store guard's
banned keys and words pass for both. Its "dials the store hub" check fails, as it must, since the probe has no hub
link. `manifest.test.ts`'s identity test fails on the probe's name and its third content script.
