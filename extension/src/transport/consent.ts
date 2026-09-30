/**
 * Nothing is stored: `permissions.contains` is the consent state (extension-distribution.md §8.4). Orion runs the same
 * AMO build and counts as consented, an accepted premise (§16).
 */
import type { Target } from "../../../src/protocol/wire.ts";

export const DATA_COLLECTION = { data_collection: ["websiteContent"] };

export type ConsentDeps = {
  target: Target;
  /** `null` where `runtime.getBrowserInfo` does not exist. */
  browserName: () => Promise<string | null>;
  permissions: {
    contains: (p: unknown) => Promise<boolean>;
    request: (p: unknown) => Promise<boolean>;
  };
  onClick: (fn: () => void) => void;
};

export async function startConsent(d: ConsentDeps, grant: () => void): Promise<void> {
  if (d.target !== "firefox") return grant();
  const name = await d.browserName();
  if (name !== "Firefox") return grant();

  d.onClick(() => void d.permissions.request(DATA_COLLECTION).then(ok => ok && grant()));
  if (await d.permissions.contains(DATA_COLLECTION)) grant();
}
