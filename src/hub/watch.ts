/**
 * The watch CLI's engine (§11.2): a hub client with `role: "watch"` that prints one summary line per card event, and
 * nothing else. It never claims the grant, sends no act, and injects nothing — the coach reads, and the player drives.
 *
 * Two halves. `cardLine` and `feedLine` are pure: a frame in, the line out, so every format in §11.2 is a table test
 * rather than a live run. `runWatch` is the loop around them: connect (spawning the hub if needed, §7.2), print the
 * ladder line while the game is out of reach, then subscribe, read the card it joined on, and print what arrives.
 *
 * Lines are summaries because notifications truncate; `read_card` has the rest (§11.2).
 */
import { HubClient, type ClientOptions } from "./client.ts";
import { reach, tabsLine } from "./ladder.ts";
import type { ClientEvent, Notice } from "../protocol/wire.ts";

/** How much of the card's first line a summary carries (§11.2). */
const TEXT_CUT = 300;
/** How often the CLI retries while the game is out of reach (§11.2). */
const RETRY_MS = 5_000;

/**
 * The fields a line is written from, as they arrive: the `card` event's body and the `card` read's result share them.
 * This is `CardResult`'s wire-side view, not a second model of it — the event body is a `Record<string, unknown>` the
 * relay forwarded, and a read's `result` is `unknown` too, so nothing here may trust a field's type. A HUD mid-refresh
 * sends nulls and an older build may send nothing at all; a line is written from whatever did arrive.
 */
export type CardFacts = { kind?: unknown; wave?: unknown; verdict?: unknown; text?: unknown };

/** What each streamed card kind is called on the feed. The panel's own `rewards` streams as `reward` (§11.1). */
const LABEL: Record<string, string> = {
  battle: "BATTLE",
  learn: "LEARN",
  reward: "REWARDS",
  rewards: "REWARDS",
  biome: "BIOME",
  encounter: "ENCOUNTER",
};

/**
 * One card as its feed line, or null when there is nothing to say: no card at all, or a kind the stream never carries
 * (`starters`, `fusion`), which a late-join read can still land on.
 */
export function cardLine(c: CardFacts): string | null {
  const label = typeof c.kind === "string" ? LABEL[c.kind] : undefined;
  if (label === undefined) return null;
  const wave = typeof c.wave === "number" ? ` w${c.wave}` : "";
  const verdict = typeof c.verdict === "string" && c.verdict !== "" ? ` · ${c.verdict}` : "";
  const text = summaryText(c.text);
  return `${label}${wave}${verdict}${text === "" ? "" : ` | ${text}`}`;
}

/** One event or notice as its feed line, or null when it says nothing the player has to see. */
export function feedLine(f: ClientEvent | Notice): string | null {
  if (f.t === "notice") return f.kind === "resume" ? "RESUMED" : `TABS ${tabsLine(f.tabs)}`;
  if (f.kind === "card") return cardLine(f.body as CardFacts);
  const message = f.body.message;
  return `COACH ERROR ${typeof message === "string" ? message : "the HUD failed"}`;
}

export type WatchOptions = {
  port: number;
  /** This plugin copy's version, for the handshake's skew comparison (§7.3). */
  version: string;
  /** Where a line goes. The default is stdout, which is what `Monitor` reads. */
  print?: (line: string) => void;
  /** How long between retries while the game is out of reach; the spec's 5 s by default (§11.2). */
  retryMs?: number;
  /** Ends the loop and closes the connection. Without one the CLI runs until the process does. */
  signal?: AbortSignal;
  /** Test seam: what starting a hub on the port does (§7.2). */
  spawnHub?: ClientOptions["spawnHub"];
  /** Test seam: who holds the port when it answers but is not a hub (rung 1). */
  portHolder?: ClientOptions["portHolder"];
};

/**
 * The loop. It holds two pieces of state and no more: the ladder line already on screen, so an unchanged one is not
 * repeated, and whether a `card` read is still owed, so the late join happens once per stretch out of reach.
 *
 * Rung 8 is the one the loop stays quiet about: the hub's `tabs` notice reports a split tab count itself, with the
 * `TABS` prefix and at the moment it happens, and the `resume` notice — not the loop — is what reads the card again.
 * Both pieces of state are therefore settled where the notice lands rather than on the next poll, because a split can
 * open and close inside one retry window and the loop would never see the rung at all.
 */
export async function runWatch(o: WatchOptions): Promise<void> {
  const print = o.print ?? ((l: string) => console.log(l));
  const retryMs = o.retryMs ?? RETRY_MS;

  /** The ladder line already on screen, so the same one is not printed twice (§11.2). */
  let ladder: string | null = null;
  /** A `card` read still owed: the late join, and the one after every stretch out of reach. */
  let owed = true;
  let subscribed = false;

  const say = (line: string | null) => {
    if (line !== null) print(line);
  };

  /**
   * The `card` read: the late join, and the `resume` notice's re-read. It settles the debt itself, so the notice's read
   * and the loop's are never both spent on one return. A refusal is the ladder's to explain, not ours.
   */
  const readCard = async (): Promise<void> => {
    owed = false;
    const r = await client.send("card", {});
    if (r.ok) say(cardLine(r.result as CardFacts));
  };

  const client = new HubClient({
    port: o.port,
    version: o.version,
    role: "watch",
    onEvent: f => {
      say(feedLine(f));
      if (f.t !== "notice") return;
      // A notice is what the player is looking at now, so no ladder line stands behind it to be compared against —
      // the loop may never see the rung the notice describes, since a split can open and close between two polls.
      ladder = null;
      // A tab count back to one is a new card as far as we know: the stream said nothing while it was split (§7.5).
      if (f.kind === "resume") void readCard();
    },
    spawnHub: o.spawnHub,
    portHolder: o.portHolder,
  });

  try {
    while (o.signal?.aborted !== true) {
      const trouble = await client.ready();
      const state = trouble === null ? await client.state() : null;
      if (trouble === null && !subscribed) {
        // Subscribing needs only a hub: the tab count is the hub's story to tell, and it tells it on subscribe (§7.5).
        subscribed = true;
        await client.subscribe();
      }
      if (trouble !== null) subscribed = false;

      const r = reach({ trouble, extensions: state?.extensions ?? [], tabs: state?.tabs ?? [] });
      if (r !== null && r.rung !== 8) {
        // Out of reach: the line the player can act on, and a card read owed for when the game comes back.
        owed = true;
        if (r.line !== ladder) {
          ladder = r.line;
          print(r.line);
        }
      } else {
        // Reachable, or split across tabs — which the `tabs` notice already printed, and `resume` will read after.
        ladder = null;
        if (r === null && owed) await readCard();
      }
      await sleep(retryMs, o.signal);
    }
  } finally {
    client.close();
  }
}

/**
 * All of the card's text a summary line carries: its first line, cut to `TEXT_CUT` (§11.2). A card the HUD has not
 * drawn text for carries none. Not `ladder.ts`'s `firstLine`, which picks the first *non-blank* line out of a stack.
 */
function summaryText(text: unknown): string {
  if (typeof text !== "string") return "";
  return (text.split("\n")[0] ?? "").trim().slice(0, TEXT_CUT);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}
