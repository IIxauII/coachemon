/**
 * A fake browser on the hub's socket: what the extension package will be (§8), reduced to the frames §7.6 defines.
 * Tests drive the hub through it, so the hub is exercised over a real WebSocket with a real upgrade, not through its
 * internals.
 */
import WebSocket from "ws";
import { COMMAND_NAMES } from "../protocol/commands.ts";
import { PROTOCOL } from "../protocol/version.ts";
import type { ExtensionCmd, ExtensionHello, EventKind, Flavour, TabState, Target, Welcome } from "../protocol/wire.ts";

export type FakeExtensionOptions = Partial<Omit<ExtensionHello, "t">> & {
  /** The `Origin` the upgrade carries; the default is a Chrome extension's. */
  origin?: string;
  /** Left unsent when false, for the tests that watch what the hub does before a hello. */
  hello?: boolean;
};

/** What the fake answers a command with. `null`: nothing, so the hub's 5 s deadline is what replies. */
export type Answer = (cmd: ExtensionCmd) => Record<string, unknown> | { error: string } | null;

export class FakeExtension {
  readonly commands: string[];
  /** Every command the hub routed here, in order. */
  readonly received: ExtensionCmd[] = [];
  welcome: Welcome | null = null;
  #answer: Answer = () => ({ ok: true });
  readonly #ws: WebSocket;

  private constructor(ws: WebSocket, commands: string[]) {
    this.#ws = ws;
    this.commands = commands;
    ws.on("message", raw => {
      const f = JSON.parse(raw.toString()) as ExtensionCmd | Welcome;
      if (f.t === "welcome") {
        this.welcome = f;
        return;
      }
      if (f.t !== "cmd") return;
      this.received.push(f);
      const answer = this.#answer(f);
      if (answer === null) return;
      if ("error" in answer) this.#send({ t: "reply", id: f.id, ok: false, code: "threw", message: answer.error });
      else this.#send({ t: "reply", id: f.id, ok: true, result: answer });
    });
  }

  static connect(port: number, opts: FakeExtensionOptions = {}): Promise<FakeExtension> {
    const commands = opts.commands ?? [...COMMAND_NAMES];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`, { headers: { origin: opts.origin ?? "chrome-extension://abcdefghijklmnop" } });
    return new Promise((resolve, reject) => {
      ws.on("error", reject);
      ws.on("open", () => {
        const ext = new FakeExtension(ws, commands);
        if (opts.hello !== false) {
          ext.#send({
            t: "hello",
            protocol: opts.protocol ?? PROTOCOL,
            version: opts.version ?? "1.0.0",
            target: (opts.target ?? "chrome") as Target,
            flavour: (opts.flavour ?? "store") as Flavour,
            build: opts.build ?? "test",
            consent: opts.consent ?? true,
            commands,
          });
        }
        resolve(ext);
      });
    });
  }

  answers(answer: Answer): void {
    this.#answer = answer;
  }

  tab(tab: number, state: TabState = "ready", title = "PokéRogue"): void {
    this.#send({ t: "tab", tab, state, title });
  }

  consent(consent: boolean): void {
    this.#send({ t: "consent", consent });
  }

  event(tab: number, kind: EventKind, body: Record<string, unknown>): void {
    this.#send({ t: "event", tab, kind, body });
  }

  ping(): void {
    this.#send({ t: "ping" });
  }

  close(): Promise<void> {
    if (this.#ws.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise(resolve => {
      this.#ws.on("close", () => resolve());
      this.#ws.close();
    });
  }

  #send(frame: Record<string, unknown>): void {
    this.#ws.send(JSON.stringify(frame));
  }
}

/** The frames a test sends are answered asynchronously; this waits for what they caused to arrive. */
export const delivered = (): Promise<void> => new Promise(r => setTimeout(r, 25));
