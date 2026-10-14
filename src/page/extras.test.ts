import assert from "node:assert/strict";
import { test } from "node:test";
import { onPage, send } from "./fake-page.ts";

type Tag = { tagType: string; serializable: boolean };
type SummonInit = { statStages: number[]; tags: Tag[]; abilitiesApplied: Set<number> };

/** The save's copy of a mon's summon data: it drops a tag a load cannot rebuild, and `toJSON` writes the Set as an array (game-code.md §28). */
class SummonData {
  statStages: number[];
  tags: Tag[];
  abilitiesApplied: Set<number>;
  constructor(src: SummonInit) {
    this.statStages = [...src.statStages];
    this.tags = src.tags.filter(t => t.serializable);
    this.abilitiesApplied = new Set(src.abilitiesApplied);
  }
  toJSON() {
    return { statStages: this.statStages, tags: this.tags.map(t => ({ tagType: t.tagType })), abilitiesApplied: [...this.abilitiesApplied] };
  }
}

/** A live mon: a Phaser container is circular, so nothing may serialize one whole. */
function mon(fields: Record<string, unknown>) {
  const m: Record<string, unknown> = { status: null, tempSummonData: { turnCount: 1, waveTurnCount: 1 }, waveData: { endured: false, abilityRevealed: false, abilitiesApplied: new Set() }, isOnField: () => false, ...fields };
  m.parentContainer = m;
  return m;
}

/** Gordie's W180 at T5's command: Coalossal Tera'd into the lead from team slot 5, Probopass fainted on T3, Carracosta waits on its second bar. */
function gordieT5() {
  const coalossal = mon({
    id: 77, initialTeamIndex: 5, bossSegmentIndex: undefined, status: { effect: 5, toxicTurnCount: 3 },
    tempSummonData: { turnCount: 2, waveTurnCount: 4 }, waveData: { endured: false, abilityRevealed: true, abilitiesApplied: new Set([70]) },
    summonData: new SummonData({ statStages: [1, 0, 0, 0, 0, 0, 0], tags: [{ tagType: "CONFUSED", serializable: true }, { tagType: "FLINCHED", serializable: false }], abilitiesApplied: new Set([70]) }),
    isOnField: () => true,
  });
  const probopass = mon({ id: 79, initialTeamIndex: 0, bossSegmentIndex: undefined });
  const carracosta = mon({ id: 78, initialTeamIndex: 3, bossSegmentIndex: 1 });
  const leavanny = mon({ id: 12, tempSummonData: { turnCount: 3, waveTurnCount: 5 }, waveData: { endured: true, abilityRevealed: false, abilitiesApplied: new Set() } });
  const currentBattle = {
    waveIndex: 180, battleSeed: "s33d", turn: 5, battleSeedState: null, enemySwitchCounter: 1, lastMove: 450, enemyFaints: 1,
    playerFaintsHistory: [], enemyFaintsHistory: [{ pokemon: probopass, turn: 3 }], enemyParty: [coalossal, probopass, carracosta],
  };
  return { ui: { mode: 0, handlers: {} }, currentBattle, getPlayerParty: () => [leavanny] };
}

const RND = { Math: { RND: { state: () => "!rnd,1,0.25,0.5,0.75" } } };

const WAVE = (abilitiesApplied: number[], endured = false, abilityRevealed = false) => ({ endured, abilityRevealed, abilitiesApplied });

test("a mid-fight read carries every extra the save lacks, whole across the relay (#676)", t => {
  onPage(t, gordieT5(), {}, RND);
  const r = send("extras", {});
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r, "nothing in it is lost to the relay's JSON");
  assert.deepEqual(r, {
    ok: true, wave: 180, battleSeed: "s33d", turn: 5, rnd: "!rnd,1,0.25,0.5,0.75", battleSeedState: null,
    enemySwitchCounter: 1, lastMove: 450, enemyFaints: 1, playerFaintsHistory: [], enemyFaintsHistory: [{ id: 79, turn: 3 }],
    foes: [
      {
        id: 77, initialTeamIndex: 5, bossSegmentIndex: null, toxicTurnCount: 3, tempSummonData: { turnCount: 2, waveTurnCount: 4 },
        waveData: WAVE([70], false, true), onField: true,
        summonData: { statStages: [1, 0, 0, 0, 0, 0, 0], tags: [{ tagType: "CONFUSED" }], abilitiesApplied: [70] },
      },
      { id: 79, initialTeamIndex: 0, bossSegmentIndex: null, toxicTurnCount: null, tempSummonData: { turnCount: 1, waveTurnCount: 1 }, waveData: WAVE([]), onField: false, summonData: null },
      { id: 78, initialTeamIndex: 3, bossSegmentIndex: 1, toxicTurnCount: null, tempSummonData: { turnCount: 1, waveTurnCount: 1 }, waveData: WAVE([]), onField: false, summonData: null },
    ],
    party: [{ id: 12, toxicTurnCount: null, tempSummonData: { turnCount: 3, waveTurnCount: 5 }, waveData: WAVE([], true) }],
    unread: [],
  });
});

test("a field the page cannot read is null and named in unread, and the rest still reads (#676)", t => {
  const scene = gordieT5();
  const [coalossal] = scene.currentBattle.enemyParty;
  coalossal.summonData = { constructor: function () { throw new Error("no copy"); } };
  scene.currentBattle.enemyFaintsHistory = [{ pokemon: null, turn: 3 }] as never;
  onPage(t, scene);
  const r = send("extras", {});
  assert.deepEqual(r.unread, ["rnd", "enemyFaintsHistory", "foes.0.summonData"]);
  assert.equal(r.rnd, null);
  assert.equal(r.enemyFaintsHistory, null);
  assert.equal(r.foes[0].summonData, null);
  assert.equal(r.foes[0].initialTeamIndex, 5);
  assert.equal(r.turn, 5);
});

test("off a battle the read refuses no-battle rather than answering a set of nulls (#676)", t => {
  onPage(t, { ui: { mode: 0, handlers: {} }, currentBattle: null });
  assert.deepEqual(send("extras", {}), { ok: false, why: "no-battle" });
});
