import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnum } from "./parse.ts";

test("enum form auto-increments and honours explicit values", () => {
  const src = `export enum Button {\n  UP,\n  DOWN,\n  // comment\n  SUBMIT = 4,\n  ACTION,\n}\n`;
  assert.deepEqual(parseEnum(src, "Button"), [["UP", 0], ["DOWN", 1], ["SUBMIT", 4], ["ACTION", 5]]);
});

test("const-object form with gaps", () => {
  const src = `export const BiomeId = {\n  TOWN: 0,\n  SNOWY_FOREST: 31,\n  ISLAND: 40,\n  LABORATORY: 41,\n  END: 50,\n} as const;\n`;
  assert.deepEqual(parseEnum(src, "BiomeId"), [["TOWN", 0], ["SNOWY_FOREST", 31], ["ISLAND", 40], ["LABORATORY", 41], ["END", 50]]);
});

test("negative members and a preceding unrelated enum", () => {
  const src = `enum Page { PROFILE }\nexport enum PartyOption {\n  CANCEL = -1,\n  SEND_OUT,\n  SCROLL_UP = 1000,\n}\n`;
  assert.deepEqual(parseEnum(src, "PartyOption"), [["CANCEL", -1], ["SEND_OUT", 0], ["SCROLL_UP", 1000]]);
});

test("Object.freeze form", () => {
  const src = `export const MovePriorityInBracket = Object.freeze({\n  /** doc */\n  LAST: 0,\n  NORMAL: 1,\n  FIRST: 2,\n});\n`;
  assert.deepEqual(parseEnum(src, "MovePriorityInBracket"), [["LAST", 0], ["NORMAL", 1], ["FIRST", 2]]);
});

test("bit flag members", () => {
  const src = `export enum MoveFlags {\n  NONE = 0,\n  MAKES_CONTACT = 1 << 0,\n  // note\n  CHECK_ALL_HITS = 1 << 16,\n}\n`;
  assert.deepEqual(parseEnum(src, "MoveFlags"), [["NONE", 0], ["MAKES_CONTACT", 1], ["CHECK_ALL_HITS", 65536]]);
});

test("missing enum throws", () => {
  assert.throws(() => parseEnum("nothing here", "UiMode"), /not found/);
});
