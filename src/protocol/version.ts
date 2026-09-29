/** Shared by the hub, the server and the extension (extension-distribution.md §7.2, §8.5). Plain values, no imports. */

/** When to bump it: extension-distribution.md §10.7. */
export const PROTOCOL = 1;

/** The hub's marker in its `welcome`, so a squatter on the port gets nothing from the extension (extension-distribution.md §7.4). */
export const PRODUCT = "coachemon-hub";

/** The store hub's loopback port. Hardcoded: the extension cannot read configuration. */
export const STORE_PORT = 47147;

/** Apart from the store port, so a dev build beside a store install never double-counts a tab (§5.4). */
export const DEV_PORT = 47148;
