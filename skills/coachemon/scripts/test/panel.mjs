// Every group's pane, not only the one the tab bar left open (#357). The groups are `shownGroups()`, the ones the
// refresh drew (#388): drawing them again here would re-enter a renderer and re-arm the missed-sprite latch the next
// refresh reads.
export const wholeCard = el => {
  const kids = el.kids ?? [];
  const { pane } = globalThis.__hud["90-render"];
  const { shownGroups } = globalThis.__hud["98-tick"];
  const groups = shownGroups();
  // Four kids is the open panel — control, strip, tab bar, pane, and no disclaimer (extension-distribution.md §3,
  // #362) — so the drawer is the last two. Any other shape (a shut drawer, a dismissal, a failed refresh) is taken as
  // drawn.
  return kids.length === 4 && groups ? [...kids.slice(0, 2), ...groups.flatMap(g => pane(g))] : kids;
};
