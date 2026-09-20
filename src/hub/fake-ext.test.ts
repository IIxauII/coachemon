/**
 * `deadPort`: the port a test points a client at to watch it find no hub. The other fakes here are scripted by the
 * test that uses them, so they are checked by those tests; this one makes a promise of its own, which is what these
 * tests hold it to.
 *
 * The promise is the one `freePort` could not make — that no `listen(0)` in the run can be handed the port between
 * the test getting it and using it (#327). A hub that took it answered the handshake, and the test asserting an
 * unreachable game read that hub's rungs instead, which failed a release.
 */
import assert from "node:assert/strict";
import { connect, createServer } from "node:net";
import { after, test } from "node:test";
import { bandOutside, deadPort, EPHEMERAL_RANGE } from "./fake-ext.ts";

const shut: (() => void)[] = [];

after(() => {
  for (const s of shut) s();
});

/**
 * One port the kernel chose itself: what every hub in these tests binds, and what used to steal a dead port. It binds
 * port 0 directly rather than through `bindable`, so the sweep below is an honest witness and not the helper agreeing
 * with itself. `shut` is the failure path: an assertion that throws mid-sweep still gives the listeners back.
 */
function bindEphemeral(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise(resolve => {
    const s = createServer();
    shut.push(() => s.close());
    s.listen(0, "127.0.0.1", () => resolve({ port: (s.address() as { port: number }).port, close: () => new Promise<void>(r => s.close(() => r())) }));
  });
}

/** How a client finds nothing there: the connection is refused rather than accepted by a squatter. */
function dial(port: number): Promise<NodeJS.ErrnoException | null> {
  return new Promise(resolve => {
    const s = connect(port, "127.0.0.1", () => {
      s.destroy();
      resolve(null);
    });
    s.once("error", (e: NodeJS.ErrnoException) => resolve(e));
  });
}

test("a dead port has nothing listening on it (#327)", async () => {
  const port = await deadPort();
  assert.equal((await dial(port))?.code, "ECONNREFUSED");
});

test("a dead port is outside the ephemeral range, so no `listen(0)` in the run can be handed it (#327)", async () => {
  const port = await deadPort();
  const { first, last } = EPHEMERAL_RANGE;
  assert.ok(port < first || port > last, `${port} is in ${first}..${last}, the range the kernel hands out, so another test's hub can take it`);

  // The range is the guarantee; this is the witness to it, in the traffic that caused the flake — every hub in these
  // tests binds port 0. A sweep that did land on the dead port would mean the range above is wrong for this machine.
  const held = [];
  for (let i = 0; i < 200; i++) held.push(await bindEphemeral());
  const stolen = held.find(h => h.port === port);
  assert.equal(stolen, undefined, "a port-0 bind was handed the dead port");
  for (const h of held) await h.close();
});

test("a kernel with no room below its range gets a band above it, rather than every hub test failing (#327)", () => {
  // The usual Linux default, and macOS's, leave room underneath.
  assert.deepEqual(bandOutside({ first: 32_768, last: 60_999 }), { first: 22_768, width: 10_000 });
  assert.deepEqual(bandOutside({ first: 49_152, last: 65_535 }), { first: 39_152, width: 10_000 });
  // A range starting too low for that: the ports above its end are still ports `listen(0)` is never handed.
  assert.deepEqual(bandOutside({ first: 10_000, last: 60_999 }), { first: 61_000, width: 4_536 });
  // A kernel that hands out everything leaves nowhere to stand, and says so rather than picking a port it hands out.
  assert.throws(() => bandOutside({ first: 1_024, last: 65_535 }), /leaves no band of ports outside it/);
});

test("two dead ports are different, so one test's port is never another's (#327)", async () => {
  const ports = [await deadPort(), await deadPort(), await deadPort()];
  assert.equal(new Set(ports).size, ports.length, `repeated ports: ${ports.join(", ")}`);
});
