// The team value a newcomer's swap makes against the threat set at the next big fight (#567), asked exactly as the
// catch card asks it once the road lands (45-catch.js `catchLand`): `teamVerdict` inside a run read.
//
// The answer shape is today's (scorers/today.mjs), read off the judgment:
//   replaces: the member the swap search picked, named on a skip too, as today names its weakest member
//   upgrade:  the judgment's swap
//   value:    the net, ΔV less the release cost, in turns per threat
//   verdict:  "take" for a take or a swap, "pass" for a skip; the judgment has no dupe
export default {
  name: "team-value",
  score({ newcomer, hud, scene }) {
    const t = hud["26-run"].readRun(scene, run => hud["45-catch"].teamVerdict(run, newcomer));
    if (t.unavailable) throw new Error(t.unavailable);
    return {
      replaces: t.replaced?.name ?? null,
      upgrade: t.verdict === "swap",
      value: t.net,
      verdict: t.verdict === "skip" ? "pass" : "take",
      reasons: [...t.reasons, `ΔV ${t.delta}, release ${t.release}`, `judged at W${t.fight}`, t.confidence],
    };
  },
};
