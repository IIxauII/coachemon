// A tracer, spliced in beside another patch or alone (mode.ts), for comparing how two runs played the same job. Each
// line of COACH_TRACE_OUT is one event, in the order the game saw it:
//   R               a reload: the start of one child's turn (the first is the worker's own load)
//   P <phase>       the interceptor started a phase
//   S <from>><to>   the interceptor's state changed
//   G <target>      the interceptor's target changed (the harness's game-over watch retargets it)
//   M <mode>        the UI mode changed
//   Q <phase>/<mode> the prompt handler ran a queued prompt
//   I <button>/<mode> an input reached the UI (the harness's learn watch and the prompts press through it)
//   D <site>        a delayed call on the scene's clock fired; <site> is where the game scheduled it
// Every line ends with `@<n>`: how many times the scene's clock had ticked by then. Ticks are timing, not events.
import { appendFileSync as traceAppend } from "node:fs";
import { UiMode as TrUiMode } from "#enums/ui-mode";
import { PhaseInterceptor as TrInterceptor } from "#test/framework/phase-interceptor";
import { PromptHandler as TrPromptHandler } from "#test/helpers/prompt-handler";
import { ReloadHelper as TrReload } from "#test/helpers/reload-helper";
import { MockClock as TrMockClock } from "#test/mocks/mock-clock";
import { UI as TrUI } from "#ui/ui";

const traceFile = process.env.COACH_TRACE_OUT;
let traceBuf: string[] = [];
let ticks = 0;
const ev = (s: string) => {
  if (!traceFile) return;
  traceBuf.push(`${s} @${ticks}`);
  if (traceBuf.length > 2000) flushTrace();
};
const flushTrace = () => {
  if (!traceFile || traceBuf.length === 0) return;
  traceAppend(traceFile, `${traceBuf.join("\n")}\n`);
  traceBuf = [];
};
const mode = (m: number) => TrUiMode[m] ?? String(m);

{
  const update = TrMockClock.prototype.update;
  TrMockClock.prototype.update = function (this: any, ...args: any[]) {
    ticks++;
    return update.apply(this, args as any);
  };
  const addEvent = TrMockClock.prototype.addEvent;
  TrMockClock.prototype.addEvent = function (this: any, config: any) {
    if (traceFile && config && typeof config.callback === "function") {
      const frame =
        (new Error().stack ?? "")
          .split("\n")
          .slice(2)
          .find(l => l.includes("/src/") && !l.includes("mock-clock")) ?? "?";
      const site = (/\/src\/([^?)]*)/.exec(frame)?.[1] ?? frame.trim()).replace(/\?.*$/, "");
      const callback = config.callback;
      config = { ...config, callback: function (this: any, ...a: any[]) {
        ev(`D ${site}`);
        return callback.apply(this, a);
      } };
    }
    return addEvent.call(this, config);
  };
  const reload = TrReload.prototype.reloadSession;
  TrReload.prototype.reloadSession = function (this: any) {
    flushTrace();
    ev("R");
    return reload.call(this);
  };
  const proto = TrInterceptor.prototype as any;
  const logPhase = proto.logPhase;
  proto.logPhase = function (this: any, name: string) {
    if (!this.__traced) {
      this.__traced = true;
      let state = this.state;
      let target = this.target;
      Object.defineProperty(this, "state", {
        get: () => state,
        set: v => {
          if (v !== state) ev(`S ${state}>${v}`);
          state = v;
        },
      });
      Object.defineProperty(this, "target", {
        get: () => target,
        set: v => {
          if (v !== target) ev(`G ${v}`);
          target = v;
        },
      });
    }
    ev(`P ${name}`);
    return logPhase.call(this, name);
  };
  const ph = TrPromptHandler.prototype as any;
  const setMode = ph.setMode;
  ph.setMode = function (this: any, args: any[]) {
    ev(`M ${mode(args[0])}`);
    return setMode.call(this, args);
  };
  const check = ph.doPromptCheck;
  ph.doPromptCheck = function (this: any) {
    const before = this.prompts.length;
    const first = this.prompts[0];
    const r = check.call(this);
    if (this.prompts.length < before && first) ev(`Q ${first.phaseTarget}/${mode(first.mode)}`);
    return r;
  };
  const input = (TrUI.prototype as any).processInput;
  (TrUI.prototype as any).processInput = function (this: any, button: number) {
    ev(`I ${button}/${mode(this.mode)}`);
    return input.call(this, button);
  };
  process.on("exit", flushTrace);
}
