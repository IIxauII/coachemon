/**
 * The driver: everything a tool does between the MCP request and the game.
 *
 * Every call settles before it reads (#7 Principle 1). Acting calls press,
 * settle, auto-advance `MESSAGE(0)` and return the lean snapshot. Reading calls
 * settle like an acting call minus the press, which is what makes a timed-out
 * wait resumable (#14). What status a call returns is `CallOutcomes`' to decide
 * (#126): every call opens with a settle, says so before its first press, and
 * ends exactly once, refusals included. The driver only presents it.
 * No call ever judges a press by `processInput`'s return value (Principle 4),
 * and no call ever retries a press on its own (#13, #14).
 */
import { CallOutcomes, type CallEnd, type Outcome } from "./call-outcome.ts";
import { acquireLock } from "./cdp/lock.ts";
import { CdpLink } from "./cdp/link.ts";
import { CdpSession, DEFAULTS } from "./cdp/session.ts";
import { Button, NAMES, UiMode } from "./enums/generated.ts";
import { Refusal } from "./envelope.ts";
import { ladderFor, PINNED_GAME_VERSION } from "./escape-ladder/lookup.ts";
import { LinkGame } from "./game/link-game.ts";
import { HubLink, hubPort, usesHub } from "./hub/link.ts";
import { PLUGIN_VERSION } from "./plugin-version.ts";
import type { CommandName } from "./protocol/commands.ts";
import { MOVED, type Act, type CursorTarget, type GamePort, type MenuOption, type MenuRead, type Ready, type SnapshotDetail } from "./game/port.ts";
import { matchLabel, normalizeLabel, optionAnswersTo } from "./labels.ts";
import { planSelect, step, type Plan, type Walk } from "./menu-family.ts";
import { isSettingsMode, modeName } from "./screen.ts";
import { isOverwriteConfirm, planSlot, slotLabel } from "./slots.ts";
import { CALL_BUDGET_MS, settle, type SettleResult } from "./settle.ts";
import type { Choice } from "./stuck/detector.ts";

/** Auto-advance press cap (#7 §6.8). Set here, as configuration: #13 never fixed a number. Twelve is the stuck window. */
export const AUTO_ADVANCE_CAP = 12;
/** Bound on cursor-walk presses inside one `select_option`. The longest measured walk is a 6-slot party list. */
const NAV_CAP = 24;
/** What a result says when a handler's own message box waits for ACTION (#44). */
const DISMISS_MESSAGE = "press(ACTION) dismisses the message";

export type CallContext = {
  signal?: AbortSignal;
  /** Progress notifications while a settle stalls; the server wires it to the MCP progress token when one is present. */
  progress?: (message: string) => void;
  /**
   * When the call must return, on the driver's clock. Every settle in the call shares it: pre-read, cursor walk, commit
   * and auto-advance together stay inside one `CALL_BUDGET_MS` (#34). The driver sets it on entry.
   */
  deadline?: number;
};

/** One call in flight: its deadline, and what its `end` needs if it throws. */
type Call = CallContext & {
  deadline: number;
  /** The call's latest settle. */
  last: SettleResult | null;
  /**
   * The fine fingerprint of the latest game the call has seen, from its settles and its own cursor moves. Every act is
   * sent on it, and the page refuses one the game has moved off (§10.2).
   */
  fine: string;
  /** What the call will press on, set once every check before the first press has passed. */
  intent: { pre: Ready; choice: Choice; menuAction: boolean } | null;
  /** Whether anything has been sent to the game yet. */
  pressed: boolean;
  ended: boolean;
};

/** A `start_run` setup step ran out of the call budget: a `timed_out` result, never a refusal. */
class SetupTimedOut extends Error {
  readonly settle: SettleResult;
  readonly step: string;
  constructor(settle: SettleResult, step: string) {
    super(`start_run timed out at ${step}`);
    this.settle = settle;
    this.step = step;
  }
}

/** The driver's clock: real by default, fake in tests. */
export type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };

const REAL_CLOCK: Clock = { now: Date.now, sleep: ms => new Promise(r => setTimeout(r, ms)) };

const ARROWS = new Set(["UP", "DOWN", "LEFT", "RIGHT"]);

/** The starter grid with its filter bar active, where the server never acts (§6.5). */
const FILTER_BAR_SCREEN = "STARTER_SELECT/FILTER";

/** What `read_card` shows when the tab has no coach panel on it: a card of nothing, with `card_error` saying why (§11.4). */
const NO_CARD = { kind: null, key: null, wave: null, verdict: null, text: null, summary: null } as const;

const NO_CARD_NEXT = "The coach panel is not running on this tab, so there is no card to read. The panel ships with Coachemon and its own header reopens it; get_state and read_menu read the game without it.";

/**
 * What each tool sends into the tab, so a tool whose commands the installed extension never registered refuses alone
 * and every other one keeps working (§8.5). The cursor commands are not here: a family without its setter is walked
 * with presses instead, which the link's refusal already falls back to.
 */
const TOOL_COMMANDS = {
  get_state: ["probe", "menu", "snapshot"],
  read_menu: ["probe", "menu"],
  read_card: ["probe", "menu", "card"],
  read_starters: ["probe", "menu", "starters"],
  press: ["probe", "press"],
  select_option: ["probe", "menu", "press"],
  start_run: ["probe", "menu", "starters", "press"],
  // `screenshot` is not in the store table at all: an unreachable game still refuses by rung, and a store build then
  // says the picture needs a dev build (§10.6, §12.2).
  screenshot: [],
} as const satisfies Record<string, readonly CommandName[]>;

/** Modes where an acting tool's own press legitimately leads to `LoginPhase` (Save & Quit, Log Out). */
const MENU_MODES = new Set<number>([UiMode.MENU, UiMode.MENU_OPTION_SELECT]);

export class Driver {
  readonly #game: GamePort;
  readonly #outcomes = new CallOutcomes();
  readonly #clock: Clock;

  constructor(game: GamePort, clock: Clock = REAL_CLOCK) {
    this.#game = game;
    this.#clock = clock;
    game.onRejection(t => this.#outcomes.rejection(t));
  }

  /**
   * The transport is CDP unless `COACHEMON_TRANSPORT=hub` opts into the hub, which only the dev sets until the flip
   * deletes both the variable and the CDP link (§12.1). The pidfile lock rides with CDP and goes with it.
   */
  static create(home: string = DEFAULTS.home): Driver {
    if (usesHub()) {
      const hub = new HubLink({ port: hubPort(), version: PLUGIN_VERSION });
      return new Driver(new LinkGame(hub, hub));
    }
    const link = new CdpLink(new CdpSession({ home }), acquireLock(home));
    return new Driver(new LinkGame(link, link));
  }

  // ------------------------------------------------------------------ tools

  /** The only tool that answers when the game is out of reach: it reports the failing rung instead of refusing (§12.3). */
  async status(): Promise<Record<string, unknown>> {
    const presence = await this.#game.presence();
    const head = { status: "ok", reachable: presence.reach === null, reach: presence.reach && { rung: presence.reach.rung, line: presence.reach.line }, ...presence.facts };
    if (presence.reach !== null) {
      return { ...head, game_version: null, pinned_version: PINNED_GAME_VERSION, version_match: null, run_live: false, run: this.#outcomes.runState(null), wave: null, screen: "UNKNOWN(-1)", settled: null, busy_reason: null };
    }
    // The page may still be booting (locator not ready for a few seconds after launch): give it a short grace.
    let read = await this.#game.read();
    for (let i = 0; i < 50 && !read.ready; i++) {
      await new Promise(r => setTimeout(r, 100));
      read = await this.#game.read();
    }
    const ready = read.ready ? read : null;
    return {
      ...head,
      game_version: ready?.gameVersion ?? null,
      pinned_version: PINNED_GAME_VERSION,
      version_match: ready ? ready.gameVersion === PINNED_GAME_VERSION : null,
      run_live: ready?.runLive ?? false,
      run: this.#outcomes.runState(ready),
      wave: ready?.wave ?? null,
      screen: ready ? ready.screen : `UNKNOWN(${read.ready ? "-" : read.why})`,
      settled: ready?.settled ?? null,
      busy_reason: ready && !ready.settled ? ready.reason : null,
    };
  }

  getState(detail: SnapshotDetail, ctx: CallContext): Promise<Record<string, unknown>> {
    return this.#read("get_state", ctx, async ready => {
      const snap = await this.#game.snapshot(detail);
      return {
        menu: await this.#game.menu(),
        fields: {
          ...(snap.ok ? this.#cleanSnapshot(snap.snapshot) : { snapshot_error: snap.why }),
          run: { state: this.#outcomes.runState(ready) },
        },
      };
    });
  }

  /**
   * The card the coach panel is showing (§11.4): read-only, no grant, settled like every other read. It is the same
   * payload the HUD's `card` events carry, so a subscriber that has just joined reads the event it missed (§11.1).
   * The envelope's `wave` is the settled game's and `card_wave` the one the card is about: they differ only while the
   * panel is a refresh behind the game.
   */
  readCard(ctx: CallContext): Promise<Record<string, unknown>> {
    return this.#read("read_card", ctx, async () => {
      const card = await this.#game.card();
      const shown = card.ok ? card : NO_CARD;
      return {
        menu: await this.#game.menu(),
        fields: {
          kind: shown.kind, key: shown.key, card_wave: shown.wave, verdict: shown.verdict, text: shown.text, summary: shown.summary,
          ...(card.ok ? {} : { card_error: card.why }),
        },
        // A failed page read is reported, never explained; `no-hud` is the one the player can act on themselves.
        next: card.ok ? undefined : NO_CARD_NEXT,
      };
    });
  }

  /** Every starter this account has unlocked, and the grid `start_run` picks from when it is open (§11.4). Read-only. */
  readStarters(ctx: CallContext): Promise<Record<string, unknown>> {
    return this.#read("read_starters", ctx, async () => {
      const read = await this.#game.starters();
      const { ok: _ok, ...starters } = read;
      return { menu: await this.#game.menu(), fields: read.ok ? starters : { starters_error: read.why } };
    });
  }

  readMenu(ctx: CallContext): Promise<Record<string, unknown>> {
    return this.#read("read_menu", ctx, async ready => {
      const menu = await this.#game.menu();
      return { menu, fields: this.#menuPayload(ready, menu) };
    });
  }

  /**
   * Every reading tool, which is every tool that presses nothing: reachable, settle, read, and answer in the settled
   * envelope. `body` does the reads in its own order and hands back the menu read it ended on, because the Screen a
   * read-only call reports is that one — newer than the settle's, and never a refusal (#133).
   */
  #read(
    tool: keyof typeof TOOL_COMMANDS,
    ctx: CallContext,
    body: (ready: Ready) => Promise<{ menu: MenuRead; fields: Record<string, unknown>; next?: string }>,
  ): Promise<Record<string, unknown>> {
    return (async () => {
      await this.#reachable(tool);
      return this.#call(ctx, async call => {
        const s = await this.#settleRead(call);
        if (!s.settled) return this.#openingTimedOut(call, s, tool);
        const ready = s.last as Ready;
        const { menu, fields, next } = await body(ready);
        const outcome = this.#end(call, { kind: "read", settle: s, options: optionLabels(menu) });
        return await this.#settledResult(ready, screenOf(ready, menu), outcome, fields, next);
      });
    })();
  }

  async press(buttonName: string, ctx: CallContext): Promise<Record<string, unknown>> {
    await this.#reachable("press");
    return this.#call(ctx, async call => {
      const button = (Button as Record<string, Button | undefined>)[buttonName];
      if (button === undefined) throw new Refusal("unknown_button", `Unknown button ${JSON.stringify(buttonName)}`, { buttons: Object.keys(Button) });
      await this.#claim();
      const pre = await this.#settleRead(call);
      if (!pre.settled) return this.#openingTimedOut(call, pre, "press");
      const ready = pre.last as Ready;
      await this.#guard(ready);
      const choice: Choice = { kind: "button", button: buttonName };
      this.#intend(call, ready, choice, MENU_MODES.has(ready.mode));
      // Only a direction moves a cursor without moving the screen, so only a direction pays for the extra menu read.
      const cursorBefore = ARROWS.has(buttonName) ? await this.#menuCursor() : null;

      let s = await this.#pressAndSettle(button, ready.fine, call);
      let rawFallback = false;
      const unmoved = s.settled && s.fpMoved === false;
      // The press landed on a cursor the fine fingerprint does not carry: a retry would move it twice (#32).
      let landedUnseen = false;
      if (unmoved && cursorBefore !== null) {
        const cursorAfter = await this.#menuCursor();
        landedUnseen = cursorAfter !== null && cursorAfter !== cursorBefore;
      }
      // §6.4: retry once through the raw keyboard, never through processInput again.
      if (unmoved && !landedUnseen) {
        rawFallback = await this.#game.rawKey(button, ready.fine);
        if (rawFallback) s = await this.#settle(ready.fine, call);
      }
      const adv = await this.#autoAdvance(s, call);
      return this.#finishActing(call, ready, choice, adv, {
        pressed: buttonName,
        changed: landedUnseen || (adv.settle.fpMoved ?? null),
        raw_keyboard_fallback: rawFallback,
      });
    });
  }

  async selectOption(label: string | undefined, index: string | number | undefined, expectScreen: string | undefined, ctx: CallContext): Promise<Record<string, unknown>> {
    await this.#reachable("select_option");
    return this.#call(ctx, async call => {
      await this.#claim();
      const pre = await this.#settleRead(call);
      if (!pre.settled) return this.#openingTimedOut(call, pre, "select_option");
      const ready = pre.last as Ready;
      await this.#guard(ready);
      const screen = ready.screen;
      if (expectScreen !== undefined && expectScreen !== screen) {
        throw new Refusal("screen_changed", `Expected ${expectScreen} but the live screen is ${screen}. Nothing was pressed.`, { screen, expected: expectScreen });
      }
      const menu = await this.#game.menu();
      refuseMovedScreen(ready, menu);
      const labels = menu.options.map(o => normalizeLabel(o.label));
      const echo = { screen, options: labels, cursor: menu.cursor };
      if (menu.messagePending) {
        throw new Refusal("message_pending", `${screen} is showing a message that swallows cursor presses until ACTION dismisses it: ${JSON.stringify(menu.text)}. Nothing was pressed.`, { ...echo, text: menu.text, next: DISMISS_MESSAGE });
      }
      if (menu.options.length === 0) {
        throw new Refusal("no_options", `${screen} presents no options to select; use press (ACTION acknowledges a message, CANCEL leaves a viewer).`, echo);
      }
      let target: MenuOption;
      if (index !== undefined) {
        // The option's `i` as read_menu returned it this call — the way past a duplicated label (soak #25: "Revive" as
        // both a free reward and a shop item). Still a value read this call, never a remembered position.
        const hit = menu.options.find(o => String(o.i) === String(index));
        if (!hit) throw new Refusal("no_match", `No option at index ${JSON.stringify(index)} on ${screen}.`, { ...echo, indices: menu.options.map(o => o.i) });
        if (label !== undefined && !optionAnswersTo(hit, label)) {
          throw new Refusal("screen_changed", `Option ${JSON.stringify(index)} is ${JSON.stringify(hit.label)}, not ${JSON.stringify(label)}. Nothing was pressed.`, echo);
        }
        target = hit;
      } else {
        if (label === undefined) throw new Refusal("bad_args", "select_option needs a label or an index.", echo);
        const m = matchLabel(menu.options, label);
        if (m.kind === "none") throw new Refusal("no_match", `No option labelled ${JSON.stringify(label)} on ${screen}.`, echo);
        if (m.kind === "many") {
          throw new Refusal("ambiguous", `${m.options.length} options match ${JSON.stringify(label)} on ${screen}; pass index to pick one.`, { ...echo, matches: m.options.map(o => ({ index: o.i, label: o.label, ...("cost" in o ? { cost: o.cost } : {}), ...("kind" in o ? { kind: o.kind } : {}) })) });
        }
        target = m.option;
      }

      const plan = planSelect(menu, target);
      this.#intend(call, ready, plan.choice, MENU_MODES.has(ready.mode));
      // A walk that ran out of time committed nothing and has nothing to advance: its unsettled result passes through.
      const { settle: s } = await this.#execute(menu, target, plan, ready.fine, call);
      const adv = await this.#autoAdvance(s, call);
      return this.#finishActing(call, ready, plan.choice, adv, { selected: target.label, on: screen, ...plan.extra });
    });
  }

  async startRun(species: string[], slot: number | undefined, overwrite: boolean, ctx: CallContext): Promise<Record<string, unknown>> {
    await this.#reachable("start_run");
    return this.#call(ctx, async call => {
      await this.#claim();
      const pre = await this.#settleRead(call);
      if (!pre.settled) return this.#openingTimedOut(call, pre, "start_run");
      const ready = pre.last as Ready;
      await this.#guard(ready);
      if (ready.mode !== UiMode.TITLE) {
        throw new Refusal("not_on_title", `start_run needs the TITLE screen; the game is on ${ready.screen}.`, { screen: ready.screen });
      }
      if (species.length === 0 || species.length > 6) throw new Refusal("bad_party", "species must name 1–6 starters.");

      if (slot !== undefined && (slot < 0 || slot > 4)) throw new Refusal("bad_slot", "slot must be 0–4.");

      const choice: Choice = { kind: "planned", name: "start_run" };
      this.#intend(call, ready, choice, true);
      const log: string[] = [];
      try {
        return await this.#startRunFromTitle(call, ready, choice, species, slot, overwrite, log);
      } catch (e) {
        if (!(e instanceof SetupTimedOut)) throw e;
        const out = await this.#timedOutResult(e.settle, this.#end(call, { kind: "acting", pre: ready, choice, settle: e.settle, options: null }), "start_run");
        return {
          ...out,
          step: e.step,
          log,
          next: out.next ?? `the run setup stopped at ${e.step}: read_menu shows where. start_run needs TITLE, so finish the setup from there or back out to TITLE before calling start_run again`,
        };
      }
    });
  }

  /** Everything `start_run` presses, from TITLE to the first decision of the run. A step that runs out of time throws `SetupTimedOut`. */
  async #startRunFromTitle(call: Call, ready: Ready, choice: Choice, species: string[], slot: number | undefined, overwrite: boolean, log: string[]): Promise<Record<string, unknown>> {
    let presses = 0;
    const expect = async (s: SettleResult, screen: string, step: string): Promise<Ready> => {
      if (!s.settled) throw new SetupTimedOut(s, step);
      const r = s.last as Ready;
      if (r.screen === FILTER_BAR_SCREEN) {
        throw new Refusal("filter_bar", `start_run arrived on the starter filter bar after ${step}; the server never drives it. Leave it by hand.`, { step, screen: r.screen, log });
      }
      if (r.screen !== screen) {
        throw new Refusal("start_run_unexpected_screen", `start_run expected ${screen} after ${step} but saw ${r.screen}`, { step, screen: r.screen, log });
      }
      return r;
    };
    /** Reach and commit `target` on `m`, as `select_option` would. A walk that runs out of time stops the setup at `step`. */
    const select = async (m: MenuRead, target: MenuOption, preFp: string, step: string, landed?: (species: string | undefined) => void): Promise<SettleResult> => {
      const r = await this.#execute(m, target, planSelect(m, target), preFp, call, landed);
      if (!r.committed) throw new SetupTimedOut(r.settle, step);
      return r.settle;
    };
    /**
     * A party refused on the grid, before any starter is added: CANCEL on the empty grid asks to return to the title and
     * Yes goes there (#41), so the corrected start_run needs no manual steps. If that fails, say how to finish by hand.
     */
    const refuseFromGrid = async (code: string, message: string, detail: Record<string, unknown>): Promise<never> => {
      try {
        const confirm = await expect(await this.#pressAndSettle(Button.CANCEL, cur.fine, call), "CONFIRM", "back out");
        const m = await this.#game.menu();
        const yes = matchLabel(m.options, "Yes");
        if (yes.kind !== "one") throw new Refusal("start_run_unexpected_screen", `no single Yes on the return-to-title confirm: ${m.options.map(o => o.label).join(" | ")}`);
        log.push(`back out: ${m.options.map(o => o.label).join(" | ")} → Yes`);
        let back = await select(m, yes.option, confirm.fine, "back out");
        // Yes sets STARTER_SELECT again before the title phase shows TITLE (StarterSelectUiHandler.tryExit): wait past it.
        if (back.settled && (back.last as Ready).mode === UiMode.STARTER_SELECT) back = await this.#settle((back.last as Ready).fine, call);
        await expect(back, "TITLE", "back out");
      } catch (e) {
        const live = await this.#game.read();
        const screen = live.ready ? live.screen : "UNKNOWN(-1)";
        // By Screen, not mode: on the filter bar a press(CANCEL) is refused, so only read_menu is a way on.
        const next =
          screen === "CONFIRM" ? 'select_option("Yes") on this CONFIRM to return to TITLE, then start_run again'
          : screen === "STARTER_SELECT" ? 'press(CANCEL), then select_option("Yes") on the CONFIRM to return to TITLE, then start_run again'
          : "read_menu to see where the game is; start_run needs TITLE";
        throw new Refusal(code, `${message} Backing out to TITLE failed (${(e as Error).message}).`, {
          ...detail, screen, log, back_out_error: e instanceof Refusal ? e.code : e instanceof SetupTimedOut ? "timed_out" : "error", next,
        });
      }
      throw new Refusal(code, `${message} Backed out to TITLE; call start_run again with a corrected party.`, { ...detail, screen: "TITLE", log });
    };

    // 1. TITLE → game-mode select. New Game is the first option unless Continue is offered (source order: [Continue,] New Game, Load Game, Daily Run, Settings).
    let menu = await this.#game.menu();
    refuseMovedScreen(ready, menu);
    const newGameIndex = menu.options.length >= 5 ? 1 : 0;
    log.push(`title: ${menu.options.map(o => o.label).join(" | ")} → index ${newGameIndex}`);
    let s = await select(menu, menu.options[newGameIndex], ready.fine, "title");
    presses++;
    let cur = await expect(s, "OPTION_SELECT", "title");
    // 2. Game mode: Classic is index 0.
    menu = await this.#game.menu();
    log.push(`game mode: ${menu.options.map(o => o.label).join(" | ")} → index 0`);
    s = await select(menu, menu.options[0], cur.fine, "game mode");
    presses++;
    cur = await expect(s, "STARTER_SELECT", "game mode");

    // 3. Starters, by name, resolved against the live filtered grid.
    const info = await this.#game.starters();
    if (!info.ok) throw new Refusal("starter_unreadable", info.why);
    const picks: typeof info.grid = [];
    for (const name of species) {
      const hit = info.grid.filter(g => g.name !== null && normalizeLabel(g.name) === normalizeLabel(name));
      if (hit.length !== 1) {
        await refuseFromGrid("unknown_species", `${JSON.stringify(name)} is not on the starter grid (${hit.length} matches).`, { available: info.grid.map(g => g.name) });
      }
      picks.push(hit[0]);
    }
    const cost = picks.reduce((t, p) => t + (p.cost ?? 0), 0);
    if (info.valueLimit !== null && cost > info.valueLimit) {
      await refuseFromGrid("party_over_budget", `Party costs ${cost} against a limit of ${info.valueLimit}.`, { picks: picks.map(p => ({ name: p.name, cost: p.cost })), limit: info.valueLimit });
    }
    for (const pick of picks) {
      menu = await this.#game.menu();
      refuseMovedScreen(cur, menu);
      // The species under the cursor is checked before ACTION opens its menu.
      const onPick = (species: string | undefined) => {
        if (species && normalizeLabel(species) !== normalizeLabel(pick.name ?? "")) {
          throw new Refusal("starter_cursor", `grid cursor landed on ${species}, not ${pick.name}`, { log });
        }
      };
      try {
        s = await select(menu, { i: pick.i, label: pick.name }, cur.fine, `select ${pick.name}`, onPick);
      } catch (e) {
        if (!(e instanceof Refusal && e.code === "cursor_unreachable")) throw e;
        throw new Refusal("starter_cursor", `could not position the grid cursor on ${pick.name}: ${(e.detail.got as { why: string }).why}`, { log });
      }
      presses++;
      cur = await expect(s, "OPTION_SELECT", `select ${pick.name}`);
      menu = await this.#game.menu();
      log.push(`${pick.name}: ${menu.options.map(o => o.label).join(" | ")} → index 0`);
      s = await select(menu, menu.options[0], cur.fine, `add ${pick.name}`);
      presses++;
      cur = await expect(s, "STARTER_SELECT", `add ${pick.name}`);
    }
    const after = await this.#game.starters();
    if (!after.ok) throw new Refusal("starter_unreadable", "could not re-read the starter screen", { log });
    if (after.party.length !== picks.length) {
      throw new Refusal("party_mismatch", `Expected ${picks.length} starters in the party, the screen shows ${after.party.length}: ${after.party.join(", ")}`, { log });
    }
    log.push(`party: ${after.party.join(", ")} valid=${after.partyValid}`);

    // 4. SUBMIT → CONFIRM [Yes, No] → SAVE_SLOT.
    s = await this.#pressAndSettle(Button.SUBMIT, cur.fine, call);
    presses++;
    cur = await expect(s, "CONFIRM", "submit");
    menu = await this.#game.menu();
    log.push(`confirm: ${menu.options.map(o => o.label).join(" | ")} → index 0`);
    s = await select(menu, menu.options[0], cur.fine, "confirm");
    presses++;
    cur = await expect(s, "SAVE_SLOT/SAVE", "confirm");

    // 5. Slot: only the screen knows. A logged-in account's slots live server-side, so localStorage cannot pre-check
    // them (measured: every key absent while slot 0 held a run). Refusing here leaves the setup on SAVE_SLOT/SAVE,
    // where select_option("Slot N") continues it and CANCEL abandons it without touching any save.
    menu = await this.#game.menu();
    const { free, occupied, chosen: slotOpt } = planSlot(menu.options, slot);
    const leftOn = { screen: "SAVE_SLOT/SAVE", free, occupied, slots: menu.options, log, next: 'select_option("Slot N") to continue, or press(CANCEL) to abandon this setup (no save is touched)' };
    if (!slotOpt) {
      if (slot !== undefined) throw new Refusal("bad_slot", `slot ${slot} ("Slot ${slot + 1}") is not on the save-slot screen`, leftOn);
      throw new Refusal("no_free_slot", "Every save slot has data. Pass slot and overwrite: true to replace one; the run setup is waiting on the save-slot screen.", leftOn);
    }
    const chosen = Number(slotOpt.i);
    const chosenLabel = slotLabel(slotOpt);
    if (slotOpt.hasData === true && !overwrite) {
      throw new Refusal("slot_occupied", `${chosenLabel} has a saved run. Free: ${free.join(", ") || "none"}. The run setup is waiting on the save-slot screen.`, leftOn);
    }
    s = await select(menu, slotOpt, cur.fine, "save slot");
    presses++;
    // Only an occupied slot asks to overwrite; ACTION on a free one starts the run at once, and the first CONFIRM after
    // that is CheckSwitchPhase's "Will you switch Pokémon?" (#30). Here overwrite is true: occupied without it refused above.
    if (slotOpt.hasData === true) {
      if (!s.settled) throw new SetupTimedOut(s, "save slot");
      const r = s.last as Ready;
      if (!isOverwriteConfirm(r)) {
        throw new Refusal("start_run_unexpected_screen", `start_run expected the overwrite confirm after choosing ${chosenLabel} but saw ${r.screen} (phase ${r.phaseName}). Nothing was answered.`, { step: "save slot", screen: r.screen, log });
      }
      // Yes deletes the session in that slot, then starts the run.
      menu = await this.#game.menu();
      log.push(`overwrite confirm: ${menu.options.map(o => o.label).join(" | ")} → index 0`);
      s = await select(menu, menu.options[0], r.fine, "overwrite confirm");
      presses++;
    }

    this.#outcomes.newRun();
    const adv = await this.#autoAdvance(s, call);
    return this.#finishActing(call, ready, choice, adv, {
      started: true,
      slot: chosen,
      party: after.party,
      presses: presses + adv.presses,
      log,
    });
  }

  async screenshot(): Promise<string> {
    await this.#reachable("screenshot");
    return this.#game.screenshot();
  }

  // ------------------------------------------------------------------ calls

  /** One tool call: one deadline for everything it waits on (#34), and exactly one `end`, a thrown call included. */
  async #call(ctx: CallContext, body: (call: Call) => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const call: Call = { ...ctx, deadline: ctx.deadline ?? this.#clock.now() + CALL_BUDGET_MS, last: null, fine: "", intent: null, pressed: false, ended: false };
    try {
      return await body(call);
    } catch (e) {
      if (!call.ended) {
        const sent = call.pressed ? call.intent : null;
        this.#end(call, { kind: "refused", pre: sent?.pre ?? null, choice: sent?.choice ?? null, settle: call.last });
      }
      throw e;
    }
  }

  #end(call: Call, end: CallEnd): Outcome {
    call.ended = true;
    return this.#outcomes.end(end);
  }

  /** What the call is about to press on. Nothing is sent yet: `#sending` tells `CallOutcomes` when something is. */
  #intend(call: Call, pre: Ready, choice: Choice, menuAction: boolean): void {
    call.intent = { pre, choice, menuAction };
  }

  /** Right before anything reaches the game (a press, a setCursor, a modal button): `pressing`, once per call. */
  #sending(call: Call): void {
    if (call.pressed || call.intent === null) return;
    call.pressed = true;
    this.#outcomes.pressing({ menuAction: call.intent.menuAction, on: call.intent.pre });
  }

  // ---------------------------------------------------------------- settle

  async #settle(preFp: string | null, call: Call): Promise<SettleResult> {
    const s = await settle(
      {
        poll: () => this.#game.read(),
        onPoll: (read, t) => this.#outcomes.poll(read, t),
        onStall: (stallMs, reason) => call.progress?.(`waiting for the game to settle: ${reason} for ${Math.round(stallMs / 1000)} s`),
        signal: call.signal,
        now: this.#clock.now,
        sleep: this.#clock.sleep,
        budgetMs: Math.max(0, call.deadline - this.#clock.now()),
      },
      preFp,
    );
    call.last = s;
    if (s.settled && s.last?.ready) call.fine = s.last.fine;
    return s;
  }

  /** The call's opening settle. A call that presses nothing settles like an acting call minus the press; if the last call timed out, this is a resume. */
  async #settleRead(call: Call): Promise<SettleResult> {
    const s = await this.#settle(null, call);
    this.#outcomes.waited(s);
    return s;
  }

  async #pressAndSettle(button: Button, preFp: string, call: Call): Promise<SettleResult> {
    if (!(await this.#tryPress(button, call))) return this.#refuseMoved(call, preFp, `press(${NAMES.Button[button] ?? button})`);
    return this.#settle(preFp, call);
  }

  /** One press on the call's fingerprint. `false`: the game had moved off it, and nothing was pressed (§10.2). */
  async #tryPress(button: Button, call: Call): Promise<boolean> {
    const r = await this.#act(call, fine => this.#game.press(button, fine));
    if (r.ok) return true;
    if (r.why === MOVED) return false;
    if (r.threw) throw new Refusal("press_threw", `processInput threw: ${r.why}`);
    throw new Refusal("scene_unavailable", `the scene was unavailable when pressing: ${r.why}`);
  }

  /** Send one act on the call's fingerprint, and keep the fingerprint it answers with: where a cursor move left the game. */
  async #act<T extends Act>(call: Call, send: (fine: string) => Promise<T>): Promise<T> {
    this.#sending(call);
    const r = await send(call.fine);
    if (typeof r.fine === "string") call.fine = r.fine;
    return r;
  }

  /**
   * A cursor move on the call's fingerprint. A game that moved first is refused like any act; any other outcome is the
   * caller's to judge.
   */
  async #setCursor(call: Call, target: CursorTarget): Promise<Act & { species?: string }> {
    const preFp = call.fine;
    const r = await this.#act(call, fine => this.#game.setCursor(target, fine));
    if (!r.ok && r.why === MOVED) return this.#refuseMoved(call, preFp, `moving the ${target.family} cursor`);
    return r;
  }

  /** The game moved between the read an act was decided on and the act (§10.2): settle on where it went, then refuse. */
  async #refuseMoved(call: Call, preFp: string, what: string): Promise<never> {
    const s = await this.#settle(preFp, call);
    const screen = s.last?.ready ? s.last.screen : "UNKNOWN(-1)";
    throw new Refusal("game_moved", `The game changed after the read ${what} was decided on, so ${what} was not sent. It is now on ${screen}: read_menu, then decide again.`, { screen });
  }

  // --------------------------------------------------------------- guards

  /**
   * Every tool's first move: can a command reach the game at all, and does the connected extension have what this tool
   * needs (§12.2)? The refusal is the ladder's line, with its rung, so the agent reads the same words `status` gives.
   *
   * It sits outside the call, before the deadline is set: nothing has been asked of the game, so there is no call for
   * `CallOutcomes` to end. The grant is taken inside the call, where a refusal does end one.
   */
  async #reachable(tool: keyof typeof TOOL_COMMANDS): Promise<void> {
    const { reach } = await this.#game.presence(TOOL_COMMANDS[tool]);
    if (reach === null) return;
    throw new Refusal(reach.code, reach.line, { rung: reach.rung, ...(reach.tabs ? { tabs: reach.tabs } : {}) });
  }

  /** An acting call takes the right to act before it reads anything, so nothing is settled on a game we may not touch (§7.5). */
  async #claim(): Promise<void> {
    const c = await this.#game.claim();
    if (!c.ok) throw new Refusal(c.code, c.message, c.detail ?? {});
  }

  async #guard(ready: Ready): Promise<void> {
    const screen = ready.screen;
    if (isSettingsMode(ready.mode)) throw new Refusal("settings_mode", `The game is on ${screen}; six settings carry requireReload and the reload fires on leaving, killing a live run. Leave Settings by hand.`, { screen });
    if (screen === FILTER_BAR_SCREEN) throw new Refusal("filter_bar", "The starter filter bar is active; setCursor would write filterBarCursor and CANCEL resets persisted filters. Leave it by hand.", { screen });
    // A transport whose settles pump has no frozen loop to refuse: the driver's own polls keep it turning (§10.3).
    if (this.#game.pumps) return;
    // #23: re-apply focus emulation, then refuse if the loop is still frozen. Never bringToFront.
    await this.#game.keepAlive();
    const a = await this.#game.frame();
    await this.#clock.sleep(150);
    const b = await this.#game.frame();
    if (a !== null && a === b) {
      throw new Refusal("loop_frozen", "The game loop is not advancing (hidden page and focus emulation did not take). A press now would freeze mid-fade. Nothing was pressed.", { screen, frame: a });
    }
  }

  // ------------------------------------------------------------- movement

  /** The menu reader's cursor, or `null` when the read failed or the screen has none: never mistaken for a move. */
  async #menuCursor(): Promise<number | string | null> {
    const m = await this.#game.menu();
    return m.readable && (typeof m.cursor === "number" || typeof m.cursor === "string") ? m.cursor : null;
  }

  /**
   * Carry out a plan on `menu`: reach `target` the way its family does, then commit. The committed settle, or the
   * unsettled result with `committed: false` when a walk ran out of the call's deadline first. `landed` sees the species
   * under a cursor `setCursor` put there, before the commit.
   */
  async #execute(menu: MenuRead, target: MenuOption, plan: Plan, preFp: string, call: Call, landed?: (species: string | undefined) => void): Promise<{ settle: SettleResult; committed: boolean }> {
    const { reach, commit } = plan;
    let walked: SettleResult | null = null;
    if (reach.kind === "set") {
      const r = await this.#setCursor(call, reach.to);
      if (r.ok) landed?.(r.species);
      else if (reach.miss === "refuse") throw new Refusal("cursor_unreachable", `could not position the ${reach.cursor} on ${target.label}`, { got: r });
      else walked = await this.#walk(menu, reach.walk, call);
    } else if (reach.kind === "walk") {
      walked = await this.#walk(menu, reach, call);
    }
    if (walked) return { settle: walked, committed: false };
    if (commit.kind === "action") return { settle: await this.#pressAndSettle(Button.ACTION, preFp, call), committed: true };
    const r = await this.#act(call, fine => this.#game.modalButton(commit.index, fine));
    if (!r.ok && r.why === MOVED) return this.#refuseMoved(call, preFp, `the ${JSON.stringify(target.label)} button`);
    if (!r.ok) throw new Refusal("modal_button", `button action ${commit.index} unavailable: ${r.why}`);
    return { settle: await this.#settle(preFp, call), committed: true };
  }

  /**
   * Press the rule's step until the cursor reads `to`, each press settled against the call's deadline. `null` once it
   * is there; the unsettled result if the deadline ran out first. A settled press that leaves the cursor where it was
   * refuses at once: the same press again does the same (#34). So does a step that reads another Screen than `from`,
   * the menu the walk was planned on: nothing is committed there. A press the game moved ahead of (§10.2) was never
   * sent: the walk settles and steps again from wherever the cursor now is.
   */
  async #walk(from: MenuRead, { to, rule }: Walk, call: Call): Promise<SettleResult | null> {
    let prev: number | null = null;
    let sent = 0;
    for (let n = 0; n < NAV_CAP; n++) {
      const menu = await this.#game.menu();
      if (menu.readable && menu.screen !== from.screen) {
        throw new Refusal("screen_changed", `The screen changed from ${from.screen} to ${menu.screen} while walking the cursor toward ${to}. ${sent} cursor press(es) were sent, nothing was committed.`, { screen: menu.screen, was: from.screen, target: to, presses: sent });
      }
      const cur = Number(menu.cursor);
      if (cur === to) return null;
      if (cur === prev) {
        throw new Refusal("cursor_stuck", `The cursor stayed on ${cur} after a ${rule} step toward ${to}; ${to} can't be reached by moving the cursor here. ${sent} cursor press(es) were sent, nothing was committed.`, { cursor: cur, target: to, rule, presses: sent });
      }
      const pre = call.fine;
      const pressed = await this.#tryPress(step(rule, cur, to), call);
      prev = pressed ? cur : null;
      if (pressed) sent++;
      const s = await this.#settle(pre, call);
      if (!s.settled) return s;
    }
    throw new Refusal("cursor_unreachable", `cursor did not reach ${to} within ${NAV_CAP} presses`, { target: to, presses: sent });
  }

  // --------------------------------------------------------- auto-advance

  async #autoAdvance(first: SettleResult, call: Call): Promise<{ settle: SettleResult; messages: string[]; presses: number; capped: boolean }> {
    const messages: string[] = [];
    let s = first;
    let presses = 0;
    while (s.settled) {
      const r = s.last as Ready;
      // Only MESSAGE(0) with a live prompt; CONFIRM is never advanced — ACTION is consent (#8).
      if (r.mode !== UiMode.MESSAGE || !(r.awaitingActionInput && r.onActionInput)) break;
      if (presses >= AUTO_ADVANCE_CAP) return { settle: s, messages, presses, capped: true };
      // A message that went away before its ACTION arrived was never answered (§10.2): settle, and look again.
      if (!(await this.#tryPress(Button.ACTION, call))) {
        s = await this.#settle(r.fine, call);
        continue;
      }
      if (r.messageText) messages.push(r.messageText);
      s = await this.#settle(r.fine, call);
      presses++;
    }
    return { settle: s, messages, presses, capped: false };
  }

  // ------------------------------------------------------------ results

  async #finishActing(
    call: Call,
    pre: Ready,
    choice: Choice,
    adv: { settle: SettleResult; messages: string[]; presses: number; capped: boolean },
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const s = adv.settle;
    if (!s.settled) {
      const outcome = this.#end(call, { kind: "acting", pre, choice, settle: s, options: null });
      return { ...(await this.#timedOutResult(s, outcome, "act")), messages: adv.messages, ...payload };
    }
    const afterRead = s.last as Ready;
    const menu = await this.#game.menu();
    const snap = await this.#game.snapshot("lean");
    const outcome = this.#end(call, { kind: "acting", pre, choice, settle: s, options: optionLabels(menu) });
    return await this.#settledResult(
      afterRead,
      afterRead.screen,
      outcome,
      {
        ...payload,
        messages: adv.messages,
        ...(snap.ok ? this.#cleanSnapshot(snap.snapshot) : { snapshot_error: snap.why }),
        menu: this.#menuSummary(afterRead, menu),
      },
      // The cap stopped a long chain with a live MESSAGE still up: progress, not stuck (#7 §6.8, #45). A MESSAGE
      // that really repeats trips the detector across calls.
      adv.capped ? `press("ACTION"): auto-advance stopped after ${AUTO_ADVANCE_CAP} messages with more to read` : undefined,
    );
  }

  async #settledResult(
    ready: Ready,
    /** The Screen the result reports: a read-only call's is its menu read's, newer than the settle's. */
    screen: string,
    outcome: Outcome,
    payload: Record<string, unknown>,
    /** The call's suggested next step, returned only when the status is `ok`. */
    next?: string,
  ): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { status: outcome.status, wave: ready.wave, screen, ...payload };
    if (next !== undefined && outcome.status === "ok") out.next = next;
    if (outcome.diagnostic) {
      out.diagnostic = outcome.diagnostic;
      out.console_tail = await this.#game.tail();
    }
    if (outcome.escape) out.escape = outcome.escape;
    return out;
  }

  /** The opening settle ran out of time: nothing was pressed, so the call ends as a read. */
  #openingTimedOut(call: Call, s: SettleResult, tool: string): Promise<Record<string, unknown>> {
    return this.#timedOutResult(s, this.#end(call, { kind: "read", settle: s, options: null }), tool);
  }

  async #timedOutResult(s: SettleResult, outcome: Outcome, what: string): Promise<Record<string, unknown>> {
    const last = s.last && s.last.ready ? s.last : null;
    const alert = last?.mode === UiMode.ALERT_MODAL ? last.messageText : null;
    // The budget ran out with the game idle on a message that takes ACTION (#55): waiting on it would never end.
    // Not a doubled press: processInput clears onActionInput synchronously, so a live one is a fresh prompt.
    const pending = alert === null && last !== null && last.settled && last.mode === UiMode.MESSAGE && last.awaitingActionInput && last.onActionInput;
    return {
      status: outcome.status,
      wave: last?.wave ?? null,
      screen: last ? last.screen : "UNKNOWN(-1)",
      diagnostic: outcome.diagnostic,
      ...(alert !== null ? { alert_text: alert } : {}),
      ...(pending ? { message_pending: true, text: last.messageText, next: DISMISS_MESSAGE } : {}),
      console_tail: await this.#game.tail(),
      note:
        alert !== null
          ? `${what}: the game is showing an alert that no input can close yet. If it stays, only a page reload leaves it (destructive: progress since the last save).`
          : pending
            ? `${what} ran out of call budget, but the game is waiting on a message: press(ACTION) moves it on. Waiting with get_state will not.`
            : `${what} did not settle within the call budget. Not fatal: call get_state or read_menu to keep waiting; nothing is pressed by that.`,
    };
  }

  #cleanSnapshot(snap: Record<string, unknown>): Record<string, unknown> {
    const { ready: _ready, mode: _mode, biome, party, enemy, ...rest } = snap;
    const clean = JSON.parse(JSON.stringify({ ...rest, party, enemy })) as Record<string, unknown>;
    return {
      ...clean,
      biome: typeof biome === "number" ? { int: biome, name: NAMES.BiomeId[biome] ?? null } : null,
      // The page reads the game's enums as the integers they are; naming them is the server's job, and the coach's
      // fields are named on both sides of the field, as `probe.js` named them for the coach skill (§11.4).
      party: named(party),
      enemy: named(enemy),
    };
  }

  #menuSummary(ready: Ready, menu: MenuRead): Record<string, unknown> {
    return {
      screen: ready.screen,
      family: menu.family,
      options: menu.options.map(o => o.label),
      cursor: menu.cursor,
      text: menu.text,
      ...this.#pendingMessage(menu),
      tutorial_active: ready.tutorialActive,
    };
  }

  /** A handler's own message box is up and swallows presses (#44): flag it and name the way out. */
  #pendingMessage(menu: MenuRead): Record<string, unknown> {
    return menu.messagePending ? { message_pending: true, next: DISMISS_MESSAGE } : {};
  }

  #menuPayload(ready: Ready, menu: MenuRead): Record<string, unknown> {
    const ladder = ladderFor({ screen: screenOf(ready, menu), liveVersion: ready.gameVersion ?? "", tutorialActive: ready.tutorialActive });
    return {
      mode: { int: ready.mode, name: modeName(ready.mode) },
      handler: menu.handler ?? ready.handler,
      family: menu.family,
      readable: menu.readable,
      options: menu.options,
      cursor: menu.cursor,
      text: menu.text,
      ...this.#pendingMessage(menu),
      // While a handler's own message waits, CANCEL dismisses it exactly as ACTION does (PartyUiHandler.processInput).
      cancel_effect: menu.messagePending ? "consents" : ladder.status === "ladder" ? ladder.cancelEffect : "unknown",
      screen_class: ladder.status === "ladder" ? ladder.class : null,
      ladder_note: ladder.status === "ladder" ? undefined : ladder.message,
      tutorial_active: ready.tutorialActive,
      phase: ready.phaseName,
      // The reader's `extra` as read_menu has always shown it, the pending message included.
      extra: menu.messagePending ? { ...menu.extra, messagePending: true } : menu.extra,
    };
  }
}

/**
 * A side of the field with its enums named: the status, the types and each move's type and category, as `probe.js`
 * named them (§11.4). A number with no name in the pinned tables stays the number, and a field the detail did not ask
 * for stays away.
 */
function named(side: unknown): unknown {
  if (!Array.isArray(side)) return side;
  const name = (table: Record<number, string>, v: unknown) => (typeof v === "number" ? table[v] ?? v : v);
  return side.map(p => {
    if (!p || typeof p !== "object") return p;
    const mon = p as Record<string, unknown>;
    return {
      ...mon,
      ...("status" in mon ? { status: name(NAMES.StatusEffect, mon.status) } : {}),
      ...(Array.isArray(mon.types) ? { types: mon.types.map(t => name(NAMES.PokemonType, t)) } : {}),
      ...(Array.isArray(mon.moves)
        ? {
            moves: mon.moves.map(m => (m && typeof m === "object"
              ? { ...m, type: name(NAMES.PokemonType, (m as Record<string, unknown>).type), category: name(NAMES.MoveCategory, (m as Record<string, unknown>).category) }
              : m)),
          }
        : {}),
    };
  });
}

/**
 * The Screen a menu read reports, newer than the settle's. A read that failed (a throw, no handler, an unmapped family)
 * identified no menu, so it says nothing newer: the settled Screen stands (#133).
 */
function screenOf(ready: Ready, menu: MenuRead): string {
  return menu.readable ? menu.screen : ready.screen;
}

/** The menu read is a second read after the settle: an acting call refuses before its first press if the Screen moved between them (#133). */
function refuseMovedScreen(ready: Ready, menu: MenuRead): void {
  if (screenOf(ready, menu) === ready.screen) return;
  throw new Refusal("screen_changed", `The screen changed from ${ready.screen} to ${menu.screen} between the settled read and the menu read. Nothing was pressed.`, { screen: menu.screen, was: ready.screen });
}

/** The option labels the stuck detector judges untried against, or `null` when the menu gave none. */
function optionLabels(menu: MenuRead): string[] | null {
  return menu.readable && menu.options.length > 0 ? menu.options.map(o => normalizeLabel(o.label)) : null;
}
