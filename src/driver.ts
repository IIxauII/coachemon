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
import { acquireLock, lockContended, type Lock } from "./cdp/lock.ts";
import { CdpLink } from "./cdp/link.ts";
import { CdpSession, DEFAULTS } from "./cdp/session.ts";
import { Button, NAMES, UiMode } from "./enums/generated.ts";
import { Refusal } from "./envelope.ts";
import { ladderFor, PINNED_GAME_VERSION } from "./escape-ladder/lookup.ts";
import { LinkGame } from "./game/link-game.ts";
import { MOVED, type Act, type CursorTarget, type GamePort, type MenuOption, type MenuRead, type Ready, type SnapshotDetail } from "./game/port.ts";
import { matchLabel, normalizeLabel, optionAnswersTo } from "./labels.ts";
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

/** Modes where an acting tool's own press legitimately leads to `LoginPhase` (Save & Quit, Log Out). */
const MENU_MODES = new Set<number>([UiMode.MENU, UiMode.MENU_OPTION_SELECT]);

export class Driver {
  readonly lock: Lock;
  readonly #game: GamePort;
  readonly #outcomes = new CallOutcomes();
  readonly #clock: Clock;

  constructor(game: GamePort, lock: Lock, clock: Clock = REAL_CLOCK) {
    this.#game = game;
    this.lock = lock;
    this.#clock = clock;
    game.onRejection(t => this.#outcomes.rejection(t));
  }

  static create(home: string = DEFAULTS.home): Driver {
    const link = new CdpLink(new CdpSession({ home }));
    return new Driver(new LinkGame(link, link), acquireLock(home));
  }

  // ------------------------------------------------------------------ tools

  async status(): Promise<Record<string, unknown>> {
    let attached = false;
    let launchedChrome = false;
    let error: string | null = null;
    try {
      ({ attached, launchedChrome } = await this.#game.attach());
    } catch (e) {
      error = (e as Error).message;
    }
    const contended = lockContended(this.lock);
    if (!attached) {
      return { status: "ok", attached, error, wave: null, screen: "UNKNOWN(-1)", run_live: false, game_version: null, tab_contended: contended.contended, lock_holder: contended.holder };
    }
    // The page may still be booting (locator not ready for a few seconds after launch): give it a short grace.
    let read = await this.#game.read();
    for (let i = 0; i < 50 && !read.ready; i++) {
      await new Promise(r => setTimeout(r, 100));
      read = await this.#game.read();
    }
    const ready = read.ready ? read : null;
    return {
      status: "ok",
      attached,
      game_version: ready?.gameVersion ?? null,
      pinned_version: PINNED_GAME_VERSION,
      version_match: ready ? ready.gameVersion === PINNED_GAME_VERSION : null,
      run_live: ready?.runLive ?? false,
      run: this.#outcomes.runState(ready),
      wave: ready?.wave ?? null,
      screen: ready ? ready.screen : `UNKNOWN(${read.ready ? "-" : read.why})`,
      settled: ready?.settled ?? null,
      busy_reason: ready && !ready.settled ? ready.reason : null,
      tab_contended: contended.contended,
      lock_holder: contended.holder,
      chrome_launched_by_server: launchedChrome,
    };
  }

  async getState(detail: SnapshotDetail, ctx: CallContext): Promise<Record<string, unknown>> {
    return this.#call(ctx, async call => {
      const s = await this.#settleRead(call);
      if (!s.settled) return this.#openingTimedOut(call, s, "get_state");
      const ready = s.last as Ready;
      const snap = await this.#game.snapshot(detail);
      const menu = await this.#game.menu();
      const outcome = this.#end(call, { kind: "read", settle: s, options: optionLabels(menu) });
      // A read-only call never refuses on a Screen that moved since the settle: it reports the newer one.
      return this.#settledResult(ready, screenOf(ready, menu), outcome, {
        ...(snap.ok ? this.#cleanSnapshot(snap.snapshot) : { snapshot_error: snap.why }),
        run: { state: this.#outcomes.runState(ready) },
      });
    });
  }

  async readMenu(ctx: CallContext): Promise<Record<string, unknown>> {
    return this.#call(ctx, async call => {
      const s = await this.#settleRead(call);
      if (!s.settled) return this.#openingTimedOut(call, s, "read_menu");
      const ready = s.last as Ready;
      const menu = await this.#game.menu();
      const outcome = this.#end(call, { kind: "read", settle: s, options: optionLabels(menu) });
      return this.#settledResult(ready, screenOf(ready, menu), outcome, this.#menuPayload(ready, menu));
    });
  }

  async press(buttonName: string, ctx: CallContext): Promise<Record<string, unknown>> {
    return this.#call(ctx, async call => {
      const button = (Button as Record<string, Button | undefined>)[buttonName];
      if (button === undefined) throw new Refusal("unknown_button", `Unknown button ${JSON.stringify(buttonName)}`, { buttons: Object.keys(Button) });
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
        rawFallback = await this.#game.rawKey(button);
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
    return this.#call(ctx, async call => {
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
      if (menu.extra.messagePending === true) {
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

      // Command.BALL is the second command; BALL rows carry a ballType, Cancel does not. Refused by position, not by the
      // localised label (#56).
      const throwsBall = (menu.family === "command" && Number(target.i) === 1) || (menu.family === "ball" && "ballType" in target);
      if (throwsBall && menu.extra.catchable === false) {
        throw new Refusal("cannot_catch_trainer", `This is a trainer battle: its Pokémon cannot be caught, so ${JSON.stringify(target.label)} is refused. Nothing was pressed.`, echo);
      }

      const choice: Choice = menu.family === "modal" ? { kind: "modal_button", index: Number(target.i) } : { kind: "option", label: normalizeLabel(target.label) };
      this.#intend(call, ready, choice, MENU_MODES.has(ready.mode));

      const spread = menu.family === "target_select" && menu.extra.isMultipleTargets === true;
      const extra = { selected: target.label, on: screen, ...(spread ? { targets: "all" } : {}) };
      const walk = await this.#moveTo(menu, target, call);
      if (walk) return this.#finishActing(call, ready, choice, { settle: walk, messages: [], presses: 0, capped: false }, extra);
      const committed = await this.#commit(menu, target, ready.fine, call);
      const adv = await this.#autoAdvance(committed, call);
      return this.#finishActing(call, ready, choice, adv, extra);
    });
  }

  async startRun(species: string[], slot: number | undefined, overwrite: boolean, ctx: CallContext): Promise<Record<string, unknown>> {
    return this.#call(ctx, async call => {
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
        const out = this.#timedOutResult(e.settle, this.#end(call, { kind: "acting", pre: ready, choice, settle: e.settle, options: null }), "start_run");
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
    const moveTo = async (m: MenuRead, target: MenuOption, step: string): Promise<void> => {
      const walk = await this.#moveTo(m, target, call);
      if (walk) throw new SetupTimedOut(walk, step);
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
        await moveTo(m, yes.option, "back out");
        let back = await this.#commit(m, yes.option, confirm.fine, call);
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
    await moveTo(menu, menu.options[newGameIndex], "title");
    let s = await this.#commit(menu, menu.options[newGameIndex], ready.fine, call);
    presses++;
    let cur = await expect(s, "OPTION_SELECT", "title");
    // 2. Game mode: Classic is index 0.
    menu = await this.#game.menu();
    log.push(`game mode: ${menu.options.map(o => o.label).join(" | ")} → index 0`);
    await moveTo(menu, menu.options[0], "game mode");
    s = await this.#commit(menu, menu.options[0], cur.fine, call);
    presses++;
    cur = await expect(s, "STARTER_SELECT", "game mode");

    // 3. Starters, by name, resolved against the live filtered grid.
    const info = await this.#game.starterGrid();
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
      const placed = await this.#setCursor(call, { family: "starter_select", index: pick.i });
      if (!placed.ok) throw new Refusal("starter_cursor", `could not position the grid cursor on ${pick.name}: ${placed.why}`, { log });
      if (placed.species && normalizeLabel(placed.species) !== normalizeLabel(pick.name ?? "")) {
        throw new Refusal("starter_cursor", `grid cursor landed on ${placed.species}, not ${pick.name}`, { log });
      }
      s = await this.#pressAndSettle(Button.ACTION, cur.fine, call);
      presses++;
      cur = await expect(s, "OPTION_SELECT", `select ${pick.name}`);
      menu = await this.#game.menu();
      log.push(`${pick.name}: ${menu.options.map(o => o.label).join(" | ")} → index 0`);
      await moveTo(menu, menu.options[0], `add ${pick.name}`);
      s = await this.#commit(menu, menu.options[0], cur.fine, call);
      presses++;
      cur = await expect(s, "STARTER_SELECT", `add ${pick.name}`);
    }
    const after = await this.#game.starterGrid();
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
    await moveTo(menu, menu.options[0], "confirm");
    s = await this.#commit(menu, menu.options[0], cur.fine, call);
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
    await moveTo(menu, slotOpt, "save slot");
    s = await this.#commit(menu, slotOpt, cur.fine, call);
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
      await moveTo(menu, menu.options[0], "overwrite confirm");
      s = await this.#commit(menu, menu.options[0], r.fine, call);
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

  async #guard(ready: Ready): Promise<void> {
    const screen = ready.screen;
    const c = lockContended(this.lock);
    if (c.contended) throw new Refusal("tab_contended", `Another driver (pid ${c.holder}) holds the tab. Nothing was pressed.`, { screen, holder: c.holder });
    if (isSettingsMode(ready.mode)) throw new Refusal("settings_mode", `The game is on ${screen}; six settings carry requireReload and the reload fires on leaving, killing a live run. Leave Settings by hand.`, { screen });
    if (screen === FILTER_BAR_SCREEN) throw new Refusal("filter_bar", "The starter filter bar is active; setCursor would write filterBarCursor and CANCEL resets persisted filters. Leave it by hand.", { screen });
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

  /** Walk the cursor onto `target`. `null` once it is there; the unsettled result if the call's deadline ran out first. */
  async #moveTo(menu: MenuRead, target: MenuOption, call: Call): Promise<SettleResult | null> {
    switch (menu.family) {
      case "option_select": {
        const unskipped = (menu.extra.unskippedIndices as number[] | null) ?? null;
        const j = unskipped ? unskipped.indexOf(Number(target.i)) : Number(target.i);
        if (j < 0) throw new Refusal("option_skipped", `option ${target.label} is not selectable right now`, { options: menu.options.map(o => o.label) });
        if ((await this.#setCursor(call, { family: "option_select", index: j })).ok) return null;
        return this.#walk(menu, j, call, cur => (cur < j ? Button.DOWN : Button.UP));
      }
      case "command":
      case "fight":
      case "mystery_encounter": {
        // 2×2 grids: UP/DOWN are ±2, LEFT/RIGHT ±1.
        const t = Number(target.i);
        return this.#walk(menu, t, call, cur => (Math.floor(cur / 2) !== Math.floor(t / 2) ? (cur < t ? Button.DOWN : Button.UP) : cur < t ? Button.RIGHT : Button.LEFT));
      }
      case "modifier_select": {
        const r = await this.#setCursor(call, { family: "modifier_select", row: Number(target.row), col: Number(target.col) });
        if (!r.ok) throw new Refusal("cursor_unreachable", `could not position the shop cursor on ${target.label}`, { got: r });
        return null;
      }
      case "starter_select": {
        const r = await this.#setCursor(call, { family: "starter_select", index: Number(target.i) });
        if (!r.ok) throw new Refusal("cursor_unreachable", `could not position the grid cursor on ${target.label}`, { got: r });
        return null;
      }
      case "learn_move": {
        // Rows 0..4 with UP/DOWN ±1, wrapping; ACTION on a moveset row forgets it, on row 4 declines the new move.
        const t = Number(target.i);
        if ((await this.#setCursor(call, { family: "learn_move", row: t })).ok) return null;
        return this.#walk(menu, t, call, cur => (cur < t ? Button.DOWN : Button.UP));
      }
      case "target_select": {
        // A spread move ignores the cursor: ACTION hits every target and no direction moves it (#33).
        if (menu.extra.isMultipleTargets === true) return null;
        // BattlerIndex grid, nothing wraps (#40): enemies 2,3 on top, player field 0,1 below. UP/DOWN jump to the first
        // target in the other row, LEFT/RIGHT step ±1 within a row (TargetSelectUiHandler.processInput).
        const t = Number(target.i);
        const enemy = (i: number) => i >= 2;
        return this.#walk(menu, t, call, cur => (enemy(cur) !== enemy(t) ? (enemy(t) ? Button.UP : Button.DOWN) : cur < t ? Button.RIGHT : Button.LEFT));
      }
      case "party":
        // The slot list is a DOWN-cycle: 0..n-1 → 6 (Cancel) → 0; the option phase is a plain list (#7 §7: presses, always).
        if (menu.extra.optionsMode === true) return this.#walk(menu, Number(target.i), call, cur => (cur < Number(target.i) ? Button.DOWN : Button.UP));
        return this.#walk(menu, Number(target.i), call, () => Button.DOWN);
      case "modal":
        return null; // committed through the button action, no cursor
      case "save_slot":
      case "ball":
      case "menu":
      default:
        return this.#walk(menu, Number(target.i), call, cur => (cur < Number(target.i) ? Button.DOWN : Button.UP));
    }
  }

  /**
   * Press `step(cursor)` until the cursor reads `target`, each press settled against the call's deadline. A settled
   * press that leaves the cursor where it was refuses at once: the same press again does the same (#34). So does a step
   * that reads another Screen than `from`, the menu the walk was planned on: nothing is committed there. A press the game
   * moved ahead of (§10.2) was never sent: the walk settles and steps again from wherever the cursor now is.
   */
  async #walk(from: MenuRead, target: number, call: Call, step: (cursor: number) => Button): Promise<SettleResult | null> {
    let prev: number | null = null;
    let sent = 0;
    for (let n = 0; n < NAV_CAP; n++) {
      const menu = await this.#game.menu();
      if (menu.readable && menu.screen !== from.screen) {
        throw new Refusal("screen_changed", `The screen changed from ${from.screen} to ${menu.screen} while walking the cursor toward ${target}. ${sent} cursor press(es) were sent, nothing was committed.`, { screen: menu.screen, was: from.screen, target, presses: sent });
      }
      const cur = Number(menu.cursor);
      if (cur === target) return null;
      if (cur === prev) {
        throw new Refusal("cursor_stuck", `The cursor stayed on ${cur} after a press toward ${target}; ${target} can't be reached by moving the cursor here. ${sent} cursor press(es) were sent, nothing was committed.`, { cursor: cur, target, presses: sent });
      }
      const pre = call.fine;
      const pressed = await this.#tryPress(step(cur), call);
      prev = pressed ? cur : null;
      if (pressed) sent++;
      const s = await this.#settle(pre, call);
      if (!s.settled) return s;
    }
    throw new Refusal("cursor_unreachable", `cursor did not reach ${target} within ${NAV_CAP} presses`, { target, presses: sent });
  }

  /** The final commit: always `processInput(ACTION)`, except the modal family's own button action. */
  async #commit(menu: MenuRead, target: MenuOption, preFp: string, call: Call): Promise<SettleResult> {
    if (menu.family === "modal") {
      const r = await this.#act(call, fine => this.#game.modalButton(Number(target.i), fine));
      if (!r.ok && r.why === MOVED) return this.#refuseMoved(call, preFp, `the ${JSON.stringify(target.label)} button`);
      if (!r.ok) throw new Refusal("modal_button", `button action ${target.i} unavailable: ${r.why}`);
      return this.#settle(preFp, call);
    }
    return this.#pressAndSettle(Button.ACTION, preFp, call);
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
      return { ...this.#timedOutResult(s, outcome, "act"), messages: adv.messages, ...payload };
    }
    const afterRead = s.last as Ready;
    const menu = await this.#game.menu();
    const snap = await this.#game.snapshot("lean");
    const outcome = this.#end(call, { kind: "acting", pre, choice, settle: s, options: optionLabels(menu) });
    return this.#settledResult(
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

  #settledResult(
    ready: Ready,
    /** The Screen the result reports: a read-only call's is its menu read's, newer than the settle's. */
    screen: string,
    outcome: Outcome,
    payload: Record<string, unknown>,
    /** The call's suggested next step, returned only when the status is `ok`. */
    next?: string,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { status: outcome.status, wave: ready.wave, screen, ...payload };
    if (next !== undefined && outcome.status === "ok") out.next = next;
    if (outcome.diagnostic) {
      out.diagnostic = outcome.diagnostic;
      out.console_tail = this.#game.consoleTail();
    }
    if (outcome.escape) out.escape = outcome.escape;
    return out;
  }

  /** The opening settle ran out of time: nothing was pressed, so the call ends as a read. */
  #openingTimedOut(call: Call, s: SettleResult, tool: string): Record<string, unknown> {
    return this.#timedOutResult(s, this.#end(call, { kind: "read", settle: s, options: null }), tool);
  }

  #timedOutResult(s: SettleResult, outcome: Outcome, what: string): Record<string, unknown> {
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
      console_tail: this.#game.consoleTail(),
      note:
        alert !== null
          ? `${what}: the game is showing an alert that no input can close yet. If it stays, only a page reload leaves it (destructive: progress since the last save).`
          : pending
            ? `${what} ran out of call budget, but the game is waiting on a message: press(ACTION) moves it on. Waiting with get_state will not.`
            : `${what} did not settle within the call budget. Not fatal: call get_state or read_menu to keep waiting; nothing is pressed by that.`,
    };
  }

  #cleanSnapshot(snap: Record<string, unknown>): Record<string, unknown> {
    const { ready: _ready, mode: _mode, biome, party, ...rest } = snap;
    const clean = JSON.parse(JSON.stringify({ ...rest, party })) as Record<string, unknown>;
    return {
      ...clean,
      biome: typeof biome === "number" ? { int: biome, name: NAMES.BiomeId[biome] ?? null } : null,
      party: Array.isArray(party)
        ? party.map(p => (p && typeof p === "object" && "status" in p && typeof p.status === "number" ? { ...p, status: NAMES.StatusEffect[p.status] ?? p.status } : p))
        : party,
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
    return menu.extra.messagePending === true ? { message_pending: true, next: DISMISS_MESSAGE } : {};
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
      cancel_effect: menu.extra.messagePending === true ? "consents" : ladder.status === "ladder" ? ladder.cancelEffect : "unknown",
      screen_class: ladder.status === "ladder" ? ladder.class : null,
      ladder_note: ladder.status === "ladder" ? undefined : ladder.message,
      tutorial_active: ready.tutorialActive,
      phase: ready.phaseName,
      extra: menu.extra,
    };
  }
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
