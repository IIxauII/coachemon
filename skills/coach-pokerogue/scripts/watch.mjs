// Always-on coach feed for Claude's Monitor tool: prints one short stdout line per
// new battle, danger, learn-move prompt and reward screen, and one per distinct read
// error. Lines are summaries (notifications truncate long ones); read.sh battle
// has the detail. Each line carries the HUD's own verdict when the HUD is running,
// so Claude can stay quiet when the panel already has it. Also keeps the HUD
// overlay alive, re-injecting it whenever the page has lost it.
// Read-only, like read.sh.
// Usage: node watch.mjs <chrome|orion> [--no-hud]
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const [browser, flag] = process.argv.slice(2);
if (!["chrome", "orion"].includes(browser)) {
  console.error("usage: node watch.mjs <chrome|orion> [--no-hud]");
  process.exit(2);
}
const withHud = flag !== "--no-hud";
const readSh = fileURLToPath(new URL("./read.sh", import.meta.url));
const read = async mode => JSON.parse((await run(readSh, [browser, mode])).stdout);

const mon = p => `${p.name} L${p.lv} ${p.types.join("/")} [${[p.ability, p.passive].filter(Boolean).join("/")}] ${p.hp}`;
const move = m => `${m.name} (${m.type} ${m.category}${m.power > 0 ? ` ${m.power}` : ""}${m.accuracy > 0 ? ` ${m.accuracy}%` : ""})`;
const item = i => `${i.name}${i.cost ? ` $${i.cost}` : ""}`;
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);

// One event per distinct key per kind: a reroll changes the reward names, so it fires again.
const seen = {};
const emit = (kind, key, line) => {
  if (key == null || seen[kind] === key) return;
  seen[kind] = key;
  console.log(line);
};
// The HUD refreshes once a second, so its verdict on a new screen can trail the read by a poll or two. Hold an event
// back until the verdict for this key is in, but not forever: after a few polls it goes out without one.
const HUD_WAIT_POLLS = 3;
const waits = {};
const hudReady = (kind, key, ready) => {
  if (!withHud || ready) return true;
  if (waits[kind]?.key !== key) waits[kind] = { key, n: 0 };
  return ++waits[kind].n > HUD_WAIT_POLLS;
};
const dangers = new Set(); // `${wave}|${mon}`: one DANGER line per mon per wave
let firstBattle = true; // the first battle seen since the watcher started may already be under way
let lastError = null;
for (;;) {
  try {
    const snap = await read("battle");
    if (snap.error) throw new Error(snap.error);
    if (snap.loading) { await new Promise(r => setTimeout(r, 2000)); continue; }
    lastError = null;
    if (withHud && !snap.hudActive) await read("hud");
    const w = `w${snap.wave}`;
    const hud = snap.hud && snap.hud.wave === snap.wave ? snap.hud : null;
    const foes = snap.enemy.filter(e => !e.hp.startsWith("0/"));
    // Keyed on the wave alone: a trainer's fainted mons drop out of the enemy list mid-battle.
    const battleKey = `${snap.wave}`;
    if (foes.length && snap.wave != null && !snap.learn && !snap.rewards && seen.battle !== battleKey
      && hudReady("battle", battleKey, hud?.verdict)) {
      const v = hud?.verdict ?? null;
      const danger = hud?.danger ?? [];
      const resumed = firstBattle && snap.turn > 1 ? ` (resumed, turn ${snap.turn})` : "";
      // An easy wave only needs names: the panel has it handled.
      const foeText = v === "easy" ? foes.map(p => `${p.name} L${p.lv}`).join(" · ") : foes.map(mon).join(" · ");
      emit("battle", battleKey,
        `NEW BATTLE ${w}${snap.double ? " double" : ""} ${snap.trainer ?? "wild"}${v ? ` · ${v === "danger" ? "DANGER" : v}` : ""}${resumed}`
        + ` | ${foeText}${danger.map(d => ` 💀 ${d.mon}`).join("")}`);
      for (const d of danger) dangers.add(`${snap.wave}|${d.mon}`);
      firstBattle = false;
    }
    // A 💀 that shows up after the battle line: once per mon per wave.
    if (hud && seen.battle === battleKey) {
      for (const d of hud.danger ?? []) {
        const key = `${snap.wave}|${d.mon}`;
        if (dangers.has(key)) continue;
        dangers.add(key);
        console.log(`DANGER ${w} ${d.mon} ← ${d.from} ${d.move}`);
      }
    }
    if (snap.learn) {
      const key = `${snap.wave}|${snap.learn.pokemon}|${snap.learn.move.name}`;
      if (seen.learn !== key && hudReady("learn", key, hud?.learn)) {
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
      if (seen.rewards !== key && hudReady("rewards", key, hud?.rewards)) {
        emit("rewards", key,
          `REWARDS ${w} money $${snap.money} reroll $${r.rerollCost} | free: ${r.free.map(item).join(", ")} | shop: ${r.shop.map(item).join(", ")}`
          + `${hud?.rewards ? ` | HUD: ${hud.rewards}` : ""}`);
      }
    }
  } catch (e) {
    const msg = String(e.message ?? e).split("\n")[0];
    if (msg !== lastError) console.log(`COACH ERROR ${msg}`);
    lastError = msg;
  }
  await new Promise(r => setTimeout(r, 2000));
}
