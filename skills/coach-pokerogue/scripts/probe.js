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
    // Mid-reload or on the title screen the battle scene exists without its UI yet.
    if (!s?.ui) throw Object.assign(new Error("game loading"), { loading: true });
    // Title screen or between runs: no battle to read.
    if (MODE === "battle" && !s.currentBattle) throw Object.assign(new Error("no battle"), { loading: true });
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
      const CATS = ["Physical","Special","Status"];
      const moveInfo = mv => ({ name: mv.name, type: TYPES[mv.type], power: mv.power, category: CATS[mv.category], accuracy: mv.accuracy });
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
          return { ...moveInfo(mv), name: m.getName(), pp: `${m.getMovePp() - m.ppUsed}/${m.getMovePp()}` };
        }),
      });
      const b = s.currentBattle;
      const party = s.getPlayerParty();
      const h = s.ui.getHandler();
      const uiModeId = s.ui.getMode();
      const phase = s.phaseManager?.getCurrentPhase?.();

      // Learn-move: the SUMMARY screen (UiMode 9, summaryUiMode 1) holds the new move; before it opens, the
      // "forget a move?" prompt only has LearnMovePhase's moveId, so build the move from a PokemonMove.
      let learn = null;
      if (uiModeId === 9 && h?.summaryUiMode === 1 && h.newMove) {
        learn = { pokemon: h.pokemon.name, move: moveInfo(h.newMove) };
      } else if (phase?.phaseName === "LearnMovePhase") {
        const pk = party[phase.partyMemberIndex];
        const pm = pk?.moveset.find(Boolean);
        if (pk && pm) learn = { pokemon: pk.name, move: moveInfo(new pm.constructor(phase.moveId).getMove()) };
      }

      // Rewards: MODIFIER_SELECT (UiMode 6). Free rewards in options, shop rows in shopOptionsRows.
      let rewards = null;
      if (uiModeId === 6 && h?.options) {
        const item = o => {
          const t = o.modifierTypeOption?.type;
          let desc = null;
          try { desc = t?.getDescription?.(); } catch {}
          return { name: t?.name, desc, cost: o.modifierTypeOption?.cost ?? 0 };
        };
        rewards = { free: h.options.map(item), shop: (h.shopOptionsRows || []).flat().map(item), rerollCost: h.rerollCost ?? null };
      }

      out = {
        wave: b?.waveIndex ?? null,
        double: b?.double ?? null,
        trainer: b?.trainer?.getName?.() ?? null,
        money: s.money,
        hudActive: !!window.__coachHud,
        uiMode: document.getElementById("touchControls")?.dataset.uiMode ?? null,
        learn,
        rewards,
        party: party.map(mon),
        enemy: s.getEnemyParty().map(mon),
        items: s.modifiers.map(m => `${m.type?.name} x${m.stackCount}`),
      };
    }
  } catch (e) {
    out = e.loading ? { loading: true } : { error: String(e) };
  }
  document.documentElement.dataset.mcpOut = JSON.stringify(out);
})();
