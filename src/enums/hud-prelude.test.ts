import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error: plain .mjs without type declarations
import { bundle, enumPrelude } from "../../skills/coach-pokerogue/scripts/hud-bundle.mjs";

test("injects only the members the source names, at the generated values", () => {
  const out = enumPrelude("if (mv.category === MoveCategory.STATUS && t !== MoveTarget.USER) x = MoveCategory.PHYSICAL;");
  assert.equal(out, [
    "const MoveCategory = Object.freeze({ PHYSICAL: 0, STATUS: 2 });",
    "const MoveTarget = Object.freeze({ USER: 0 });",
  ].join("\n"));
});

test("a member the pinned tag doesn't have fails the bundle", () => {
  assert.throws(() => enumPrelude("MoveId.NOT_A_MOVE"), /MoveId\.NOT_A_MOVE is not a member/);
});

test("property reads and unknown tables are left alone", () => {
  assert.equal(enumPrelude("s.Stat.ATK; Foo.BAR; Math.PI"), "");
});

test("the HUD and the probe bundle", () => {
  assert.match(bundle("hud"), /^const MoveCategory = Object\.freeze/m);
  assert.match(bundle("battle"), /^\{\n\/\/ ---- enums/);
});
