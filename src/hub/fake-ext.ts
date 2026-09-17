/**
 * The fake extension and fake client the hub's tests drive it with. Both are real `ws` sockets on the loopback port
 * the hub bound, so the tests exercise the upgrade check too: a browser sends an extension-scheme `Origin` and a local
 * client sends none, exactly as the real ones do (§7.4).
 */
import { WebSocket } from "ws";
import { COMMAND_NAMES } from "../protocol/commands.ts";
import { PROTOCOL } from "../protocol/version.ts";
import type { ExtensionHello, Flavour, FromClient, FromExtension, Target, ToClient, ToExtension } from "../protocol/wire.ts";

/** A socket with a frame queue: `take` waits for the next frame a predicate accepts, and fails the test on silence. */
export class Peer<In, Out> {
  readonly ws: WebSocket;
  readonly seen: In[] = [];
  #waiting: { match: (f: In) => boolean; resolve: (f: In) => void }[] = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", raw => {
      const f = JSON.parse(String(raw)) as In;
      // A frame a waiter takes never reaches the queue, so `seen` is exactly what no test asked for.
      const i = this.#waiting.findIndex(w => w.match(f));
      if (i >= 0) this.#waiting.splice(i, 1)[0].resolve(f);
      else this.seen.push(f);
    });
  }

  send(frame: Out): void {
    this.ws.send(JSON.stringify(frame));
  }

  /** The next frame matching `match`, from the queue or the wire. */
  async take<T>(match: (f: In) => boolean, ms = 2_000): Promise<T> {
    const i = this.seen.findIndex(match);
    if (i >= 0) return this.seen.splice(i, 1)[0] as In & T;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no matching frame within ${ms} ms; saw ${JSON.stringify(this.seen)}`)), ms);
      this.#waiting.push({
        match,
        resolve: f => {
          clearTimeout(timer);
          resolve(f as In & T);
        },
      });
    });
  }

  /** Nothing arrives within `ms`: how a test asserts silence (a dropped event, a refused notice). */
  async quiet(ms = 150): Promise<void> {
    await new Promise(r => setTimeout(r, ms));
  }

  close(): void {
    this.ws.close();
  }
}

export type FakeExtOptions = {
  target?: Target;
  flavour?: Flavour;
  protocol?: number;
  version?: string;
  consent?: boolean;
  commands?: string[];
};

/** A browser connection: it sends `hello`, waits for the hub's `welcome`, then whatever the test scripts. */
export async function fakeExtension(port: number, o: FakeExtOptions = {}): Promise<Peer<ToExtension, FromExtension>> {
  const ws = await open(port, { origin: "chrome-extension://fakefakefakefake" });
  const peer = new Peer<ToExtension, FromExtension>(ws);
  const hello: ExtensionHello = {
    t: "hello",
    protocol: o.protocol ?? PROTOCOL,
    version: o.version ?? "1.0.0",
    target: o.target ?? "chrome",
    flavour: o.flavour ?? "store",
    build: "fake",
    consent: o.consent ?? true,
    commands: o.commands ?? [...COMMAND_NAMES],
  };
  peer.send(hello);
  await peer.take(f => f.t === "welcome");
  return peer;
}

/** A local client: no `Origin`, a `hello` with a role and a version, then the hub's `welcome`. */
export async function fakeClient(port: number, version = "1.0.0"): Promise<Peer<ToClient, FromClient>> {
  const ws = await open(port, {});
  const peer = new Peer<ToClient, FromClient>(ws);
  peer.send({ t: "hello", role: "server", version, pid: process.pid });
  await peer.take(f => f.t === "welcome");
  return peer;
}

/** A tab the hub counts: ready, and its browser consented. */
export async function readyTab(port: number, tab = 1, o: FakeExtOptions = {}): Promise<Peer<ToExtension, FromExtension>> {
  const ext = await fakeExtension(port, o);
  ext.send({ t: "tab", tab, state: "ready", title: "PokéRogue" });
  return ext;
}

export function open(port: number, headers: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`, { headers });
    ws.once("open", () => resolve(ws));
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.once("error", reject);
  });
}
