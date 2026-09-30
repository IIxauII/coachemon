import { PRODUCT, PROTOCOL } from "../../../src/protocol/version.ts";
import type { ExtensionHello, Flavour, FromExtension, TabState, Target, ToExtension } from "../../../src/protocol/wire.ts";
import { MAX_DETAIL_BYTES } from "../relay/channel.ts";
import { TOO_LARGE, type EventReport, type RelayReply, type ToBackground } from "../messages.ts";

// extension-distribution.md §8.1, §8.2.
export const WELCOME_MS = 2_000;
export const WELCOME_BACKOFF_MS = 10 * 60_000;
export const PING_MS = 20_000;
export const RETRY_MS = [1_000, 2_000, 5_000] as const;
export const RETRY_STEADY_MS = 20_000;

export type Socket = { send(data: string): void; close(): void };

export type SocketHandlers = {
  open(): void;
  message(data: string): void;
  /** A close and an error both land here. */
  closed(): void;
};

export type TransportDeps = {
  url: string;
  target: Target;
  flavour: Flavour;
  version: string;
  build: string;
  /** Exactly what this build's page script registers: the hub checks a tool's command against it (extension-distribution.md §8.5). */
  commands: string[];
  dial: (url: string, h: SocketHandlers) => Socket;
  after: (ms: number, fn: () => void) => () => void;
  toTab: (tab: number, message: unknown) => Promise<unknown>;
  /** A command the background answers itself, or `null` to forward it; only a dev build has any (extension-distribution.md §10.6). */
  local?: (cmd: Extract<ToExtension, { t: "cmd" }>) => Promise<RelayReply> | null;
  /** A frame only this build knows, `true` once handled; only a dev build has one (extension-distribution.md §5.4). */
  extra?: (frame: ToExtension) => boolean;
  /** `false` only on Firefox, until the player clicks (extension-distribution.md §8.4). */
  consent: boolean;
};

type Phase = "idle" | "dialing" | "live" | "waiting";

export class Transport {
  readonly #d: TransportDeps;
  /** A tab counts only while `ready` (extension-distribution.md §7.5). */
  readonly #tabs = new Map<number, { state: TabState; title: string }>();
  /** Held until the welcome lands, so nothing about the player's game reaches a squatter on the port (extension-distribution.md §7.4). */
  readonly #held: number[] = [];
  #socket: Socket | null = null;
  #phase: Phase = "idle";
  #consent: boolean;
  #attempt = 0;
  #cancelRetry: (() => void) | null = null;
  #cancelWelcome: (() => void) | null = null;
  #cancelPing: (() => void) | null = null;

  constructor(d: TransportDeps) {
    this.#d = d;
    this.#consent = d.consent;
  }

  get ready(): number[] {
    return this.#consent ? this.#present : [];
  }

  /**
   * Consent or not, because this is what dialing looks at: an unconsented Firefox still connects and says `consent:
   * false`, the only frame that lets the status ladder name the click (extension-distribution.md §8.4, §12.3).
   */
  get #present(): number[] {
    return [...this.#tabs].filter(([, t]) => t.state === "ready").map(([tab]) => tab);
  }

  get live(): boolean {
    return this.#phase === "live";
  }

  /** A keepalive is how a restarted background re-learns its tabs, Safari's only assumed mechanism (extension-distribution.md §8.2). */
  fromTab(tab: number, message: ToBackground): void {
    if (message.t === "event") return this.#event(tab, message);
    if (message.state === null) return this.#dialIfWanted();
    const state: TabState = message.state;
    const known = this.#tabs.get(tab);
    if (state === "gone") this.#tabs.delete(tab);
    else this.#tabs.set(tab, { state, title: message.title });
    if (state !== "gone" && (!known || known.state !== state)) this.#announce(tab);
    if (state === "gone" && known) this.#send({ t: "tab", tab, state, title: known.title });
    this.#dialIfWanted();
  }

  tabClosed(tab: number): void {
    const known = this.#tabs.get(tab);
    if (!known) return;
    this.#tabs.delete(tab);
    this.#send({ t: "tab", tab, state: "gone", title: known.title });
  }

  grant(): void {
    if (this.#consent) return;
    this.#consent = true;
    this.#send({ t: "consent", consent: true });
    for (const tab of this.ready) this.#announce(tab);
    this.#dialIfWanted();
  }

  /** Background start, and every reconnect-on-wake (extension-distribution.md §8.2). */
  start(): void {
    this.#dialIfWanted();
  }

  close(): void {
    this.#cancelRetry?.();
    this.#cancelWelcome?.();
    this.#cancelPing?.();
    this.#cancelRetry = this.#cancelWelcome = this.#cancelPing = null;
    this.#socket?.close();
    this.#socket = null;
    this.#phase = "idle";
  }

  #dialIfWanted(): void {
    // `waiting` is the 10 min welcome back-off; a tab arriving does not shorten it.
    if (this.#phase !== "idle" || this.#cancelRetry || this.#present.length === 0) return;
    this.#phase = "dialing";
    const socket = this.#d.dial(this.#d.url, {
      open: () => this.#opened(),
      message: data => this.#frame(data),
      closed: () => this.#dropped(),
    });
    this.#socket = socket;
    this.#cancelWelcome = this.#d.after(WELCOME_MS, () => this.#noWelcome());
  }

  #opened(): void {
    const hello: ExtensionHello = {
      t: "hello",
      protocol: PROTOCOL,
      version: this.#d.version,
      target: this.#d.target,
      flavour: this.#d.flavour,
      build: this.#d.build,
      consent: this.#consent,
      commands: this.#d.commands,
    };
    this.#raw(hello);
    // Before the welcome only the hello goes out (extension-distribution.md §7.4).
    for (const tab of this.ready) this.#held.push(tab);
  }

  #frame(data: string): void {
    let frame: ToExtension | null = null;
    try {
      frame = JSON.parse(data) as ToExtension;
    } catch {
      return;
    }
    if (frame.t === "welcome") return this.#welcomed(frame.product);
    if (this.#phase !== "live") return;
    if (this.#d.extra?.(frame)) return;
    if (frame.t === "cmd") void this.#forward(frame);
  }

  #welcomed(product: string): void {
    if (this.#phase !== "dialing") return;
    // A wrong product is a foreign process on our port: the same 10 min as silence (extension-distribution.md §8.1).
    if (product !== PRODUCT) return this.#noWelcome();
    this.#cancelWelcome?.();
    this.#cancelWelcome = null;
    this.#phase = "live";
    this.#attempt = 0;
    while (this.#held.length) this.#announce(this.#held.shift()!);
    this.#cancelPing = this.#d.after(PING_MS, () => this.#ping());
  }

  #ping(): void {
    if (this.#phase !== "live") return;
    this.#raw({ t: "ping" });
    this.#cancelPing = this.#d.after(PING_MS, () => this.#ping());
  }

  #noWelcome(): void {
    this.#teardown();
    this.#phase = "waiting";
    this.#cancelRetry = this.#d.after(WELCOME_BACKOFF_MS, () => {
      this.#cancelRetry = null;
      this.#phase = "idle";
      this.#dialIfWanted();
    });
  }

  #dropped(): void {
    if (this.#phase === "waiting") return;
    this.#teardown();
    this.#phase = "idle";
    const ms = RETRY_MS[this.#attempt] ?? RETRY_STEADY_MS;
    this.#attempt++;
    this.#cancelRetry = this.#d.after(ms, () => {
      this.#cancelRetry = null;
      this.#dialIfWanted();
    });
  }

  #teardown(): void {
    this.#cancelWelcome?.();
    this.#cancelPing?.();
    this.#cancelWelcome = this.#cancelPing = null;
    this.#held.length = 0;
    this.#socket?.close();
    this.#socket = null;
  }

  async #forward(cmd: Extract<ToExtension, { t: "cmd" }>): Promise<void> {
    const mine = this.#d.local?.(cmd);
    if (mine) return this.#send(await mine);
    let reply: RelayReply;
    try {
      const answer = await this.#d.toTab(cmd.tab, { t: "cmd", id: cmd.id, name: cmd.name, args: cmd.args });
      reply = (answer as RelayReply | undefined)
        ?? { t: "reply", id: cmd.id, ok: false, code: "tab-gone", message: "the tab did not answer" };
    } catch (e) {
      // `tabs.sendMessage` rejects when the tab closed (extension-distribution.md §9.7).
      reply = { t: "reply", id: cmd.id, ok: false, code: "tab-gone", message: e instanceof Error ? e.message : String(e) };
    }
    this.#send(reply);
  }

  #event(tab: number, e: EventReport): void {
    this.#send({ t: "event", tab, kind: e.kind, body: e.body });
  }

  #announce(tab: number): void {
    const known = this.#tabs.get(tab);
    if (!known || !this.#consent) return;
    if (this.#phase === "dialing") {
      if (!this.#held.includes(tab)) this.#held.push(tab);
      return;
    }
    this.#send({ t: "tab", tab, state: known.state, title: known.title });
  }

  /** Every frame but the hello: dropped with no proved hub or no consent (extension-distribution.md §8.4). */
  #send(frame: FromExtension): void {
    if (this.#phase !== "live" || !this.#consent) return;
    this.#raw(frame);
  }

  #raw(frame: FromExtension): void {
    const data = JSON.stringify(frame);
    // The cap a second time, on the frame (extension-distribution.md §8.3): a reply refuses, and an event, which
    // nothing waits for, is dropped.
    if (data.length > MAX_DETAIL_BYTES) {
      if (frame.t !== "reply") return;
      const over: FromExtension = { t: "reply", id: frame.id, ok: false, code: "too-large", message: TOO_LARGE };
      this.#socket?.send(JSON.stringify(over));
      return;
    }
    this.#socket?.send(data);
  }
}
