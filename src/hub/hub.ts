/**
 * The hub (§7): one detached process per machine owns the `127.0.0.1` listener. Every MCP server and watch CLI is a
 * client; every browser's extension is a browser connection. It routes a command from one client to the one counted
 * tab, counts tabs across every browser, holds the driver grant and fans out events.
 *
 * It knows nothing about the game and caches nothing: no queue, no retry, no result inspection. A command that cannot
 * be routed is refused at once with a hub code (§7.6), never held.
 *
 * `src/hub/main.ts` is the process around this; a test drives it on a port of its own with a fake extension client.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { STORE_COMMANDS } from "../protocol/commands.ts";
import { DEV_COMMAND_NAMES, type DevCommandName } from "../protocol/dev-commands.ts";
import { PRODUCT, PROTOCOL } from "../protocol/version.ts";
import type { ClientReply, ExtensionHello, FromClient, FromExtension, HubCode, TabInfo, ToClient, ToExtension } from "../protocol/wire.ts";

/** No reply from the extension within this long and the client hears `timeout` instead (§7.6). */
export const COMMAND_TIMEOUT_MS = 5_000;
/** No clients and no counted tabs for this long and the hub exits (§7.2). */
export const IDLE_EXIT_MS = 10 * 60_000;

/** The ceiling on how often the idle check runs; the exit is never precise, and nothing depends on it being so. */
const IDLE_TICK_MS = 15_000;

/** An `Origin` from one of these is a browser; absent is a local client; anything else is 403 (§7.4). */
const EXTENSION_SCHEMES = new Set(["chrome-extension:", "moz-extension:", "safari-web-extension:"]);

export type ConnKind = "client" | "browser";

/**
 * Who may open a socket (§7.4). `Host` must be the loopback address and the port we actually bound, which is what
 * defeats DNS rebinding; the extension's id is never checked, because no browser keeps it stable (§2.1).
 */
export function authorize(headers: IncomingHttpHeaders, port: number): ConnKind | null {
  if (headers.host !== `127.0.0.1:${port}`) return null;
  const origin = headers.origin;
  if (origin === undefined || origin === "") return "client";
  const scheme = origin.slice(0, origin.indexOf(":") + 1);
  return EXTENSION_SCHEMES.has(scheme) ? "browser" : null;
}

type TabRecord = { tab: number; state: TabInfo["state"]; title: string };

type Browser = {
  kind: "browser";
  conn: number;
  ws: WebSocket;
  hello: ExtensionHello | null;
  consent: boolean;
  tabs: Map<number, TabRecord>;
};

type Client = {
  kind: "client";
  conn: number;
  ws: WebSocket;
  version: string | null;
  subscribed: boolean;
};

type Pending = { client: Client; id: number; browser: Browser; timer: NodeJS.Timeout };

export type HubOptions = {
  /** `0` binds a free port, which the hub then treats as its own for the `Host` check. */
  port: number;
  /** This plugin copy's version, for the handshake's skew comparison (§7.3). */
  version: string;
  idleMs?: number;
  timeoutMs?: number;
  /** No clients and no counted tabs for `idleMs`: the process around the hub exits (§7.2). */
  onIdle?: () => void;
  /** A newer client retired this hub: every connection is closed and the process exits (§7.3). */
  onRetire?: () => void;
};

export class Hub {
  readonly #version: string;
  readonly #timeoutMs: number;
  readonly #idleMs: number;
  readonly #onIdle: () => void;
  readonly #onRetire: () => void;
  readonly #server: Server;
  readonly #wss = new WebSocketServer({ noServer: true });
  readonly #browsers = new Set<Browser>();
  readonly #clients = new Set<Client>();
  readonly #pending = new Map<number, Pending>();
  #port = 0;
  #conns = 0;
  #commands = 0;
  #driver: Client | null = null;
  /** Whether subscribers have been told the tab count left one: one notice per transition, not one per event (§7.5). */
  #noticed = false;
  #idleSince: number;
  #idleTimer: NodeJS.Timeout | null = null;

  constructor(o: HubOptions) {
    this.#version = o.version;
    this.#timeoutMs = o.timeoutMs ?? COMMAND_TIMEOUT_MS;
    this.#idleMs = o.idleMs ?? IDLE_EXIT_MS;
    this.#onIdle = o.onIdle ?? (() => {});
    this.#onRetire = o.onRetire ?? (() => {});
    this.#idleSince = Date.now();
    this.#server = createServer((_req, res) => {
      res.writeHead(403).end();
    });
    this.#server.on("upgrade", (req, socket, head) => this.#upgrade(req.headers, socket, head));
  }

  get port(): number {
    return this.#port;
  }

  /** Rejects with the listen error, `EADDRINUSE` included: another hub already owns the port (§7.2). */
  listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.#server.once("error", reject);
      this.#server.listen(port, "127.0.0.1", () => {
        const addr = this.#server.address();
        this.#port = typeof addr === "object" && addr !== null ? addr.port : port;
        this.#server.removeListener("error", reject);
        this.#idleTimer = setInterval(() => this.#checkIdle(), Math.min(this.#idleMs, IDLE_TICK_MS));
        this.#idleTimer.unref();
        resolve(this.#port);
      });
    });
  }

  close(): void {
    for (const p of this.#pending.values()) clearTimeout(p.timer);
    this.#pending.clear();
    if (this.#idleTimer) clearInterval(this.#idleTimer);
    for (const c of [...this.#clients, ...this.#browsers]) c.ws.close();
    this.#wss.close();
    this.#server.close();
  }

  // ------------------------------------------------------------ connections

  #upgrade(headers: IncomingHttpHeaders, socket: Duplex, head: Buffer): void {
    const kind = authorize(headers, this.#port);
    if (kind === null) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    this.#wss.handleUpgrade({ headers, method: "GET", url: "/" } as never, socket, head, ws => {
      this.#idleSince = Date.now();
      if (kind === "browser") this.#browser(ws);
      else this.#client(ws);
    });
  }

  #browser(ws: WebSocket): void {
    const b: Browser = { kind: "browser", conn: ++this.#conns, ws, hello: null, consent: false, tabs: new Map() };
    this.#browsers.add(b);
    ws.on("message", raw => {
      const f = parse<FromExtension>(raw);
      if (f) this.#fromBrowser(b, f);
    });
    ws.on("close", () => {
      this.#browsers.delete(b);
      // Every command in flight to this browser's tab loses its tab with the socket.
      for (const [hubId, p] of [...this.#pending]) if (p.browser === b) this.#refusePending(hubId, "no-tab", "The tab's browser disconnected before it answered.");
      this.#afterTabs();
    });
  }

  #client(ws: WebSocket): void {
    const c: Client = { kind: "client", conn: ++this.#conns, ws, version: null, subscribed: false };
    this.#clients.add(c);
    ws.on("message", raw => {
      const f = parse<FromClient>(raw);
      if (f) this.#fromClient(c, f);
    });
    ws.on("close", () => {
      this.#clients.delete(c);
      // The grant is held per connection: closing the socket releases it (§7.5).
      if (this.#driver === c) this.#driver = null;
      for (const [hubId, p] of [...this.#pending]) if (p.client === c) this.#drop(hubId);
      if (this.#clients.size === 0) this.#idleSince = Date.now();
    });
  }

  // ------------------------------------------------------------- from a browser

  #fromBrowser(b: Browser, f: FromExtension): void {
    switch (f.t) {
      case "hello":
        b.hello = f;
        b.consent = f.consent === true;
        send(b.ws, { t: "welcome", product: PRODUCT, protocol: PROTOCOL, version: this.#version });
        this.#afterTabs();
        return;
      case "consent":
        b.consent = f.consent === true;
        this.#afterTabs();
        return;
      case "tab":
        if (f.state === "gone") b.tabs.delete(f.tab);
        else b.tabs.set(f.tab, { tab: f.tab, state: f.state, title: f.title });
        this.#afterTabs();
        return;
      case "reply": {
        const p = this.#pending.get(f.id);
        if (!p) return;
        this.#drop(f.id);
        if (f.ok) send(p.client.ws, { t: "reply", id: p.id, ok: true, result: f.result });
        else send(p.client.ws, { t: "reply", id: p.id, ok: false, code: f.code, message: f.message });
        return;
      }
      case "event": {
        // With more than one tab the hub forwards nothing: the subscribers already hold a `tabs` notice (§7.5).
        if (this.#counted().length !== 1) return;
        for (const c of this.#clients) if (c.subscribed) send(c.ws, { t: "event", kind: f.kind, body: f.body });
        return;
      }
      case "ping":
        return;
    }
  }

  // -------------------------------------------------------------- from a client

  #fromClient(c: Client, f: FromClient): void {
    switch (f.t) {
      case "hello":
        c.version = f.version;
        send(c.ws, { t: "welcome", product: PRODUCT, protocol: PROTOCOL, version: this.#version });
        return;
      case "retire":
        // A newer plugin copy is taking over: every connection goes, then the process around us (§7.3).
        this.close();
        this.#onRetire();
        return;
      case "claim":
        send(c.ws, this.#claim(c) ? { t: "claimed", ok: true } : { t: "claimed", ok: false, code: "contended" });
        return;
      case "state":
        send(c.ws, this.#state(c));
        return;
      case "subscribe": {
        c.subscribed = true;
        // A client that subscribes into an already-split tab count hears the same notice as one that watched it split.
        const counted = this.#counted();
        if (counted.length > 1) send(c.ws, { t: "notice", kind: "tabs", tabs: counted.map(t => t.info) });
        return;
      }
      case "cmd":
        this.#route(c, f.id, f.name, f.args ?? {});
        return;
    }
  }

  /** The grant, per client connection: taken while free, kept while held, refused to anyone else (§7.5). */
  #claim(c: Client): boolean {
    if (this.#driver === null) this.#driver = c;
    return this.#driver === c;
  }

  #state(asking: Client): ToClient {
    return {
      t: "state",
      extensions: [...this.#browsers].flatMap(b =>
        b.hello === null
          ? []
          : [{ conn: b.conn, target: b.hello.target, version: b.hello.version, flavour: b.hello.flavour, protocol: b.hello.protocol, consent: b.consent, commands: b.hello.commands }],
      ),
      tabs: this.#tabs(),
      driver: this.#driver === null ? null : this.#driver === asking ? "you" : "other",
    };
  }

  // ------------------------------------------------------------------ routing

  #route(c: Client, id: number, name: string, args: Record<string, unknown>): void {
    const refuse = (code: HubCode, message: string, tabs?: TabInfo[]) => send(c.ws, { t: "reply", id, ok: false, code, message, ...(tabs ? { tabs } : {}) } satisfies ClientReply);
    const store = Object.hasOwn(STORE_COMMANDS, name) ? STORE_COMMANDS[name as keyof typeof STORE_COMMANDS] : null;
    const dev = DEV_COMMAND_NAMES.includes(name as DevCommandName);
    if (!store && !dev) return refuse("unknown-command", `${name} is not a Coachemon command.`);

    const counted = this.#counted();
    if (counted.length === 0) return refuse("no-tab", "No pokerogue.net tab is connected.");
    if (counted.length > 1) return refuse("tabs", `${counted.length} pokerogue.net tabs are connected.`, counted.map(t => t.info));
    const { browser, info } = counted[0];
    const hello = browser.hello as ExtensionHello;

    if (hello.protocol !== PROTOCOL && hello.protocol !== PROTOCOL - 1) {
      return refuse("protocol", `Coachemon in ${hello.target} speaks protocol ${hello.protocol}; this hub speaks ${PROTOCOL}.`);
    }
    // A dev command only ever reaches a dev build, which pairs with a server from the same checkout (§10.6).
    if (dev && hello.flavour !== "dev") return refuse("unknown-command", `${name} needs a dev build of Coachemon.`);
    if (!hello.commands.includes(name)) return refuse("missing-command", `Coachemon in ${hello.target} does not have the ${name} command.`);

    // Acts need the grant, and take it implicitly; a pumping probe needs it and never takes it (§7.5).
    if (store?.kind === "act") {
      if (!this.#claim(c)) return refuse("contended", "Another session is driving this tab.");
    } else if (name === "probe" && args.pump === true) {
      if (this.#driver !== c) return refuse("not-driver", "Only the driving session may pump the game loop.");
    }

    const hubId = ++this.#commands;
    const timer = setTimeout(() => this.#refusePending(hubId, "timeout", `${name} got no answer from Coachemon within ${this.#timeoutMs} ms.`), this.#timeoutMs);
    this.#pending.set(hubId, { client: c, id, browser, timer });
    send(browser.ws, { t: "cmd", id: hubId, tab: info.tab, name, args });
  }

  #refusePending(hubId: number, code: HubCode, message: string): void {
    const p = this.#pending.get(hubId);
    if (!p) return;
    this.#drop(hubId);
    send(p.client.ws, { t: "reply", id: p.id, ok: false, code, message });
  }

  #drop(hubId: number): void {
    const p = this.#pending.get(hubId);
    if (!p) return;
    clearTimeout(p.timer);
    this.#pending.delete(hubId);
  }

  // --------------------------------------------------------------------- tabs

  /** Every tab every browser that said hello has reported, whatever its state: what `state` shows, so the ladder can read it. */
  #known(): { browser: Browser; hello: ExtensionHello; info: TabInfo }[] {
    return [...this.#browsers].flatMap(b =>
      b.hello === null ? [] : [...b.tabs.values()].map(t => ({ browser: b, hello: b.hello as ExtensionHello, info: { conn: b.conn, tab: t.tab, target: (b.hello as ExtensionHello).target, title: t.title, state: t.state } })),
    );
  }

  #tabs(): TabInfo[] {
    return this.#known().map(t => t.info);
  }

  /** A tab counts once its relay announced the page handlers ready and its browser has consent (§7.5, §8.4). */
  #counted(): { browser: Browser; info: TabInfo }[] {
    return this.#known().filter(t => t.info.state === "ready" && t.browser.consent);
  }

  /** One `tabs` notice on leaving a single tab, one `resume` on returning to it (§7.5). */
  #afterTabs(): void {
    const counted = this.#counted();
    if (counted.length === 0) this.#idleSince = Date.now();
    if (counted.length > 1 && !this.#noticed) {
      this.#noticed = true;
      this.#notice("tabs", counted.map(t => t.info));
    } else if (counted.length === 1 && this.#noticed) {
      this.#noticed = false;
      this.#notice("resume", counted.map(t => t.info));
    }
  }

  #notice(kind: "tabs" | "resume", tabs: TabInfo[]): void {
    for (const c of this.#clients) if (c.subscribed) send(c.ws, { t: "notice", kind, tabs });
  }

  #checkIdle(): void {
    if (this.#clients.size > 0 || this.#counted().length > 0) {
      this.#idleSince = Date.now();
      return;
    }
    if (Date.now() - this.#idleSince < this.#idleMs) return;
    this.close();
    this.#onIdle();
  }
}

export async function startHub(o: HubOptions): Promise<Hub> {
  const hub = new Hub(o);
  await hub.listen(o.port);
  return hub;
}

function send(ws: WebSocket, frame: ToClient | ToExtension): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
}

/** A frame that is not JSON, or not an object with a `t`, is dropped: the hub answers nothing to nonsense. */
function parse<T>(raw: unknown): T | null {
  try {
    const v = JSON.parse(String(raw)) as { t?: unknown };
    return typeof v === "object" && v !== null && typeof v.t === "string" ? (v as T) : null;
  } catch {
    return null;
  }
}
