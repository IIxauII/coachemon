import type { OracleLine } from "../solver/solver.ts";
import type { Located } from "./locate.ts";

type Ids<T> = T extends readonly (infer E)[] ? readonly Ids<E>[]
  : T extends object ? { [K in keyof T]: K extends "move" | "species" | "status" ? number : Ids<T[K]> }
  : T;

/** `move`, `species` and `status` are the game's own ids: no enum name exists in the page (hud-bundle.mjs). */
export type PageOracleLine = Ids<OracleLine>;

export type OracleLineResult = { ok: true } | { ok: false; why: "no-hud" | "other-fight" | "malformed" };

/** The overlay decides whether the oracle line is for the fight it is on (#670). Self-contained (extension-distribution.md §10.5). */
export function oracleLine(_L: Located, args: { line: PageOracleLine }): OracleLineResult {
  const hud = (globalThis as any).__coachHud;
  if (!hud || typeof hud.oracleLine !== "function") return { ok: false, why: "no-hud" };
  return hud.oracleLine(args.line);
}
