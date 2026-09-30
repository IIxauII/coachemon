/**
 * After `runtime.reload()` the content scripts are orphaned in every open tab, and nothing else puts them back
 * (extension-distribution.md §5.4). Each script replaces an older copy in place (§9.6).
 */

export type Injector = {
  gameTabs: () => Promise<number[]>;
  inject: (tab: number, files: string[], world: "MAIN" | "ISOLATED") => Promise<unknown>;
};

/**
 * extension-distribution.md §5.4 names `page.js` and `hud.js`. `relay.js` goes back too: a reloaded extension has no
 * relay in the tab either, and without one the tab never reaches the hub again.
 */
export async function reinject(inj: Injector): Promise<void> {
  const tabs = await inj.gameTabs().catch(() => [] as number[]);
  for (const tab of tabs) {
    await inj.inject(tab, ["relay.js"], "ISOLATED").catch(() => {});
    await inj.inject(tab, ["page.js", "hud.js"], "MAIN").catch(() => {});
  }
}
