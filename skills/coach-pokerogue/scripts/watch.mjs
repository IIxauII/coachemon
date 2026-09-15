// Always-on coach feed for Claude's Monitor tool: prints one short stdout line per
// new battle, learn-move prompt and reward screen, and one per distinct read
// error. Lines are summaries (notifications truncate long ones); read.sh battle
// has the detail. Also keeps the HUD overlay alive, re-injecting it whenever the
// page has lost it.
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

// One event per distinct key per kind: a reroll changes the reward names, so it fires again.
const seen = {};
const emit = (kind, key, line) => {
  if (key == null || seen[kind] === key) return;
  seen[kind] = key;
  console.log(line);
};
let lastError = null;
for (;;) {
  try {
    const snap = await read("battle");
    if (snap.error) throw new Error(snap.error);
    if (snap.loading) { await new Promise(r => setTimeout(r, 2000)); continue; }
    lastError = null;
    if (withHud && !snap.hudActive) await read("hud");
    const w = `w${snap.wave}`;
    const foes = snap.enemy.filter(e => !e.hp.startsWith("0/"));
    if (foes.length && snap.wave != null) {
      // Keyed on the wave alone: a trainer's fainted mons drop out of the enemy list mid-battle.
      emit("battle", `${snap.wave}`,
        `NEW BATTLE ${w} ${snap.double ? "double" : "single"} ${snap.trainer ?? "wild"} | ${foes.map(mon).join(" · ")}`);
    }
    if (snap.learn) {
      const pk = snap.party.find(p => p.name === snap.learn.pokemon);
      emit("learn", `${snap.wave}|${snap.learn.pokemon}|${snap.learn.move.name}`,
        `LEARN MOVE ${w} ${snap.learn.pokemon} wants ${move(snap.learn.move)} | has: ${(pk?.moves ?? []).map(move).join(", ")}`);
    }
    if (snap.rewards) {
      const r = snap.rewards;
      emit("rewards", `${snap.wave}|${r.free.map(i => i.name).join(",")}`,
        `REWARDS ${w} money $${snap.money} reroll $${r.rerollCost} | free: ${r.free.map(item).join(", ")} | shop: ${r.shop.map(item).join(", ")}`);
    }
  } catch (e) {
    const msg = String(e.message ?? e).split("\n")[0];
    if (msg !== lastError) console.log(`COACH ERROR ${msg}`);
    lastError = msg;
  }
  await new Promise(r => setTimeout(r, 2000));
}
