import assert from "node:assert/strict";
import test from "node:test";
import { formatShopDraws, shopDraws } from "./shop.ts";
import type { WaveWindow } from "./waves.ts";

const shop = (rerolls: number, money: number) => ({ rerolls, money, party: 3, tms: 1, rollTms: 0 });
const tick = (seq: number, wave: number, o: { kind?: string; drew?: boolean; shop?: ReturnType<typeof shop>; stages?: Record<string, number> } = {}) =>
  ({ seq, at: seq * 100, ms: seq, kind: o.kind ?? "rewards", wave, drew: o.drew ?? false, stages: o.stages ?? {}, ...(o.shop ? { shop: o.shop } : {}) });
const win = (wave: number, ticks: ReturnType<typeof tick>[]): WaveWindow => ({ wave, stats: { ticks, gaps: [] } });

test("a shop's first draw, the first after a reroll and the first after a buy are each taken once (#516)", () => {
  const draws = shopDraws([
    win(3, [
      tick(1, 3, { kind: "battle", drew: true }),
      tick(2, 3, { drew: true, shop: shop(0, 900), stages: { "shop.ahead": 12 } }),
      tick(3, 3, { shop: shop(0, 900) }),
      tick(4, 3, { shop: shop(1, 650) }),
      tick(5, 3, { drew: true, shop: shop(1, 650) }),
      tick(6, 3, { drew: true, shop: shop(1, 650) }),
      tick(7, 3, { drew: true, shop: shop(1, 450) }),
    ]),
    win(4, [tick(8, 4, { drew: true, shop: shop(0, 1200) }), tick(9, 4, { drew: true })]),
  ]);
  assert.deepEqual(draws.map(d => [d.wave, d.after, d.ms]), [[3, "first", 2], [3, "reroll", 5], [3, "buy", 7], [4, "first", 8]],
    "a reroll's state is drawn on its first refresh that drew, not on the first refresh that saw it");
});

test("a log from before the shop note has no shop draws (#516)", () => {
  assert.deepEqual(shopDraws([win(1, [tick(1, 1, { drew: true })])]), []);
});

test("the table puts the stages in refresh order and keeps a stage it does not know (#516)", () => {
  const out = formatShopDraws([{ wave: 2, after: "first", ms: 40, shop: shop(0, 500), stages: { "shop.tm": 9, read: 3, "shop.new": 1 } }]);
  assert.match(out, /\| wave \| draw \| party \| TMs \(rolled\) \| ms \| read \| shop\.tm \| shop\.new \|/);
  assert.match(out, /\| 2 \| first \| 3 \| 1 \(0\) \| 40 \| 3 \| 9 \| 1 \|/);
});
