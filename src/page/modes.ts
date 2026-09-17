/**
 * The generated enums the page handlers compare against (#164). Not itself a page function: a plain table each
 * transport hands into the call (§10.5) — the CDP link as JSON inside the `dispatch` expression, the extension by
 * importing it — because a stringified handler has no imports at runtime. A pin bump that renumbers `UiMode` moves
 * every page comparison with it instead of breaking the reader silently; the same holds for the starter bit flags,
 * which `starters` reads out of `gameData` (§11.4).
 */
import { AbilityAttr, Passive, SummaryUiMode, UiMode } from "../enums/generated.ts";

/** What `dispatch` puts on `L`: `m` for `UiMode`, `sm` for `SummaryUiMode`, `pa` for `Passive`, `ab` for `AbilityAttr`. */
export type PageModes = { m: typeof UiMode; sm: typeof SummaryUiMode; pa: typeof Passive; ab: typeof AbilityAttr };

export const PAGE_MODES: PageModes = Object.freeze({ m: UiMode, sm: SummaryUiMode, pa: Passive, ab: AbilityAttr });
