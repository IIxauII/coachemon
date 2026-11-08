/**
 * The probe's `manifest.commands`, one per chord, from §6.1 of the routes note on `research/keyboard-routes`.
 *
 * Chrome refuses a manifest with more than four `mac` suggested keys, or any `MacCtrl+Alt` / `Command+Alt` entry, as a
 * hard error. Orion reads commands only from the Chrome-flavoured build. So that build suggests four keys, one per
 * single modifier plus ⌘⇧, and declares the rest with no key, for the owner to bind by hand on the browser's own
 * shortcuts page. The Firefox build suggests every chord it accepts.
 *
 * - `suggested`: declared with `suggested_key.mac`.
 * - `unbound`: declared with no `suggested_key`, to bind by hand.
 * - `absent`: not declared on that build.
 *
 * Descriptions go into the manifest, which the store guard substring-matches: no word from `BANNED_MANIFEST_WORDS`.
 */
import type { Target } from "../../../src/protocol/wire.ts";

export type Declared = "suggested" | "unbound" | "absent";

export type ProbeCommand = {
  name: string;
  /** In `manifest.commands` syntax. */
  mac: string;
  /** How the owner reads it. */
  chord: string;
  chrome: Declared;
  firefox: Declared;
};

export const PROBE_COMMANDS: readonly ProbeCommand[] = [
  { name: "probe-opt-k", mac: "Alt+K", chord: "⌥K", chrome: "suggested", firefox: "suggested" },
  { name: "probe-ctrl-k", mac: "MacCtrl+K", chord: "⌃K", chrome: "suggested", firefox: "suggested" },
  // ⌘K is Firefox's web search, so Firefox can only list it unbound.
  { name: "probe-cmd-k", mac: "Command+K", chord: "⌘K", chrome: "suggested", firefox: "unbound" },
  { name: "probe-cmd-shift-k", mac: "Command+Shift+K", chord: "⇧⌘K", chrome: "suggested", firefox: "suggested" },
  { name: "probe-ctrl-shift-k", mac: "MacCtrl+Shift+K", chord: "⌃⇧K", chrome: "unbound", firefox: "suggested" },
  { name: "probe-opt-shift-k", mac: "Alt+Shift+K", chord: "⌥⇧K", chrome: "unbound", firefox: "suggested" },
  { name: "probe-cmd-ctrl-k", mac: "Command+MacCtrl+K", chord: "⌃⌘K", chrome: "unbound", firefox: "suggested" },
  // Fails the whole Chrome manifest, so the Chrome-flavoured build never carries it.
  { name: "probe-ctrl-opt-k", mac: "MacCtrl+Alt+K", chord: "⌃⌥K", chrome: "absent", firefox: "suggested" },
  { name: "probe-opt-j", mac: "Alt+J", chord: "⌥J", chrome: "unbound", firefox: "suggested" },
  { name: "probe-ctrl-j", mac: "MacCtrl+J", chord: "⌃J", chrome: "unbound", firefox: "suggested" },
  // ⌥U is a dead key on the US layout: the note's probe 4 expects Firefox never to fire it.
  { name: "probe-opt-u", mac: "Alt+U", chord: "⌥U", chrome: "unbound", firefox: "suggested" },
  // Chrome only. Bound by hand at chrome://extensions/shortcuts with the scope set to Global: as a suggested key it
  // would be a fifth.
  { name: "probe-global", mac: "Command+Shift+1", chord: "⇧⌘1", chrome: "unbound", firefox: "absent" },
  // A click on the toolbar button. The Chrome-flavoured build gains an `action` for it.
  { name: "_execute_action", mac: "Command+Shift+U", chord: "⇧⌘U", chrome: "unbound", firefox: "suggested" },
];

/** The command `commands.update()` is tried on, and the chord it is moved to. */
export const UPDATE_TRY = { name: "probe-opt-j", shortcut: "Alt+L", chord: "⌥L" } as const;

export function commandsFor(target: Target): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of PROBE_COMMANDS) {
    const declared = target === "firefox" ? c.firefox : c.chrome;
    if (declared === "absent") continue;
    const description = `Key probe: ${c.chord} (${c.mac})`;
    out[c.name] = declared === "suggested" ? { suggested_key: { mac: c.mac }, description } : { description };
  }
  return out;
}
