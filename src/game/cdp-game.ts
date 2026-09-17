/**
 * The CDP adapter behind the game port (#127). It alone knows the JavaScript sent into the tab (`js.ts` is its
 * implementation), the `Runtime.evaluate` round trip and what a page throw becomes: every `Thrown` ends here.
 * It also identifies the Screen: both reads return the page's discriminators, and they stop here (#133).
 */
import { isThrown, type CdpSession, type Thrown } from "../cdp/session.ts";
import { Button, UiMode } from "../enums/generated.ts";
import { screenId, type Discriminators } from "../screen.ts";
import * as js from "./js.ts";
import type { Act, ConsoleLine, CursorTarget, Failed, Family, GamePort, MenuRead, MenuReadBase, PredicateRead, Ready, SnapshotDetail, StarterGrid } from "./port.ts";

/** The part of `CdpSession` the adapter drives. */
export type GameSession = Pick<CdpSession, "attached" | "launchedChrome" | "onException" | "ensure" | "evaluate" | "keepAlive" | "rawKey" | "screenshot" | "consoleTail">;

/** Each button's keyboard equivalent, for the raw fallback (§6.4). Phaser binds to `window`, so a dispatched key reaches the game (#9). */
const RAW_KEYS: Partial<Record<Button, [key: string, code: string, keyCode: number]>> = {
  [Button.UP]: ["ArrowUp", "ArrowUp", 38],
  [Button.DOWN]: ["ArrowDown", "ArrowDown", 40],
  [Button.LEFT]: ["ArrowLeft", "ArrowLeft", 37],
  [Button.RIGHT]: ["ArrowRight", "ArrowRight", 39],
  [Button.ACTION]: ["z", "KeyZ", 90],
  [Button.CANCEL]: ["x", "KeyX", 88],
  [Button.SUBMIT]: ["Enter", "Enter", 13],
  [Button.MENU]: ["Escape", "Escape", 27],
};

/** What `PREDICATE` and `READER` return: the port's reads with the discriminators in place of the Screen. */
type PageRead = Extract<PredicateRead, { ready: false }> | (Omit<Ready, "screen"> & { disc: Discriminators });
type PageMenu =
  | (Omit<MenuReadBase, "screen"> & { family: Family | null; extra: Record<string, unknown>; disc: Discriminators })
  /** Not located (no `mode`), or no handler for the mode. */
  | { readable: false; why: string; mode?: number; disc?: undefined };

const NO_DISC: Discriminators = { partyUiMode: null, optionsMode: false, saveSlotUiMode: null, summaryUiMode: null, alertClosable: false, filterMode: false, transferMode: false };

type PageAct = { ok: boolean; why?: string };
/** An act the page ran, with what it read back; or why it did not. */
type Ran<T> = Extract<Act, { ok: false }> | { ok: true; page: T };

export class CdpGame implements GamePort {
  readonly #session: GameSession;

  constructor(session: GameSession) {
    this.#session = session;
  }

  /** Every game operation attaches first: attach-else-launch is the session's, and idempotent. */
  async #evaluate<T>(expression: string): Promise<T | Thrown> {
    await this.#session.ensure();
    return this.#session.evaluate<T>(expression);
  }

  async #act<T extends PageAct>(expression: string): Promise<Ran<T>> {
    const r = await this.#evaluate<T>(expression);
    if (isThrown(r)) return { ok: false, why: r.__throw, threw: true };
    if (!r.ok) return { ok: false, why: String(r.why), threw: false };
    return { ok: true, page: r };
  }

  // ------------------------------------------------------- game operations

  async read(): Promise<PredicateRead> {
    const r = await this.#evaluate<PageRead>(js.PREDICATE);
    if (isThrown(r)) return { ready: false, why: r.__throw, frame: null, domMode: null };
    if (!r.ready) return r;
    const { disc, ...read } = r;
    return { ...read, screen: screenId(r.mode, disc) };
  }

  async frame(): Promise<number | null> {
    const r = await this.#evaluate<{ ready: boolean; frame: number | null }>(js.FRAME);
    return isThrown(r) ? null : r.frame;
  }

  async menu(): Promise<MenuRead> {
    const r = await this.#evaluate<PageMenu>(js.READER);
    if (isThrown(r)) return unreadable(r.__throw, -1);
    if (r.disc === undefined) return unreadable(r.why, r.mode ?? -1);
    const { disc, ...menu } = r;
    // Each family's `extra` is what its READER branch wrote: the page's JSON is untyped, so the union is asserted here.
    return { ...menu, messagePending: menu.messagePending === true, screen: screenId(r.mode, disc), extra: { ...menu.extra, ...screenFields(r.family, r.mode, disc) } } as MenuRead;
  }

  async press(b: Button): Promise<Act> {
    const r = await this.#act(js.press(b));
    return r.ok ? { ok: true } : r;
  }

  async setCursor(t: CursorTarget): Promise<Act & { species?: string }> {
    switch (t.family) {
      case "option_select": {
        const r = await this.#act<PageAct & { fullCursor: number }>(js.optionSelectSetCursor(t.index));
        return landed(r, p => p.fullCursor === t.index, p => `fullCursor ${p.fullCursor}`);
      }
      case "modifier_select": {
        const r = await this.#act<PageAct & { rowCursor: number; cursor: number }>(js.shopSetCursor(t.row, t.col));
        return landed(r, p => p.rowCursor === t.row && p.cursor === t.col, p => `row ${p.rowCursor}, column ${p.cursor}`);
      }
      case "starter_select": {
        const r = await this.#act<PageAct & { cursor: number; species?: string | null }>(js.starterSetCursor(t.index));
        const out = landed(r, p => p.cursor === t.index, p => `cursor ${p.cursor} (${p.species})`);
        return out.ok && r.ok && typeof r.page.species === "string" ? { ...out, species: r.page.species } : out;
      }
      case "learn_move": {
        const r = await this.#act<PageAct & { moveCursor: number }>(js.learnMoveSetCursor(t.row));
        return landed(r, p => p.moveCursor === t.row, p => `moveCursor ${p.moveCursor}`);
      }
    }
  }

  async modalButton(i: number): Promise<Act> {
    const r = await this.#act(js.modalButton(i));
    return r.ok ? { ok: true } : r;
  }

  async starterGrid(): Promise<StarterGrid | Failed> {
    const r = await this.#evaluate<StarterGrid | { ok: false; why?: string }>(js.STARTER_INFO);
    if (isThrown(r)) return { ok: false, why: r.__throw };
    return r.ok ? r : { ok: false, why: String(r.why) };
  }

  async snapshot(d: SnapshotDetail): Promise<{ ok: true; snapshot: Record<string, unknown> } | Failed> {
    const r = await this.#evaluate<Record<string, unknown>>(js.snapshot(d));
    return isThrown(r) ? { ok: false, why: r.__throw } : { ok: true, snapshot: r };
  }

  // -------------------------------------------------------- tab operations

  async rawKey(b: Button): Promise<boolean> {
    const k = RAW_KEYS[b];
    if (!k) return false;
    await this.#session.ensure();
    await this.#session.rawKey(...k);
    return true;
  }

  async keepAlive(): Promise<void> {
    await this.#session.ensure();
    await this.#session.keepAlive();
  }

  async attach(): Promise<{ attached: boolean; launchedChrome: boolean }> {
    await this.#session.ensure();
    return { attached: this.#session.attached, launchedChrome: this.#session.launchedChrome };
  }

  async screenshot(): Promise<string> {
    await this.#session.ensure();
    return this.#session.screenshot();
  }

  consoleTail(): ConsoleLine[] {
    return this.#session.consoleTail();
  }

  onRejection(cb: (t: number) => void): void {
    this.#session.onException = cb;
  }
}

function unreadable(why: string, mode: number): MenuRead {
  return { readable: false, why, mode, screen: screenId(mode, NO_DISC), family: null, options: [], cursor: null, text: null, messagePending: false, extra: {} };
}

/** The fields a family takes from the Screen's discriminators, so they always agree with `screen`. */
function screenFields(family: string | null, mode: number, d: Discriminators): Record<string, unknown> {
  switch (family) {
    case "party":
      return { optionsMode: d.optionsMode, partyUiMode: d.partyUiMode, transferMode: d.transferMode };
    case "save_slot":
      return { uiMode: d.saveSlotUiMode };
    case "acknowledge":
      return mode === UiMode.ALERT_MODAL ? { closable: d.alertClosable } : {};
    case "starter_select":
      return { filterMode: d.filterMode };
    default:
      return {};
  }
}

/** A setCursor that ran is ok only once the handler's own cursor reads the target. */
function landed<T extends PageAct>(r: Ran<T>, on: (p: T) => boolean, where: (p: T) => string): Act {
  if (!r.ok) return r;
  return on(r.page) ? { ok: true } : { ok: false, why: `the cursor landed on ${where(r.page)}`, threw: false };
}
