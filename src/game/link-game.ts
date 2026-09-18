/**
 * The game port over a link (#127, §12.1). It alone knows what a link's answers mean for the Driver: a `Fault` ends
 * here, reads degrade to their not-readable values, acts say whether the page threw, refused or found the game `moved`,
 * and both reads' discriminators become the Screen (#133). It knows nothing of the transport underneath.
 */
import { UiMode, type Button } from "../enums/generated.ts";
import type { Refused } from "../page/acts.ts";
import { disc } from "../page/disc.ts";
import type { MenuResult } from "../page/menu.ts";
import { screenId, type Discriminators } from "../screen.ts";
import type { CommandName } from "../protocol/commands.ts";
import { isFault, type Claim, type Fault, type GameLink, type Presence, type Tab, type Unready } from "./link.ts";
import type { Act, CardRead, ConsoleLine, CursorTarget, Failed, GamePort, MenuRead, PredicateRead, SnapshotDetail, StarterGrid } from "./port.ts";

/** A menu read that located no handler has no discriminators: they read as off. */
const NO_DISC: Discriminators = disc(null);

export class LinkGame implements GamePort {
  readonly #link: GameLink;
  readonly #tab: Tab;

  constructor(link: GameLink, tab: Tab) {
    this.#link = link;
    this.#tab = tab;
  }

  // ------------------------------------------------------- game operations

  async read(): Promise<PredicateRead> {
    const r = await this.#link.probe({});
    if (isFault(r)) return { ready: false, why: r.message, frame: null, domMode: null };
    if (!r.ready) return { ready: false, why: r.why, frame: r.frame, domMode: r.domMode };
    const { disc, pumped: _pumped, errorAt: _errorAt, console: _console, ...read } = r;
    return { ...read, screen: screenId(r.mode, disc) };
  }

  async frame(): Promise<number | null> {
    const r = await this.#link.probe({});
    return isFault(r) ? null : r.frame;
  }

  async menu(): Promise<MenuRead> {
    const r: MenuResult | Unready | Fault = await this.#link.menu();
    if (isFault(r)) return unreadable(r.message, -1);
    if ("ok" in r) return unreadable(r.why, -1);
    if (r.disc === undefined) return unreadable(r.why, r.mode);
    const { disc, ...menu } = r;
    // Each family's `extra` is what its reader branch wrote: the page's JSON is untyped, so the union is asserted here.
    return { ...menu, messagePending: menu.messagePending === true, screen: screenId(r.mode, disc), extra: { ...menu.extra, ...screenFields(r.family, r.mode, disc) } } as MenuRead;
  }

  async press(button: Button, fine: string): Promise<Act> {
    return done(await this.#link.press({ button, fine }));
  }

  async setCursor(t: CursorTarget, fine: string): Promise<Act & { species?: string }> {
    switch (t.family) {
      case "option_select": {
        const r = await this.#link.cursorOption({ index: t.index, fine });
        return landed(r, p => p.fullCursor === t.index, p => `fullCursor ${p.fullCursor}`);
      }
      case "modifier_select": {
        const r = await this.#link.cursorShop({ row: t.row, col: t.col, fine });
        return landed(r, p => p.rowCursor === t.row && p.cursor === t.col, p => `row ${p.rowCursor}, column ${p.cursor}`);
      }
      case "starter_select": {
        const r = await this.#link.cursorStarter({ index: t.index, fine });
        const out = landed(r, p => p.cursor === t.index, p => `cursor ${p.cursor} (${p.species})`);
        return out.ok && !isFault(r) && r.ok && typeof r.species === "string" ? { ...out, species: r.species } : out;
      }
      case "learn_move": {
        const r = await this.#link.cursorLearn({ row: t.row, fine });
        return landed(r, p => p.moveCursor === t.row, p => `moveCursor ${p.moveCursor}`);
      }
    }
  }

  async modalButton(index: number, fine: string): Promise<Act> {
    return done(await this.#link.modal({ index, fine }));
  }

  async starters(): Promise<StarterGrid | Failed> {
    return answered(await this.#link.starters());
  }

  async card(): Promise<CardRead | Failed> {
    // `no-hud` is the page's own refusal (§10.1), so it degrades like any other unreadable read.
    return answered<CardRead>(await this.#link.card());
  }

  async snapshot(detail: SnapshotDetail): Promise<{ ok: true; snapshot: Record<string, unknown> } | Failed> {
    const r = await this.#link.snapshot({ detail });
    if (isFault(r)) return { ok: false, why: r.message };
    if (r.ok === false) return { ok: false, why: String(r.why) };
    return { ok: true, snapshot: r };
  }

  screenshot(): Promise<string> {
    return this.#link.screenshot();
  }

  // -------------------------------------------------------- tab operations

  get pumps(): boolean {
    return this.#tab.pumps;
  }

  presence(needs?: readonly CommandName[]): Promise<Presence> {
    return this.#tab.presence(needs);
  }

  claim(): Promise<Claim> {
    return this.#tab.claim();
  }

  keepAlive(): Promise<void> {
    return this.#tab.keepAlive();
  }

  rawKey(b: Button, fine: string): Promise<boolean> {
    return this.#tab.rawKey(b, fine);
  }

  tail(): Promise<ConsoleLine[]> {
    return this.#tab.tail();
  }

  onRejection(cb: (t: number) => void): void {
    this.#tab.onRejection(cb);
  }
}

/** A read the Driver takes whole: a command that never got an answer and one the page refused both degrade to `Failed`. */
function answered<T extends { ok: true }>(r: T | Unready | Fault): T | Failed {
  if (isFault(r)) return { ok: false, why: r.message };
  return r.ok ? r : { ok: false, why: String(r.why) };
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

/** An act's answer, when it did nothing: the page threw, refused, or found the game moved (and says where it is now). */
function failed(r: Refused | Fault): Extract<Act, { ok: false }> {
  if (isFault(r)) return { ok: false, why: r.message, threw: true };
  return { ok: false, why: String(r.why), threw: false, ...(typeof r.fine === "string" ? { fine: r.fine } : {}) };
}

function done(r: { ok: true } | Refused | Fault): Act {
  return !isFault(r) && r.ok ? { ok: true } : failed(r);
}

/** A cursor act that ran is ok only once the handler's own cursor reads the target. Either way the cursor moved: `fine` says where. */
function landed<T extends { ok: true; fine: string }>(r: T | Refused | Fault, on: (p: T) => boolean, where: (p: T) => string): Act {
  if (isFault(r) || !r.ok) return failed(r);
  return on(r) ? { ok: true, fine: r.fine } : { ok: false, why: `the cursor landed on ${where(r)}`, threw: false, fine: r.fine };
}
