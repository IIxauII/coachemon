/** Replays a recorded sequence of acting calls and screen reads through a fresh detector. */
import { StuckDetector, type ActingCall, type Assessment, type AssessContext } from "./detector.ts";

export type ReplayStep =
  | { call: ActingCall; transcriptLine: number }
  | { assess: AssessContext; transcriptLine: number };

export type Trip = {
  call: number;
  transcriptLine: number;
  assessment: Exclude<Assessment, { status: "ok" }>;
};

export type ReplayResult = {
  calls: number;
  admitted: number;
  trips: number;
  firstTrip: Trip | null;
  /** Most repeats of any assessed fingerprint in the window, tripped or not. */
  maxRepeats: number;
  /** Where `maxRepeats` was first reached. */
  maxRepeatsAt: { transcriptLine: number; fingerprint: string } | null;
};

export function replay(steps: readonly ReplayStep[]): ReplayResult {
  const detector = new StuckDetector();
  let calls = 0;
  let admitted = 0;
  let trips = 0;
  let maxRepeats = 0;
  let maxRepeatsAt: ReplayResult["maxRepeatsAt"] = null;
  let firstTrip: Trip | null = null;

  for (const step of steps) {
    if ("call" in step) {
      calls++;
      if (step.call.before.settled && step.call.after.settled && !step.call.tutorialActive) admitted++;
      detector.recordActing(step.call);
      continue;
    }
    const repeats = detector.repeatsOf(step.assess.fingerprint);
    if (step.assess.settled && repeats > maxRepeats) {
      maxRepeats = repeats;
      maxRepeatsAt = { transcriptLine: step.transcriptLine, fingerprint: step.assess.fingerprint };
    }
    const assessment = detector.assess(step.assess);
    if (assessment.status === "ok") continue;
    trips++;
    firstTrip ??= { call: calls, transcriptLine: step.transcriptLine, assessment };
  }
  return { calls, admitted, trips, firstTrip, maxRepeats, maxRepeatsAt };
}
