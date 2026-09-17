import assert from "node:assert/strict";
import { test } from "node:test";
import { SummaryUiMode, UiMode } from "../enums/generated.ts";
import { disc } from "./disc.ts";
import { dispatch } from "./dispatch.ts";
import { fine } from "./fine.ts";
import { COMMAND_HANDLERS } from "./handlers.ts";
import { locate } from "./locate.ts";
import { PAGE_MODES } from "./modes.ts";

/** Every function a transport puts in the page, by the name it is stringified under (§10.5). */
const PAGE_FUNCTIONS: Record<string, Function> = { dispatch, locate, fine, disc, ...COMMAND_HANDLERS };

/**
 * A bare numeric mode or handler index in the page source is a silent break waiting for a pin bump: it says nothing
 * about which `UiMode` it meant, and no codegen or drift check moves it (#164). Every one must come from `L.m`/`L.sm`.
 */
const BARE = [
  /\bmode\s*[=!]==?\s*\d/,
  /\bhandlers\[\s*\d/,
  /\b(?:summaryUiMode|partyUiMode|uiMode)\s*[=!]==?\s*\d/,
];

test("no page function compares a mode or indexes a handler by a bare number (#164)", () => {
  for (const [name, fn] of Object.entries(PAGE_FUNCTIONS)) {
    const src = String(fn);
    for (const re of BARE) {
      const hit = src.match(re);
      assert.equal(hit, null, `${name} has a bare mode literal: ${hit?.[0]}`);
    }
  }
});

test("the enums handed into the page are the generated ones (#164)", () => {
  assert.equal(PAGE_MODES.m, UiMode);
  assert.equal(PAGE_MODES.sm, SummaryUiMode);
});

test("every mode name the page functions read exists in the generated enums (#164)", () => {
  const names = { m: new Set<string>(), sm: new Set<string>() };
  for (const fn of Object.values(PAGE_FUNCTIONS)) {
    for (const [, prop, key] of String(fn).matchAll(/\b(?:L\.)?(m|sm)\.([A-Z][A-Z0-9_]*)\b/g)) {
      names[prop as "m" | "sm"].add(key);
    }
  }
  // The handlers destructure `m` off `L`, so the scan must have found the mode names they compare against.
  assert.ok(names.m.size >= 20, `expected the page to name many UiModes, found ${names.m.size}`);
  assert.ok(names.sm.size >= 1, "expected the page to name a SummaryUiMode");
  for (const key of names.m) assert.ok(key in UiMode, `UiMode.${key} is not a generated UiMode`);
  for (const key of names.sm) assert.ok(key in SummaryUiMode, `SummaryUiMode.${key} is not generated`);
});
