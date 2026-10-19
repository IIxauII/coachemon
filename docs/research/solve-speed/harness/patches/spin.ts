// A faster patch than poll1.ts: `PhaseInterceptor.to` and `.run` (test/framework/phase-interceptor.ts) check again on
// the next turn of the event loop instead of on a timer, so a phase that ends synchronously costs no timer at all.
// COACH_CLOCK=1 also ticks the scene's MockClock on every check, so a phase waiting on a 1 ms delayed call need not
// wait for the clock's own 1 ms interval.
import { PhaseInterceptor } from "#test/framework/phase-interceptor";

const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
const tickClock = process.env.COACH_CLOCK === "1";
const LIMIT_MS = 20_000;

(PhaseInterceptor.prototype as any).run = async function (this: any, currentPhase: any): Promise<void> {
  this.state = "running";
  this.logPhase(currentPhase.phaseName);
  currentPhase.start();
  const deadline = Date.now() + LIMIT_MS;
  while (this.state === "running") {
    if (Date.now() > deadline) throw new Error("Timed out in waitUntil!");
    if (tickClock) {
      const clock = this.scene.time;
      clock.preUpdate(clock.systems.game.loop.time, 1);
      clock.update(clock.systems.game.loop.time, 1);
    }
    await nextTurn();
  }
};

(PhaseInterceptor.prototype as any).to = async function (this: any, target: string, runTarget = true): Promise<void> {
  this.target = target;
  const pm = this.scene.phaseManager;
  let currentPhase = pm.getCurrentPhase();
  const deadline = Date.now() + LIMIT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error("Timed out in waitUntil!");
    // A timer of the caller's may retarget it, as the harness's game-over watch does: give timers their turn first.
    await nextTurn();
    if (this.state === "interrupted") continue;
    currentPhase = pm.getCurrentPhase();
    if (currentPhase.is(this.target)) break;
    // The harness's game-over watch is a 1 ms interval: a turn of the event loop is not sure to run it.
    if (currentPhase.is("GameOverPhase")) {
      await new Promise(resolve => setTimeout(resolve, 5));
      continue;
    }
    await this.run(currentPhase);
  }
  if (!runTarget) return;
  await this.run(currentPhase);
};
