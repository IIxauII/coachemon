// PROTOTYPE — read-only. Dump the STARTER_SELECT grid: flat index -> species,
// with row/col derived exactly as calcStarterPosition does (index % 9, index / 9).
import { connect, inGame } from './lib.mjs';
const cdp = await connect();
const rows = await cdp.evaluate(inGame(`
  const h = handler;
  if (h.constructor.name !== 'StarterSelectUiHandler') return { error: 'not starter select, mode=' + ui.mode };
  const gd = scene.gameData;
  return {
    gridLength: h.filteredStarterContainers.length,
    allSpecies: h.allSpecies ? h.allSpecies.length : null,
    starterContainers: h.starterContainers ? h.starterContainers.length : null,
    validStarterContainers: h.validStarterContainers ? h.validStarterContainers.length : null,
    numFilters: h.filterBar.numFilters,
    filterLabels: h.filterBar.labels ? h.filterBar.labels.map(l => l.text) : null,
    valueLimit: h.getValueLimit(),
    entries: h.filteredStarterContainers.map((c, i) => ({
      i, row: Math.floor(i / 9), col: i % 9,
      id: c.species.speciesId, name: c.species.name,
      gen: c.species.generation,
      cost: gd.getSpeciesStarterValue(c.species.speciesId),
      caught: !!(gd.dexData[c.species.speciesId] && gd.dexData[c.species.speciesId].caughtAttr),
    })),
  };
`));
if (rows.error) { console.log(rows.error); }
else {
  console.log(`grid=${rows.gridLength}  allSpecies=${rows.allSpecies}  starterContainers=${rows.starterContainers}  valid=${rows.validStarterContainers}`);
  console.log(`filters=${rows.numFilters} ${JSON.stringify(rows.filterLabels)}  valueLimit=${rows.valueLimit}`);
  for (const e of rows.entries) {
    console.log(`  [${String(e.i).padStart(2)}] r${e.row}c${e.col}  ${e.name.padEnd(12)} #${String(e.id).padStart(4)} gen${e.gen} cost=${e.cost} caught=${e.caught}`);
  }
  const cheap = rows.entries.filter(e => e.caught).sort((a, b) => a.cost - b.cost).slice(0, 8);
  console.log('\ncheapest caught:', cheap.map(e => `${e.name}(i=${e.i},cost=${e.cost})`).join(' '));
}
cdp.close();
