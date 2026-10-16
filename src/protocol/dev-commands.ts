/**
 * Kept out of `commands.ts`, which a store build imports: the guard fails a store artifact carrying these strings
 * (extension-distribution.md §5.5, §10.6). Without `/*#__PURE__*\/` the bundler keeps the `Object.freeze` call, and
 * the three names with it, in every store artifact.
 */
export const DEV_COMMAND_NAMES = /*#__PURE__*/ Object.freeze(["eval", "screenshot", "reload"] as const);

export type DevCommandName = (typeof DEV_COMMAND_NAMES)[number];
