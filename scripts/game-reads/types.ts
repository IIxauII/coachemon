import type { SourceRef } from "../../src/escape-ladder/types.ts";

/** A unit of the game's repo: its `src/`, or the `test/` framework the harness template runs on. */
export type GameRef = SourceRef | `test/${string}.ts#${string}`;

/** `file#outer.member` taken apart; `symbol` is all after the `#`, and `member` is undefined on a bare `file#outer`. */
export function refParts(ref: string): { file: string; symbol: string; outer: string; member: string | undefined } {
  const [file, symbol = ""] = ref.split("#", 2);
  const dot = symbol.indexOf(".");
  return { file, symbol, outer: dot < 0 ? symbol : symbol.slice(0, dot), member: dot < 0 ? undefined : symbol.slice(dot + 1) };
}

export type ReadKind =
  | "field" | "method" | "enum-member" | "phase" | "table" | "constant"
  | "index" | "locator" | "storage-key" | "import";

export type GameRead = {
  /** The name as our code spells it: a property name, a phase-name string, a storage key, an import specifier. */
  name: string;
  kind: ReadKind;
  /** Where the game defines it, `file#Symbol` or `file#Class.member`; drift checks each one at the target version. */
  at: GameRef[];
  /**
   * Defined outside the game's own source: `phaser` and `vitest` are the game's libraries, whose versions drift hashes;
   * `ours` is a name of our own that the game happens to declare too, or a storage key we write, which drift leaves alone.
   */
  from?: "phaser" | "vitest" | "ours";
  note?: string;
};

/** A game enum or list we mirror or switch on: a member the game adds that `known` lacks is ADDED until handled. */
export type GameSet = { at: SourceRef; known: readonly string[]; handledIn: readonly string[] };

/**
 * A hand constant in our code that copies game data. `ours` is `<repo file>#<id>`, and that file carries
 * `// @mirrors <id>` above the constant.
 */
export type Mirror = { ours: string; of: GameRef[] };

/** One area's share of the registry: what its scanned files read. */
export type Area = {
  reads: readonly GameRead[];
  sets?: readonly GameSet[];
  mirrors?: readonly Mirror[];
};
