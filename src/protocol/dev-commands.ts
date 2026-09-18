/**
 * The dev-only command names (§10.6). A module of their own, not part of `commands.ts`, because a store build of the
 * extension imports `STORE_COMMANDS` and must not carry these strings at all: the guard fails a store artifact whose
 * files contain `screenshot` (§5.5).
 *
 * A dev build's `extension/src/dev/commands.ts` does import it, so that one list serves the hub, the guard and the
 * extension. `Object.freeze` is a call, and a call is a side effect a bundler keeps even where its value is unused —
 * which left the three names in every store artifact. `/*#__PURE__*\/` is what tells it otherwise; without the
 * annotation the whole module has to be dropped, and the guard is what notices either way.
 *
 * They sit outside the protocol integer: a dev build always pairs with a server from the same checkout, and the hub
 * routes them to a `flavour: "dev"` extension and to nothing else. The shapes live with the extension's dev table;
 * the hub only needs the names.
 */
export const DEV_COMMAND_NAMES = /*#__PURE__*/ Object.freeze(["eval", "screenshot", "reload"] as const);

export type DevCommandName = (typeof DEV_COMMAND_NAMES)[number];
