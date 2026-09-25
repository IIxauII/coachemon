/**
 * The store-artifact guard (§5.5). It runs against what the build actually wrote, not against the source, and CI runs
 * it after every build: it is the thing standing between a dev affordance and a store review.
 *
 * Check 4 — the dispatch keys — is the real one. The string checks are a backstop; if a vendored library ever trips
 * one, narrow that check to our own entry chunks, never drop it.
 */
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { walk } from "../src/build/artifact.ts";
import { BANNED_MANIFEST_KEYS, BANNED_MANIFEST_WORDS } from "../src/build/manifest.ts";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { COMMAND_NAMES } from "../../src/protocol/commands.ts";
import { DEV_COMMAND_NAMES } from "../../src/protocol/dev-commands.ts";
import { EVENT, encode } from "../src/relay/channel.ts";

const OUT = fileURLToPath(new URL("../.output/", import.meta.url));

/**
 * Anything that would be a dev affordance or the dev port, in a store artifact's files. §5.5 spells the interpreter
 * check as `new Function(`; the minifier drops the `new`, which no artifact would ever have tripped on, so the bare
 * call is banned too.
 */
const BANNED_IN_STORE = ["47148", "eval(", "new Function(", "Function(", "screenshot", "captureVisibleTab", "executeScript", "runtime.reload", "dev-reload"];

/** The store hub's URL, which a store build must actually dial (§8.1). */
const REQUIRED_IN_STORE = "ws://127.0.0.1:47147";

type Artifact = { name: string; dir: string; flavour: "store" | "dev"; target: string };

function artifacts(): Artifact[] {
  const dirs = readdirSync(OUT).filter(name => statSync(join(OUT, name)).isDirectory() && /-mv3-(store|dev)$/.test(name));
  return dirs.map(name => ({
    name,
    dir: join(OUT, name),
    flavour: name.endsWith("-dev") ? "dev" : "store",
    target: name.split("-")[0],
  }));
}

/** Every file in an artifact except the icons, which are the only binaries. */
function files(dir: string): { path: string; rel: string }[] {
  return walk(dir, name => !name.endsWith(".png")).map(rel => ({ path: join(dir, rel), rel }));
}

const manifestOf = (a: Artifact) => JSON.parse(readFileSync(join(a.dir, "manifest.json"), "utf8")) as Record<string, unknown>;

/**
 * Check 4: load the built `page.js` in a context with nothing but a fake document, and read the command list out of
 * the hello it announces itself with (§9.3). A store artifact's list must **equal** `STORE_COMMANDS`.
 */
function commandsOf(a: Artifact): { build: string; commands: string[]; answers: boolean } {
  const doc = new EventTarget();
  const hellos: { build: string; side: string; commands?: string[] }[] = [];
  doc.addEventListener(EVENT.hello, e => {
    const detail = (e as CustomEvent<string>).detail;
    const parsed = JSON.parse(detail);
    if (parsed.side === "page") hellos.push(parsed);
  });
  const context = createContext({ document: doc, window: {}, CustomEvent, console, JSON, Promise });
  runInContext(readFileSync(join(a.dir, "page.js"), "utf8"), context);
  assert.ok(hellos.length >= 1, `${a.name}: page.js announced no hello`);
  const first = hellos[0];
  // The double announce: a relay hello of the page's own build is answered once more (§9.3).
  doc.dispatchEvent(new CustomEvent(EVENT.hello, { detail: encode({ build: first.build, side: "relay" }) }));
  return { build: first.build, commands: first.commands ?? [], answers: hellos.length === 2 };
}

const all = artifacts();

test("there are artifacts to guard", () => {
  assert.ok(all.length > 0, "no artifacts in .output/ — run `npm run build:all` first");
});

for (const a of all) {
  test(`${a.name}: LICENSE and THIRD_PARTY_NOTICES.md ship with it (§15)`, () => {
    for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
      const text = readFileSync(join(a.dir, name), "utf8");
      assert.ok(text.length > 100, `${name} is missing or empty`);
    }
    // The corresponding-source line carries the real version, not the spec's placeholder (§15).
    assert.doesNotMatch(readFileSync(join(a.dir, "THIRD_PARTY_NOTICES.md"), "utf8"), /extension-v<version>/);
  });

  test(`${a.name}: the page registers exactly the commands this flavour may have (§5.5 check 4)`, () => {
    const { build, commands, answers } = commandsOf(a);
    assert.match(build, /^\d+\.\d+\.\d+\+[0-9a-f]{12}$/, "the build id was not stamped");
    assert.ok(answers, "the page did not answer a relay hello");
    if (a.flavour === "store") {
      assert.deepEqual([...commands].sort(), [...COMMAND_NAMES].sort());
      for (const dev of DEV_COMMAND_NAMES) assert.ok(!commands.includes(dev), `store build registers ${dev}`);
    } else {
      // A dev build may add to the table but never drop a store command.
      for (const name of COMMAND_NAMES) assert.ok(commands.includes(name), `dev build is missing ${name}`);
      // Only the page's half of the dev table is here: the other two are the background's, and never reach a tab (§10.6).
      const [inPage, ...inBackground] = DEV_COMMAND_NAMES;
      assert.ok(commands.includes(inPage), `dev build does not register ${inPage}`);
      for (const name of inBackground) assert.ok(!commands.includes(name), `the page registered ${name}`);
    }
  });

  test(`${a.name}: the HUD ships comment-stripped (§5.2)`, () => {
    const hud = readFileSync(join(a.dir, "hud.js"), "utf8");
    assert.doesNotMatch(hud, /^\s*\/\//m);
    assert.doesNotMatch(hud, /^\s*\/\*/m);
  });

  // The Firefox add-on linter warns on `import()` whose argument it can't see is a literal, and the HUD is the one
  // script that reaches the game's own modules (#381). It does that through an injected module script whose source
  // imports one literal URL, so the packaged file calls `import` not at all.
  test(`${a.name}: the HUD calls no import() (§5.2)`, () => {
    assert.doesNotMatch(readFileSync(join(a.dir, "hud.js"), "utf8"), /(?<![\w$.])import\s*\(/);
  });

  if (a.flavour === "store") {
    test(`${a.name}: the manifest declares no permission of any kind (§5.5 check 1)`, () => {
      const manifest = manifestOf(a);
      for (const key of BANNED_MANIFEST_KEYS) assert.ok(!(key in manifest), `store manifest has ${key}`);
      const text = JSON.stringify(manifest);
      for (const word of BANNED_MANIFEST_WORDS) assert.ok(!text.includes(word), `store manifest mentions ${word}`);
    });

    test(`${a.name}: no dev affordance and no dev port in any file (§5.5 check 2)`, () => {
      for (const f of files(a.dir)) {
        const text = readFileSync(f.path, "utf8");
        for (const banned of BANNED_IN_STORE) {
          assert.ok(!text.includes(banned), `${f.rel} contains ${banned}`);
        }
      }
      const dials = files(a.dir).some(f => readFileSync(f.path, "utf8").includes(REQUIRED_IN_STORE));
      assert.ok(dials, `no file dials ${REQUIRED_IN_STORE}`);
    });
  } else {
    test(`${a.name}: a dev artifact never carries the store port (§5.5 check 3)`, () => {
      for (const f of files(a.dir)) {
        assert.ok(!readFileSync(f.path, "utf8").includes("47147"), `${f.rel} contains 47147`);
      }
    });
  }

  if (a.target === "safari") {
    test(`${a.name}: Safari's background is \`scripts\`, not a service worker (§5.3)`, () => {
      assert.deepEqual(manifestOf(a).background, { scripts: ["background.js"], persistent: false });
    });
  }

  if (a.target === "firefox") {
    test(`${a.name}: Firefox overrides the CSP that breaks \`ws://127.0.0.1\` (§5.3)`, () => {
      const manifest = manifestOf(a);
      assert.deepEqual(manifest.content_security_policy, { extension_pages: "script-src 'self'" });
      assert.deepEqual((manifest.background as Record<string, unknown>).scripts, ["background.js"]);
    });
  }
}
