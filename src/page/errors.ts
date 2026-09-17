export type ConsoleLine = { t: string; level: string; text: string };

/** The page's error record, kept on `globalThis.__coachemonErrors`, where `probe` reads it. */
export type Recorder = {
  /** Epoch ms of the latest uncaught page error or unhandled rejection. */
  at: number | null;
  /** The last 30 page errors and warnings, 300 characters each. */
  lines: ConsoleLine[];
};

/**
 * Start recording the page's uncaught errors, unhandled rejections and console errors and warnings, for `probe`'s
 * `errorAt` and `tail` (§10.1, §12.4). Idempotent: a second call keeps the first recorder. The extension's page script
 * installs it on load; the CDP link does not, because CDP reports the same through its own events. Self-contained.
 */
export function recordErrors(): void {
  const g = globalThis as any;
  if (g.__coachemonErrors) return;
  const rec: Recorder = { at: null, lines: [] };
  const push = (level: string, text: string) => {
    rec.lines.push({ t: new Date().toISOString(), level, text: String(text).slice(0, 300) });
    if (rec.lines.length > 30) rec.lines.shift();
  };
  const describe = (v: any) => {
    try { return v && typeof v.message === "string" ? v.message : String(v); } catch (e) { return "?"; }
  };
  g.addEventListener("error", (e: any) => {
    rec.at = Date.now();
    push("exception", e && typeof e.message === "string" ? e.message : describe(e && e.error));
  });
  g.addEventListener("unhandledrejection", (e: any) => {
    rec.at = Date.now();
    push("rejection", describe(e && e.reason));
  });
  for (const [method, level] of [["error", "error"], ["warn", "warning"]] as const) {
    const original = g.console[method];
    g.console[method] = function (...a: unknown[]) {
      push(level, a.map(describe).join(" "));
      return original.apply(this, a);
    };
  }
  g.__coachemonErrors = rec;
}
