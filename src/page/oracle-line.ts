import type { OracleLine } from "../solver/solver.ts";
import type { Located } from "./locate.ts";

type Ids<T> = T extends readonly (infer E)[] ? readonly Ids<E>[]
  : T extends object ? { [K in keyof T]: K extends "move" | "species" | "status" ? number : Ids<T[K]> }
  : T;

/** `move`, `species` and `status` are the game's own ids: no enum name exists in the page (hud-bundle.mjs). */
export type PageLine = Ids<OracleLine>;

export type OracleLineResult = { ok: true } | { ok: false; why: string };

/** The panel decides whether the line is for the fight it is on (#670). Self-contained (extension-distribution.md §10.5). */
export function oracleLine(_L: Located, args: { line: PageLine }): OracleLineResult {
  const hud = (globalThis as any).__coachHud;
  if (!hud || typeof hud.oracleLine !== "function") return { ok: false, why: "no-hud" };
  const r = hud.oracleLine(args.line);
  return r && r.ok === true ? { ok: true } : { ok: false, why: r && typeof r.why === "string" ? r.why : "not-held" };
}
