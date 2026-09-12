import assert from "node:assert/strict";
import { test } from "node:test";
import { matchLabel, normalizeLabel } from "./labels.ts";

test("normalise strips BBCode, whitespace and case", () => {
  assert.equal(normalizeLabel("[shadow]Apply[/shadow]"), "apply");
  assert.equal(normalizeLabel("  Send   Out "), "send out");
  assert.equal(normalizeLabel(null), "");
});

test("exact match only — no prefix or fuzzy matching", () => {
  const options = [{ label: "Apply" }, { label: "Cancel" }, { label: "Applying" }];
  assert.deepEqual(matchLabel(options, "apply"), { kind: "one", option: { label: "Apply" } });
  assert.deepEqual(matchLabel(options, "App"), { kind: "none" });
});

test("duplicates are ambiguous, not first-wins", () => {
  const options = [{ label: "Potion" }, { label: "Potion" }];
  const m = matchLabel(options, "potion");
  assert.equal(m.kind, "many");
});
