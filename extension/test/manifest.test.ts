/**
 * The manifests (§5.3, §5.4), pinned key by key. The guard checks the artifact; this checks the intent, so a change
 * to a reviewed value has to be deliberate.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { Target } from "../../src/protocol/wire.ts";
import {
  ACTION_TITLE,
  BANNED_MANIFEST_KEYS,
  BANNED_MANIFEST_WORDS,
  DESCRIPTION,
  GECKO_ID,
  GECKO_MIN_VERSION,
  MATCHES,
  manifestFor,
  storeVersion,
} from "../src/build/manifest.ts";

const TARGETS: Target[] = ["chrome", "firefox", "safari"];
const store = (target: Target) => manifestFor({ target, flavour: "store", version: "1.2.3" });

test("a store build declares no permission of any kind, on any target (§6)", () => {
  for (const target of TARGETS) {
    const m = store(target);
    for (const key of BANNED_MANIFEST_KEYS) assert.ok(!(key in m), `${target} store manifest has ${key}`);
    const text = JSON.stringify(m);
    for (const word of BANNED_MANIFEST_WORDS) assert.ok(!text.includes(word), `${target} store manifest mentions ${word}`);
  }
});

test("every target carries the same identity and the same two content scripts (§3, §5.3)", () => {
  for (const target of TARGETS) {
    const m = store(target);
    assert.equal(m.name, "Coachemon");
    assert.equal(m.description, DESCRIPTION);
    assert.equal(m.homepage_url, "https://github.com/IIxauII/coachemon");
    assert.deepEqual(m.icons, { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" });
    assert.deepEqual(m.content_scripts, [
      { matches: MATCHES, js: ["relay.js"], run_at: "document_start", world: "ISOLATED" },
      { matches: MATCHES, js: ["page.js", "hud.js"], run_at: "document_idle", world: "MAIN" },
    ]);
  }
  // Not `*.pokerogue.net`: the beta site was never reviewed against (§6).
  assert.deepEqual(MATCHES, ["https://pokerogue.net/*"]);
});

test("Chrome's floor is `world: \"MAIN\"`'s, on a service worker (§5.3)", () => {
  const m = store("chrome");
  assert.equal(m.minimum_chrome_version, "111");
  assert.deepEqual(m.background, { service_worker: "background.js" });
  // Nothing pins the extension id, so Chrome needs no `key`.
  assert.ok(!("key" in m));
});

test("Firefox carries the CSP override, the gecko id and the data-collection declaration (§5.3)", () => {
  const m = store("firefox");
  assert.deepEqual(m.background, { scripts: ["background.js"] });
  assert.deepEqual(m.action, { default_title: ACTION_TITLE });
  assert.deepEqual(m.content_security_policy, { extension_pages: "script-src 'self'" });
  assert.deepEqual(m.browser_specific_settings, {
    gecko: {
      id: GECKO_ID,
      strict_min_version: GECKO_MIN_VERSION,
      data_collection_permissions: { required: ["none"], optional: ["websiteContent"] },
    },
  });
  // The title is the pre-140 consent experience itself, so it must say what the click allows (§8.4).
  assert.match(ACTION_TITLE, /local AI agent read this game/);
});

test("the Firefox floor clears `data_collection_permissions` on both platforms, desktop-only (§5.3)", () => {
  // Both halves are load-bearing and neither is obvious, so both are pinned; `GECKO_MIN_VERSION` carries the why.
  assert.equal(GECKO_MIN_VERSION, "142.0");
  const bss = store("firefox").browser_specific_settings as Record<string, unknown>;
  assert.ok(!("gecko_android" in bss), "a `gecko_android` key would list the add-on on Firefox for Android");
});

test("Safari gets an event page and the 18 floor (§5.3)", () => {
  const m = store("safari");
  assert.deepEqual(m.background, { scripts: ["background.js"], persistent: false });
  assert.deepEqual(m.browser_specific_settings, { safari: { strict_min_version: "18.0" } });
});

test("the dev flavour adds exactly the two permissions it needs (§5.4)", () => {
  for (const target of TARGETS) {
    const m = manifestFor({ target, flavour: "dev", version: "1.2.3" });
    assert.deepEqual(m.permissions, ["scripting", "activeTab"]);
    assert.deepEqual(m.host_permissions, ["<all_urls>"]);
    // Everything else is the store manifest, unchanged.
    const { permissions, host_permissions, ...rest } = m;
    assert.deepEqual(rest, store(target));
  }
});

test("a store version is three numbers, whatever package.json says (§14.2)", () => {
  assert.equal(storeVersion("1.2.3"), "1.2.3");
  assert.equal(storeVersion("0.0.0-placeholder"), "0.0.0");
  assert.equal(storeVersion("10.20.30+build"), "10.20.30");
  assert.equal(storeVersion("not a version"), "0.0.0");
});
