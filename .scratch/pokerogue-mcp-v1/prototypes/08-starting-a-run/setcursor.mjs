// PROTOTYPE — does setCursor work on STARTER_SELECT from outside?
// Checks this.cursor AND whether the cursor sprite lands where
// calcStarterPosition() says it should, which is the thing that breaks.
import { connect, inGame } from './lib.mjs';
const cdp = await connect();

const probe = (target) => inGame(`
  const h = handler;
  if (h.constructor.name !== 'StarterSelectUiHandler') return { error: 'mode=' + ui.mode };
  const before = { cursor: h.cursor, scroll: h.scrollCursor, filterMode: h.filterMode,
                   objX: h.cursorObj.x, objY: h.cursorObj.y, visible: h.cursorObj.visible };
  const changed = h.setCursor(${target});
  // recompute calcStarterPosition exactly as the source does
  const pos = i => ({ x: (i % 9) * 18, y: 13 + (Math.floor(i / 9) - h.scrollCursor) * 17 });
  const want = pos(h.cursor);
  const after = { cursor: h.cursor, scroll: h.scrollCursor, filterMode: h.filterMode,
                  filterBarCursor: h.filterBarCursor,
                  objX: h.cursorObj.x, objY: h.cursorObj.y, visible: h.cursorObj.visible,
                  wantX: want.x - 1, wantY: want.y + 1,
                  species: h.filteredStarterContainers[h.cursor] ? h.filteredStarterContainers[h.cursor].species.name : null,
                  gridLength: h.filteredStarterContainers.length,
                  // is the sprite inside the 9-row visible window?
                  onScreen: (want.y + 1) >= 0 && (want.y + 1) <= 13 + 9 * 17 };
  return { changed, before, after };
`);

for (const t of [13, 26, 999, -5, 0]) {
  const r = await cdp.evaluate(probe(t));
  if (r.error) { console.log('ERR', r.error); break; }
  const a = r.after;
  const synced = a.objX === a.wantX && a.objY === a.wantY;
  console.log(`setCursor(${String(t).padStart(4)}) -> changed=${String(r.changed).padEnd(5)} cursor=${String(a.cursor).padStart(3)} (${a.species}) scroll=${a.scroll}  sprite=(${a.objX},${a.objY}) want=(${a.wantX},${a.wantY}) synced=${synced} onScreen=${a.onScreen}`);
}
cdp.close();
