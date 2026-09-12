// PROTOTYPE — does setCursor desync the cursor sprite when scrollCursor != 0?
// setCursor() honours scrollCursor but never calls updateScroll(). The two
// in-game paths that move both (UP/DOWN out of the filter bar) set scrollCursor,
// call updateScroll(), THEN setCursor -- that is the correct recipe.
//
// This account's grid is 3 rows and the window is 9, so normal play clamps
// scrollCursor to 0 and the bug is unreachable. We construct scrollCursor=1 to
// measure the mechanism, then restore. Fully reversible, no presses.
import { connect, inGame } from './lib.mjs';
const cdp = await connect();
const r = await cdp.evaluate(inGame(`
  const h = handler;
  const want = i => ({ x: (i % 9) * 18 - 1, y: 13 + (Math.floor(i / 9) - h.scrollCursor) * 17 + 1 });
  const obs = () => ({ cursor: h.cursor, scroll: h.scrollCursor,
                       sprite: { x: h.cursorObj.x, y: h.cursorObj.y }, want: want(h.cursor) });
  const origCursor = h.cursor, origScroll = h.scrollCursor;
  const steps = {};

  steps.baseline = obs();

  // 1. naive: move scroll without updateScroll, then setCursor -- what a server
  //    would do if it treated scrollCursor as a plain number
  h.scrollCursor = 1;
  h.setCursor(0);
  steps.naive = obs();
  steps.naive.spriteMatchesWant = steps.naive.sprite.y === steps.naive.want.y;
  steps.naive.spriteOnScreen = steps.naive.sprite.y >= 13 && steps.naive.sprite.y <= 13 + 9 * 17;

  // 2. correct recipe: scrollCursor = floor(i/9) clamped, updateScroll(), setCursor(i)
  const target = 0;
  const numRows = Math.ceil(h.filteredStarterContainers.length / 9);
  h.scrollCursor = Math.max(0, Math.min(Math.floor(target / 9), Math.max(0, numRows - 9)));
  h.updateScroll();
  h.setCursor(target);
  steps.fixed = obs();
  steps.fixed.spriteMatchesWant = steps.fixed.sprite.y === steps.fixed.want.y;
  steps.fixed.spriteOnScreen = steps.fixed.sprite.y >= 13 && steps.fixed.sprite.y <= 13 + 9 * 17;

  // restore
  h.scrollCursor = origScroll;
  h.updateScroll();
  h.setCursor(origCursor);
  steps.restored = obs();

  return { steps, gridLength: h.filteredStarterContainers.length, numRows,
           visibleRows: 9, windowCells: 81,
           desyncThresholdIndex: 'index < scrollCursor*9 or >= scrollCursor*9+81' };
`));
console.log(JSON.stringify(r, null, 2));
cdp.close();
