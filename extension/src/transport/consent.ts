/**
 * Firefox's consent (§8.4). Only the Firefox build ever withholds it, and only on Firefox itself: Orion installs the
 * AMO build and counts as consented, which it is told apart by `runtime.getBrowserInfo()` — an accepted premise, since
 * Orion's answer was never observed (§16).
 *
 * Firefox 140 and later have built-in data consent, detected by a `data_collection` key in `permissions.getAll()`.
 * Firefox 128–139 have none, and Mozilla's guidance is a custom consent experience: the toolbar click is it, with the
 * action's title saying what the click allows, recorded in the extension origin's own `localStorage` — no `storage`
 * permission, and the Firefox build's background is an event page, so it has one.
 */
import type { Target } from "../../../src/protocol/wire.ts";

/** Picked here; the extension origin's own key, never the page's. */
export const CONSENT_KEY = "coachemon-consent";

/** What Firefox 140+ is asked for, and what `contains` is checked against. */
export const DATA_COLLECTION = { data_collection: ["websiteContent"] };

export type ConsentDeps = {
  target: Target;
  /** `runtime.getBrowserInfo?.().name`, or null where the API does not exist. */
  browserName: () => Promise<string | null>;
  permissions: {
    getAll: () => Promise<Record<string, unknown>>;
    contains: (p: unknown) => Promise<boolean>;
    request: (p: unknown) => Promise<boolean>;
  };
  /** `localStorage`, for the 128–139 path. */
  store: { get: (key: string) => string | null; set: (key: string, value: string) => void };
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

  const all = await d.permissions.getAll();
  if (Object.hasOwn(all, "data_collection")) {
    d.onClick(() => void d.permissions.request(DATA_COLLECTION).then(ok => ok && grant()));
    if (await d.permissions.contains(DATA_COLLECTION)) grant();
    return;
  }
  // 128–139: the click itself is the consent experience, and the action's title is what states it (§5.3).
  d.onClick(() => {
    d.store.set(CONSENT_KEY, "true");
    grant();
  });
  if (d.store.get(CONSENT_KEY) === "true") grant();
}
