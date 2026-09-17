import assert from "node:assert/strict";
import { test } from "node:test";
import { onPage, send } from "./fake-page.ts";

/** BALL as game 1.12 builds it (BallUiHandler.setup): a names text ending in Cancel, then a separate counts text. */
function ballScene(counts: number[], cursor: number) {
  const text = (t: string) => ({ text: t });
  const countsText = text(counts.map(c => `×${c}`).join("\n"));
  const h = {
    cursor,
    countsText,
    pokeballSelectContainer: { list: [{}, text("Poké Ball\nGreat Ball\nUltra Ball\nRogue Ball\nMaster Ball\nCancel"), countsText, {}] },
  };
  return { ui: { mode: 4, handlers: { 4: h } }, pokeballCounts: Object.fromEntries(counts.map((c, i) => [i, c])) };
}

test("BALL options carry the ball name and count, plus the Cancel row (#46)", t => {
  onPage(t, ballScene([13, 9, 0, 0, 0], 1));
  const menu = send("menu", {});
  assert.equal(menu.family, "ball");
  assert.equal(menu.readable, true);
  assert.equal(menu.cursor, 1);
  assert.deepEqual(menu.options, [
    { i: 0, label: "Poké Ball ×13", name: "Poké Ball", ballType: 0, count: 13 },
    { i: 1, label: "Great Ball ×9", name: "Great Ball", ballType: 1, count: 9 },
    { i: 2, label: "Ultra Ball ×0", name: "Ultra Ball", ballType: 2, count: 0 },
    { i: 3, label: "Rogue Ball ×0", name: "Rogue Ball", ballType: 3, count: 0 },
    { i: 4, label: "Master Ball ×0", name: "Master Ball", ballType: 4, count: 0 },
    { i: 5, label: "Cancel" },
  ]);
});

test("BALL labels stay distinct when two ball types share a count (#46)", t => {
  onPage(t, ballScene([0, 0, 0, 0, 0], 0));
  const labels = send("menu", {}).options.map((o: { label: string }) => o.label);
  assert.equal(new Set(labels).size, labels.length, labels.join(", "));
});

test("the menu reader picks learn_move from disc's summaryUiMode", t => {
  const h = { summaryUiMode: 1, moveSelect: true, moveCursor: 0, cursor: 2, pokemon: { name: "Charmander", getMoveset: () => [] }, newMove: null };
  onPage(t, { ui: { mode: 9, handlers: { 9: h } } });
  assert.equal(send("menu", {}).family, "learn_move");
});

test("a login modal's buttons and form labels are read, its typed form text never is (§6)", t => {
  const text = (s: string) => ({ text: s });
  const h = {
    buttonLabels: [text("Login"), text("Register")],
    titleText: text("Login"),
    formLabels: [text("Username"), text("Password")],
    inputs: [text("ash"), text("pikachu123")],
  };
  onPage(t, { ui: { mode: 20, handlers: { 20: h } } });
  const menu = send("menu", {});
  assert.equal(menu.family, "modal");
  assert.deepEqual(menu.options.map((o: { label: string }) => o.label), ["Login", "Register"]);
  assert.deepEqual(menu.extra.formLabels, ["Username", "Password"]);
  assert.equal("inputs" in menu.extra, false);
  assert.equal(JSON.stringify(menu).includes("pikachu123"), false);
});

test("a mode without a handler is unreadable", t => {
  onPage(t, { ui: { mode: 2, handlers: {} } });
  assert.deepEqual(send("menu", {}), { readable: false, why: "no-handler", mode: 2 });
});
