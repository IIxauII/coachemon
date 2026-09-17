import type { Discriminators } from "./disc.ts";
import type { Located, Page, Scene, Unlocated } from "./locate.ts";

/**
 * Answer one command inside the game tab, in one page turn: locate the scene, refuse an act whose fingerprint the game
 * has left, run the handler (§10.1, §10.2). Every transport answers through this: the CDP link stringifies it with its
 * function arguments (§10.5), the extension's page script calls it directly.
 *
 * Off the game every command refuses `{ ok: false, why }` with the locator's reason, except `probe`, which reports
 * `ready: false` itself. Self-contained (§10.5).
 */
export function dispatch(
  locate: () => Scene | Unlocated,
  fine: (L: Scene) => string,
  disc: (h: Page) => Discriminators,
  handler: (L: any, args: any) => unknown,
  name: string,
  kind: "read" | "act",
  args: Record<string, unknown>,
): unknown {
  const at = locate();
  if (!at.ready) return name === "probe" ? handler(at, args) : { ok: false, why: at.why };
  const L: Located = { ...at, fine: () => fine(at), disc };
  if (kind === "act") {
    const now = L.fine();
    if (now !== args.fine) return { ok: false, why: "moved", fine: now };
  }
  return handler(L, args);
}
