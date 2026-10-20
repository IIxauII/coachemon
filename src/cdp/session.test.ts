import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULTS, findGameTab, isGameTab } from "./session.ts";

const page = (url: string, id = url) => ({ id, type: "page", url, webSocketDebuggerUrl: `ws://x/${id}` });

test("the game tab is a page on the game's origin, whatever its path, query or hash (#644)", () => {
  assert.equal(isGameTab(page("https://pokerogue.net/"), DEFAULTS.url), true);
  assert.equal(isGameTab(page("https://pokerogue.net/?x#y"), DEFAULTS.url), true);
  assert.equal(isGameTab(page("https://pokerogue.net/some/path"), DEFAULTS.url), true);
});

test("a subdomain, another scheme or a URL that only mentions the game is not the game tab (#644)", () => {
  for (const url of [
    "https://wiki.pokerogue.net/",
    "https://beta.pokerogue.net/",
    "http://pokerogue.net/",
    "https://pokerogue.net.example.com/",
    "https://www.google.com/search?q=https://pokerogue.net/",
  ]) assert.equal(isGameTab(page(url), DEFAULTS.url), false, url);
});

test("a non-page target on the game's origin is not the game tab (#644)", () => {
  assert.equal(isGameTab({ ...page("https://pokerogue.net/"), type: "service_worker" }, DEFAULTS.url), false);
});

test("with the wiki listed before the game, the game is picked (#644)", () => {
  const targets = [page("https://wiki.pokerogue.net/wiki/Main_Page", "wiki"), page("https://pokerogue.net/", "game")];
  assert.equal(findGameTab(targets, DEFAULTS.url)?.id, "game");
});

test("no game tab among the targets picks none", () => {
  assert.equal(findGameTab([page("https://wiki.pokerogue.net/")], DEFAULTS.url), null);
});
