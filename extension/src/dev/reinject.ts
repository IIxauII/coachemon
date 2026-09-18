/**
 * The second half of the dev loop (§5.4), and not a command: after `runtime.reload()` the extension's content scripts
 * are orphaned in every open tab and nothing puts them back, so a restarted dev background re-injects them and the run
 * keeps its place. Each script replaces an older copy in place (§9.6).
 *
 * Injected, like everything else under `src/dev/`, so a test drives it with no browser; `live.ts` is the real wiring.
 */

export type Injector = {
  /** The open `pokerogue.net` tabs, by id. */
  gameTabs: () => Promise<number[]>;
  inject: (tab: number, files: string[], world: "MAIN" | "ISOLATED") => Promise<unknown>;
};

/**
 * §5.4 names `page.js` and `hud.js`. `relay.js` goes back too, because a reloaded extension has no relay in the tab
 * either, and without one the tab never reaches the hub again — which is the whole point of reloading.
 */
export async function reinject(inj: Injector): Promise<void> {
  const tabs = await inj.gameTabs().catch(() => [] as number[]);
  for (const tab of tabs) {
    // A tab the browser will not script is skipped, never fatal: the rest still come back.
    await inj.inject(tab, ["relay.js"], "ISOLATED").catch(() => {});
    await inj.inject(tab, ["page.js", "hud.js"], "MAIN").catch(() => {});
  }
}
