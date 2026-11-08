/** `keyprobe.js`, the key probe's MAIN-world box (#1018). Throwaway: it lives only on `prototype/1010-keyboard-probe`. */
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { startKeyProbePanel } from "../src/keyprobe/panel.ts";

export default defineUnlistedScript(() => {
  startKeyProbePanel({ build: COACHEMON_BUILD, target: COACHEMON_TARGET });
});
