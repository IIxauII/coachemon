/**
 * The in-memory game adapter (#127), for tests only. A test scripts one screen model: its closures hold the state and
 * answer the game operations. The fake brings the rest a Driver needs: a fake clock, a lock and a frame counter.
 *
 * What a screen reacts to is strict: `read`, `menu`, `starterGrid` and every act (`press`, `setCursor`, `modalButton`,
 * `rawKey`) throw `unexpected <op>` when the screen does not script them, failing the test instead of passing it through
 * a fallback. The rest have benign defaults: an advancing frame, an empty snapshot, an attached tab.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Lock } from "../cdp/lock.ts";
import type { Clock } from "../driver.ts";
import type { Button } from "../enums/generated.ts";
import type { Act, CursorTarget, Failed, GamePort, MenuRead, PredicateRead, Ready, SnapshotDetail, StarterGrid } from "./port.ts";

/** A predicate read as a screen gives it: the fake stamps the frame. */
export type ScreenRead = Omit<Ready, "frame"> | Extract<PredicateRead, { ready: false }>;

export type FakeScreen = {
  read?: () => ScreenRead;
  menu?: () => MenuRead;
  starterGrid?: () => StarterGrid | Failed;
  /** A press the screen reacts to; returning nothing means it reached `processInput`. */
  onPress?: (b: Button) => Act | void;
  onSetCursor?: (t: CursorTarget) => Act & { species?: string };
  onModalButton?: (i: number) => Act;
  onRawKey?: (b: Button) => boolean;
  /** Replaces the advancing frame counter: a constant freezes the loop. */
  frame?: () => number | null;
  snapshot?: (d: SnapshotDetail) => Record<string, unknown>;
  /** Another live process holding the driver lock. */
  lockHolder?: number;
};

export function fakeGame(screen: FakeScreen) {
  let t = 0;
  let frame = 0;
  let rejection: ((t: number) => void) | null = null;
  const unexpected = (op: string): never => {
    throw new Error(`unexpected ${op}`);
  };

  const game: GamePort = {
    read: async () => {
      const r = (screen.read ?? unexpected("read"))();
      return r.ready ? { ...r, frame: ++frame } : r;
    },
    frame: async () => (screen.frame ? screen.frame() : ++frame),
    menu: async () => (screen.menu ?? unexpected("menu"))(),
    press: async b => (screen.onPress ?? unexpected("press"))(b) ?? { ok: true },
    setCursor: async target => (screen.onSetCursor ?? unexpected("setCursor"))(target),
    modalButton: async i => (screen.onModalButton ?? unexpected("modalButton"))(i),
    starterGrid: async () => (screen.starterGrid ?? unexpected("starterGrid"))(),
    snapshot: async d => ({ ok: true, snapshot: screen.snapshot?.(d) ?? {} }),
    rawKey: async b => (screen.onRawKey ?? unexpected("rawKey"))(b),
    keepAlive: async () => {},
    attach: async () => ({ attached: true, launchedChrome: false }),
    screenshot: async () => "",
    consoleTail: () => [],
    onRejection: cb => {
      rejection = cb;
    },
  };

  const clock: Clock = {
    now: () => t,
    sleep: async ms => {
      t += ms;
    },
  };

  return {
    game,
    clock,
    lock: screen.lockHolder === undefined ? { path: "/nonexistent/driver.lock", contended: false, holder: null } : heldLock(screen.lockHolder),
    now: () => t,
    /** Fire the page's unhandled rejection at `at`. */
    reject: (at: number) => rejection?.(at),
  };
}

/** A lock file naming `pid` as the holder, removed when the test process exits. */
function heldLock(pid: number): Lock {
  const dir = mkdtempSync(path.join(tmpdir(), "pokerogue-mcp-lock-"));
  const file = path.join(dir, "driver.lock");
  writeFileSync(file, JSON.stringify({ pid }));
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  return { path: file, contended: false, holder: null };
}
