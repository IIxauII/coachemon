// The drawn panel, as a golden about **what a card says** wants to read it. Shared because every kind's scenario
// script wants the same thing, and because the panel's own shelling is one fact that belongs in one place: a shell
// child added or dropped — #362 took the footer off — is then one edit here rather than one per script.
// The drawer shows one group at a time and the tab bar decides which (#357), so this walks the card's own groups
// rather than the pane a click happens to have left open. Which pane that is, and what the bar holds, is rendertest's
// subject, not each kind's.
// **The groups are the very ones the refresh drew** (#388): `shownGroups()` is what the live panel shells and what
// the stream puts on the wire, so a guard or a fallback added there lands in these goldens too. It is also why
// reading the panel here is free — the groups are already drawn and cached, so nothing re-enters a renderer and
// nothing re-arms the missed-sprite latch the next refresh reads.
export const wholeCard = el => {
  const kids = el.kids ?? [];
  const { pane } = globalThis.__hud["90-render"];
  const { shownGroups } = globalThis.__hud["98-tick"];
  const groups = shownGroups();
  // The panel is its control, the strip, the tab bar and the open pane — it carries no disclaimer of its own (§3,
  // #362) — so the drawer is the two at the end. Anything else — a shut drawer, a dismissal, a failed refresh — is
  // taken exactly as it was drawn.
  return kids.length === 4 && groups ? [...kids.slice(0, 2), ...groups.flatMap(g => pane(g))] : kids;
};
