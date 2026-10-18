// A write from the overlay anywhere in the game it is handed is recorded and dropped: a frozen object would refuse one
// only in strict code.
export const writes = [];
const guarded = new WeakMap();
// A guard is never guarded again, or two reads of one mon, one through a method's result, would not be `===`.
const proxies = new WeakSet();
export const guard = v => {
  if ((typeof v !== "object" && typeof v !== "function") || v === null || proxies.has(v)) return v;
  if (!guarded.has(v)) {
    const wrote = (_, k) => { writes.push(String(k)); return true; };
    // A proxy must read a non-configurable, non-writable property as itself, or the read throws: `flatMap` reaches
    // `Array.prototype` through a guarded array's `constructor`.
    const get = (t, k) => {
      const d = Reflect.getOwnPropertyDescriptor(t, k);
      return d && !d.configurable && !d.writable && "value" in d ? d.value : guard(Reflect.get(t, k));
    };
    const g = new Proxy(v, { get, apply: (t, self, args) => guard(Reflect.apply(t, self, args)),
      set: wrote, defineProperty: wrote, deleteProperty: wrote });
    guarded.set(v, g);
    proxies.add(g);
  }
  return guarded.get(v);
};
