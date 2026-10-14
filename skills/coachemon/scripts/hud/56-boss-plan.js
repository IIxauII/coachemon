// Names a boss fight's plan file (CONTEXT.md, `Boss-fight plan`). The name is the fight's key: a later session finds
// the plan by it, so any read of the same fight has to give the same name.
import { isRivalWave } from "./03-calendar.js";

const tryDo = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };

// The voucher, not `config.isBoss`: the boss flag also takes in the evil-team admins and the Trainer's Test, and
// leaves out the first three rivals (game-code.md §12).
const isBossFight = s => {
  const b = s?.currentBattle;
  if (!b?.trainer) return false;
  return !!b.trainer.config?.hasVoucher || isRivalWave(s, b.waveIndex);
};

const dashed = (text, keep) => String(text ?? "").replace(keep, "-").replace(/^-+|-+$/g, "");

// Relative to the coachemon home directory. The seed keeps its case, since two seeds can differ only there, and a
// Daily's can hold `/` (game-code.md §11).
// @only probe, tests: planFile
export const planFile = s => {
  if (!isBossFight(s)) return null;
  const b = s.currentBattle;
  const name = dashed(tryDo(() => b.trainer.getName(), "").toLowerCase(), /[^\p{L}\p{N}]+/gu) || "trainer";
  return `plans/${dashed(s.seed, /[^A-Za-z0-9]+/g)}-w${b.waveIndex}-${name}.md`;
};
