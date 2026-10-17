import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { appendFileSync } from "node:fs";
import { z } from "zod";
import { Button } from "./enums/generated.ts";
import { Refusal } from "./envelope.ts";
import type { CallContext, Driver } from "./driver.ts";

type Extra = {
  signal: AbortSignal;
  _meta?: { progressToken?: string | number };
  sendNotification: (n: { method: "notifications/progress"; params: { progressToken: string | number; progress: number; message?: string } }) => Promise<void>;
};

function context(extra: Extra): CallContext {
  const token = extra._meta?.progressToken;
  let progress = 0;
  return {
    signal: extra.signal,
    progress: token === undefined ? undefined : message => {
      progress++;
      void extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress, message } }).catch(() => {});
    },
  };
}

function json(value: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], isError };
}

/** `scripts/soak-report.ts` reads this log's lines (#25). */
const LOG = process.env.COACHEMON_LOG;
const t0 = Date.now();
function logCall(tool: string, args: unknown, ms: number, result: Record<string, unknown>): void {
  if (!LOG) return;
  const line = { t: Date.now() - t0, tool, args, ms, status: result.status ?? result.error, screen: result.screen, wave: result.wave, selected: result.selected, messages: result.messages };
  try {
    appendFileSync(LOG, JSON.stringify(line) + "\n");
  } catch {
    // logging never fails a call
  }
}

async function run(tool: string, args: unknown, fn: () => Promise<Record<string, unknown>>) {
  const t = Date.now();
  try {
    const result = await fn();
    logCall(tool, args, Date.now() - t, result);
    // run_interrupted is an error by contract (v1-tool-surface.md §3).
    return json(result, result.status === "run_interrupted");
  } catch (e) {
    const body = e instanceof Refusal ? { error: e.code, message: e.message, ...e.detail } : { error: "internal", message: (e as Error).message ?? String(e) };
    logCall(tool, args, Date.now() - t, body);
    return json(body, true);
  }
}

export function toolServer(driver: Driver): McpServer {
  const server = new McpServer({ name: "coachemon", version: "0.1.0" });

  server.registerTool(
    "status",
    {
      description:
        "Is the server attached to a PokéRogue tab and is a run live. The only tool meaningful before a run exists. Attaches lazily (launching Chrome if needed).",
      inputSchema: {},
    },
    async () => run("status", {}, () => driver.status()),
  );

  server.registerTool(
    "get_state",
    {
      description:
        "The settled snapshot: wave, turn, money, biome, active pokémon, enemy, party. detail widens it: party (movesets, IVs, stats), items (held modifiers, best-effort), full. Waits for the game to settle; if a previous call timed out, this resumes the wait without pressing anything.",
      inputSchema: { detail: z.enum(["lean", "party", "items", "full"]).optional() },
    },
    async ({ detail }, extra) => run("get_state", { detail }, () => driver.getState(detail ?? "lean", context(extra as Extra))),
  );

  server.registerTool(
    "read_menu",
    {
      description:
        "What the game is asking right now: composite screen id, option labels in cursor order, cursor, message text, and what CANCEL would do here (cancel_effect). Labels are read fresh each call; pass them back verbatim to select_option.",
      inputSchema: {},
    },
    async (_args, extra) => run("read_menu", {}, () => driver.readMenu(context(extra as Extra))),
  );

  server.registerTool(
    "read_card",
    {
      description:
        "What the coach panel on the tab is showing right now: the card's kind (battle, learn, reward, biome, encounter), its verdict, its groups, its plain text and the summary behind it. `groups` is the card's named parts in the order the panel shows them — act (what to do now), foes, catch, plan, options, audit, road, notes — each with a label, a summary and its rows as plain lines, so read the group you want by id instead of parsing the text; `text` is those same groups written out. `oracle_line` is { state: \"on\", turn, of } while a held oracle line leads the card, `of` being the line's last turn, and null otherwise. `randomized` is true while the Moveset or Ability Randomizer challenge is on: a species' moves and abilities are then not what its tables say, so cite only what the live mon shows. Read-only, and the same payload the panel's card events carry — read it once after subscribing to catch the card already up. Returns card_error: no-hud when the panel is not running.",
      inputSchema: {},
    },
    async (_args, extra) => run("read_card", {}, () => driver.readCard(context(extra as Extra))),
  );

  server.registerTool(
    "read_starters",
    {
      description:
        "Every starter this account has unlocked — dex id, IV total, passive, hidden ability, egg moves, cost reduction, candy — plus the grid start_run picks from (names, costs, the picked party, the point budget) when the starter screen is open. Read-only; off the grid the costs read null.",
      inputSchema: {},
    },
    async (_args, extra) => run("read_starters", {}, () => driver.readStarters(context(extra as Extra))),
  );

  server.registerTool(
    "select_option",
    {
      description:
        "Make one decision: move the cursor to the option with this label (exact match after trimming/case-folding; an option's `name` matches too, e.g. `Great Ball` for `Great Ball ×9`) and commit with ACTION. Returns messages crossed while auto-advancing text, the lean snapshot and the next menu. Refuses (nothing pressed) on no_match, ambiguous, screen_changed, game_moved (the game changed before the press reached it), settings screens, the starter filter bar, a contended tab or a frozen loop. To leave a screen, select the option that leaves it (Cancel, No): there is no back button. On MODIFIER_SELECT, taking a free reward (cost 0) ends the shop and advances to the next wave: buy shop items (cost > 0) first.",
      inputSchema: {
        label: z.string().optional().describe("An option label as read_menu returned it"),
        index: z.union([z.string(), z.number()]).optional().describe("The option's `i` as read_menu returned it this call — use when a label is duplicated (e.g. the same item as a free reward and in the shop). With label too, both must agree."),
        expect_screen: z.string().optional().describe("Composite screen id from read_menu; refused with screen_changed if the live screen differs"),
      },
    },
    async ({ label, index, expect_screen }, extra) => run("select_option", { label, index, expect_screen }, () => driver.selectOption(label, index, expect_screen, context(extra as Extra))),
  );

  server.registerTool(
    "press",
    {
      description:
        "Deliver one raw button — the escape hatch for unmodelled screens. CANCEL is not 'back': it consents on messages, selects the last option on option lists, abandons a run on the save-slot screen and pops a team member on the starter grid; check read_menu's cancel_effect first. Never repeat a button because the last one seemed to fail; judge by the returned state.",
      inputSchema: { button: z.enum(Object.keys(Button) as [string, ...string[]]) },
    },
    async ({ button }, extra) => run("press", { button }, () => driver.press(button, context(extra as Extra))),
  );

  server.registerTool(
    "start_run",
    {
      description:
        "From the TITLE screen, start a Classic run with these starters (species names as shown on the starter grid) and play up to the first decision. Refuses an occupied save slot unless overwrite is true; default slot is the lowest free one. If the party exceeds the cost budget or a name is not on the grid, it refuses once the grid is open and backs out to TITLE first, so a corrected start_run works at once; should the back-out fail, the refusal's next says how to finish it.",
      inputSchema: {
        species: z.array(z.string()).min(1).max(6),
        slot: z.number().int().min(0).max(4).optional().describe('0-based save-slot index: 0 is the screen\'s "Slot 1", 4 is "Slot 5".'),
        overwrite: z.boolean().optional(),
      },
    },
    async ({ species, slot, overwrite }, extra) => run("start_run", { species, slot, overwrite }, () => driver.startRun(species, slot, overwrite ?? false, context(extra as Extra))),
  );

  server.registerTool(
    "solving",
    {
      description:
        "Solving: the player's standing, opt-in setting that lets the coach solve a trainer fight on the run's own seed for an oracle line, never in a Daily run. Off until the player turns it on; it persists across sessions and restarts, so it is never asked per fight. Pass on to turn it on or off; omit on to read it. Turning it on costs about 0.6 GB of disk, a one-time setup and minutes of CPU per fight: tell the player that and turn it on only on their yes. Needs no game.",
      inputSchema: { on: z.boolean().optional().describe("true turns solving on, false turns it off; omit to read the setting") },
    },
    async ({ on }) => run("solving", { on }, () => driver.solving(on)),
  );

  server.registerTool(
    "screenshot",
    {
      description: "A PNG of the game for the human reading the transcript. Never needed to play; ~100× slower and ~90× larger than a text read.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await driver.screenshot();
        return { content: [{ type: "image" as const, data, mimeType: "image/png" }] };
      } catch (e) {
        // A store build has no dev table, so no screenshot: `unavailable` (extension-distribution.md §12.2).
        if (e instanceof Refusal) return json({ error: e.code, message: e.message, ...e.detail }, true);
        return json({ error: "screenshot_failed", message: (e as Error).message }, true);
      }
    },
  );

  const jobId = z.string().describe("The job's id, as start_job returned it");

  server.registerTool(
    "start_job",
    {
      description:
        "Start a background job: work that outlasts one tool call. Returns at once with the job's id, and the job runs on after the call ends: poll_job reads its progress, read_job its answer, cancel_job stops it. Every job's fields carry end_file, a file that appears only once the job has ended (done, failed or cancelled), so its end can be waited on from outside this server, as a Monitor running `until [ -e <end_file> ]; do sleep 10; done; cat <end_file>` does. A job lasts only as long as this server process. Refuses unknown_job_kind, naming the kinds this server runs, and solving_off for a solving job while the player has solving off.",
      inputSchema: {
        kind: z
          .string()
          .describe(
            "Which job to run. clone sets up the game clone solving runs in: once per pinned game version, answering at once when it is already set up, else with the clone or a no answer naming the cause. " +
              "solve solves the trainer fight on the tab from its wave-start save, setting the clone up first if it needs to: its progress is how far the search has gone of its budget, and its result an oracle line, which hand_oracle_line gives the coach panel, or a no answer with the reason. One runs per fight: a solve for a new fight cancels the last fight's job, and one for the fight already being solved hands back that job. " +
              "Where the fight can't be solved (a Daily, a game version other than the pinned one, no hub, …) it refuses no_answer at once with the reason, and no job starts; relay the message as given.",
          ),
        args: z.record(z.string(), z.unknown()).optional().describe("The job's own arguments"),
      },
    },
    async ({ kind, args }, extra) => run("start_job", { kind, args }, () => driver.startJob(kind, args ?? {}, context(extra as Extra))),
  );

  server.registerTool(
    "poll_job",
    {
      description:
        "A background job's state (running, done, failed or cancelled) and its latest progress line, short enough to relay as it is. Read-only and cheap: poll as often as needed. Refuses unknown_job for an id this server does not hold, listing the ones it does.",
      inputSchema: { job: jobId },
    },
    async ({ job }) => run("poll_job", { job }, () => driver.pollJob(job)),
  );

  server.registerTool(
    "read_job",
    {
      description:
        "A background job's answer: poll_job's fields, plus `result` once it is done or `failure` once it has failed. A cancelled job has neither, and a running one reads as poll_job does.",
      inputSchema: { job: jobId },
    },
    async ({ job }) => run("read_job", { job }, () => driver.readJob(job)),
  );

  server.registerTool(
    "cancel_job",
    {
      description: "Stop a running background job: it ends cancelled at once and its work stops. A job that has already ended is left as it ended, and the result says how.",
      inputSchema: { job: jobId },
    },
    async ({ job }) => run("cancel_job", { job }, () => driver.cancelJob(job)),
  );

  server.registerTool(
    "hand_oracle_line",
    {
      description:
        "Hand the coach panel the oracle line a solve job found, so the card leads with it: its step is the turn's call and it stands in for the fight plan until a checkpoint misses. Pass the solve's job id once the job is done with an oracle line. An oracle line holds only from where it was solved, so it is handed only while the fight on the tab still stands at the line's first turn: past that, or on another wave, it refuses moved_on and hands nothing. Refuses no_oracle_line for a job still running, cancelled, failed, answered no answer (its reason and message come with the refusal) or not a solve. Returns held: true once the panel holds the oracle line, or held: false with oracle_line_error: no-hud, other-fight (another run's or wave's) or malformed. A settled read: it never presses anything and needs no grant.",
      inputSchema: { job: jobId },
    },
    async ({ job }, extra) => run("hand_oracle_line", { job }, () => driver.handOracleLine(job, context(extra as Extra))),
  );

  return server;
}
