import assert from "node:assert/strict";
import test from "node:test";
import { audioBlocker } from "./orion.ts";

test("a running audio context lets the run start", () => {
  assert.equal(audioBlocker({ state: "running" }), null);
});

test("no audio context is the game's audio switched off, where no phase waits on a sound (#711)", () => {
  assert.equal(audioBlocker({ state: null }), null);
  assert.equal(audioBlocker({}), null);
});

test("a locked context stops the run, and so does a probe that failed", () => {
  assert.equal(audioBlocker({ state: "suspended" }), "audio-locked");
  assert.equal(audioBlocker({ error: "TypeError: x" }), "audio-probe:TypeError: x");
});
