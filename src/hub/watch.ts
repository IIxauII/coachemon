/** The watch CLI's engine (extension-distribution.md §11.2). */
import { HubClient, type ClientOptions } from "./client.ts";
import { reach, tabsLine } from "./ladder.ts";
import type { ClientEvent, Notice } from "../protocol/wire.ts";

const TEXT_CUT = 300;
const RETRY_MS = 5_000;

/**
 * Untyped on purpose: the event body and a read's result both arrive as `unknown`, a HUD mid-refresh sends nulls and an
 * older build may send nothing at all.
 */
export type CardFacts = { kind?: unknown; wave?: unknown; verdict?: unknown; text?: unknown };

/** The panel's own `rewards` streams as `reward` (extension-distribution.md §11.1). */
const LABEL: Record<string, string> = {
  battle: "BATTLE",
  learn: "LEARN",
  reward: "REWARDS",
  rewards: "REWARDS",
  biome: "BIOME",
  encounter: "ENCOUNTER",
};

/** Null for a kind the stream never carries (`starters`, `fusion`), which a late-join read can still land on. */
export function cardLine(c: CardFacts): string | null {
  const label = typeof c.kind === "string" ? LABEL[c.kind] : undefined;
  if (label === undefined) return null;
  const wave = typeof c.wave === "number" ? ` w${c.wave}` : "";
  const verdict = typeof c.verdict === "string" && c.verdict !== "" ? ` · ${c.verdict}` : "";
  const text = summaryText(c.text);
  return `${label}${wave}${verdict}${text === "" ? "" : ` | ${text}`}`;
}

export function feedLine(f: ClientEvent | Notice): string | null {
  if (f.t === "notice") return f.kind === "resume" ? "RESUMED" : `TABS ${tabsLine(f.tabs)}`;
  if (f.kind === "card") return cardLine(f.body as CardFacts);
  const message = f.body.message;
  return `COACH ERROR ${typeof message === "string" ? message : "the HUD failed"}`;
}

export type WatchOptions = {
  port: number;
  /** This plugin copy's version (extension-distribution.md §7.3). */
  version: string;
  /** Defaults to stdout, which is what `Monitor` reads. */
  print?: (line: string) => void;
  retryMs?: number;
  /** Ends the loop and closes the connection. Without one the CLI runs until the process does. */
  signal?: AbortSignal;
  /** Test seam. */
  spawnHub?: ClientOptions["spawnHub"];
  /** Test seam. */
  portHolder?: ClientOptions["portHolder"];
};

/**
 * Quiet on rung 8: the `tabs` notice reports a split itself and `resume` reads the card again. So a notice, not the next
 * poll, settles the loop's state, because a split can open and close inside one retry window.
 */
export async function runWatch(o: WatchOptions): Promise<void> {
  const print = o.print ?? ((l: string) => console.log(l));
  const retryMs = o.retryMs ?? RETRY_MS;

  /** The ladder line already on screen. */
  let ladder: string | null = null;
  /** A `card` read still owed: the late join, and the one after every stretch out of reach. */
  let owed = true;
  let subscribed = false;

  const say = (line: string | null) => {
    if (line !== null) print(line);
  };

  /** Settles the debt before it awaits, so a `resume` and the loop never both read on one return. A refusal is the ladder's to explain. */
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
      ladder = null;
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
        // Subscribing needs only a hub, which tells the tab count on subscribe (extension-distribution.md §7.5).
        subscribed = true;
        await client.subscribe();
      }
      if (trouble !== null) subscribed = false;

      const r = reach({ trouble, extensions: state?.extensions ?? [], tabs: state?.tabs ?? [] });
      if (r !== null && r.rung !== 8) {
        owed = true;
        if (r.line !== ladder) {
          ladder = r.line;
          print(r.line);
        }
      } else {
        ladder = null;
        if (r === null && owed) await readCard();
      }
      await sleep(retryMs, o.signal);
    }
  } finally {
    client.close();
  }
}

/** Not `ladder.ts`'s `firstLine`, which skips blank lines. */
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
