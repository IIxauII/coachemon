import type { CardGroup } from "../protocol/wire.ts";
import type { Located } from "./locate.ts";

export type CardResult =
  | { ok: true; kind: string | null; key: string | null; wave: number | null; verdict: string | null; groups: CardGroup[] | null; text: string | null; summary: Record<string, unknown> | null }
  | { ok: false; why: "no-hud" };

/**
 * The payload `coachemon:card` carries, for a late join; `summary` is the liveness gate, read on its own
 * (extension-distribution.md §11.1, §11.4). A panel with nothing to coach, or whose refresh threw, reads as a card of
 * nulls: a HUD failure surfaces as `coachemon:coach-error`, never here. Self-contained (§10.5).
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
