/** extension-distribution.md §5.4's roots, relative to the repo root. */
export const WATCHED = ["skills/coachemon/scripts/hud", "src/page", "src/protocol", "extension"] as const;

export const SETTLE_MS = 200;

/** Directories that change because we built, or because npm did: a watcher that rebuilds on them never stops. */
const IGNORED = new Set([".output", "node_modules", ".wxt", ".git", ".cache"]);

const BUILT = /\.(ts|tsx|js|mjs|cjs|json|css|html)$/;

export function interesting(rel: string): boolean {
  const parts = rel.split(/[\\/]/);
  if (parts.some(p => IGNORED.has(p))) return false;
  const name = parts[parts.length - 1] ?? "";
  // A dotfile or an editor's swap file: both churn.
  if (name === "" || name.startsWith(".") || name.endsWith("~")) return false;
  return BUILT.test(name);
}
