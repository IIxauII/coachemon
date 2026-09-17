/**
 * The hub (§7): one detached process per machine, a thin router between the clients that want to play (MCP servers,
 * the watch CLI) and the browsers that can reach a game tab. It knows nothing about the game and caches nothing.
 *
 * What it does own: the loopback listener and its upgrade check (§7.4), the driver grant (§7.5), the count of ready
 * tabs across every connected browser, the fan-out of card events, and the 5 s deadline on a command it forwarded.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { STORE_COMMANDS } from "../protocol/commands.ts";
import { PRODUCT, PROTOCOL } from "../protocol/version.ts";
import type { ClientReply, ExtensionHello, FromClient, FromExtension, HubState, TabInfo, TabState, ToClient, ToExtension } from "../protocol/wire.ts";

/** No reply from the extension within this and the client gets `timeout` (§7.6). */
export const COMMAND_TIMEOUT_MS = 5_000;
/** No clients and no counted tabs for this long and the hub exits (§7.2). */
export const IDLE_EXIT_MS = 10 * 60_000;

const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\//;

type ExtConn = {
  conn: number;
  ws: WebSocket;
  hello: ExtensionHello | null;
  consent: boolean;
  tabs: Map<number, { state: TabState; title: string }>;
};

type ClientConn = { id: number; ws: WebSocket; subscribed: boolean };

type Pending = { ext: ExtConn; client: ClientConn; clientId: number; timer: NodeJS.Timeout };

export type HubOptions = {
  port: number;
  /** This hub's plugin version, for the skew comparison every client makes (§7.3). */
  version: string;
  /** What a client's `retire` does once no driver holds the grant. Default: exit 0. */
  onRetire?: () => void;
  /** What the idle timer does. Default: exit 0. */
  onIdle?: () => void;
  idleMs?: number;
  timeoutMs?: number;
};

type ClientRefusal = Extract<ClientReply, { ok: false }>["code"];

export class Hub {
  readonly port: number;
  readonly #version: string;
  readonly #http: Server;
  readonly #wss: WebSocketServer;
  readonly #extensions = new Map<WebSocket, ExtConn>();
  readonly #clients = new Map<WebSocket, ClientConn>();
  readonly #pending = new Map<number, Pending>();
  readonly #idleMs: number;
  readonly #timeoutMs: number;
  readonly #onRetire: () => void;
  readonly #onIdle: () => void;
  #driver: ClientConn | null = null;
  #nextConn = 1;
  #nextCmd = 1;
  /** Whether subscribers have been told the count left one (§7.5), so each crossing is noticed exactly once. */
  #noticed = false;
  #idle: NodeJS.Timeout | null = null;
  #closed = false;

  private constructor(opts: HubOptions, http: Server, port: number) {
    this.port = port;
    this.#version = opts.version;
    this.#idleMs = opts.idleMs ?? IDLE_EXIT_MS;
    this.#timeoutMs = opts.timeoutMs ?? COMMAND_TIMEOUT_MS;
    this.#onRetire = opts.onRetire ?? (() => process.exit(0));
    this.#onIdle = opts.onIdle ?? (() => process.exit(0));
    this.#http = http;
    this.#wss = new WebSocketServer({ noServer: true });
    this.#http.on("upgrade", (req, socket, head) => this.#upgrade(req, socket, head));
    this.#http.on("request", (_req, res) => void res.writeHead(404).end());
    this.#armIdle();
  }

  /** Binds `127.0.0.1` only. Rejects with the listen error, `EADDRINUSE` included: a second hub exits 0 on it (§7.2). */
  static listen(opts: HubOptions): Promise<Hub> {
    return new Promise((resolve, reject) => {
      const http = createServer();
      http.once("error", reject);
      http.listen(opts.port, "127.0.0.1", () => {
        http.removeListener("error", reject);
        const address = http.address();
        resolve(new Hub(opts, http, typeof address === "object" && address ? address.port : opts.port));
      });
    });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#idle) clearTimeout(this.#idle);
    for (const p of this.#pending.values()) clearTimeout(p.timer);
    this.#pending.clear();
    // A graceful close waits on a peer that may be gone; the hub is ending, so the sockets end with it.
    for (const ws of [...this.#extensions.keys(), ...this.#clients.keys()]) ws.terminate();
    this.#extensions.clear();
    this.#clients.clear();
    this.#wss.close();
    this.#http.closeAllConnections();
    await new Promise<void>(r => this.#http.close(() => r()));
  }

  // --------------------------------------------------------------- upgrade

  /**
   * §7.4, before any frame: an exact `Host` defeats DNS rebinding, an absent `Origin` is a local client, an
   * extension-scheme `Origin` is a browser, anything else gets 403. The extension's id is not checked.
   */
  #upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const origin = req.headers.origin;
    const browser = origin !== undefined && EXTENSION_ORIGIN.test(origin);
    if (req.headers.host !== `127.0.0.1:${this.port}` || (origin !== undefined && !browser)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    this.#wss.handleUpgrade(req, socket, head, ws => (browser ? this.#addExtension(ws) : this.#addClient(ws)));
  }

  // ------------------------------------------------------------ extensions

  #addExtension(ws: WebSocket): void {
    const ext: ExtConn = { conn: this.#nextConn++, ws, hello: null, consent: false, tabs: new Map() };
    this.#extensions.set(ws, ext);
    this.#welcome(ws);
    ws.on("message", raw => this.#fromExtension(ext, raw.toString()));
    ws.on("close", () => {
      this.#extensions.delete(ws);
      this.#failPending(ext);
      this.#tabsChanged();
    });
    ws.on("error", () => ws.close());
  }

  #fromExtension(ext: ExtConn, raw: string): void {
    const f = parse<FromExtension>(raw);
    if (!f) return;
    switch (f.t) {
      case "hello":
        ext.hello = f;
        ext.consent = f.consent === true;
        this.#tabsChanged();
        return;
      case "consent":
        ext.consent = f.consent === true;
        this.#tabsChanged();
        return;
      case "tab":
        if (f.state === "gone") ext.tabs.delete(f.tab);
        else ext.tabs.set(f.tab, { state: f.state, title: f.title });
        this.#tabsChanged();
        return;
      case "reply": {
        const p = this.#pending.get(f.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.#pending.delete(f.id);
        send(p.client.ws, f.ok
          ? { t: "reply", id: p.clientId, ok: true, result: f.result }
          : { t: "reply", id: p.clientId, ok: false, code: f.code, message: f.message });
        return;
      }
      case "event":
        // More than one tab and the hub forwards nothing; the subscribers were told why by `#tabsChanged` (§7.5).
        if (this.#readyTabs().length !== 1) return;
        this.#broadcast({ t: "event", kind: f.kind, body: f.body });
        return;
      case "ping":
        return;
    }
  }

  // --------------------------------------------------------------- clients

  #addClient(ws: WebSocket): void {
    const client: ClientConn = { id: this.#nextConn++, ws, subscribed: false };
    this.#clients.set(ws, client);
    this.#welcome(ws);
    this.#armIdle();
    ws.on("message", raw => this.#fromClient(client, raw.toString()));
    ws.on("close", () => {
      this.#clients.delete(ws);
      // The grant is held per client connection, and released when that socket closes (§7.5).
      if (this.#driver === client) this.#driver = null;
      this.#armIdle();
    });
    ws.on("error", () => ws.close());
  }

  #fromClient(client: ClientConn, raw: string): void {
    const f = parse<FromClient>(raw);
    if (!f) return;
    switch (f.t) {
      case "hello":
        // Nothing to do with it here: every outcome of a version skew is a client's to take (§7.3), and the hub's own
        // version reached this client in the `welcome` it already has.
        return;
      case "retire":
        // The client sends this only when no driver held the grant; the hub checks again, because the two raced.
        if (this.#driver) return;
        void this.close().then(() => this.#onRetire());
        return;
      case "claim":
        send(client.ws, this.#grant(client) ? { t: "claimed", ok: true } : { t: "claimed", ok: false, code: "contended" });
        return;
      case "state":
        send(client.ws, this.#state(client));
        return;
      case "subscribe":
        client.subscribed = true;
        // A client subscribing while the count is already off one learns it now, not at the next crossing.
        if (this.#noticed) send(client.ws, { t: "notice", kind: "tabs", tabs: this.#readyTabs() });
        return;
      case "cmd":
        this.#route(client, f);
        return;
    }
  }

  /** Takes the grant for this client, or says it is held elsewhere. */
  #grant(client: ClientConn): boolean {
    if (this.#driver === null) this.#driver = client;
    return this.#driver === client;
  }

  #state(asking: ClientConn): HubState {
    const extensions = [];
    for (const e of this.#extensions.values()) {
      if (!e.hello) continue;
      extensions.push({
        conn: e.conn,
        target: e.hello.target,
        version: e.hello.version,
        flavour: e.hello.flavour,
        protocol: e.hello.protocol,
        consent: e.consent,
        // Beyond §7.6's table: the server reads the command list to tell a missing command from an unknown one, and to
        // decide per menu family whether to jump or press-walk (§10.1). Client-facing, so outside `PROTOCOL`.
        commands: [...(e.hello.commands ?? [])],
      });
    }
    return {
      t: "state",
      extensions,
      tabs: this.#readyTabs(true),
      driver: this.#driver === null ? null : this.#driver === asking ? "you" : "other",
    };
  }

  // --------------------------------------------------------------- routing

  /**
   * One command from one client to the one counted tab (§7.5). The checks run in the order the client can act on: who
   * is driving, then how many tabs there are, then whether that extension can answer this name at all.
   */
  #route(client: ClientConn, f: Extract<FromClient, { t: "cmd" }>): void {
    const refuse = (code: ClientRefusal, message: string, tabs?: TabInfo[]) =>
      send(client.ws, { t: "reply", id: f.id, ok: false, code, message, ...(tabs ? { tabs } : {}) });

    const spec = (STORE_COMMANDS as Record<string, { kind: "read" | "act" } | undefined>)[f.name];
    const acts = spec?.kind === "act";
    const pumping = f.name === "probe" && f.args?.pump === true;

    // Both gates only read the grant. Taking it waits until the command is about to go out, so a command that refuses
    // for any other reason leaves no grant behind for the next session to trip over.
    if (pumping) {
      // The pump gate: a settle that advances the loop is an act for gating, and never claims (§7.5).
      if (this.#driver !== client) return refuse("not-driver", "Only the session holding the driver grant may pump the game loop.");
    } else if (acts && this.#driver !== null && this.#driver !== client) {
      return refuse("contended", "Another session holds the Coachemon driver grant.");
    }

    const tabs = this.#readyTabs();
    if (tabs.length === 0) return refuse("no-tab", "No pokerogue.net tab is ready.");
    if (tabs.length > 1) return refuse("tabs", `${tabs.length} pokerogue.net tabs are ready.`, tabs);

    const target = tabs[0]!;
    const ext = [...this.#extensions.values()].find(e => e.conn === target.conn)!;
    const hello = ext.hello!;

    if (hello.protocol !== PROTOCOL && hello.protocol !== PROTOCOL - 1) {
      return refuse("protocol", `Coachemon ${hello.version} speaks protocol ${hello.protocol}; this hub speaks ${PROTOCOL}.`);
    }
    const offered = hello.commands ?? [];
    if (!spec) {
      // Outside the store table: routed only to a dev build that listed it, never to a store artifact (§10.6).
      if (hello.flavour !== "dev" || !offered.includes(f.name)) return refuse("unknown-command", `${f.name} is not a Coachemon command.`);
    } else if (!offered.includes(f.name)) {
      return refuse("missing-command", `Coachemon ${hello.version} in ${hello.target} does not offer ${f.name}.`);
    }

    // The implicit claim (§7.5): the first act from a client takes the grant, at the moment the act is sent.
    if (acts) this.#grant(client);

    const id = this.#nextCmd++;
    const timer = setTimeout(() => {
      this.#pending.delete(id);
      refuse("timeout", `${f.name} got no answer from Coachemon within ${this.#timeoutMs / 1000} s.`);
    }, this.#timeoutMs);
    timer.unref?.();
    this.#pending.set(id, { ext, client, clientId: f.id, timer });
    send(ext.ws, { t: "cmd", id, tab: target.tab, name: f.name, args: f.args ?? {} } satisfies ToExtension);
  }

  /** A browser that went away answers nothing it was already holding. */
  #failPending(ext: ExtConn): void {
    for (const [id, p] of [...this.#pending]) {
      if (p.ext !== ext) continue;
      clearTimeout(p.timer);
      this.#pending.delete(id);
      send(p.client.ws, { t: "reply", id: p.clientId, ok: false, code: "tab-gone", message: "Coachemon disconnected before the command answered." });
    }
  }

  // ------------------------------------------------------------ tabs, idle

  /** Every ready tab across every consented browser (§7.5). `all`: every tab a browser reported, for `state`. */
  #readyTabs(all = false): TabInfo[] {
    const out: TabInfo[] = [];
    for (const e of this.#extensions.values()) {
      if (!e.hello || (!e.consent && !all)) continue;
      for (const [tab, t] of e.tabs) {
        if (!all && t.state !== "ready") continue;
        out.push({ conn: e.conn, tab, target: e.hello.target, title: t.title, state: t.state });
      }
    }
    return out;
  }

  #tabsChanged(): void {
    const tabs = this.#readyTabs();
    if (tabs.length > 1 && !this.#noticed) {
      this.#noticed = true;
      this.#broadcast({ t: "notice", kind: "tabs", tabs });
    } else if (tabs.length === 1 && this.#noticed) {
      this.#noticed = false;
      this.#broadcast({ t: "notice", kind: "resume", tabs });
    }
    this.#armIdle();
  }

  /** §7.2: the hub exits after ten idle minutes. A browser holding no counted tab does not keep it alive. */
  #armIdle(): void {
    if (this.#idle) clearTimeout(this.#idle);
    this.#idle = null;
    if (this.#closed || this.#clients.size > 0 || this.#readyTabs().length > 0) return;
    this.#idle = setTimeout(() => void this.close().then(() => this.#onIdle()), this.#idleMs);
    this.#idle.unref?.();
  }

  /** To every client that asked for events; a client that did not subscribe hears nothing (§7.5). */
  #broadcast(frame: ToClient): void {
    for (const c of this.#clients.values()) if (c.subscribed) send(c.ws, frame);
  }

  #welcome(ws: WebSocket): void {
    send(ws, { t: "welcome", product: PRODUCT, protocol: PROTOCOL, version: this.#version });
  }
}

function send(ws: WebSocket, frame: ToClient | ToExtension): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
}

function parse<T>(raw: string): T | null {
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === "object" && v !== null && "t" in v ? (v as T) : null;
  } catch {
    return null;
  }
}
