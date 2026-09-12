/**
 * Replays the stuck detector against the #6 prototype's transcripts
 * (`prototype/one-wave:.scratch/prototype-one-wave/run*.jsonl`).
 *
 *   node scripts/stuck-replay.ts [--emit <dir>] <run.jsonl>...
 *
 * The prototype has no tool calls, so each policy iteration (one `screen`
 * event, its presses, the settles that follow) stands in for one acting call.
 * Cursor-walk presses are folded into the call they serve. `MESSAGE(0)`
 * iterations are folded into the call before them, because v1 auto-advances
 * that screen inside the acting call (spec §6.8); `--no-fold` keeps them as
 * decisions, which is the harsher test of the threshold's headroom.
 *
 * `--emit <dir>` writes each run's calls as `<run>.calls.json`, the fixture the
 * replay test reads, so the test does not depend on the prototype branch.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { PINNED_GAME_VERSION } from "../src/escape-ladder/lookup.ts";
import type { ActingCall, AssessContext, Choice } from "../src/stuck/detector.ts";
import { replay, type ReplayStep } from "../src/stuck/replay.ts";

type Event = Record<string, any>;

const PARTY_UI_MODES = [
  "SWITCH", "FAINT_SWITCH", "POST_BATTLE_SWITCH", "REVIVAL_BLESSING", "MODIFIER", "MOVE_MODIFIER", "TM_MODIFIER",
  "REMEMBER_MOVE_MODIFIER", "MODIFIER_TRANSFER", "SPLICE", "RELEASE", "CHECK", "SELECT",
];
/** The prototype hardcoded the shop's row-0 buttons (#7 flags this as a bug); only used to name its "first reward". */
const SHOP_ROW_0 = new Set(["Reroll", "Manage Items", "Check Team", "Lock Rarities", "Transfer"]);

const stripBBCode = (s: string) => s.replace(/\[\/?[^\]]*\]/g, "").trim();

function compositeScreen(screen: Event, finalPress: Event | undefined): string {
  if (screen.name !== "PARTY") return screen.name;
  const why: string = finalPress?.why ?? "";
  const fromWhy = /partyUiMode (\d+)/.exec(why)?.[1];
  const pum = screen.extra?.partyUiMode ?? (fromWhy === undefined ? undefined : Number(fromWhy));
  const disc = pum !== undefined ? PARTY_UI_MODES[pum] : screen.phase === "SelectModifierPhase" ? "MODIFIER" : undefined;
  const options = screen.extra?.optionsMode ?? /^party:option/.test(why);
  return `PARTY${disc ? `/${disc}` : ""}${options ? ":options" : ""}`;
}

function choiceOf(screen: Event, press: Event): Choice {
  const why: string = press.why ?? "";
  const options: string[] = (screen.options ?? []).map((o: string | null) => stripBBCode(o ?? ""));
  const quoted = /"(.*)"/.exec(why)?.[1];
  if (why.startsWith("party:option") && quoted !== undefined) return { kind: "option", label: stripBBCode(quoted) };
  const move = /^fight:move\[\d+\] (.+?) \(power/.exec(why)?.[1];
  if (move) return { kind: "option", label: move };
  const slot = /slot (-?\d+)/.exec(why)?.[1];
  if (why.startsWith("party:must-answer") && slot !== undefined) return { kind: "option", label: options[Math.max(0, Number(slot))] };
  if (why === "shop:first-free-reward") {
    return { kind: "option", label: options.find(o => !SHOP_ROW_0.has(o)) ?? "?" };
  }
  if (why === "command:fight") return { kind: "option", label: "Fight" };
  if (why === "confirm:No") return { kind: "option", label: "No" };
  if (why === "confirm:Yes") return { kind: "option", label: "Yes" };
  if (why === "title:continue") return { kind: "option", label: "Continue" };
  if (why === "option-select:first") return { kind: "option", label: options[0] };
  return { kind: "button", button: press.btn };
}

function toSteps(events: Event[], fold: boolean, clock: boolean): ReplayStep[] {
  const steps: ReplayStep[] = [];
  let state = { fingerprint: "", settled: true };
  let open: { call: ActingCall; screen: Event } | null = null;

  const close = () => {
    // A screen the prototype read but never pressed on (it stopped there) is not a call.
    if (!open || (open.call.choice.kind === "button" && open.call.choice.button === "?")) return;
    open.call.after = { ...state };
    steps.push({ call: open.call, transcriptLine: open.screen.line });
    open = null;
  };

  // The prototype's `fp` is #13's five fields; the battle clock is appended from the same predicate read.
  const fingerprint = (s: Event) => (clock ? `${s.fp}|${s.wave ?? ""}|${s.turn ?? ""}` : s.fp);

  for (const e of events) {
    if (e.kind === "settled") state = { fingerprint: fingerprint(e.state), settled: true };
    else if (e.kind === "settle-timeout") state = { fingerprint: fingerprint(e.r), settled: false };
    else if (e.kind === "screen") {
      const auto = fold && e.mode === 0 && !e.tutorialActive;
      if (auto && open) continue;
      close();
      const now: AssessContext = {
        screen: compositeScreen(e, undefined),
        fingerprint: state.fingerprint,
        settled: state.settled,
        liveVersion: PINNED_GAME_VERSION,
        tutorialActive: !!e.tutorialActive,
        options: e.options?.length ? e.options.map((o: string | null) => stripBBCode(o ?? "")) : null,
      };
      steps.push({ assess: now, transcriptLine: e.line });
      open = {
        screen: e,
        call: {
          screen: now.screen,
          before: { ...state },
          after: { ...state },
          choice: { kind: "button", button: "?" },
          tutorialActive: !!e.tutorialActive,
        },
      };
    } else if (e.kind === "press" && open && !String(e.why).startsWith("nav ")) {
      if (open.screen.mode === 0 && fold && open.call.choice.kind !== "button") continue;
      if (open.call.choice.kind === "button" && open.call.choice.button === "?") {
        open.call.choice = choiceOf(open.screen, e);
        open.call.screen = compositeScreen(open.screen, e);
        const assess = steps.at(-1);
        if (assess && "assess" in assess) assess.assess.screen = open.call.screen;
      }
    }
  }
  close();
  return steps;
}

const args = process.argv.slice(2);
const emitAt = args.indexOf("--emit");
const emitDir = emitAt === -1 ? null : args.splice(emitAt, 2)[1];
const fold = !args.includes("--no-fold");
const clock = !args.includes("--no-clock");
const files = args.filter(a => !a.startsWith("--"));

for (const file of files) {
  const events = readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line, i) => ({ ...JSON.parse(line), line: i + 1 }));
  const steps = toSteps(events, fold, clock);
  const result = replay(steps);
  const name = basename(file, ".jsonl");

  console.log(
    `${name}: ${result.calls} calls, ${result.admitted} admitted, stop=${events.at(-1)?.stop}, ` +
      `first trip ${result.firstTrip ? `at ${name}.jsonl:${result.firstTrip.transcriptLine} (call ${result.firstTrip.call})` : "none"}`,
  );
  if (result.firstTrip) {
    const { assessment } = result.firstTrip;
    const s = assessment.stuck;
    const next = s.ladder.next === null ? null : s.ladder.rungs[s.ladder.next].rung;
    console.log(`  ${assessment.status} ${s.verdict} on ${s.screen} ×${s.repeats}`);
    if (s.cycle) {
      for (const m of s.cycle) {
        const r = m.ladder.next === null ? null : m.ladder.rungs[m.ladder.next].rung;
        console.log(`    cycle: ${m.screen} → next rung ${r ? JSON.stringify(r) : "none"}`);
      }
    }
    console.log(`  tried ${JSON.stringify(s.tried)} untried ${JSON.stringify(s.untried)}`);
    console.log(`  next rung ${next ? JSON.stringify(next) : "none"}`);
  }
  const peak = result.maxRepeatsAt;
  console.log(
    `  maxRepeats=${result.maxRepeats}${peak ? ` at ${name}.jsonl:${peak.transcriptLine} ${JSON.stringify(peak.fingerprint)}` : ""} trips=${result.trips}`,
  );

  if (emitDir) {
    mkdirSync(emitDir, { recursive: true });
    writeFileSync(join(emitDir, `${name}.calls.json`), JSON.stringify(steps) + "\n");
  }
}
