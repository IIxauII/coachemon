// The drawn panel, as a golden about **what a card says** wants to read it. Shared because every kind's scenario
// script wants the same thing, and because the panel's own shelling is one fact that belongs in one place: a shell
// child added or dropped — #362 takes the footer off — is then one edit here rather than one per script.
// The drawer shows one group at a time and the tab bar decides which (#357), so this walks the card's own groups
// rather than the pane a click happens to have left open. Which pane that is, and what the bar holds, is rendertest's
// subject, not each kind's.
export const wholeCard = el => {
  const kids = el.kids ?? [];
  const { groupsOf, pane } = globalThis.__hud["90-render"];
  const groups = groupsOf(globalThis.__coachHud.last());
  // The panel is its control, the strip, the tab bar, the open pane and the footer, so the drawer is the two in the
  // middle. Anything else — a dismissal, a failed refresh — is taken exactly as it was drawn.
  return kids.length === 5 && groups ? [...kids.slice(0, 2), ...groups.flatMap(g => pane(g)), kids[4]] : kids;
};
