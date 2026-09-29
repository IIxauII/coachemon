export type ConsoleLine = { t: string; level: string; text: string };

/** The page's error record, kept on `globalThis.__coachemonErrors`, where `probe` reads it. */
export type Recorder = {
  /** Epoch ms of the latest uncaught page error or unhandled rejection. */
  at: number | null;
  lines: ConsoleLine[];
};

/**
 * For `probe`'s `errorAt` and `tail` (extension-distribution.md §12.4). Nothing outside its tests calls it: the
 * extension's page script never installs it, so under the hub link both read empty. The CDP link reads the same
 * through CDP's own events.
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
