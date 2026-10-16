/**
 * CDP's driver grant (CONTEXT.md, `Driver`): a pidfile whose dead holder is taken over. Advisory — it keeps the dev's own
 * parallel sessions from interleaving presses on one save (#6), not a hostile process.
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Contention = { contended: boolean; holder: number | null };

const FREE: Contention = { contended: false, holder: null };

export type DriverLock = {
  /** Who holds the tab, without taking it: a reading call never becomes the driver. */
  contention(): Contention;
  /** Become the driver unless a live one already is. After the first take this only re-checks. */
  take(): Contention;
};

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function holder(file: string): Contention {
  try {
    const { pid } = JSON.parse(readFileSync(file, "utf8")) as { pid: number };
    if (pid === process.pid || !alive(pid)) return FREE;
    return { contended: true, holder: pid };
  } catch {
    return FREE;
  }
}

/** Drop the file on the way out, but only while it is still ours: a driver that took over after us keeps it. */
function armRelease(file: string): void {
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
}

export function driverLock(home: string): DriverLock {
  const file = path.join(home, "driver.lock");
  let held = false;
  return {
    /** Re-read every time: the holder may have exited, or another appeared, since the last look. */
    contention: () => holder(file),
    take() {
      const c = holder(file);
      if (held || c.contended) return c;
      mkdirSync(home, { recursive: true });
      writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      held = true;
      armRelease(file);
      return FREE;
    },
  };
}
