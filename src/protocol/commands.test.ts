import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMAND_HANDLERS } from "../page/handlers.ts";
import { COMMAND_NAMES, STORE_COMMANDS } from "./commands.ts";

test("the page registers exactly the store table's commands (§10.1)", () => {
  assert.deepEqual(Object.keys(COMMAND_HANDLERS).sort(), [...COMMAND_NAMES].sort());
  assert.deepEqual([...COMMAND_NAMES].sort(), ["card", "cursor.learn", "cursor.option", "cursor.shop", "cursor.starter", "key", "menu", "modal", "press", "probe", "snapshot", "starters"]);
});

test("every act takes the fingerprint it was decided on, and no read does (§10.2)", () => {
  for (const name of COMMAND_NAMES) {
    const spec = STORE_COMMANDS[name];
    assert.equal("fine" in spec.args, spec.kind === "act", name);
  }
});

test("the store table is frozen all the way down", () => {
  assert.throws(() => {
    (STORE_COMMANDS as unknown as Record<string, unknown>).eval = { kind: "read", args: {}, since: 1 };
  });
  assert.throws(() => {
    (STORE_COMMANDS.press.args as Record<string, unknown>).extra = { type: "string" };
  });
  assert.ok(Object.isFrozen(STORE_COMMANDS.snapshot.args.detail));
});
