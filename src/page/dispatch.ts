import type { CommandSpec } from "../protocol/commands.ts";
import type { Discriminators } from "./disc.ts";
import type { Located, Page, Scene, Unlocated } from "./locate.ts";
import type { PageModes } from "./modes.ts";
import type { StarterReads } from "./starter.ts";

/** Self-contained (extension-distribution.md §10.5). */
export function dispatch(
  locate: () => Scene | Unlocated,
  fine: (L: Scene, modes: PageModes) => string,
  disc: (h: Page) => Discriminators,
  starter: (h: Page) => StarterReads,
  handler: (L: any, args: any) => unknown,
  name: string,
  kind: CommandSpec["kind"],
  modes: PageModes,
  args: Record<string, unknown>,
): unknown {
  const at = locate();
  if (!at.ready) return name === "probe" ? handler(at, args) : { ok: false, why: at.why };
  const L: Located = { ...at, ...modes, fine: () => fine(at, modes), disc, starter };
  if (kind === "act") {
    const now = L.fine();
    if (now !== args.fine) return { ok: false, why: "moved", fine: now };
  }
  return handler(L, args);
}
