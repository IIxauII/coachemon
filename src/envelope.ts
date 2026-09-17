/**
 * The result envelope (#7 §3, #14): every tool result carries a status and the
 * `{wave, screen}` header; anything but `ok` carries a fixed diagnostic.
 * Which status a call returns, and the precedence between them, is
 * `call-outcome.ts`'s to decide (#126).
 */
import type { StuckReport } from "./stuck/detector.ts";

export type Status = "ok" | "timed_out" | "stuck" | "run_over" | "run_interrupted";

export type Diagnostic = {
  reason: string;
  mode: { int: number | null; name: string | null };
  phase_name: string | null;
  fingerprint: string | null;
  elapsed_ms: number;
  /** Time since the fingerprint last changed; not the same as `elapsed_ms`. */
  stall_ms?: number;
  /** Whether the press landed at all — the bit #6's timeouts were missing. */
  fp_moved?: boolean | null;
  mode_from_dom?: string | null;
  resume_count?: number;
  cumulative_stall_ms?: number;
  beyond_observed?: boolean;
  loop_frozen?: boolean;
  cause?: string;
  stuck?: StuckReport;
  hang?: { heldMs: number; corroborated: boolean };
};

export type Header = { status: Status; wave: number | null; screen: string; diagnostic?: Diagnostic };

/**
 * Thrown by a tool to refuse: nothing was sent to the game, or (`start_run`) the screen was not the one the next step
 * needs. Becomes an MCP error result carrying the live screen. Running out of call budget is never a refusal: that is
 * a `timed_out` result, a `start_run` stopped mid-setup included.
 */
export class Refusal extends Error {
  code: string;
  detail: Record<string, unknown>;
  constructor(code: string, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}
