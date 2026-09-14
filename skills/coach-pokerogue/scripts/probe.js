// Runs in the PokéRogue page world. Read-only: presses nothing, writes nothing
// to the game. Result is JSON on document.documentElement.dataset.mcpOut so an
// isolated-world caller (Orion's `do JavaScript`) can pick it up from the DOM.
// __MODE__ is replaced by read.sh with "battle" or "starters".
(() => {
  const MODE = "__MODE__";
  const TYPES = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy","Stellar"];
  const STATS = ["hp","atk","def","spa","spd","spe"];
  let out;
  try {
    const game = Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game;
    const s = game.scene.getScene("battle");
    if (MODE === "starters") {
      const gd = s.gameData;
      const h = s.ui.getHandler();
      const costs = Object.fromEntries((h.filteredStarterContainers || []).map(c => [c.species.speciesId, c.cost]));
      out = {
        onStarterScreen: Object.keys(costs).length > 0,
        starters: Object.entries(gd.starterData)
          .filter(([id]) => gd.dexData[id] && BigInt(gd.dexData[id].caughtAttr) > 0n)
          .map(([id, st]) => ({
            id: +id,
            cost: costs[id] ?? null,
            ivTotal: gd.dexData[id].ivs.reduce((a, b) => a + b, 0),
            passiveUnlocked: (st.passiveAttr & 1) === 1,
            hiddenAbility: (st.abilityAttr & 4) === 4,
            eggMoves: st.eggMoves,
            costReduction: st.valueReduction,
            candy: st.candyCount,
          })),
      };
    } else {
      const mon = p => ({
        name: p.name,
        lv: p.level,
        hp: `${p.hp}/${p.getMaxHp()}`,
        types: p.getTypes().map(t => TYPES[t] ?? t),
        ability: p.getAbility()?.name,
        passive: p.hasPassive?.() ? p.getPassiveAbility()?.name : null,
        stats: Object.fromEntries(STATS.map((k, i) => [k, p.getStat(i)])),
        statStages: p.summonData?.statStages,
        status: p.status?.effect ?? null,
        onField: p.isOnField(),
        boss: p.isBoss(),
        moves: p.moveset.map(m => {
          const mv = m.getMove();
          return { name: m.getName(), type: TYPES[mv.type], power: mv.power, category: ["Physical","Special","Status"][mv.category], pp: `${m.getMovePp() - m.ppUsed}/${m.getMovePp()}` };
        }),
      });
      const b = s.currentBattle;
      out = {
        wave: b?.waveIndex ?? null,
        double: b?.double ?? null,
        trainer: b?.trainer?.getName?.() ?? null,
        money: s.money,
        uiMode: document.getElementById("touchControls")?.dataset.uiMode ?? null,
        party: s.getPlayerParty().map(mon),
        enemy: s.getEnemyParty().map(mon),
        items: s.modifiers.map(m => `${m.type?.name} x${m.stackCount}`),
      };
    }
  } catch (e) {
    out = { error: String(e) };
  }
  document.documentElement.dataset.mcpOut = JSON.stringify(out);
})();
