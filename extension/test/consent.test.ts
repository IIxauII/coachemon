/**
 * Firefox's consent (§8.4): the data-collection permission the toolbar click asks for, and Orion — which runs the
 * AMO build and must count as consented without ever showing a click.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { Target } from "../../src/protocol/wire.ts";
import { DATA_COLLECTION, startConsent, type ConsentDeps } from "../src/transport/consent.ts";

function deps(o: { target?: Target; name?: string | null; contains?: boolean; requestGrants?: boolean }) {
  const clicks: (() => void)[] = [];
  const requested: unknown[] = [];
  const d: ConsentDeps = {
    target: o.target ?? "firefox",
    browserName: async () => o.name ?? "Firefox",
    permissions: {
      contains: async () => o.contains ?? false,
      request: async p => {
        requested.push(p);
        return o.requestGrants ?? true;
      },
    },
    onClick: fn => void clicks.push(fn),
  };
  return { d, clicks, requested };
}

/** `startConsent` calls `grant` synchronously or not at all; this collects whichever. */
async function run(h: ReturnType<typeof deps>) {
  let granted = 0;
  await startConsent(h.d, () => void granted++);
  return {
    granted: () => granted,
    click: async () => {
      assert.equal(h.clicks.length, 1, "no click handler was registered");
      h.clicks[0]();
      // The click requests a permission, so let its promise settle before reading the count.
      await new Promise(r => setImmediate(r));
    },
  };
}

test("Chrome and Safari have no consent step at all (§8.4)", async () => {
  for (const target of ["chrome", "safari"] as Target[]) {
    const h = deps({ target });
    const r = await run(h);
    assert.equal(r.granted(), 1);
    assert.equal(h.clicks.length, 0, `${target} registered a consent click`);
  }
});

test("Orion running the AMO build counts as consented (§8.4)", async () => {
  const h = deps({ target: "firefox", name: "Orion" });
  const r = await run(h);
  assert.equal(r.granted(), 1);
  assert.equal(h.clicks.length, 0);
});

test("Firefox asks for the data-collection permission on the click (§8.4)", async () => {
  const h = deps({ contains: false });
  const r = await run(h);
  assert.equal(r.granted(), 0, "consent before the click");
  await r.click();
  assert.deepEqual(h.requested, [DATA_COLLECTION]);
  assert.equal(r.granted(), 1);
});

test("Firefox that already holds the permission starts consented (§8.4)", async () => {
  const r = await run(deps({ contains: true }));
  assert.equal(r.granted(), 1);
});

test("a refused request leaves the browser unconsented (§8.4)", async () => {
  const h = deps({ requestGrants: false });
  const r = await run(h);
  await r.click();
  assert.equal(r.granted(), 0);
});
