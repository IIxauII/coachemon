// Name-level classes for the HUD's game-only reads (#916 Q2). A name not listed is plain if a field, computed if a
// method. Usage: node classes.mjs <scan.json>
import { readFileSync } from "node:fs";

// Runs game code that writes state, draws from the RNG or builds game objects: needs the live object it is called on.
const LIVE = new Set([
  "executeWithSeedOffset", "addEnemyPokemon", "genPartyMember", "generateNewBattleTrainer", "calculateStats",
  "trySetShinySeed", "tryRerollHiddenAbilitySeed", "randomSpecies", "applyStarterChoice", "applyStarterSelectModify",
  "applyModifyEvolutions", "getWildSpeciesForLevel", "getNextMove", "healFunc", "primaryPokemon", "textures", "texture",
]);
// Game functions handed a live mon, move or party as an argument: the argument is a live handle, passed unread.
const HANDLE = new Set([
  "getAttackDamage", "getMoveEffectiveness", "applyConditions", "getTargetBenefitScore", "getUserBenefitScore",
  "getMatchupScore", "calculateBattleAccuracy", "getAccuracyMultiplier", "canApplyAbility", "isMoveRestricted",
  "doesFlagEffectApply", "getMoveType", "getMoveCategory", "getPriorityModifier", "getCritStage", "getMoveChance",
  "isMoveWeatherCancelled", "isMoveTerrainCancelled", "isUsable", "getPartyMemberMatchupScores",
  "getSortedPartyMemberMatchupScores", "shouldTera", "queryParty", "canApply", "getCondition", "isTmCompatible",
]);
// Read only to reach another game object.
const NAV = new Set([
  "getPlayerParty", "getEnemyParty", "getField", "getPlayerField", "getAlly", "getOpponents", "getSpecies",
  "getSpeciesForm", "getAllSpecies", "getAllStarters", "getFixedBattle", "getMysteryEncounter", "getTrainer",
  "getCurrentPhase", "getHandler", "getTagOnSide", "getAttrs", "getAbilityAttrs", "getAllValidEventEncounters",
  "getPrevolution", "getCondition", "phaseManager", "handlers", "gameData", "optionsContainer", "positionalTagManager",
  "trainerConfig", "dailyConfig", "customModifierRewardSettings", "enemyPartyConfigs", "pokemonConfigs",
  "partyTemplates", "partyTemplateFunc", "speciesPools", "trainerPool", "pokemonPool", "biomeLinks", "starterContainers",
  "cursorObj", "modifierTypeOption", "berryItemsMap", "tradeOptionsMap", "attrs", "chargeAttrs", "conditionsSeq2",
  "conditionsSeq3", "restrictions", "effects", "encounterOptions", "requirements", "primaryPokemonRequirements",
  "teamTransformations", "selectedOption", "typeOptions", "shopOptionsRows", "mysteryEncounterSaveData",
  "customPokemonData", "oricorioData", "misc", "dialogueTokens",
]);
// Methods that only return a stored field or a fixed fact of a table.
const PLAIN_METHODS = new Set([
  "getBattlerIndex", "getFieldIndex", "getLastXMoves", "getMoveQueue", "getNature", "getLevels", "hasFlag",
  "hasPrevolution", "hasTrainer", "isChargingMove", "isClassicFinalBoss", "isFainted", "isMax", "isMega", "isShiny",
  "getBattlerCount", "getBattleCount", "isDouble", "getEvolutions", "getLevelMoves", "getMaxStackCount",
]);

export const classOf = (name, kind) => (LIVE.has(name) || HANDLE.has(name) ? "live" : NAV.has(name) ? "nav"
  : kind === "method" ? (PLAIN_METHODS.has(name) ? "plain" : "computed") : "plain");

if (process.argv[2]) {
  const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const tot = { computed: 0, plain: 0, live: 0, nav: 0 };
  console.log("file\tonly\tcomputed\tplain\tlive\tnav");
  for (const r of rows) {
    const c = { computed: 0, plain: 0, live: 0, nav: 0 };
    for (const [k, lines] of Object.entries(r.game)) {
      if (!k.endsWith(":only")) continue;
      const [name, kind] = k.split(":");
      c[classOf(name, kind)] += lines.length;
    }
    const only = c.computed + c.plain + c.live + c.nav;
    for (const x in tot) tot[x] += c[x];
    if (only) console.log([r.file, only, c.computed, c.plain, c.live, c.nav].join("\t"));
  }
  console.log(["TOTAL", tot.computed + tot.plain + tot.live + tot.nav, tot.computed, tot.plain, tot.live, tot.nav].join("\t"));
}
