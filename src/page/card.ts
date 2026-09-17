import type { Located } from "./locate.ts";

export type CardResult =
  | { ok: true; kind: string | null; key: string | null; wave: number | null; verdict: string | null; text: string | null; summary: Record<string, unknown> | null }
  | { ok: false; why: "no-hud" };

/**
 * The card the HUD is showing (§10.1, §11.4): `summary` is `__coachHud.summary()`, the fields `read.sh battle`'s `hud`
 * had. `kind`, `key` and `text` stay null until the HUD derives them for its card events (§11.1). Self-contained (§10.5).
 */
export function card(_L: Located, _args: Record<string, never>): CardResult {
  const hud = (globalThis as any).__coachHud;
  if (!hud || typeof hud.summary !== "function") return { ok: false, why: "no-hud" };
  const summary = hud.summary() || null;
  return {
    ok: true,
    kind: null,
    key: null,
    wave: summary && typeof summary.wave === "number" ? summary.wave : null,
    verdict: summary && typeof summary.verdict === "string" ? summary.verdict : null,
    text: null,
    summary,
  };
}
