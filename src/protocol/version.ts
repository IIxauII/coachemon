/**
 * The protocol's fixed numbers (§7.2, §8.5), shared by the hub, the server and the extension. Plain values, no imports.
 */

/** Bumped when a command is removed or renamed, or an existing argument or result field changes meaning (§10.7). */
export const PROTOCOL = 1;

/** The hub's marker in its `welcome`, so a squatter on the port gets nothing from the extension (§7.4). */
export const PRODUCT = "coachemon-hub";

/** The store hub's loopback port. Hardcoded: the extension cannot read configuration. */
export const STORE_PORT = 47147;

/** The dev hub's port, so a dev build next to a store install never double-counts a tab (§5.4). */
export const DEV_PORT = 47148;
