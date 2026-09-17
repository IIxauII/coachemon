/**
 * The in-memory game adapter (#127), for tests only. A test scripts one screen model: its closures hold the state and
 * answer the game operations. The fake brings the rest a Driver needs: a fake clock, a lock and a frame counter.
 *
 * What a screen reacts to is strict: `read`, `menu`, `starterGrid` and every act (`press`, `setCursor`, `modalButton`,
 * `rawKey`) throw `unexpected <op>` when the screen does not script them, failing the test instead of passing it through
 * a fallback. The rest have benign defaults: an advancing frame, an empty snapshot, an attached tab.
 *
 * With `guardFine` the fake checks acts the way the page does (§10.2): an act whose fingerprint is not the screen's
 * current one refuses `moved` without reaching the screen, and a cursor act answers the fingerprint it left.
 */
import type { Clock } from "../driver.ts";
import type { Button } from "../enums/generated.ts";
import type { Reach } from "../hub/ladder.ts";
import type { Act, CursorTarget, Failed, GamePort, MenuRead, PredicateRead, Ready, SnapshotDetail, StarterGrid } from "./port.ts";

/** A predicate read as a screen gives it: the fake stamps the frame. */
export type ScreenRead = Omit<Ready, "frame"> | Extract<PredicateRead, { ready: false }>;

export type FakeScreen = {
  read?: () => ScreenRead;
  menu?: () => MenuRead;
  starterGrid?: () => StarterGrid | Failed;
  /** A press the screen reacts to, given the fingerprint it was sent on; returning nothing means it reached `processInput`. */
  onPress?: (b: Button, fine: string) => Act | void;
  onSetCursor?: (t: CursorTarget, fine: string) => Act & { species?: string };
  onModalButton?: (i: number, fine: string) => Act;
  onRawKey?: (b: Button) => boolean;
  /** Replaces the advancing frame counter: a constant freezes the loop. */
  frame?: () => number | null;
  snapshot?: (d: SnapshotDetail) => Record<string, unknown>;
  /** Another live process holding the driver lock: this fake's claim is refused, as the CDP link's is (§7.5). */
  lockHolder?: number;
  /** The transport's settles pump, so no acting call checks the frame for a frozen loop (§10.3). */
  pumps?: boolean;
  /** Nothing can reach the game: every tool refuses with this rung's line before it reads anything (§12.3). */
  unreachable?: Reach;
  /** Acts refuse `moved` off the screen's current fingerprint, as the page does. */
  guardFine?: boolean;
};

export function fakeGame(screen: FakeScreen) {
  let t = 0;
  let frame = 0;
  let rejection: ((t: number) => void) | null = null;
  const unexpected = (op: string): never => {
    throw new Error(`unexpected ${op}`);
  };
  const current = (): string | null => {
    const r = (screen.read ?? unexpected("read"))();
    return r.ready ? r.fine : null;
  };
  /** The page's check before an act: `null` lets it through. */
  const moved = (fine: string): Act | null => {
    if (!screen.guardFine) return null;
    const now = current();
    return now === fine ? null : { ok: false, why: "moved", threw: false, fine: now ?? "" };
  };

  const game: GamePort = {
    read: async () => {
      const r = (screen.read ?? unexpected("read"))();
      return r.ready ? { ...r, frame: ++frame } : r;
    },
    frame: async () => (screen.frame ? screen.frame() : ++frame),
    menu: async () => (screen.menu ?? unexpected("menu"))(),
    press: async (b, fine) => moved(fine) ?? (screen.onPress ?? unexpected("press"))(b, fine) ?? { ok: true },
    setCursor: async (target, fine) => {
      const refused = moved(fine);
      if (refused) return refused;
      const r = (screen.onSetCursor ?? unexpected("setCursor"))(target, fine);
      return screen.guardFine ? { ...r, fine: current() ?? "" } : r;
    },
    modalButton: async (i, fine) => moved(fine) ?? (screen.onModalButton ?? unexpected("modalButton"))(i, fine),
    starterGrid: async () => (screen.starterGrid ?? unexpected("starterGrid"))(),
    snapshot: async d => ({ ok: true, snapshot: screen.snapshot?.(d) ?? {} }),
    rawKey: async b => (screen.onRawKey ?? unexpected("rawKey"))(b),
    keepAlive: async () => {},
    pumps: screen.pumps ?? false,
    presence: async () => (screen.unreachable ? { reach: screen.unreachable, facts: {} } : { reach: null, facts: { attached: true } }),
    claim: async () =>
      screen.lockHolder === undefined
        ? { ok: true }
        : { ok: false, code: "tab_contended", message: `Another driver (pid ${screen.lockHolder}) holds the tab. Nothing was pressed.`, detail: { holder: screen.lockHolder } },
    screenshot: async () => "",
    tail: async () => [],
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
    now: () => t,
    /** Fire the page's unhandled rejection at `at`. */
    reject: (at: number) => rejection?.(at),
  };
}
