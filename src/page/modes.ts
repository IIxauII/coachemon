/**
 * Every transport hands this into the call, because a stringified handler has no imports at runtime
 * (extension-distribution.md §10.5, #164).
 */
import { AbilityAttr, Passive, SummaryUiMode, UiMode } from "../enums/generated.ts";

export type PageModes = { m: typeof UiMode; sm: typeof SummaryUiMode; pa: typeof Passive; ab: typeof AbilityAttr };

export const PAGE_MODES: PageModes = Object.freeze({ m: UiMode, sm: SummaryUiMode, pa: Passive, ab: AbilityAttr });
