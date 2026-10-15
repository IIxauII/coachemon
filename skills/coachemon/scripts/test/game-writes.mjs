// A write from the overlay anywhere in the game it is handed is recorded and dropped: a frozen object would refuse one
// only in strict code.
export const writes = [];
const guarded = new WeakMap();
// A guard is never guarded again, or two reads of one mon, one through a method's result, would not be `===`.
const guards = new WeakSet();
export const guard = v => {
  if ((typeof v !== "object" && typeof v !== "function") || v === null || guards.has(v)) return v;
  if (!guarded.has(v)) {
    const wrote = (_, k) => { writes.push(String(k)); return true; };
    const g = new Proxy(v, { get: (t, k) => guard(Reflect.get(t, k)), apply: (t, self, args) => guard(Reflect.apply(t, self, args)),
      set: wrote, defineProperty: wrote, deleteProperty: wrote });
    guarded.set(v, g);
    guards.add(g);
  }
  return guarded.get(v);
};
