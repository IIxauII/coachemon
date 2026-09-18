// One party, shared by the tests that ask about the party as a whole (`hud/08-party.js`). The card tests keep their
// own mon builders — a card needs a scene, a battle and a screen around the party — but nothing about a *profile*
// depends on any of that, so the profile is checked against this one team.
//
// The team is built to exercise every part of the profile at once:
//   Garchomp   Dragon/Ground, BST 600, final form   — immune to Electric, ×4 weak to Ice
//   Snorlax    Normal, BST 540, final form
//   Lapras     Water/Ice, BST 535, final form
//   Magikarp   Water, BST 200, one stage from Gyarados — the weakest member, by an *estimated* final BST
// So: Fighting, Grass and Electric are shared weaknesses (two members weak, fewer resisting), while Ice is not — only
// Garchomp is weak to it and Lapras resists it. Normal, Fighting, Bug, Water, Ice, Dark and Fairy are holes: no move
// on the team hits them super-effectively.

export const TY = ["Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel", "Fire", "Water",
  "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark", "Fairy"];
const CAT = { P: 0, S: 1, X: 2 }; // MoveCategory: physical, special, status

// A move attribute the HUD recognises by its constructor name (`hasAttr`), so a fixture attr has to be a real class.
class FixedDamageAttr {}
class GyroBallPowerAttr {}
export const ATTRS = { FixedDamageAttr, GyroBallPowerAttr };

/**
 * A species as the profile reads one: its id, its types, its BST, and the evolutions the game hands over as
 * `[[speciesId, level], …]` (`getEvolutionLevels`). `root` is the line's first member, which is what makes a catch a
 * duplicate.
 */
export const species = (id, name, types, bst, { evos = [], root = id } = {}) => ({
  speciesId: id, name, baseTotal: bst,
  type1: TY.indexOf(types[0]), type2: types[1] == null ? null : TY.indexOf(types[1]),
  getEvolutionLevels: () => evos,
  getRootSpeciesId: () => root,
  getName: () => name,
});

/** `moves`: `[name, type, power, category, attrs?]`. `power` −1 is a move the game prices from the situation. */
export const mon = (sp, level, moves, { ability = "Pressure", passive = null, luck = 0, allowed = true, hp = 100 } = {}) => ({
  name: sp.name, species: sp, level, hp, id: `${sp.speciesId}:${level}`,
  getTypes: () => [sp.type1, sp.type2].filter(t => t != null),
  getAbility: () => ({ name: ability }),
  hasPassive: () => !!passive,
  getPassiveAbility: () => ({ name: passive }),
  getLuck: () => luck,
  isAllowedInBattle: () => allowed,
  moveset: moves.map(([name, type, power, cat, attrs = []]) => ({
    getName: () => name,
    getMove: () => ({ name, type: TY.indexOf(type), power, category: CAT[cat], attrs, accuracy: 100 }),
  })),
});

export const SPECIES = {
  garchomp: species(445, "Garchomp", ["Dragon", "Ground"], 600, { root: 443 }),
  snorlax: species(143, "Snorlax", ["Normal"], 540),
  lapras: species(131, "Lapras", ["Water", "Ice"], 535),
  magikarp: species(129, "Magikarp", ["Water"], 200, { evos: [[130, 20]] }),
  gyarados: species(130, "Gyarados", ["Water", "Flying"], 540, { root: 129 }),
  lucario: species(448, "Lucario", ["Fighting", "Steel"], 525, { root: 447 }),
  sudowoodo: species(185, "Sudowoodo", ["Rock"], 410),
};

/** The shared party, freshly built each call so a test can't leak state into the next one. */
export const party = () => [
  mon(SPECIES.garchomp, 50, [["Earthquake", "Ground", 100, "P"], ["Dragon Claw", "Dragon", 80, "P"]], { ability: "Rough Skin", luck: 3 }),
  mon(SPECIES.snorlax, 48, [["Body Slam", "Normal", 85, "P"], ["Crunch", "Dark", 80, "P"]], { ability: "Thick Fat", luck: 1 }),
  mon(SPECIES.lapras, 47, [["Surf", "Water", 90, "S"], ["Ice Beam", "Ice", 90, "S"]], { ability: "Water Absorb", luck: 2 }),
  mon(SPECIES.magikarp, 35, [["Tackle", "Normal", 40, "P"]], { ability: "Swift Swim" }),
];
