/**
 * `page.js` (§10.5): the MAIN-world script that holds the command handlers. A WXT unlisted script, listed in the
 * manifest by hand next to `hud.js` (§5.2).
 *
 * It imports the handlers from the repo's `src/page/`, which the CDP transport evaluates from the same source during
 * the opt-in period, so one source serves both transports until CDP is deleted.
 */
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { startPage, type PageInstance } from "../src/page/register.ts";
import type { Channel } from "../src/relay/channel.ts";

export default defineUnlistedScript(() => {
  startPage({
    channel: document as unknown as Channel,
    makeEvent: (type, detail) => new CustomEvent(type, { detail }),
    build: COACHEMON_BUILD,
    // The relay's marker belongs to the isolated world: seeing it from here means this script ran isolated (§9.4).
    isolated: (globalThis as Record<string, unknown>).__coachemonIsolated !== undefined,
    host: window as unknown as { __coachemonPage?: PageInstance },
  });
});
