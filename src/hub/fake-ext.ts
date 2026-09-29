/**
 * The fake sockets are real ones carrying the real `Origin`s, so a test runs the hub's upgrade check too
 * (extension-distribution.md §7.4).
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { WebSocket } from "ws";
import type { HubProcess } from "./client.ts";
import { COMMAND_NAMES } from "../protocol/commands.ts";
import { PROTOCOL } from "../protocol/version.ts";
import type { ExtensionHello, Flavour, FromClient, FromExtension, Target, ToClient, ToExtension } from "../protocol/wire.ts";

export const EPHEMERAL_RANGE = ephemeralRange();

const DEAD_BAND = 10_000;

// Random, not from the pid: pids congruent modulo the band would collide on every draw rather than once.
const searchStart = Math.floor(Math.random() * DEAD_BAND);

let deadPortsTaken = 0;

/**
 * Drawn from outside the ephemeral range, never from `listen(0)`: a port the kernel picked and the test let go is one
 * it picks again, for another test file's hub, which then answers the handshake the test expected nothing to answer.
 * That failed a release at random (#327). Two callers drawing the same port stays possible, only rare.
 */
export async function deadPort(): Promise<number> {
  const { first, width } = DEAD_PORTS;
  // Each call moves on from the last, so one process never hands back a port it has already given out.
  const start = (searchStart + deadPortsTaken++) % width;
  for (let i = 0; i < width; i++) {
    const port = first + ((start + i) % width);
    if (await bindable(port)) return port;
  }
  throw new Error(`every port in ${first}..${first + width - 1} is taken`);
}

const DEAD_PORTS = bandOutside(EPHEMERAL_RANGE);

export function bandOutside(range: { first: number; last: number }): { first: number; width: number } {
  if (range.first - DEAD_BAND >= 1_024) return { first: range.first - DEAD_BAND, width: DEAD_BAND };
  // An `ip_local_port_range` of `10000 60999` leaves no band below it.
  if (range.last < 65_535) return { first: range.last + 1, width: 65_536 - (range.last + 1) };
  throw new Error(`the ephemeral range ${range.first}..${range.last} leaves no band of ports outside it to draw a dead port from`);
}

/** The tie-break between two callers, not the guarantee: lying outside the ephemeral range is. */
function bindable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}

function ephemeralRange(): { first: number; last: number } {
  // Linux's default, whose floor is below macOS's 49152, so it holds on both.
  const ASSUMED = { first: 32_768, last: 65_535 };
  try {
    const [first, last] = readFileSync("/proc/sys/net/ipv4/ip_local_port_range", "utf8").trim().split(/\s+/).map(Number);
    return Number.isInteger(first) && Number.isInteger(last) && first > 1_024 && last >= first ? { first, last } : ASSUMED;
  } catch {
    return ASSUMED;
  }
}

export function deadSpawn(stderr = "no hub here"): HubProcess {
  return { pid: null, stderr: () => stderr, exited: Promise.resolve(1), release: () => {} };
}

export class Peer<In, Out> {
  readonly ws: WebSocket;
  /** Exactly the frames no test has taken. */
  readonly seen: In[] = [];
  #waiting: { match: (f: In) => boolean; resolve: (f: In) => void }[] = [];
  #standing: { match: (f: In) => boolean; reply: (f: In) => Out }[] = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", raw => {
      const f = JSON.parse(String(raw)) as In;
      // A standing answer is checked first, so `take` and `answering` on one peer never both reply to a frame.
      const standing = this.#standing.find(s => s.match(f));
      if (standing !== undefined) {
        this.send(standing.reply(f));
        return;
      }
      const i = this.#waiting.findIndex(w => w.match(f));
      if (i >= 0) this.#waiting.splice(i, 1)[0].resolve(f);
      else this.seen.push(f);
    });
  }

  send(frame: Out): void {
    this.ws.send(JSON.stringify(frame));
  }

  /** Answers every matching frame for the rest of the test, not only the next. */
  answering<T extends In>(match: (f: In) => f is T, reply: (f: T) => Out): void {
    this.#standing.push({ match: match as (f: In) => boolean, reply: reply as (f: In) => Out });
  }

  /** From the queue or the wire; rejects after `ms` of silence. */
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

  /** Only waits: a test asserts silence by reading `seen` after it. */
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

export async function fakeClient(port: number, version = "1.0.0"): Promise<Peer<ToClient, FromClient>> {
  const ws = await open(port, {});
  const peer = new Peer<ToClient, FromClient>(ws);
  peer.send({ t: "hello", role: "server", version, pid: process.pid });
  await peer.take(f => f.t === "welcome");
  return peer;
}

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
