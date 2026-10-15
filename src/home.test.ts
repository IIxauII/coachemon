import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";
import { coachemonHome } from "./home.ts";

test("COACHEMON_HOME names the home directory", () => {
  assert.equal(coachemonHome({ COACHEMON_HOME: "/srv/coach" }), "/srv/coach");
});

test("without COACHEMON_HOME the home directory is ~/.coachemon", () => {
  assert.equal(coachemonHome({}), path.join(homedir(), ".coachemon"));
});
