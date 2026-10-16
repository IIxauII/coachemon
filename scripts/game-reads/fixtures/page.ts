export function fixture(L: any) {
  const h = L.ui.handlers[L.m.STARTER_SELECT];
  const result = { cursor: h.cursor, keys: Object.keys(h) };
  if (L.scene.phaseManager.getCurrentPhase().phaseName === "SelectStarterPhase") return result;
  return result;
}
