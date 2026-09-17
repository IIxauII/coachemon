/**
 * The store command table (§10.1): the closed set of commands anything may send into a game tab. The hub refuses a name
 * not in it; a store build of the extension registers exactly these handlers. Plain data, no imports.
 *
 * Every act carries `fine`, the fine fingerprint of the read it was decided on: the page refuses `moved` rather than act
 * on a game that has since changed (§10.2).
 */

export type Field =
  | { type: "boolean"; optional?: true }
  | { type: "number"; optional?: true }
  | { type: "string"; optional?: true }
  | { type: "enum"; values: readonly string[]; optional?: true };

export type CommandSpec = { kind: "read" | "act"; args: { readonly [name: string]: Field }; since: number };

const bool = { type: "boolean", optional: true } as const;
const num = { type: "number" } as const;
const fine = { type: "string" } as const;

/** The keys the `key` command can send: today's raw-keyboard buttons (§10.4). */
export const KEY_BUTTONS = ["UP", "DOWN", "LEFT", "RIGHT", "ACTION", "CANCEL", "SUBMIT", "MENU"] as const;

export const SNAPSHOT_DETAILS = ["lean", "party", "items", "full"] as const;

const TABLE = {
  probe: { kind: "read", args: { pump: bool, tail: bool }, since: 1 },
  menu: { kind: "read", args: {}, since: 1 },
  snapshot: { kind: "read", args: { detail: { type: "enum", values: SNAPSHOT_DETAILS } }, since: 1 },
  starters: { kind: "read", args: {}, since: 1 },
  card: { kind: "read", args: {}, since: 1 },
  press: { kind: "act", args: { button: num, fine }, since: 1 },
  key: { kind: "act", args: { button: { type: "enum", values: KEY_BUTTONS }, fine }, since: 1 },
  "cursor.option": { kind: "act", args: { index: num, fine }, since: 1 },
  "cursor.shop": { kind: "act", args: { row: num, col: num, fine }, since: 1 },
  "cursor.starter": { kind: "act", args: { index: num, fine }, since: 1 },
  "cursor.learn": { kind: "act", args: { row: num, fine }, since: 1 },
  modal: { kind: "act", args: { index: num, fine }, since: 1 },
} as const satisfies Record<string, CommandSpec>;

export type CommandName = keyof typeof TABLE;

type FieldValue<F> = F extends { type: "boolean" } ? boolean
  : F extends { type: "number" } ? number
  : F extends { type: "string" } ? string
  : F extends { type: "enum"; values: readonly (infer V)[] } ? V
  : never;

type Optional<A> = { [K in keyof A]: A[K] extends { optional: true } ? K : never }[keyof A];

/** A command's arguments, as its schema types them. */
export type Args<N extends CommandName> = {
  -readonly [K in Exclude<keyof (typeof TABLE)[N]["args"], Optional<(typeof TABLE)[N]["args"]>>]: FieldValue<(typeof TABLE)[N]["args"][K]>;
} & {
  -readonly [K in Optional<(typeof TABLE)[N]["args"]>]?: FieldValue<(typeof TABLE)[N]["args"][K]>;
};

function freeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}

export const STORE_COMMANDS: { readonly [N in CommandName]: CommandSpec } = freeze(TABLE);

export const COMMAND_NAMES = Object.freeze(Object.keys(STORE_COMMANDS) as CommandName[]);

// The dev-only names live in `dev-commands.ts`, so a store build of the extension — which imports this module — never
// carries them (§5.5, §10.6).
