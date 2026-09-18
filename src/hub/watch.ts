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
 * Everything is `unknown`, because both come off the wire — a HUD mid-refresh sends nulls, and an older build may send
 * nothing at all.
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
  const text = firstLine(c.text);
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
  print?: (line: string) => void;
  retryMs?: number;
  /** Ends the loop and closes the connection. Without one the CLI runs until the process does. */
  signal?: AbortSignal;
  spawnHub?: ClientOptions["spawnHub"];
  portHolder?: ClientOptions["portHolder"];
};

/**
 * The loop. It holds two pieces of state and no more: the ladder line already on screen, so an unchanged one is not
 * repeated, and whether the card has been read for this stretch of reachability, so the late join happens once.
 *
 * Rung 8 is the one the loop stays quiet about: the hub's `tabs` notice reports a split tab count itself, with the
 * `TABS` prefix and at the moment it happens, and the `resume` notice — not the loop — is what reads the card again.
 */
export async function runWatch(o: WatchOptions): Promise<void> {
  const print = o.print ?? ((l: string) => console.log(l));
  const retryMs = o.retryMs ?? RETRY_MS;

  const say = (line: string | null) => {
    if (line !== null) print(line);
  };
  const client = new HubClient({
    port: o.port,
    version: o.version,
    role: "watch",
    onEvent: f => {
      say(feedLine(f));
      // A tab count back to one is a new card as far as we know: the stream said nothing while it was split (§7.5).
      if (f.t === "notice" && f.kind === "resume") void readCard();
    },
    spawnHub: o.spawnHub,
    portHolder: o.portHolder,
  });

  /** The `card` read: the late join, and the `resume` notice's re-read. A refusal is the ladder's to explain, not ours. */
  const readCard = async (): Promise<void> => {
    const r = await client.send("card", {});
    if (r.ok) say(cardLine(r.result as CardFacts));
  };

  let ladder: string | null = null;
  let subscribed = false;
  let joined = false;
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
      if (r === null) {
        ladder = null;
        if (!joined) {
          joined = true;
          await readCard();
        }
      } else if (r.rung !== 8) {
        joined = false;
        if (r.line !== ladder) {
          ladder = r.line;
          print(r.line);
        }
      }
      await sleep(retryMs, o.signal);
    }
  } finally {
    client.close();
  }
}

/** The card's first line, cut to `TEXT_CUT`; a card the HUD has not drawn text for carries none (§11.2). */
function firstLine(text: unknown): string {
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
