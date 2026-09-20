/**
 * The fakes the hub's tests drive it with: an extension, a client, a port no hub will answer on, and a hub start that
 * never comes up.
 * The two sockets are real `ws` sockets on the loopback port the hub bound, so the tests exercise the upgrade check
 * too: a browser sends an extension-scheme `Origin` and a local client sends none, exactly as the real ones do (§7.4).
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { WebSocket } from "ws";
import type { HubProcess } from "./client.ts";
import { COMMAND_NAMES } from "../protocol/commands.ts";
import { PROTOCOL } from "../protocol/version.ts";
import type { ExtensionHello, Flavour, FromClient, FromExtension, Target, ToClient, ToExtension } from "../protocol/wire.ts";

/**
 * The ports the kernel hands out for `listen(0)`, which is what every hub in these tests binds. Linux publishes the
 * range; elsewhere the widest plausible one is assumed, so a port outside it is outside macOS's 49152.. too.
 */
export const EPHEMERAL_RANGE = ephemeralRange();

/** How wide a band of dead ports to draw from. */
const DEAD_BAND = 10_000;

/**
 * Where this process starts looking, drawn once. It is random rather than derived from the pid: pids congruent modulo
 * the band would start two processes on the same stretch on every draw, which is a collision that repeats rather than
 * one that happens once. The counter on top keeps one process's own ports apart.
 */
const searchStart = Math.floor(Math.random() * DEAD_BAND);

/** How many dead ports this process has taken, so a second call never hands back the first call's port. */
let deadPortsTaken = 0;

/**
 * A port nothing is listening on, and that no `listen(0)` in this run can be handed behind the test's back: the hub's
 * ports are fixed, so the tests pick their own.
 *
 * It is drawn from outside the ephemeral range rather than from `listen(0)`, and that is the whole point. A port the
 * kernel picked and the test then let go is a port the kernel will pick again — for another test file's hub, which
 * then answers the handshake the test expected nothing to answer, and the assertion reads that hub's rungs instead.
 * That failed a release at random (#327).
 *
 * What it does not promise: a port nothing binds *by number*. A test that starts a hub on its own dead port is doing
 * exactly that, deliberately, and two callers drawing the same port remains possible — the probe and a random start
 * make it rare, they do not make it impossible.
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

/**
 * The band dead ports come from: below the ephemeral range where there is room, otherwise above it. Either way it is
 * a stretch the kernel will not hand to `listen(0)`, which is the only property that matters here.
 */
const DEAD_PORTS = bandOutside(EPHEMERAL_RANGE);

/**
 * The band to draw dead ports from, given what the kernel hands out: below the range where there is room, otherwise
 * above it. Exported because which band a machine gets is the whole guarantee, and a machine whose kernel forces the
 * second branch is one no test here runs on.
 */
export function bandOutside(range: { first: number; last: number }): { first: number; width: number } {
  if (range.first - DEAD_BAND >= 1_024) return { first: range.first - DEAD_BAND, width: DEAD_BAND };
  // A kernel whose range starts too low to leave a band below it usually leaves one above; `ip_local_port_range` of
  // `10000 60999` is the case that would otherwise fail every test here rather than one.
  if (range.last < 65_535) return { first: range.last + 1, width: 65_536 - (range.last + 1) };
  throw new Error(`the ephemeral range ${range.first}..${range.last} leaves no band of ports outside it to draw a dead port from`);
}

/**
 * Whether this exact port is free right now, by binding it and letting it go. This is the tie-break between two
 * callers, not the guarantee: what keeps the port dead afterwards is that it sits below the ephemeral floor.
 */
function bindable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}

function ephemeralRange(): { first: number; last: number } {
  // Linux's own default, and its floor is below macOS's 49152: assuming it is safe on both when nothing says otherwise.
  const ASSUMED = { first: 32_768, last: 65_535 };
  try {
    const [first, last] = readFileSync("/proc/sys/net/ipv4/ip_local_port_range", "utf8").trim().split(/\s+/).map(Number);
    return Number.isInteger(first) && Number.isInteger(last) && first > 1_024 && last >= first ? { first, last } : ASSUMED;
  } catch {
    return ASSUMED;
  }
}

/** A hub start that never comes up, saying why: the default for tests that must not spawn a real process. */
export function deadSpawn(stderr = "no hub here"): HubProcess {
  return { pid: null, stderr: () => stderr, exited: Promise.resolve(1), release: () => {} };
}

/** A socket with a frame queue: `take` waits for the next frame a predicate accepts, and fails the test on silence. */
export class Peer<In, Out> {
  readonly ws: WebSocket;
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
      // A frame a waiter takes never reaches the queue, so `seen` is exactly what no test asked for.
      const i = this.#waiting.findIndex(w => w.match(f));
      if (i >= 0) this.#waiting.splice(i, 1)[0].resolve(f);
      else this.seen.push(f);
    });
  }

  send(frame: Out): void {
    this.ws.send(JSON.stringify(frame));
  }

  /**
   * Answers every matching frame for the rest of the test, rather than the one `take` waits for. It is what a test
   * needs to assert that something was *not* asked twice: a second request the code should not have made comes back
   * as a second line rather than as silence.
   */
  answering<T extends In>(match: (f: In) => f is T, reply: (f: T) => Out): void {
    this.#standing.push({ match: match as (f: In) => boolean, reply: reply as (f: In) => Out });
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
