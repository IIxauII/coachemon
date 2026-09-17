/**
 * A Node client of the hub (§7.2): the MCP server's side of the loopback socket, and the watch CLI's.
 *
 * It uses `ws` rather than the global `WebSocket` so that it sends no `Origin` header, which is what tells the hub a
 * local client from a browser (§7.4). Dialling is connect-else-spawn: a refused connection means no hub is running yet,
 * and this client starts one, detached, and retries. Nothing is written to disk.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { PRODUCT } from "../protocol/version.ts";
import type { Claimed, ClientReply, ClientRole, HubState, Notice, ToClient, Welcome } from "../protocol/wire.ts";
import { foreignPort, hubWontStart, type Reach } from "./reach.ts";

/** How long a squatter on the port has to prove it is the hub (§7.2 rung 1). */
const WELCOME_MS = 1_000;
/** How long a spawned hub has to come up, polled every `RETRY_MS`. */
const SPAWN_MS = 3_000;
const RETRY_MS = 100;
/** The hub answers or refuses within 5 s (§7.6); past this the socket itself is wrong. */
const REQUEST_MS = 10_000;

export type DialOptions = {
  port: number;
  /** This plugin copy's `package.json` version, for the skew comparison (§7.3). */
  version: string;
  role: ClientRole;
  /** Left unset outside tests: a hub is spawned when the port refuses. */
  spawnHub?: boolean;
};

export type Dialed = { ok: true; client: HubClient } | { ok: false; reach: Reach };

export type Handlers = {
  event?: (kind: "card" | "coach-error", body: Record<string, unknown>) => void;
  notice?: (n: Notice) => void;
  close?: () => void;
};

export class HubClient {
  readonly hubVersion: string;
  /** The message every tool call refuses with while the plugin and the hub disagree (§7.3), or `null`. */
  readonly skew: string | null;
  readonly #ws: WebSocket;
  readonly #replies = new Map<number, (r: ClientReply) => void>();
  readonly #states: ((s: HubState) => void)[] = [];
  readonly #claims: ((c: Claimed) => void)[] = [];
  #handlers: Handlers = {};
  #next = 1;
  #closed = false;

  constructor(ws: WebSocket, welcome: Welcome, skew: string | null) {
    this.#ws = ws;
    this.hubVersion = welcome.version;
    this.skew = skew;
    ws.on("message", raw => this.#receive(raw.toString()));
    ws.on("close", () => this.#drain());
    ws.on("error", () => this.#drain());
  }

  get open(): boolean {
    return !this.#closed && this.#ws.readyState === WebSocket.OPEN;
  }

  on(handlers: Handlers): void {
    this.#handlers = handlers;
  }

  /** One command to the one ready tab. Every refusal comes back as a reply, never as a throw. */
  send(name: string, args: Record<string, unknown>): Promise<ClientReply> {
    const id = this.#next++;
    return new Promise(resolve => {
      const done = (r: ClientReply) => {
        clearTimeout(timer);
        this.#replies.delete(id);
        resolve(r);
      };
      const timer = setTimeout(() => done({ t: "reply", id, ok: false, code: "timeout", message: `${name} got no answer from the Coachemon hub.` }), REQUEST_MS);
      this.#replies.set(id, done);
      if (!this.#write({ t: "cmd", id, name, args })) done({ t: "reply", id, ok: false, code: "timeout", message: "The Coachemon hub connection closed." });
    });
  }

  state(): Promise<HubState> {
    return this.#ask({ t: "state" }, this.#states, EMPTY_STATE);
  }

  /** Takes the driver grant (§7.5). `false`: another session holds it. */
  async claim(): Promise<boolean> {
    const c = await this.#ask<Claimed>({ t: "claim" }, this.#claims, { t: "claimed", ok: false, code: "contended" });
    return c.ok;
  }

  /**
   * Send a frame the hub answers with exactly one of its own, and wait for that answer. A hub that never answers, or a
   * socket that is already gone, resolves `fallback`: nothing a tool call waits on is allowed to hang.
   */
  #ask<T>(frame: Record<string, unknown>, queue: ((v: T) => void)[], fallback: T): Promise<T> {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(fallback), REQUEST_MS);
      queue.push(v => {
        clearTimeout(timer);
        resolve(v);
      });
      if (!this.#write(frame)) {
        clearTimeout(timer);
        queue.pop();
        resolve(fallback);
      }
    });
  }

  subscribe(): void {
    this.#write({ t: "subscribe" });
  }

  /** Ask an older hub to stand down so this plugin copy's own can take the port (§7.3). The hub refuses if it is driving. */
  retire(): void {
    this.#write({ t: "retire" });
  }

  close(): void {
    this.#closed = true;
    this.#ws.close();
  }

  #write(frame: Record<string, unknown>): boolean {
    if (this.#ws.readyState !== WebSocket.OPEN) return false;
    this.#ws.send(JSON.stringify(frame));
    return true;
  }

  #receive(raw: string): void {
    let f: ToClient;
    try {
      f = JSON.parse(raw) as ToClient;
    } catch {
      return;
    }
    switch (f?.t) {
      case "reply":
        this.#replies.get(f.id)?.(f);
        return;
      case "state":
        this.#states.shift()?.(f);
        return;
      case "claimed":
        this.#claims.shift()?.(f);
        return;
      case "event":
        this.#handlers.event?.(f.kind, f.body);
        return;
      case "notice":
        this.#handlers.notice?.(f);
        return;
      default:
        return;
    }
  }

  /** The socket went away: everything waiting on it answers now, so no tool call hangs on a dead hub. */
  #drain(): void {
    this.#closed = true;
    for (const [id, done] of [...this.#replies]) done({ t: "reply", id, ok: false, code: "timeout", message: "The Coachemon hub connection closed." });
    this.#replies.clear();
    while (this.#states.length) this.#states.shift()!(EMPTY_STATE);
    while (this.#claims.length) this.#claims.shift()!({ t: "claimed", ok: false, code: "contended" });
    this.#handlers.close?.();
  }
}

const EMPTY_STATE: HubState = { t: "state", extensions: [], tabs: [], driver: null };

/**
 * Connect, or start a hub and connect (§7.2). A failure here is rung 1 or rung 2 of the ladder: both mean no hub
 * answers, and the two differ in whether anything else does.
 */
export async function dial(opts: DialOptions, retiring = false): Promise<Dialed> {
  const first = await connect(opts.port);
  if (first.kind === "squatter") return { ok: false, reach: foreignPort(opts.port) };
  if (first.kind === "open") return handshake(first.ws, first.welcome, opts, retiring);
  if (opts.spawnHub === false) return { ok: false, reach: hubWontStart("no hub is running and this client was told not to start one") };

  // Nothing is listening: start the per-machine hub, detached, and watch its stderr until it answers or dies.
  const child = spawn(process.execPath, [fileURLToPath(new URL("./main.ts", import.meta.url)), "--port", String(opts.port)], {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  let exit: number | null = null;
  child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
  child.stderr?.on("error", () => {});
  child.on("error", e => (stderr ||= e.message));
  child.on("exit", code => (exit = code ?? 0));
  const release = () => {
    child.stderr?.destroy();
    child.unref();
  };

  const until = Date.now() + SPAWN_MS;
  while (Date.now() < until) {
    await sleep(RETRY_MS);
    const again = await connect(opts.port);
    if (again.kind === "open") {
      release();
      return handshake(again.ws, again.welcome, opts, retiring);
    }
    if (again.kind === "squatter") {
      release();
      return { ok: false, reach: foreignPort(opts.port) };
    }
    // Exit 0 is the second hub losing the race for the port (`EADDRINUSE`): keep retrying, the winner is coming up.
    if (exit !== null && exit !== 0) {
      release();
      return { ok: false, reach: hubWontStart(stderr.split("\n").find(l => l.trim()) ?? `it exited ${exit}`) };
    }
  }
  release();
  return { ok: false, reach: hubWontStart(stderr.split("\n").find(l => l.trim()) ?? "it did not answer within 3 s") };
}

type Attempt =
  | { kind: "open"; ws: WebSocket; welcome: Welcome }
  | { kind: "refused" }
  /** Connected, but no `welcome` carrying the product marker: a foreign process holds the port (§7.2 rung 1). */
  | { kind: "squatter" };

function connect(port: number): Promise<Attempt> {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
    let done = false;
    const finish = (a: Attempt) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (a.kind !== "open") ws.close();
      resolve(a);
    };
    const timer = setTimeout(() => finish({ kind: "squatter" }), WELCOME_MS);
    ws.on("error", () => finish({ kind: "refused" }));
    ws.on("close", () => finish({ kind: "refused" }));
    ws.on("message", raw => {
      let f: Welcome;
      try {
        f = JSON.parse(raw.toString()) as Welcome;
      } catch {
        return finish({ kind: "squatter" });
      }
      if (f?.t !== "welcome") return;
      if (f.product !== PRODUCT) return finish({ kind: "squatter" });
      finish({ kind: "open", ws, welcome: f });
    });
  });
}

/** Say hello, then decide what this plugin copy's and this hub's versions mean for each other (§7.3). */
async function handshake(ws: WebSocket, welcome: Welcome, opts: DialOptions, retiring: boolean): Promise<Dialed> {
  ws.send(JSON.stringify({ t: "hello", role: opts.role, version: opts.version, pid: process.pid }));
  const order = compareVersions(opts.version, welcome.version);
  if (order === 0) return { ok: true, client: new HubClient(ws, welcome, null) };
  if (order < 0) {
    return { ok: true, client: new HubClient(ws, welcome, "This Claude session's Coachemon plugin is older than the running hub. Restart this Claude session.") };
  }

  // Newer than the hub. A hub nobody is driving is retired and replaced; one with a driver on it is left alone. One
  // retire is tried per dial: a hub that is still older after it was retired is a race nobody wins by repeating.
  const client = new HubClient(ws, welcome, null);
  const state = await client.state();
  if (state.driver === null && !retiring) {
    client.retire();
    client.close();
    // The retired hub is closing its listener; the retry spawns this plugin copy's own.
    await sleep(RETRY_MS);
    return dial(opts, true);
  }
  client.close();
  const again = await connect(opts.port);
  if (again.kind !== "open") return { ok: false, reach: hubWontStart("it stopped answering while this session reconnected to it") };
  again.ws.send(JSON.stringify({ t: "hello", role: opts.role, version: opts.version, pid: process.pid }));
  return {
    ok: true,
    client: new HubClient(again.ws, again.welcome, "Another session is driving on an older Coachemon hub. Finish or close that session, then retry."),
  };
}

/** Plugin versions, compared numerically field by field; anything non-numeric sorts as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (parseInt(pa[i] ?? "0", 10) || 0) - (parseInt(pb[i] ?? "0", 10) || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Not unref'd: the dial is waiting on it, and a process with nothing else pending must not exit mid-retry. */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
