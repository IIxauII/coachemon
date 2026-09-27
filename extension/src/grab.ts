/**
 * The background half of a **grab**: the hop from the browser's own shortcut into one tab's relay.
 *
 * It sends **blind** — to whatever tab the shortcut handler hands over, with no tab query and none of the **reach**
 * ladder's refusals. Nothing here touches the transport, so a grab never reaches the **hub**.
 */
import type { ToRelay } from "./messages.ts";

export type GrabDeps = {
  /**
   * `browser.commands.onCommand`, which hands over the focused tab. *Command* is the browser's word for a manifest
   * shortcut here and never ours. One shortcut is declared and nothing reserved, so there is no name to filter on: a
   * fire is the player's press.
   */
  onCommand: (fn: (tab: number | undefined) => void) => void;
  /** `tabs.sendMessage`. */
  toTab: (tab: number, message: ToRelay) => void;
};

/**
 * Not `async`, and nothing is awaited on the way to `onCommand`: Chrome's service worker restarts on every event and
 * wakes only for listeners it found in the first turn, so a registration behind an await is a shortcut that never fires.
 */
export function startGrab(d: GrabDeps): void {
  d.onCommand(tab => {
    // No tab is no relay to hand the keyboard to. Silent, like every other refusal a grab can meet.
    if (tab == null) return;
    d.toTab(tab, { t: "grab" });
  });
}
