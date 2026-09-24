/**
 * Firefox's consent (§8.4). Only the Firefox build ever withholds it, and only on Firefox itself: Orion installs the
 * AMO build and counts as consented, which it is told apart by `runtime.getBrowserInfo()` — an accepted premise, since
 * Orion's answer was never observed (§16).
 *
 * The manifest floor is Firefox 142 (§5.3), so every version that can install this build has built-in data consent:
 * the toolbar click requests `data_collection` and `permissions.contains` is the state. Nothing is stored, and nothing
 * is detected first — the floor retired the 128–139 versions that needed a consent click of their own (#380).
 */
import type { Target } from "../../../src/protocol/wire.ts";

/** What Firefox is asked for, and what `contains` is checked against. */
export const DATA_COLLECTION = { data_collection: ["websiteContent"] };

export type ConsentDeps = {
  target: Target;
  /** `runtime.getBrowserInfo?.().name`, or null where the API does not exist. */
  browserName: () => Promise<string | null>;
  permissions: {
    contains: (p: unknown) => Promise<boolean>;
    request: (p: unknown) => Promise<boolean>;
  };
  /** `action.onClicked`. */
  onClick: (fn: () => void) => void;
};

/**
 * Works out whether this browser has consent and arranges for the click that grants it, calling `grant` once it does —
 * now, or whenever the player clicks. Every target but Firefox grants immediately.
 */
export async function startConsent(d: ConsentDeps, grant: () => void): Promise<void> {
  if (d.target !== "firefox") return grant();
  const name = await d.browserName();
  // Anything that is not Firefox running the AMO build — Orion — counts as consented (§8.4).
  if (name !== "Firefox") return grant();

  // The click is the consent experience, and the action's title is what states what it allows (§5.3).
  d.onClick(() => void d.permissions.request(DATA_COLLECTION).then(ok => ok && grant()));
  if (await d.permissions.contains(DATA_COLLECTION)) grant();
}
