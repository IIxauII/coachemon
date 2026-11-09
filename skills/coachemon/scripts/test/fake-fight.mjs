const zeros = xs => xs.map(() => 0);
const nulls = xs => xs.map(() => null);

// Mirrors the wear arrays of `tpModel`'s start state, which `tpFight` reads unguarded: an array added there goes here
// too.
export const fightState = st => ({
  ox: zeros(st.oh), od: zeros(st.oh), og: zeros(st.oh), ok: zeros(st.oh), ou: nulls(st.oh),
  fd: zeros(st.fh), fg: zeros(st.fh), fl: zeros(st.fh), fk: zeros(st.fh), fu: nulls(st.fh),
  ...st,
});
