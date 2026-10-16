import { encounterSummary } from "./46-encounter.js";
import { caption, dim, h, ink, line, some } from "./90-render.js";

const ENCOUNTER_MARK = { take: "★", ok: "·", avoid: "✗", off: "·" };
export const captionEncounter = m => caption("🎭", m.name, m.tier ? h("span", { ...dim, fontWeight: "normal" }, m.tier) : null);

export const drawEncounter = m => {
  const options = [];
  m.options.forEach((o, k) => {
    const mark = o.verdict === "take" && k !== m.pick ? "✓" : ENCOUNTER_MARK[o.verdict] ?? "·";
    const seed = o.exact ? h("span", { ...dim, marginRight: "2px" }, "fixed") : null;
    if (seed) seed.title = "fixed by the run seed: this is what happens";
    const isOff = o.verdict === "off";
    const off = isOff ? h("span", { ...dim, marginRight: "3px" }, "off") : null;
    const label = h("span", { ...(isOff ? dim : ink.ours), fontWeight: k === m.pick ? "bold" : "normal", marginRight: "3px" }, o.label);
    const outcome = o.outcome ? h("span", isOff ? dim : {}, `— ${o.outcome}`) : null;
    options.push(line(mark, off, label, seed, outcome));
    const bits = [
      o.battle ? `⚔ ${o.battle}` : null,
      o.cost && !o.outcome ? `$${o.cost.toLocaleString("en-US")}` : null, // a judged outcome names its own price
      m.known && o.by ? `by ${o.by}` : o.qualifies?.length ? `${o.qualifies.join(", ")} qualif${o.qualifies.length === 1 ? "ies" : "y"}` : null,
      o.why,
    ].filter(Boolean);
    if (bits.length) options.push(line("", h("span", dim, bits.join(" · "))));
  });
  const notes = [
    ...m.notes.map(n => line("·", h("span", dim, n))),
    m.known ? null : line("", h("span", dim, "not judged yet: options and requirements only")),
  ];
  return [
    some("act", "Now", encounterSummary(m), []),
    some("options", "Options", null, options),
    some("notes", "Notes", null, notes),
  ].filter(Boolean);
};
