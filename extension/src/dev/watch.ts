/**
 * What the dev loop watches (§5.4). The walking and the building are `extension/scripts/dev.ts`; the two decisions
 * worth pinning are here, because a watcher that rebuilds on its own output never stops rebuilding.
 *
 * Not bundled by anything: no entrypoint imports it, so it never reaches an artifact of either flavour.
 */

/** The four roots of §5.4, relative to the repo root. `extension/` covers the glue, the manifests and the build. */
export const WATCHED = ["skills/coach-pokerogue/scripts/hud", "src/page", "src/protocol", "extension"] as const;

/** A burst of file events — an editor writing, a formatter following it — is one build. */
export const SETTLE_MS = 200;

/** Directories that change because we built, or because npm did; watching them is a loop. */
const IGNORED = new Set([".output", "node_modules", ".wxt", ".git", ".cache"]);

/** What the build actually reads. A path outside it changed nothing a rebuild would pick up. */
const BUILT = /\.(ts|tsx|js|mjs|cjs|json|css|html)$/;

export function interesting(rel: string): boolean {
  const parts = rel.split(/[\\/]/);
  if (parts.some(p => IGNORED.has(p))) return false;
  const name = parts[parts.length - 1] ?? "";
  // A dotfile or an editor's swap file: neither is what the build reads, and both churn.
  if (name === "" || name.startsWith(".") || name.endsWith("~")) return false;
  return BUILT.test(name);
}
