// What vitest's own fake timers (vi.useFakeTimers, @sinonjs/fake-timers bundled in vitest 4.1.11) do with the timer forms
// the test framework uses. Copy into the clone's test/tests/ as <name>.test.ts and run
// `PROBE_OUT=<file> npx pnpm@<pin> exec vitest run test/tests/<name>.test.ts`. Output: runs/profile/vitest-timers-probe.txt.
import { describe, it, vi } from "vitest";
import * as timers from "node:timers";
import { writeFileSync } from "node:fs";

describe("probe", () => {
  it("fake timers", async () => {
    const out: string[] = [];
    out.push(`setTimeout is node's: ${globalThis.setTimeout === timers.setTimeout}`);
    out.push(`setTimeout src: ${String(globalThis.setTimeout).slice(0, 80)}`);
    out.push(`window.setTimeout same: ${(globalThis as any).window?.setTimeout === globalThis.setTimeout}`);
    out.push(`rAF: ${typeof (globalThis as any).requestAnimationFrame}`);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const clock = (globalThis.setTimeout as any).clock;
    out.push(`clock on setTimeout: ${clock !== undefined}`);
    const fired: string[] = [];
    const a = setInterval(() => fired.push(`A@${clock.now}`), 1);
    const b = setInterval(() => fired.push(`B@${clock.now}`));
    const c = setInterval(() => fired.push(`C@${clock.now}`), 0);
    setTimeout(() => fired.push(`T0@${clock.now}`), 0);
    setTimeout(() => fired.push(`T1@${clock.now}`), 1);
    const start = clock.now;
    for (let i = 0; i < 12; i++) clock.next();
    out.push(`fired from ${start}: ${fired.map(f => f.replace(String(start), "0")).join(" ")}`);
    out.push(`timers: ${JSON.stringify(Object.values(clock.timers).map((t: any) => ({ id: t.id, callAt: t.callAt - start, interval: t.interval })))}`);
    out.push(`now: ${clock.now - start}`);
    out.push(`Date faked: ${Date.now() - clock.now}`);
    clearInterval(a);
    clearInterval(b);
    clearInterval(c);
    vi.useRealTimers();
    writeFileSync(process.env.PROBE_OUT as string, out.join("\n"));
  });
});
