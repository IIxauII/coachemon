// Runs in the PokéRogue page world and writes nothing to the game. The result is JSON on
// `document.documentElement.dataset.mcpOut`, where an isolated-world caller (Orion's `do JavaScript`) can read it off
// the DOM. hud-bundle.mjs sets `MODE` to read.sh's mode.
import { TYPES } from "./hud/01-core.js";
import { learnState, rewardsScreen } from "./hud/02-screens.js";

(() => {
  const MODE = "__MODE__";
  // The HUD's TYPES are the type chart's eighteen. Stellar, a Tera type with no chart row, comes after them.
  const typeName = t => TYPES[t] ?? (t === PokemonType.STELLAR ? "Stellar" : undefined);
  const STATS = ["hp","atk","def","spa","spd","spe"];
  let out;
  try {
    // Needs no run, no scene and no panel, so it comes before the game lookup. The panel's copy wins over the store's:
    // it carries the encounter still being recorded.
    if (MODE === "journal") {
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem("coach-me-journal")); } catch {}
      let live = null, stats = null;
      try { live = window.__coachHud?.journal?.() ?? null; stats = window.__coachHud?.journalStats?.() ?? null; } catch {}
      const entries = live ?? (Array.isArray(stored) ? stored : []);
      document.documentElement.dataset.mcpOut = JSON.stringify({ hudActive: !!window.__coachHud, stats, entries });
      return;
    }
    if (MODE === "stats") {
      let stats = null;
      try { stats = window.__coachHud?.stats?.() ?? window.__coachMeter?.stats?.() ?? null; } catch {}
      document.documentElement.dataset.mcpOut = JSON.stringify({ hudActive: !!window.__coachHud, meterActive: !!window.__coachMeter, stats });
      return;
    }
    const game = Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game;
    const s = game.scene.getScene("battle");
    // Mid-reload or on the title screen the battle scene exists without its UI yet.
    if (!s?.ui) throw Object.assign(new Error("game loading"), { loading: true });
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
            passiveUnlocked: (st.passiveAttr & Passive.UNLOCKED) === Passive.UNLOCKED,
            hiddenAbility: (st.abilityAttr & AbilityAttr.ABILITY_HIDDEN) === AbilityAttr.ABILITY_HIDDEN,
            eggMoves: st.eggMoves,
            costReduction: st.valueReduction,
            candy: st.candyCount,
          })),
        hud: (() => { try { return window.__coachHud?.summary?.()?.starters ?? null; } catch { return null; } })(),
      };
    } else {
      const CATS = ["Physical","Special","Status"];
      const moveInfo = mv => ({ name: mv.name, type: typeName(mv.type), power: mv.power, category: CATS[mv.category], accuracy: mv.accuracy });
      const mon = p => ({
        name: p.name,
        lv: p.level,
        hp: `${p.hp}/${p.getMaxHp()}`,
        types: p.getTypes().map(t => typeName(t) ?? t),
        ability: p.getAbility()?.name,
        passive: p.hasPassive?.() ? p.getPassiveAbility()?.name : null,
        stats: Object.fromEntries(STATS.map((k, i) => [k, p.getStat(i)])),
        statStages: p.summonData?.statStages,
        status: p.status?.effect ?? null,
        onField: p.isOnField(),
        boss: p.isBoss(),
        // `bossSegmentIndex` is 0 on the last bar (game-code.md §3).
        bossBars: p.isBoss() && p.bossSegments > 1 ? { left: (p.bossSegmentIndex ?? p.bossSegments - 1) + 1, of: p.bossSegments } : null,
        held: (p.getHeldItems?.() ?? []).map(m => `${m.type?.name} x${m.stackCount}`),
        moves: p.moveset.map(m => {
          const mv = m.getMove();
          return { ...moveInfo(mv), name: m.getName(), pp: `${m.getMovePp() - m.ppUsed}/${m.getMovePp()}` };
        }),
      });
      const b = s.currentBattle;
      const party = s.getPlayerParty();
      const st = learnState(s);
      const learn = st ? { pokemon: st.pk.name, move: moveInfo(st.mv) } : null;

      const rh = rewardsScreen(s);
      let rewards = null;
      if (rh) {
        const item = o => {
          const t = o.modifierTypeOption?.type;
          let desc = null;
          try { desc = t?.getDescription?.(); } catch {}
          return { name: t?.name, desc, cost: o.modifierTypeOption?.cost ?? 0 };
        };
        rewards = { free: rh.options.map(item), shop: (rh.shopOptionsRows || []).flat().map(item), rerollCost: rh.rerollCost ?? null };
      }

      let hud = null;
      try { hud = window.__coachHud?.summary?.() ?? null; } catch {}

      out = {
        wave: b?.waveIndex ?? null,
        turn: b?.turn ?? null,
        double: b?.double ?? null,
        trainer: b?.trainer?.getName?.() ?? null,
        money: s.money,
        hudActive: !!window.__coachHud,
        hud,
        uiMode: document.getElementById("touchControls")?.dataset.uiMode ?? null,
        learn,
        rewards,
        party: party.map(mon),
        enemy: s.getEnemyParty().map(mon),
        // The party's own modifiers; a held item is on its holder (`held`) instead.
        items: s.modifiers.filter(m => m.pokemonId === undefined).map(m => `${m.type?.name} x${m.stackCount}`),
      };
    }
  } catch (e) {
    out = e.loading ? { loading: true } : { error: String(e) };
  }
  document.documentElement.dataset.mcpOut = JSON.stringify(out);
})();
