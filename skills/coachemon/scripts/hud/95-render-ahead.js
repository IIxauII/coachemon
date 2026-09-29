import { aheadIn, aheadWho } from "./49-ahead.js";
import { dim, h, ink, line } from "./90-render.js";

export const drawAhead = a => {
  if (!a?.next) return [];
  const r = a.readiness;
  const head = h("span", { fontWeight: "bold", marginRight: "3px" }, `${aheadWho(a)} ${aheadIn(a.next.in)}`);
  const where = h("span", dim, `W${a.next.wave}`);
  const out = [line("", h("span", { fontWeight: "bold", marginRight: "3px" }, "Next big fight"),
    head, where, h("span", { flex: "1" }),
    a.next.double ? h("span", { ...dim, marginRight: "3px" }, "double") : null,
    a.next.bars ? h("span", ink.later, `👑 ${a.next.bars + 1} bars`) : null)];
  // `in` 1 is the next wave, whose foes the preview's rows already list.
  if (a.next.foes?.length && a.next.in > 1) {
    out.push(line("·", h("span", dim,
      a.next.foes.map(f => `${f.name} L${f.level}`).join(" · "))));
  }
  if (a.next.rewards?.tiers.length) {
    out.push(line("·", h("span", dim, `it pays ${a.next.rewards.tiers.join(" · ")}`)));
  }
  for (const n of r?.notes ?? []) {
    out.push(line(n.good ? "✓" : "✗", h("span", {}, n.text)));
  }
  if (a.fightsBeforeHeal >= 2 || !a.heal) {
    out.push(line("✗", h("span", ink.later, a.heal
      ? `${a.fightsBeforeHeal} big fights before the next full heal (W${a.heal.wave})`
      : `no full heal left — ${a.fightsBeforeHeal} big ${a.fightsBeforeHeal === 1 ? "fight" : "fights"} on what you have`)));
  } else {
    out.push(line("✓", h("span", dim, `full heal entering W${a.heal.wave} — HP, status, PP, revives, Tera`)));
  }
  if (a.thisWave) {
    out.push(line("·", h("span", dim, a.thisWave.tiers.length
      ? `these rewards are pinned to ${a.thisWave.tiers.join(" · ")}${a.thisWave.luckUpgrades ? "" : " — luck can't upgrade them"}`
      : "luck can't upgrade these rewards")));
  }
  out.push(line("·", h("span", dim,
    `luck ${a.luck.value} (${a.luck.grade}) — ${a.luck.upgradePct}% tier upgrade per reward${a.thisWave && !a.thisWave.luckUpgrades ? ", off this wave" : ""}`)));
  for (const f of a.eternatus?.facts ?? []) {
    out.push(line(f.good ? "✓" : "✗", f.text));
  }
  return out;
};
