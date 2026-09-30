/** `page.js`, the MAIN-world script that holds the command handlers (extension-distribution.md §10.5). */
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { DEV_PAGE_HANDLERS } from "../src/dev/commands.ts";
import { startPage, type PageInstance } from "../src/page/register.ts";
import type { Channel } from "../src/relay/channel.ts";

export default defineUnlistedScript(() => {
  startPage({
    // A build-time constant, so a store build drops the dev handlers (extension-distribution.md §5.5).
    extra: COACHEMON_FLAVOUR === "dev" ? DEV_PAGE_HANDLERS : undefined,
    channel: document as unknown as Channel,
    makeEvent: (type, detail) => new CustomEvent(type, { detail }),
    build: COACHEMON_BUILD,
    // The relay's marker lives in the isolated world, so seeing it means this script ran isolated
    // (extension-distribution.md §9.4).
    isolated: (globalThis as Record<string, unknown>).__coachemonIsolated !== undefined,
    global: window as unknown as { __coachemonPage?: PageInstance },
  });
});
