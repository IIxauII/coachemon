/**
 * Reads and pokes the throwaway Chrome of `keyprobe-chrome.ts` over its CDP port, for #1019. Nothing here sends a key.
 *
 *   node scripts/keyprobe-cdp.ts <port> targets
 *   node scripts/keyprobe-cdp.ts <port> js <url-prefix> <expression>   (awaits a promise; prints the value)
 *   node scripts/keyprobe-cdp.ts <port> open <url>
 *   node scripts/keyprobe-cdp.ts <port> front <url-prefix>              (that tab becomes the active one)
 *   node scripts/keyprobe-cdp.ts <port> close <url-prefix>
 */
const [portArg, verb, ...rest] = process.argv.slice(2);
const base = `http://127.0.0.1:${portArg}`;
type Target = { id: string; type: string; url: string; title: string; webSocketDebuggerUrl: string };
const list = async (): Promise<Target[]> => (await fetch(`${base}/json/list`)).json() as Promise<Target[]>;
const find = async (prefix: string): Promise<Target> => {
  const all = (await list()).filter(x => x.url.startsWith(prefix));
  const t = all.find(x => x.type === "page") ?? all[0];
  if (!t) throw new Error(`no target at ${prefix}`);
  return t;
};

async function evaluate(t: Target, expression: string): Promise<unknown> {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("ws failed")); });
  const reply = await new Promise<Record<string, unknown>>(res => {
    ws.onmessage = e => res(JSON.parse(String(e.data)) as Record<string, unknown>);
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
  });
  ws.close();
  const r = reply.result as { result?: { value?: unknown }; exceptionDetails?: unknown } | undefined;
  if (r?.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r?.result?.value;
}

switch (verb) {
  case "targets":
    for (const t of await list()) process.stdout.write(`${t.type}\t${t.id}\t${t.url}\n`);
    break;
  case "js": {
    const v = await evaluate(await find(rest[0]), rest[1]);
    process.stdout.write(`${typeof v === "string" ? v : JSON.stringify(v, null, 1)}\n`);
    break;
  }
  case "open":
    await fetch(`${base}/json/new?${rest[0]}`, { method: "PUT" });
    break;
  case "front":
    await fetch(`${base}/json/activate/${(await find(rest[0])).id}`);
    break;
  case "close":
    await fetch(`${base}/json/close/${(await find(rest[0])).id}`);
    break;
  default:
    throw new Error("targets | js <prefix> <expr> | open <url> | front <prefix> | close <prefix>");
}
