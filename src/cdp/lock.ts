/**
 * One driver per tab. #6 had three sessions interleaving presses on one live
 * save; this lock makes the second one say so instead of pressing.
 *
 * The lock is a JSON file carrying the holder's pid. A live pid other than our
 * own means contended; a dead pid is taken over. It is advisory: it protects
 * the dev from their own parallel sessions, not from a hostile process.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Lock = { path: string; contended: boolean; holder: number | null };

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(home: string): Lock {
  mkdirSync(home, { recursive: true });
  const file = path.join(home, "driver.lock");
  if (existsSync(file)) {
    try {
      const { pid } = JSON.parse(readFileSync(file, "utf8")) as { pid: number };
      if (pid !== process.pid && alive(pid)) return { path: file, contended: true, holder: pid };
    } catch {
      // unreadable lock: take it over
    }
  }
  writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const release = () => {
    try {
      const { pid } = JSON.parse(readFileSync(file, "utf8")) as { pid: number };
      if (pid === process.pid) unlinkSync(file);
    } catch {
      // nothing to release
    }
  };
  process.once("exit", release);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(sig, () => {
      release();
      process.exit(0);
    });
  }
  return { path: file, contended: false, holder: null };
}

/** Re-check on every acting call: the holder may have exited since startup, or a second driver may have appeared. */
export function lockContended(lock: Lock): { contended: boolean; holder: number | null } {
  try {
    const { pid } = JSON.parse(readFileSync(lock.path, "utf8")) as { pid: number };
    if (pid === process.pid) return { contended: false, holder: null };
    return alive(pid) ? { contended: true, holder: pid } : { contended: false, holder: null };
  } catch {
    return { contended: false, holder: null };
  }
}
