import type { SpeciesId } from "../../enums/generated.ts";
import type { MonState, OracleLine, Step } from "../../solver/solver.ts";

export const GORDIE_SEED = "U0QKEz8wXq3LmN7pR2sT9vYb";

type Species = keyof typeof SpeciesId;

const OURS = { GYARADOS: 570, PROBOPASS: 427, SNORLAX: 824, RESHIRAM: 577, LEAVANNY: 497, GOLBAT: 493 } as const satisfies Partial<Record<Species, number>>;
const FOES = { GIGALITH: 525, CARRACOSTA: 467, COALOSSAL: 711, STONJOURNER: 574, BARBARACLE: 480, TYRANITAR: 569 } as const satisfies Partial<Record<Species, number>>;

type Hp<S extends Species> = { [K in S]: number | [hp: number, over: Partial<MonState>] };

const side = <S extends Species>(max: Record<S, number>, hp: Hp<S>, onField: S): MonState[] =>
  (Object.keys(max) as S[]).map((species, slot) => {
    const [now, over] = typeof hp[species] === "number" ? [hp[species] as number, {}] : (hp[species] as [number, Partial<MonState>]);
    return { slot, species, onField: species === onField, hp: now, maxHp: max[species], status: "NONE", statStages: [0, 0, 0, 0, 0, 0, 0], tera: false, ...over };
  });

const step = (turn: number, input: Step["input"], ours: Hp<keyof typeof OURS>, ourField: keyof typeof OURS, foes: Hp<keyof typeof FOES>, foeField: keyof typeof FOES): Step =>
  ({ turn, input, checkpoint: { ours: side(OURS, ours, ourField), foes: side(FOES, foes, foeField) } });

const healthy = { GYARADOS: 570, PROBOPASS: 359, SNORLAX: 824, RESHIRAM: 577, GOLBAT: 493 };
const left = { GIGALITH: 0, STONJOURNER: 0, CARRACOSTA: 121, COALOSSAL: 238 };

/** Gordie's W180 from T11 to the win, as the boss-plan prototype has it (#639): a re-solve from where the game stood. */
export const GORDIE_LINE: OracleLine = {
  seed: GORDIE_SEED,
  wave: 180,
  gameVersion: "1.12.0.11",
  steps: [
    step(11, { kind: "switch", to: { slot: 4, species: "LEAVANNY" } }, { ...healthy, LEAVANNY: 280 }, "LEAVANNY", { ...left, BARBARACLE: 480, TYRANITAR: 569 }, "BARBARACLE"),
    step(12, { kind: "move", move: "LEAF_STORM", tera: false }, { ...healthy, LEAVANNY: [249, { statStages: [0, 0, -2, 0, 0, 0, 0] }] }, "LEAVANNY",
      { ...left, BARBARACLE: 0, TYRANITAR: 569 }, "TYRANITAR"),
    step(13, { kind: "move", move: "BUG_BITE", tera: false, replacement: { slot: 5, species: "GOLBAT" } }, { ...healthy, LEAVANNY: 0 }, "GOLBAT",
      { ...left, BARBARACLE: 0, TYRANITAR: 512 }, "TYRANITAR"),
    step(14, { kind: "move", move: "TOXIC", tera: false }, { ...healthy, GOLBAT: 463, LEAVANNY: 0 }, "GOLBAT",
      { ...left, BARBARACLE: 0, TYRANITAR: [477, { status: "TOXIC" }] }, "TYRANITAR"),
    step(15, { kind: "move", move: "VENOSHOCK", tera: false, replacement: { slot: 0, species: "GYARADOS" } }, { ...healthy, GOLBAT: 0, LEAVANNY: 0 }, "GYARADOS",
      { ...left, BARBARACLE: 0, TYRANITAR: [339, { status: "TOXIC", statStages: [-1, 0, 0, 0, 0, 0, 0] }] }, "TYRANITAR"),
    step(16, { kind: "move", move: "HYDRO_PUMP", tera: true }, { ...healthy, GYARADOS: [351, { tera: true }], GOLBAT: 0, LEAVANNY: 0 }, "GYARADOS",
      { ...left, BARBARACLE: 0, TYRANITAR: [109, { status: "TOXIC", statStages: [-1, 0, 0, 0, 0, 0, 0] }] }, "TYRANITAR"),
    step(17, { kind: "move", move: "HYDRO_PUMP", tera: false }, { ...healthy, GYARADOS: [316, { tera: true }], GOLBAT: 0, LEAVANNY: 0 }, "GYARADOS",
      { ...left, BARBARACLE: 0, TYRANITAR: 0 }, "CARRACOSTA"),
    step(18, { kind: "move", move: "HYDRO_PUMP", tera: false }, { ...healthy, GYARADOS: [423, { tera: true }], GOLBAT: 0, LEAVANNY: 0 }, "GYARADOS",
      { ...left, CARRACOSTA: 0, BARBARACLE: 0, TYRANITAR: 0 }, "COALOSSAL"),
    step(19, { kind: "move", move: "HYDRO_PUMP", tera: false }, { ...healthy, GYARADOS: [423, { tera: true }], GOLBAT: 0, LEAVANNY: 0 }, "GYARADOS",
      { ...left, CARRACOSTA: 0, COALOSSAL: 0, BARBARACLE: 0, TYRANITAR: 0 }, "COALOSSAL"),
  ],
  receipt: [
    { step: "versions", checked: "the save's 1.12.0.11 is the clone's" },
    { step: "known_turn", checked: "T11's Razor Shell replayed to 280" },
  ],
  luck: [{ turn: 14, what: "Stone Edge misses" }],
};
