/**
 * Reads and pokes the throwaway Firefox of `keyprobe-firefox.ts` through its relay, for #1019. Nothing here sends a key.
 *
 *   node scripts/keyprobe-bidi.ts <relay-port> tree
 *   node scripts/keyprobe-bidi.ts <relay-port> js <url-prefix> <expression>   (awaits a promise; prints the value)
 *   node scripts/keyprobe-bidi.ts <relay-port> open <url>                      (a new tab)
 *   node scripts/keyprobe-bidi.ts <relay-port> front <url-prefix>
 *   node scripts/keyprobe-bidi.ts <relay-port> close <url-prefix>
 */
const [portArg, verb, ...rest] = process.argv.slice(2);
const call = async (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
  const r = await fetch(`http://127.0.0.1:${portArg}`, { method: "POST", body: JSON.stringify({ method, params }) });
  const m = (await r.json()) as Record<string, unknown>;
  if (m.error) throw new Error(`${method}: ${String(m.error)} ${String(m.message ?? "")}`);
  return (m.result ?? {}) as Record<string, unknown>;
};
type Ctx = { context: string; url: string; children?: Ctx[] };
const flat = (cs: Ctx[]): Ctx[] => cs.flatMap(c => [c, ...flat(c.children ?? [])]);
const all = async (): Promise<Ctx[]> => flat(((await call("browsingContext.getTree", {})) as { contexts: Ctx[] }).contexts);
const find = async (prefix: string): Promise<Ctx> => {
  const c = (await all()).find(x => x.url.startsWith(prefix));
  if (!c) throw new Error(`no context at ${prefix}`);
  return c;
};

switch (verb) {
  case "tree":
    for (const c of await all()) process.stdout.write(`${c.context}\t${c.url}\n`);
    break;
  case "js": {
    const r = await call("script.evaluate", { expression: rest[1], target: { context: (await find(rest[0])).context }, awaitPromise: true });
    const v = r.result as { type: string; value?: unknown } | undefined;
    if (r.type === "exception") throw new Error(JSON.stringify(r.exceptionDetails));
    process.stdout.write(`${v?.type === "string" ? String(v.value) : JSON.stringify(v)}\n`);
    break;
  }
  case "open": {
    const c = (await call("browsingContext.create", { type: "tab" })) as { context: string };
    await call("browsingContext.navigate", { context: c.context, url: rest[0], wait: "interactive" });
    break;
  }
  case "front":
    await call("browsingContext.activate", { context: (await find(rest[0])).context });
    break;
  case "close":
    await call("browsingContext.close", { context: (await find(rest[0])).context });
    break;
  default:
    throw new Error("tree | js <prefix> <expr> | open <url> | front <prefix> | close <prefix>");
}
