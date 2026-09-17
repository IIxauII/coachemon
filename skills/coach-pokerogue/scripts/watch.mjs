// Always-on coach feed for Claude's Monitor tool: prints one short stdout line per
// new battle, danger, learn-move prompt, reward screen, biome choice and Mystery Encounter, and one per distinct read
// error. Lines are summaries (notifications truncate long ones); read.sh battle
// has the detail. Each line carries the HUD's own verdict when the HUD is running,
// so Claude can stay quiet when the panel already has it. Also keeps the HUD
// overlay alive, re-injecting it whenever the page has lost it.
// Read-only, like read.sh.
// Usage: node watch.mjs <chrome|orion> [--no-hud]
//
// `watchEvents` is the whole of the inference and is pure: state in, snapshot in, new state and lines out. The poll
// loop below only reads and prints, so a recorded run of snapshots replays exactly (test/watchtest.mjs).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const mon = p => `${p.name} L${p.lv} ${p.types.join("/")} [${[p.ability, p.passive].filter(Boolean).join("/")}] ${p.hp}`;
const move = m => `${m.name} (${m.type} ${m.category}${m.power > 0 ? ` ${m.power}` : ""}${m.accuracy > 0 ? ` ${m.accuracy}%` : ""})`;
const item = i => `${i.name}${i.cost ? ` $${i.cost}` : ""}`;
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);

// The HUD refreshes once a second, so its verdict on a new screen can trail the read by a poll or two. An event is
// held back until the verdict for this key is in, but not forever: after a few polls it goes out without one.
const HUD_WAIT_POLLS = 3;
// A KO before our mon acts always; one after it acts only for a mon the fight plan is saving for a foe. A HUD from
// before `level` existed only listed the first kind.
const notable = d => (d.level ?? "ko") === "ko" || !!d.saveFor;
const dangerText = d => (d.level === "after" ? `⚠ ${d.mon} (after acting, saved for ${d.saveFor})` : `💀 ${d.mon}`);
const isLost = plan => !!plan?.startsWith("likely lost");

// Everything the watcher carries between polls. `kinds`: one event per distinct key per kind (a reroll changes the
// reward names, so rewards fire again). `dangers`: `${wave}|${mon}`, one DANGER line per mon per wave.
export const newWatchState = () => ({ kinds: {}, waits: {}, dangers: [], lost: [], firstBattle: true, lastError: null });

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
    // An easy wave only needs names: the panel has it handled.
    const foeText = v === "easy" ? foes.map(p => `${p.name} L${p.lv}`).join(" · ") : foes.map(mon).join(" · ");
    emit("battle", battleKey,
      `NEW BATTLE ${w}${snap.double ? " double" : ""} ${snap.trainer ?? "wild"}${v ? ` · ${v === "danger" ? "DANGER" : v}` : ""}${resumed}`
      + ` | ${foeText}${danger.map(d => ` ${dangerText(d)}`).join("")}${hud?.plan ? ` | plan: ${hud.plan}` : ""}`);
    for (const d of danger) s.dangers.push(`${snap.wave}|${d.mon}`);
    if (isLost(hud?.plan)) s.lost.push(snap.wave);
    s.firstBattle = false;
  }
  if (hud && s.kinds.battle === battleKey) {
    // A 💀 that shows up after the battle line: once per mon per wave.
    for (const d of (hud.danger ?? []).filter(notable)) {
      const key = `${snap.wave}|${d.mon}`;
      if (s.dangers.includes(key)) continue;
      s.dangers.push(key);
      lines.push(`DANGER ${w} ${d.mon} ← ${d.from} ${d.move}${d.level === "after" ? ` (after acting, saved for ${d.saveFor})` : ""}`);
    }
    // The fight plan turning into a likely loss mid-battle: once per wave.
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
  // A shop with no free rewards (reroll cost -1) isn't the reward screen the user picks from.
  if (snap.rewards?.free.length) {
    const r = snap.rewards;
    const key = `${snap.wave}|${r.free.map(i => i.name).join(",")}`;
    if (s.kinds.rewards !== key && hudReady("rewards", key, hud?.rewards)) {
      emit("rewards", key,
        `REWARDS ${w} money $${snap.money} reroll $${r.rerollCost} | free: ${r.free.map(item).join(", ")} | shop: ${r.shop.map(item).join(", ")}`
        + `${hud?.rewards ? ` | HUD: ${hud.rewards}` : ""}`
        // The team audit's count and its first finding only: notifications truncate, and the read has the rest.
        + `${hud?.audit ? ` | audit: ${hud.audit.split("; ")[0]}` : ""}`);
    }
  }
  // Biome choice: once per wave, only with the HUD's call (the read alone has no options to show), held back a few
  // polls while the HUD is still reading the game's biome tables.
  if (hud?.biome && s.kinds.biome !== `${snap.wave}` && hudReady("biome", `${snap.wave}`, / pick — /.test(hud.biome))) {
    emit("biome", `${snap.wave}`, `BIOME ${w} | HUD: ${hud.biome}`);
  }
  // Mystery Encounter option screen: once per wave and encounter, only with the HUD's call (the read has no options).
  const meKey = hud?.encounter ? `${snap.wave}|${hud.encounter.split(":")[0]}` : null;
  if (meKey && s.kinds.encounter !== meKey) emit("encounter", meKey, `ENCOUNTER ${w} | HUD: ${hud.encounter}`);
  return { seen: s, lines };
};

// ---- The poll loop: read, hand the snapshot to `watchEvents`, print what it returns.
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
