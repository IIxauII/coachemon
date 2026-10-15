import assert from "node:assert/strict";
import { bundle } from "../hud-bundle.mjs";

const CLASSIC_FIXED = new Set([5, 8, 25, 35, 55, 62, 64, 66, 95, 112, 114, 115, 145, 164, 165, 182, 184, 186, 188, 190, 195]);
const MODES = {
  classic: { isClassic: true, isWaveFinal: w => w === 200, isBoss: w => w % 10 === 0, isFixedBattle: w => CLASSIC_FIXED.has(w) },
  daily: { isDaily: true, isWaveFinal: w => w === 50, isBoss: w => w % 10 === 0, isFixedBattle: () => false },
};
const trainer = (name, { voucher = false } = {}) => ({ getName: () => name, config: { hasVoucher: voucher } });
const scene = (wave, t, { mode = "classic", seed = "U0QKEz8wXq3LmN7pR2sT9vYb" } = {}) =>
  ({ seed, gameMode: MODES[mode], currentBattle: { waveIndex: wave, trainer: t } });

globalThis.window = globalThis;
globalThis.Phaser = { Math: { RND: { state: () => "!rnd,0" } },
  Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: { scene: { getScene: () => ({ gameMode: {} }) } } } }] } } } };
const node = () => { const n = { style: {}, children: [], addEventListener() {}, remove() {}, append(...k) { n.children.push(...k); }, replaceChildren(...k) { n.kids = k; } }; return n; };
globalThis.document = { documentElement: { dataset: {} }, body: { appendChild() {} }, createElement: node };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.localStorage = { getItem: () => "full", setItem() {} };
eval(bundle("hud", { expose: true }));
const { planFile } = globalThis.__hud["56-boss-plan"];

const row = (label, s) => console.log(`${label.padEnd(30)}${planFile(s) ?? "—"}`);

// ---- Every rival is a boss fight
{
  console.log("== rivals, classic");
  for (const [w, name] of [[8, "Finn"], [145, "Ivy"], [195, "Ivy"]]) row(`W${w} ${name}`, scene(w, trainer(name)));
  assert.equal(planFile(scene(8, trainer("Finn"))), "plans/U0QKEz8wXq3LmN7pR2sT9vYb-w8-finn.md");
  assert.equal(planFile(scene(145, trainer("Ivy"))), "plans/U0QKEz8wXq3LmN7pR2sT9vYb-w145-ivy.md");
  assert.equal(planFile(scene(195, trainer("Ivy"))), "plans/U0QKEz8wXq3LmN7pR2sT9vYb-w195-ivy.md");
}

// ---- The trainers the game pays a voucher for are boss fights
{
  console.log("== voucher trainers");
  const fights = [[180, "Gordie"], [182, "Lorelei"], [190, "Blue"], [165, "Maxie"]];
  for (const [w, name] of fights) row(`W${w} ${name}`, scene(w, trainer(name, { voucher: true })));
  assert.equal(planFile(scene(180, trainer("Gordie", { voucher: true }))), "plans/U0QKEz8wXq3LmN7pR2sT9vYb-w180-gordie.md");
  assert.equal(planFile(scene(165, trainer("Maxie", { voucher: true }))), "plans/U0QKEz8wXq3LmN7pR2sT9vYb-w165-maxie.md");
}

// ---- Every other fight has no plan file
{
  console.log("== no plan file");
  const admin = { ...trainer("Archer"), config: { hasVoucher: false, isBoss: true } };
  const cases = [
    ["W42 an ordinary trainer", scene(42, trainer("Youngster Joey"))],
    ["W35 the grunt", scene(35, trainer("Rocket Grunt"))],
    ["W66 the admin", scene(66, admin)],
    ["W10 a wild boss", scene(10, null)],
    ["W145 Daily, no rival there", scene(145, trainer("Ivy"), { mode: "daily" })],
    // The config Mysterious Challengers clones from a gym leader's (game-code.md §12).
    ["W120 encounter's gym leader", scene(120, { ...trainer("Clair"), config: { hasVoucher: false, isBoss: true } })],
  ];
  for (const [label, s] of cases) {
    row(label, s);
    assert.equal(planFile(s), null, label);
  }
}

// ---- The name is one file in `plans/` whatever the trainer is called and whatever the seed holds
{
  console.log("== safe names");
  const pair = scene(170, trainer("Gym Leader Duo Tate & Liza", { voucher: true }));
  const unnamed = scene(170, { getName() { throw new Error("no locale yet"); }, config: { hasVoucher: true } });
  const daily = scene(20, trainer("Brock", { voucher: true }), { mode: "daily", seed: "x9/Ab+Q==" });
  row("a pair", pair);
  row("a name that won't read", unnamed);
  row("a Daily's seed", daily);
  assert.equal(planFile(pair), "plans/U0QKEz8wXq3LmN7pR2sT9vYb-w170-gym-leader-duo-tate-liza.md");
  assert.equal(planFile(unnamed), "plans/U0QKEz8wXq3LmN7pR2sT9vYb-w170-trainer.md");
  assert.equal(planFile(daily), "plans/x9-Ab-Q-w20-brock.md");
}
