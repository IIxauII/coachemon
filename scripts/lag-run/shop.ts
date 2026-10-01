/**
 * The shop card's draws cut by sub-stage (#516): per wave, the first draw, the first after each reroll and the first
 * after each buy, from the `shop` note `60-card.js` puts on every rewards refresh.
 */
import type { WaveWindow } from "./waves.ts";

type Shop = { rerolls: number; money: number; party: number; tms: number; rollTms: number };
type Tick = WaveWindow["stats"]["ticks"][number] & { shop?: Shop };

export type ShopDraw = { wave: number; after: "first" | "reroll" | "buy"; ms: number; shop: Shop; stages: Record<string, number> };

/** In the order the refresh runs them; any stage not named here goes in last. */
export const SHOP_STAGES = [
  "read", "shop.run", "shop.model", "shop.ahead", "shop.needs", "shop.context", "odds", "shop.judge", "shop.tm",
  "shop.roll", "shop.rollJudge", "shop.rollTm", "shop.audit", "road", "groups", "dom", "other",
];

/** A state is the shop's reroll count and money: a new one is drawn on its first refresh that drew. */
export function shopDraws(windows: WaveWindow[]): ShopDraw[] {
  const out: ShopDraw[] = [];
  let prev: Shop | null = null, pending: ShopDraw["after"] | null = null;
  const ticks = windows.flatMap(w => (w.stats.ticks as Tick[]).map(t => ({ t, wave: t.wave ?? w.wave })));
  for (const { t, wave } of ticks) {
    if (t.kind !== "rewards" || !t.shop || wave == null) continue;
    const s = t.shop;
    if (!prev || s.rerolls !== prev.rerolls || s.money !== prev.money) {
      pending = !prev || s.rerolls < prev.rerolls || s.money > prev.money ? "first" : s.rerolls > prev.rerolls ? "reroll" : "buy";
      prev = s;
    }
    if (pending && t.drew) {
      out.push({ wave, after: pending, ms: t.ms, shop: s, stages: t.stages ?? {} });
      pending = null;
    }
  }
  return out;
}

export function formatShopDraws(draws: ShopDraw[]): string {
  const named = new Set(SHOP_STAGES);
  const extra = [...new Set(draws.flatMap(d => Object.keys(d.stages)))].filter(k => !named.has(k)).sort();
  const cols = [...SHOP_STAGES.filter(k => draws.some(d => k in d.stages)), ...extra];
  const lines = [
    `| wave | draw | party | TMs (rolled) | ms | ${cols.join(" | ")} |`,
    `|---|---|---|---|---|${cols.map(() => "---|").join("")}`,
  ];
  for (const d of draws) {
    const cell = (k: string) => (k in d.stages ? String(d.stages[k]) : "–");
    lines.push(`| ${d.wave} | ${d.after} | ${d.shop.party} | ${d.shop.tms} (${d.shop.rollTms}) | ${d.ms} | ${cols.map(cell).join(" | ")} |`);
  }
  return lines.join("\n");
}
