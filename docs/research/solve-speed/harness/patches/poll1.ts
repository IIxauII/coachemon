// The sped-up copy's one patch: `PhaseInterceptor.run` waits for a phase to end polling every 1 ms, not every 50 ms
// (test/framework/phase-interceptor.ts). A phase that ends on a MockClock tick (1 ms) no longer costs a 50 ms poll.
import { PhaseInterceptor } from "#test/framework/phase-interceptor";

(PhaseInterceptor.prototype as any).run = async function (this: any, currentPhase: any): Promise<void> {
  this.state = "running";
  this.logPhase(currentPhase.phaseName);
  currentPhase.start();
  await vi.waitUntil(() => this.state !== "running", { interval: Number(process.env.COACH_POLL_MS ?? 1), timeout: 20_000 });
};
