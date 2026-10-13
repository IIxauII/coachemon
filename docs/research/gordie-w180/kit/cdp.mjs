const port = 9222;
const expr = process.argv[2];
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const t = tabs.find(x => x.url.includes("pokerogue.net"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true, awaitPromise: true } }));
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) { const v = d.result?.result?.value; console.log(typeof v === "string" ? v : JSON.stringify(v ?? d)); process.exit(0); } };
