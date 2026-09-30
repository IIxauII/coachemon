// Coach feed for Claude's `Monitor`: one short line per new battle, danger, learn prompt, reward screen, biome choice
// and Mystery Encounter, and one per distinct read error. Re-injects the HUD whenever the page has lost it.
// Usage: node watch.mjs <chrome|orion> [--no-hud]
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const mon = p => `${p.name} L${p.lv} ${p.types.join("/")} [${[p.ability, p.passive].filter(Boolean).join("/")}] ${p.hp}`;
const move = m => `${m.name} (${m.type} ${m.category}${m.power > 0 ? ` ${m.power}` : ""}${m.accuracy > 0 ? ` ${m.accuracy}%` : ""})`;
const item = i => `${i.name}${i.cost ? ` $${i.cost}` : ""}`;
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);

const HUD_WAIT_POLLS = 3;
// A danger with no `level` is from a HUD that predates it, which listed only KOs before our mon acts.
const notable = d => (d.level ?? "ko") === "ko" || !!d.saveFor;
const dangerText = d => (d.level === "after" ? `⚠ ${d.mon} (after acting, saved for ${d.saveFor})` : `💀 ${d.mon}`);
const isLost = plan => !!plan?.startsWith("likely lost");

export const newWatchState = () => ({ kinds: {}, waits: {}, dangers: [], lost: [], firstBattle: true, lastError: null });

// Pure: the poll loop only reads and prints, so a recorded run of snapshots replays exactly.
export const watchEvents = (state, snap, { withHud = true } = {}) => {
  const s = { ...state, kinds: { ...state.kinds }, waits: { ...state.waits }, dangers: [...state.dangers], lost: [...state.lost] };
  const lines = [];
  const emit = (kind, key, line) => {
    if (key == null || s.kinds[kind] === key) return;
    s.kinds[kind] = key;
    lines.push(line);
  };
  const hudReady = (kind, key, ready) => {
    if (!withHud || ready) return true;
    const n = (s.waits[kind]?.key === key ? s.waits[kind].n : 0) + 1;
    s.waits[kind] = { key, n };
    return n > HUD_WAIT_POLLS;
  };

  if (snap.error) {
    const msg = String(snap.error).split("\n")[0];
    if (msg !== s.lastError) lines.push(`COACH ERROR ${msg}`);
    s.lastError = msg;
    return { seen: s, lines };
  }
  if (snap.loading) return { seen: s, lines };
  s.lastError = null;

  const w = `w${snap.wave}`;
  const hud = snap.hud && snap.hud.wave === snap.wave ? snap.hud : null;
  const foes = snap.enemy.filter(e => !e.hp.startsWith("0/"));
  // Keyed on the wave alone: a trainer's fainted mons drop out of the enemy list mid-battle.
  const battleKey = `${snap.wave}`;
  if (foes.length && snap.wave != null && !snap.learn && !snap.rewards && s.kinds.battle !== battleKey
    && hudReady("battle", battleKey, hud?.verdict)) {
    const v = hud?.verdict ?? null;
    const danger = (hud?.danger ?? []).filter(notable);
    const resumed = s.firstBattle && snap.turn > 1 ? ` (resumed, turn ${snap.turn})` : "";
    const foeText = v === "easy" ? foes.map(p => `${p.name} L${p.lv}`).join(" · ") : foes.map(mon).join(" · ");
    emit("battle", battleKey,
      `NEW BATTLE ${w}${snap.double ? " double" : ""} ${snap.trainer ?? "wild"}${v ? ` · ${v === "danger" ? "DANGER" : v}` : ""}${resumed}`
      + ` | ${foeText}${danger.map(d => ` ${dangerText(d)}`).join("")}${hud?.plan ? ` | plan: ${hud.plan}` : ""}`);
    for (const d of danger) s.dangers.push(`${snap.wave}|${d.mon}`);
    if (isLost(hud?.plan)) s.lost.push(snap.wave);
    s.firstBattle = false;
  }
  if (hud && s.kinds.battle === battleKey) {
    for (const d of (hud.danger ?? []).filter(notable)) {
      const key = `${snap.wave}|${d.mon}`;
      if (s.dangers.includes(key)) continue;
      s.dangers.push(key);
      lines.push(`DANGER ${w} ${d.mon} ← ${d.from} ${d.move}${d.level === "after" ? ` (after acting, saved for ${d.saveFor})` : ""}`);
    }
    if (isLost(hud.plan) && !s.lost.includes(snap.wave)) {
      s.lost.push(snap.wave);
      lines.push(`LIKELY LOST ${w} turn ${snap.turn} | ${hud.plan}`);
    }
  }
  if (snap.learn) {
    const key = `${snap.wave}|${snap.learn.pokemon}|${snap.learn.move.name}`;
    if (s.kinds.learn !== key && hudReady("learn", key, hud?.learn)) {
      const pk = snap.party.find(p => p.name === snap.learn.pokemon);
      const stats = pk?.stats ? ` | ${pk.name} Atk${pk.stats.atk}/SpA${pk.stats.spa}` : "";
      emit("learn", key,
        `LEARN MOVE ${w} ${snap.learn.pokemon} wants ${move(snap.learn.move)} | has: ${(pk?.moves ?? []).map(move).join(", ")}${stats}`
        + `${hud?.learn ? ` | HUD: ${lower(hud.learn)}` : ""}`);
    }
  }
  // A shop with no free rewards isn't the reward screen the user picks from.
  if (snap.rewards?.free.length) {
    const r = snap.rewards;
    const key = `${snap.wave}|${r.free.map(i => i.name).join(",")}`;
    if (s.kinds.rewards !== key && hudReady("rewards", key, hud?.rewards)) {
      emit("rewards", key,
        `REWARDS ${w} money $${snap.money} reroll $${r.rerollCost} | free: ${r.free.map(item).join(", ")} | shop: ${r.shop.map(item).join(", ")}`
        + `${hud?.rewards ? ` | HUD: ${hud.rewards}` : ""}`
        + `${hud?.audit ? ` | audit: ${hud.audit.split("; ")[0]}` : ""}`);
    }
  }
  // The HUD's biome line has no ` pick — ` while it is still reading the game's biome tables.
  if (hud?.biome && s.kinds.biome !== `${snap.wave}` && hudReady("biome", `${snap.wave}`, / pick — /.test(hud.biome))) {
    emit("biome", `${snap.wave}`, `BIOME ${w} | HUD: ${hud.biome}`);
  }
  const meKey = hud?.encounter ? `${snap.wave}|${hud.encounter.split(":")[0]}` : null;
  if (meKey && s.kinds.encounter !== meKey) emit("encounter", meKey, `ENCOUNTER ${w} | HUD: ${hud.encounter}`);
  return { seen: s, lines };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = promisify(execFile);
  const [browser, flag] = process.argv.slice(2);
  if (!["chrome", "orion"].includes(browser)) {
    console.error("usage: node watch.mjs <chrome|orion> [--no-hud]");
    process.exit(2);
  }
  const withHud = flag !== "--no-hud";
  const readSh = fileURLToPath(new URL("./read.sh", import.meta.url));
  const read = async mode => JSON.parse((await run(readSh, [browser, mode])).stdout);

  let state = newWatchState();
  for (;;) {
    let snap;
    try { snap = await read("battle"); } catch (e) { snap = { error: String(e.message ?? e) }; }
    if (!snap.error && !snap.loading && withHud && !snap.hudActive) {
      try { await read("hud"); } catch {}
    }
    const out = watchEvents(state, snap, { withHud });
    state = out.seen;
    for (const l of out.lines) console.log(l);
    await new Promise(r => setTimeout(r, 2000));
  }
}
