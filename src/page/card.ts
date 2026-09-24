import type { CardGroup } from "../protocol/wire.ts";
import type { Located } from "./locate.ts";

export type CardResult =
  | { ok: true; kind: string | null; key: string | null; wave: number | null; verdict: string | null; groups: CardGroup[] | null; text: string | null; summary: Record<string, unknown> | null }
  | { ok: false; why: "no-hud" };

/**
 * The card the HUD is showing (§10.1, §11.4): `__coachHud.card()` is the very payload its `coachemon:card` events
 * carry — kind, dedupe key, wave, verdict, the card's **groups** and its plain text — and `summary` is
 * `__coachHud.summary()`, the fields `read.sh battle`'s `hud` had. A subscriber's late join reads here and gets the
 * event it missed (§11.1), groups and all, so an agent joining a decision already on screen reads it by group name
 * rather than by parsing lines.
 *
 * `summary` is the liveness gate and is read on its own: the structured read keeps working with no panel drawn, so
 * it never depends on a document existing.
 *
 * Only a page with no panel at all refuses: a panel with nothing to coach, or one whose refresh threw, reads as a card
 * of nulls, since the coach's read is not the place a HUD failure surfaces — `coachemon:coach-error` is.
 * Self-contained (§10.5).
 */
export function card(_L: Located, _args: Record<string, never>): CardResult {
  const __try = (f: () => any) => { try { return f(); } catch (e) { return null; } };
  const hud = (globalThis as any).__coachHud;
  if (!hud || typeof hud.summary !== "function") return { ok: false, why: "no-hud" };
  const summary = __try(() => hud.summary()) || null;
  const ev = typeof hud.card === "function" ? __try(() => hud.card()) || null : null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    ok: true,
    kind: str(ev && ev.kind) ?? str(summary && summary.kind),
    key: str(ev && ev.key),
    wave: num(ev && ev.wave) ?? num(summary && summary.wave),
    verdict: str(ev && ev.verdict) ?? str(summary && summary.verdict),
    groups: Array.isArray(ev && ev.groups) ? (ev.groups as CardGroup[]) : null,
    text: str(ev && ev.text),
    summary,
  };
}
