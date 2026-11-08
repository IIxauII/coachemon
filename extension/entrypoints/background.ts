/**
 * The key probe's background (#1018). Unlike the product's, it never dials the hub: no Claude session can drive a
 * probe tab, and nothing leaves the browser.
 */
import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { note, startKeyProbe } from "../src/keyprobe/background.ts";
import { startConsent } from "../src/transport/consent.ts";

export default defineBackground(() => {
  startKeyProbe();

  // Kept so a toolbar click (or `_execute_action`) on Firefox still raises the data-consent prompt it raises in the
  // product: the routes note's probe 9 asks whether it does.
  void startConsent(
    {
      target: COACHEMON_TARGET,
      browserName: async () => {
        const runtime = browser.runtime as { getBrowserInfo?: () => Promise<{ name: string }> };
        const info = await runtime.getBrowserInfo?.();
        return info?.name ?? null;
      },
      permissions: {
        contains: p => browser.permissions.contains(p as never),
        request: p => browser.permissions.request(p as never),
      },
      onClick: fn => browser.action.onClicked.addListener(fn),
    },
    () => note("data consent counts as given (nothing is sent: the probe has no hub link)"),
  );
});
