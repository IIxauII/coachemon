// PROTOTYPE — read-only-ish. While filterMode is on, setCursor(n) writes
// filterBarCursor, NOT the grid cursor. Same method name, two address spaces.
// Restores whatever it touched.
import { connect, inGame } from './lib.mjs';
const cdp = await connect();
const r = await cdp.evaluate(inGame(`
  const h = handler;
  const fb = h.filterBar;
  const snap = () => ({ filterMode: h.filterMode, gridCursor: h.cursor, filterBarCursor: h.filterBarCursor,
                         openDropDown: !!fb.openDropDown, gridLength: h.filteredStarterContainers.length });
  const before = snap();

  // the overload: setCursor while filterMode === true
  const changed = h.setCursor(3);
  const after = snap();

  // restore
  h.setCursor(before.filterBarCursor);

  return {
    before, changed, after,
    restored: snap(),
    numFilters: fb.numFilters,
    columns: fb.labels ? fb.labels.map(l => l.text) : null,
    // which column each filterBarCursor index maps to
    columnAt: Array.from({ length: fb.numFilters }, (_, i) => fb.getColumn(i)),
    defaults: Array.from({ length: fb.numFilters }, (_, i) => fb.getFilter(fb.getColumn(i)).hasDefaultValues()),
  };
`));
console.log(JSON.stringify(r, null, 2));
cdp.close();
