/**
 * Firefox's consent (§8.4): the 140+ data-collection permission, the pre-140 toolbar click, and Orion — which runs the
 * AMO build and must count as consented without ever showing a click.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { Target } from "../../src/protocol/wire.ts";
import { CONSENT_KEY, DATA_COLLECTION, startConsent, type ConsentDeps } from "../src/transport/consent.ts";

function deps(o: {
  target?: Target;
  name?: string | null;
  all?: Record<string, unknown>;
  contains?: boolean;
  requestGrants?: boolean;
  stored?: string | null;
}) {
  const store = new Map<string, string>(o.stored ? [[CONSENT_KEY, o.stored]] : []);
  const clicks: (() => void)[] = [];
  const requested: unknown[] = [];
  const d: ConsentDeps = {
    target: o.target ?? "firefox",
    browserName: async () => o.name ?? "Firefox",
    permissions: {
      getAll: async () => o.all ?? {},
      contains: async () => o.contains ?? false,
      request: async p => {
        requested.push(p);
        return o.requestGrants ?? true;
      },
    },
    store: { get: key => store.get(key) ?? null, set: (key, value) => void store.set(key, value) },
    onClick: fn => void clicks.push(fn),
  };
  return { d, store, clicks, requested };
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
      // The 140+ path requests a permission, so let its promise settle before reading the count.
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

test("Firefox 140+ asks for the data-collection permission on the click (§8.4)", async () => {
  const h = deps({ all: { data_collection: [] }, contains: false });
  const r = await run(h);
  assert.equal(r.granted(), 0, "consent before the click");
  await r.click();
  assert.deepEqual(h.requested, [DATA_COLLECTION]);
  assert.equal(r.granted(), 1);
  // 140+ records nothing itself: `permissions.contains` is the state.
  assert.equal(h.store.size, 0);
});

test("Firefox 140+ that already holds the permission starts consented (§8.4)", async () => {
  const r = await run(deps({ all: { data_collection: [] }, contains: true }));
  assert.equal(r.granted(), 1);
});

test("a refused 140+ request leaves the browser unconsented (§8.4)", async () => {
  const h = deps({ all: { data_collection: [] }, requestGrants: false });
  const r = await run(h);
  await r.click();
  assert.equal(r.granted(), 0);
});

test("a Firefox with no built-in consent records the click in its own localStorage (§8.4)", async () => {
  const h = deps({ all: { permissions: [], origins: [] } });
  const r = await run(h);
  assert.equal(r.granted(), 0);
  await r.click();
  assert.equal(r.granted(), 1);
  assert.equal(h.store.get(CONSENT_KEY), "true");
  // No permission is requested on this path: those versions have none to request.
  assert.deepEqual(h.requested, []);
});

test("a Firefox with no built-in consent remembers a click from a previous session (§8.4)", async () => {
  const r = await run(deps({ all: { permissions: [] }, stored: "true" }));
  assert.equal(r.granted(), 1);
});
