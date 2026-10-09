// Today's answer: the party profile's weakest member, `partyReasons`' upgrade, and the team side of `catchWorth`,
// asked exactly as the catch card asks them (45-catch.js `teamReasons`).
//
// A scorer gets the live game objects the HUD would see and returns one answer shape; `run.ts` tabulates them.
//   replaces: the member it would release, or null with a free slot
//   upgrade:  whether the swap is called an improvement
//   value:    the team value, on the scorer's own scale
//   verdict:  "take" | "pass" | "dupe"
//   reasons:  short strings, for reading the table

// Owns every species, form and IV already, so `catchWorth`'s account reasons are all zero and its value is the team's.
const OWNED = (party) => ({
  dex: new Proxy({}, { get: () => ({ caughtAttr: (1n << 128n) - 1n, ivs: [31, 31, 31, 31, 31, 31] }) }),
  starter: new Proxy({}, { get: () => ({ abilityAttr: 7 }) }),
  species: null,
  party,
  daily: false,
  shinyCatchMultiplier: 2,
});

export default {
  name: "today",
  score({ party, newcomer, hud }) {
    const { partyProfile, partyReasons, damagingTypes } = hud["08-party"];
    const { typesOf, abilitiesOf } = hud["01-core"];
    const profile = partyProfile(party);
    const reasons = partyReasons(profile, { species: newcomer.species, fusion: newcomer.fusionSpecies ?? null,
      level: newcomer.level, types: typesOf(newcomer), abilities: abilitiesOf(newcomer), moveTypes: damagingTypes(newcomer) });
    const weakest = profile.weakest;
    const replaces = party.length >= 6 && weakest ? weakest.mon.name : null;
    if (reasons.some(r => r.kind === "dupe")) return { replaces, upgrade: false, value: 0, verdict: "dupe", reasons: ["dupe"] };
    const worth = hud["45-catch"].catchWorth(OWNED(party), newcomer);
    return {
      replaces,
      upgrade: reasons.some(r => r.kind === "upgrade"),
      value: worth.value,
      verdict: worth.value >= worth.show ? "take" : "pass",
      reasons: [...worth.reasons, ...(weakest ? [`weakest ${weakest.mon.name} final ${weakest.estimated ? "~" : ""}${weakest.final}`] : [])],
    };
  },
};
