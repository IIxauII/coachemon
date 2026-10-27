const zeros = xs => xs.map(() => 0);

// A team-plan fight state from the fields a test sets, with zeros for each wear array it leaves out, as `tpModel`'s
// start state has: `tpFight` reads every one.
export const fightState = st => ({
  ox: zeros(st.oh), od: zeros(st.oh), og: zeros(st.oh), ok: zeros(st.oh),
  fd: zeros(st.fh), fg: zeros(st.fh), fl: zeros(st.fh), fk: zeros(st.fh),
  ...st,
});
