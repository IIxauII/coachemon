// The fixture snapshots the listing screenshots are drawn from (§3): a scene object shaped like the game's, with no
// sprite atlas, so every icon falls back to the name it stands for and no franchise art can reach a store.
//
// This file runs in the page, before the HUD bundle, as a classic script: it puts `__fixtures` and a fake `Phaser` on
// `window`, and the bundle finds them exactly as it finds the real game's. The mocks are the HUD's own test mocks
// (`skills/coachemon/scripts/test/rendertest.mjs`) — the same shapes, kept readable rather than shared, because the
// tests build theirs for Node and this one has to survive being pasted into a browser.
(() => {
  const TY = ["Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel", "Fire", "Water",
    "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark", "Fairy"];
  const cat = { P: 0, S: 1, X: 2 };
  const mv = ([n, t, p, c, a = 100]) => ({
    name: n, type: TY.indexOf(t), power: p, category: cat[c], accuracy: a, moveTarget: 3,
    isChargingMove: () => false, attrs: [],
  });
  const pk = (name, types, atk, spa, moves) => ({
    name, level: 30, hp: 100, getMaxHp: () => 100, getTypes: () => types.map(t => TY.indexOf(t)),
    getAbility: () => ({ name: "x" }), getStat: i => ({ 1: atk, 3: spa }[i] ?? 100),
    getIconAtlasKey: () => "k", getIconId: () => 1,
    moveset: moves.map(m => ({ getMove: () => mv(m), getName: () => m[0], getMovePp: () => 10, ppUsed: 0 })),
  });
  const mon = (name, lv, types, [hp, atk, def, spa, spd, spe], moves, field) => ({
    id: name, getMoveQueue: () => [], isTrapped: () => false, trainerSlot: 0, species: { legendary: false },
    name, level: lv, hp, getMaxHp: () => hp, getTypes: () => types.map(t => TY.indexOf(t)),
    getAbility: () => ({ name: "Blaze" }), hasPassive: () => false,
    getStat: i => [hp, atk, def, spa, spd, spe][i], summonData: { statStages: [0, 0, 0, 0, 0, 0, 0] },
    isOnField: () => field, isBoss: () => false, getIconAtlasKey: () => "k", getIconId: () => 1, status: null,
    moveset: moves.map(([n, t, p, c]) => ({
      getName: () => n, getMove: () => ({ type: TY.indexOf(t), power: p, category: cat[c], moveTarget: 3 }),
      getMovePp: () => 10, ppUsed: 0,
    })),
  });

  /** A fight the coach can call: one sweeper against two foes it outspeeds, with the plan already open. */
  const battle = () => {
    const party = [mon("Charizard", 50, ["Fire", "Flying"], [160, 100, 90, 130, 100, 120],
      [["Flamethrower", "Fire", 90, "S"], ["Air Slash", "Flying", 75, "S"], ["Dragon Pulse", "Dragon", 85, "S"]], true)];
    const foes = [
      mon("Paras", 34, ["Bug", "Grass"], [90, 70, 60, 45, 60, 40], [["Scratch", "Normal", 40, "P"]], true),
      mon("Oddish", 34, ["Grass", "Poison"], [90, 60, 60, 75, 65, 45], [["Absorb", "Grass", 20, "S"]], false),
    ];
    for (const f of foes) f.getOpponents = () => party;
    const trainer = {
      getName: () => "Youngster", config: { isBoss: false }, isDouble: () => false,
      getPartyMemberMatchupScores: () => [[1, 5]], getSortedPartyMemberMatchupScores: x => x, getNextSummonIndex: () => 1,
    };
    return {
      phaseManager: { getCurrentPhase: () => null }, getField: () => [...party, foes[0]],
      currentBattle: { waveIndex: 15, turn: 1, double: false, enemySwitchCounter: 0, getBattlerCount: () => 1, trainer },
      ui: { getMode: () => 0, getHandler: () => ({}) }, getPlayerParty: () => party, getEnemyParty: () => foes,
    };
  };

  /** A move to learn, with a team behind it: the card has to say what is gained and what the team loses. */
  const learn = () => {
    const espeon = pk("Espeon", ["Psychic"], 65, 130,
      [["Bite", "Dark", 60, "P"], ["Psychic", "Psychic", 90, "S"], ["Shadow Ball", "Ghost", 80, "S"], ["Dazzling Gleam", "Fairy", 80, "S"]]);
    const lapras = pk("Lapras", ["Water", "Ice"], 85, 85, [["Surf", "Water", 90, "S"], ["Ice Beam", "Ice", 90, "S"]]);
    return {
      currentBattle: { waveIndex: 27, double: false },
      ui: { getMode: () => 9, getHandler: () => ({ summaryUiMode: 1, pokemon: espeon, newMove: mv(["Earth Power", "Ground", 90, "S"]) }) },
      getEnemyParty: () => [], getPlayerParty: () => [espeon, lapras],
    };
  };

  /** Three rewards on the wave before a boss, one of them a TM only one party member should take. */
  const rewards = () => {
    class ModifierType {}
    class PokemonModifierType extends ModifierType {}
    class TmModifierType extends PokemonModifierType {}
    class PokemonHeldItemModifierType extends PokemonModifierType {}
    class AddPokeballModifierType extends ModifierType {}
    const MOVES = { 1: ["Tackle", "Normal", 40, "P"], 2: ["Spark", "Electric", 65, "P"], 3: ["Bite", "Dark", 60, "P"],
      4: ["Quick Attack", "Normal", 40, "P"], 5: ["Fire Fang", "Fire", 65, "P", 95], 6: ["Heat Wave", "Fire", 95, "S", 90] };
    class PokemonMove {
      constructor(id) { this.moveId = id; this.ppUsed = 0; }
      getMove() { return mv(MOVES[this.moveId]); }
      getName() { return MOVES[this.moveId][0]; }
      getMovePp() { return 20; }
    }
    const member = (name, types, atk, spa, ids) => ({
      ...pk(name, types, atk, spa, []), status: null, species: { forms: [] }, moveset: ids.map(id => new PokemonMove(id)),
    });
    const morpeko = member("Morpeko", ["Electric", "Dark"], 95, 70, [2, 3, 1, 4]);
    const charizard = member("Charizard", ["Fire", "Flying"], 110, 150, [6]);
    const free = [
      Object.assign(new TmModifierType(), { name: "TM Fire Fang", iconImage: "tm", tier: 1, moveId: 5, selectFilter: p => (p === morpeko ? null : "no effect") }),
      Object.assign(new PokemonHeldItemModifierType(), { name: "Leftovers", iconImage: "leftovers", tier: 0, selectFilter: () => null }),
      Object.assign(new AddPokeballModifierType(), { name: "5× Great Ball", iconImage: "gb", tier: 1, pokeballType: 1 }),
    ];
    const handler = { options: free.map(t => ({ modifierTypeOption: { type: t, cost: 0 } })), shopOptionsRows: [], rerollCost: 250 };
    return {
      money: 500, pokeballCounts: { 1: 20 }, modifiers: [], currentBattle: { waveIndex: 29 },
      ui: { getMode: () => 6, getHandler: () => handler }, getPlayerParty: () => [charizard, morpeko], getEnemyParty: () => [],
    };
  };

  window.__fixtures = { battle, learn, rewards };

  /** The page the HUD expects: a Phaser game whose battle scene is the fixture, and an atlas that has nothing. */
  window.__mountFixture = (name, view) => {
    const scene = window.__fixtures[name]();
    window.Phaser = {
      Math: { RND: { _s: "!rnd,0", state(v) { if (v !== undefined) this._s = v; return this._s; } } },
      Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => scene }, textures: { exists: () => false } } } }] } } },
    };
    try { localStorage.setItem("coach-hud-view", view); } catch {}
  };
})();
