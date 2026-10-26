import type { SolveInput } from "../../src/solver/input.ts";
import type { Beam } from "../../src/solver/oracle-line.ts";
import { LDS } from "../../src/solver/search.ts";
import { DEFAULT_BUDGET } from "../../src/solver/solver.ts";

export type SearchFlags = { budget?: string; turns?: string; lds?: string; beams?: string };

export type SearchSettings = Pick<SolveInput, "budget" | "lds" | "portfolio">;

class Refused extends Error {}

function refuse(why: string): never {
  throw new Refused(why);
}

const number = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

const whole = (value: string) => {
  const n = number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

const count = (flag: string, value: string) => whole(value) ?? refuse(`--${flag} ${value} is not a count`);

const beams = (value: string): Beam[] =>
  value.split(",").map(beam => {
    const [width = "", ours = "", ...rest] = beam.split(":");
    const w = whole(width);
    const weight = number(ours);
    if (w === undefined || !(Number.isFinite(weight) && weight >= 0) || rest.length > 0) {
      refuse(`--beams ${value} is not a list of width:weight`);
    }
    return { width: w, ours: weight };
  });

export function searchSettings(flags: SearchFlags): { ok: true; settings: SearchSettings } | { ok: false; why: string } {
  try {
    const settings: SearchSettings = {
      budget: {
        expansions: flags.budget === undefined ? DEFAULT_BUDGET.expansions : count("budget", flags.budget),
        turns: flags.turns === undefined ? DEFAULT_BUDGET.turns : count("turns", flags.turns),
      },
    };
    if (flags.lds === "none") settings.lds = null;
    else if (flags.lds !== undefined) {
      settings.lds = { ...LDS, expansions: whole(flags.lds) ?? refuse(`--lds ${flags.lds} is not a count or none`) };
    }
    if (flags.beams !== undefined) settings.portfolio = beams(flags.beams);
    return { ok: true, settings };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, why: err.message };
    throw err;
  }
}
