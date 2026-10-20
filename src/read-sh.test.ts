import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { WebSocketServer } from "ws";

const readSh = fileURLToPath(new URL("../skills/coachemon/scripts/read.sh", import.meta.url));
const shut: (() => void)[] = [];
after(() => { for (const s of shut) s(); });

/** A debug port listing `targets`; evaluating in one answers with that target's id. */
async function debugPort(targets: { id: string; type: string; url: string }[]): Promise<number> {
  const http = createServer((_req, res) => {
    const port = (http.address() as AddressInfo).port;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(targets.map(t => ({ ...t, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/${t.id}` }))));
  });
  const wss = new WebSocketServer({ server: http });
  wss.on("connection", (ws, req) => ws.on("message", raw => {
    const { id } = JSON.parse(String(raw)) as { id: number };
    ws.send(JSON.stringify({ id, result: { result: { value: req.url!.slice(1) } } }));
  }));
  await new Promise<void>(r => http.listen(0, "127.0.0.1", r));
  shut.push(() => { wss.close(); http.close(); });
  return (http.address() as AddressInfo).port;
}

const readChrome = async (port: number) =>
  (await promisify(execFile)("bash", [readSh, "chrome", "battle"], { env: { ...process.env, COACHEMON_PORT: String(port) } }))
    .stdout.trim();

test("read.sh reads the game, not the wiki listed before it (#644)", async () => {
  const port = await debugPort([
    { id: "wiki", type: "page", url: "https://wiki.pokerogue.net/wiki/Main_Page" },
    { id: "game", type: "page", url: "https://pokerogue.net/" },
  ]);
  assert.equal(await readChrome(port), "game");
});

test("read.sh reads the game page, not a worker on the game's origin listed before it (#644)", async () => {
  const port = await debugPort([
    { id: "worker", type: "service_worker", url: "https://pokerogue.net/sw.js" },
    { id: "game", type: "page", url: "https://pokerogue.net/" },
  ]);
  assert.equal(await readChrome(port), "game");
});
