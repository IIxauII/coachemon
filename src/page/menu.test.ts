import assert from "node:assert/strict";
import { test } from "node:test";
import { PartyUiMode, UiMode } from "../enums/generated.ts";
import { onPage, send, starterGrid } from "./fake-page.ts";

test("STARTER_SELECT lists the whole filtered grid by name and puts the cursor on its grid index (v1-tool-surface.md §7)", t => {
  const names: Record<number, string> = { 1: "Bulbasaur", 4: "Charmander", 7: "Squirtle" };
  const ids = [1, 4, 1, 4, 1, 4, 1, 4, 1, 7];
  const { h, sprites } = starterGrid(names, ids, { cursor: 0, scrollCursor: 1, party: [4] });
  onPage(t, { ui: { mode: UiMode.STARTER_SELECT, handlers: { [UiMode.STARTER_SELECT]: h } }, gameData: { getSpeciesStarterValue: (id: number) => (id === 4 ? 3 : 2) } });
  const menu = send("menu", {});
  assert.equal(menu.family, "starter_select");
  assert.equal(menu.cursor, 9);
  assert.deepEqual(menu.options.slice(8), [{ i: 8, label: "Bulbasaur", cost: 2 }, { i: 9, label: "Squirtle", cost: 2 }]);
  assert.deepEqual(menu.extra.party, [{ name: "Charmander", cost: 3 }]);
  assert.equal(menu.extra.partyValue, 3);
  assert.equal(menu.extra.valueLimit, 10);
  assert.equal(sprites.added, 0);
});

/** BALL as the game builds it (game-code.md §20). */
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

test("a login modal's buttons and form labels are read, its typed form text never is (extension-distribution.md §6)", t => {
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

test("a reward offer carries the game's own description, the field probe.js's reward read had (extension-distribution.md §11.4)", t => {
  const offer = (name: string, cost: number, desc: string) => ({ modifierTypeOption: { type: { name, getDescription: () => desc }, cost } });
  const h = {
    rowCursor: 1, cursor: 0, rerollCost: 250,
    options: [offer("Leftovers", 0, "Heals 1/16 of max HP every turn.")],
    shopOptionsRows: [[offer("Super Potion", 300, "Restores 50 HP.")]],
  };
  onPage(t, { ui: { mode: 6, handlers: { 6: h } }, money: 1000 });
  const menu = send("menu", {});
  assert.equal(menu.family, "modifier_select");
  const free = menu.options.find((o: { label: string }) => o.label === "Leftovers");
  assert.equal(free.desc, "Heals 1/16 of max HP every turn.");
  assert.equal(menu.options.find((o: { label: string }) => o.label === "Super Potion").desc, "Restores 50 HP.");
  // A button row has no offer behind it, so it has no description either.
  assert.equal(menu.extra.rows[0].items.length, 0);
});

/**
 * A shop after `ModifierSelectUiHandler.show` has faded its buttons in. `rerollCost < 0` shows the Continue container;
 * its text shows only with no free reward (#819).
 */
function shopScene(rewards: string[], rerollCost: number) {
  const box = (label: string, visible = true) => ({ visible, list: [{ text: label, visible: true }] });
  const offer = (name: string, cost: number) => ({ modifierTypeOption: { type: { name, getDescription: () => "" }, cost } });
  const h = {
    rowCursor: 2, cursor: 0, rerollCost,
    options: rewards.map(r => offer(r, 0)),
    shopOptionsRows: [[offer("Super Potion", 300)]],
    rerollButtonContainer: box("Reroll"), transferButtonContainer: box("Manage Items"), checkButtonContainer: box("Check Team"),
    lockRarityButtonContainer: box("Lock Rarities", false), continueButtonContainer: box("Continue", rerollCost < 0),
    setRowCursor(row: number) { this.rowCursor = row; },
    setCursor(col: number) { this.cursor = col; },
  };
  return { h, scene: { ui: { mode: UiMode.MODIFIER_SELECT, handlers: { [UiMode.MODIFIER_SELECT]: h } }, money: 1000 } };
}

test("a shop with no free reward reads Continue where the game keeps it, row 1 cursor 0, and selecting it lands there (#819)", t => {
  const { h, scene } = shopScene([], -1);
  onPage(t, scene);
  const cont = send("menu", {}).options.find((o: { label: string }) => o.label === "Continue");
  assert.deepEqual([cont.i, cont.row, cont.col, cont.kind], ["1:0", 1, 0, "buttons"]);
  const { fine } = send("probe", {});
  assert.equal(send("cursor.shop", { row: cont.row, col: cont.col, fine }).ok, true);
  assert.deepEqual([h.rowCursor, h.cursor], [1, 0]);
});

test("a shop with free rewards and a dead reroll reads no Continue: the game hides its text while a reward is offered (#819)", t => {
  onPage(t, shopScene(["Leftovers"], -1).scene);
  const menu = send("menu", {});
  assert.deepEqual(menu.options.filter((o: { row: number }) => o.row <= 1).map((o: { i: string; label: string }) => `${o.i} ${o.label}`), ["0:0 Reroll", "0:1 Manage Items", "0:2 Check Team", "1:0 Leftovers"]);
});

test("an option list reads its cursor as the option under it, counting selectable options only", t => {
  const options = ["Grass", "Fire", "Locked", "Water", "Cancel"].map((label, i) => ({ label, selectable: i !== 2 }));
  const h = { cursor: 1, scrollCursor: 2, maxOptions: 3, options, config: { options: options.map(o => (o.selectable ? { label: o.label } : o)) } };
  onPage(t, { ui: { mode: 15, handlers: { 15: h } } });
  const menu = send("menu", {});
  assert.equal(menu.family, "option_select");
  assert.deepEqual(menu.options.map((o: { skip: boolean }) => o.skip), [false, false, true, false, false]);
  assert.deepEqual(menu.extra.unskippedIndices, [0, 1, 3, 4]);
  assert.equal(menu.extra.selectedIndex, 3);
  assert.equal(menu.cursor, 2);
});

/** A party handler's options window, laid out as `PartyUiHandler` draws it (game-code.md §17). */
function partyOptions(partyUiMode: number, rows: { name: string; prefix?: { level: number } | { tm: string } }[], optionsCursor: number) {
  const list: Record<string, unknown>[] = [{ width: 94 }];
  const optionPrefixes: (Record<string, unknown> | null)[] = [];
  rows.slice().reverse().forEach((row, o) => {
    const y = -22 - 16 * o;
    let prefix: Record<string, unknown> | null = null;
    if (row.prefix && "level" in row.prefix) prefix = { text: String(row.prefix.level), y: y + 8 };
    else if (row.prefix) prefix = { frame: row.prefix.tm, y: y + 8 };
    if (prefix) list.push(prefix);
    optionPrefixes.push(prefix);
    list.push({ text: `[shadow]${row.name}[/shadow]`, y });
  });
  list.push({ frame: "cursor", y: -22 - 16 * (rows.length - 1 - optionsCursor) });
  const h = { active: true, partyUiMode, optionsMode: true, transferMode: false, optionsCursor, cursor: 0, optionsContainer: { list }, optionPrefixes };
  return { ui: { mode: UiMode.PARTY, handlers: { [UiMode.PARTY]: h } } };
}

test("a Memory Mushroom's move list reads one row per move plus Cancel, its learn levels not rows of their own (#528)", t => {
  const rows = [{ name: "Wrap", prefix: { level: 1 } }, { name: "Leer", prefix: { level: 1 } }, { name: "Twister", prefix: { level: 5 } }, { name: "Cancel" }];
  onPage(t, partyOptions(PartyUiMode.REMEMBER_MOVE_MODIFIER, rows, 2));
  const menu = send("menu", {});
  assert.deepEqual(menu.options, [
    { i: 0, label: "Wrap", learnLevel: 1 },
    { i: 1, label: "Leer", learnLevel: 1 },
    { i: 2, label: "Twister", learnLevel: 5 },
    { i: 3, label: "Cancel" },
  ]);
  assert.equal(menu.cursor, 2);
});

test("a Memory Mushroom list mixing a level move and a TM move reads one row each, the learn level on its own move (#528)", t => {
  const rows = [{ name: "Ember", prefix: { level: 9 } }, { name: "Flamethrower", prefix: { tm: "tm_fire" } }, { name: "Scratch", prefix: { level: 1 } }, { name: "Cancel" }];
  onPage(t, partyOptions(PartyUiMode.REMEMBER_MOVE_MODIFIER, rows, 3));
  const menu = send("menu", {});
  assert.deepEqual(menu.options, [
    { i: 0, label: "Ember", learnLevel: 9 },
    { i: 1, label: "Flamethrower" },
    { i: 2, label: "Scratch", learnLevel: 1 },
    { i: 3, label: "Cancel" },
  ]);
  assert.equal(menu.cursor, 3);
});

test("a faint switch's options read one row per option", t => {
  const rows = [{ name: "Send Out" }, { name: "Summary" }, { name: "Cancel" }];
  onPage(t, partyOptions(PartyUiMode.FAINT_SWITCH, rows, 0));
  const menu = send("menu", {});
  assert.deepEqual(menu.options, [{ i: 0, label: "Send Out" }, { i: 1, label: "Summary" }, { i: 2, label: "Cancel" }]);
  assert.equal(menu.cursor, 0);
});

test("a mode without a handler is unreadable", t => {
  onPage(t, { ui: { mode: 2, handlers: {} } });
  assert.deepEqual(send("menu", {}), { readable: false, why: "no-handler", mode: 2 });
});
