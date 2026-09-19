// PROTOTYPE for #246, throwaway: never merge. Is a trainer's switch decision exactly predictable at the command
// prompt, the way a sandboxed getNextMove() is (#158)?
//
// Injects the coach HUD bundle in expose mode (`__hud["NN-name"]`), with a probe appended inside its IIFE, so the
// probe can use the HUD's own `sandbox`, `sandboxBreachCount`, `awaitingDecision` (01-core) and `readTurn` (25-turn). Every 50 ms the probe:
//   1. at a command prompt it hasn't seen (wave:turn), replays EnemyCommandPhase's switch rule for every active foe
//      in field order inside ONE sandbox, calling the game's own `getPartyMemberMatchupScores`,
//      `getSortedPartyMemberMatchupScores`, `getMatchupScore`, `isTrapped` and `getNextSummonIndex`, and records every
//      piece of the inequality (own avg, best bench score, counter, mult, threshold, margin) plus the HUD's own
//      verdict, read through `readTurn(s, t => t.switches())` — the same call the card renders from;
//   2. replays it a second time from the restored state (determinism) and checks the battle stream and the global
//      Phaser RND state are both untouched — the switch check should draw neither (the tie-break is a seed fork);
//   3. wraps the trainer's `getPartyMemberMatchupScores` to record the scores and counter the GAME saw at its own
//      decision time, so a prompt-time/decision-time state drift shows up as a score diff;
//   4. once the commands are written, reads the real `turnCommands[2+i]`: `command === Command.POKEMON` (2) with
//      `cursor` = the party index sent in, or a FIGHT command, and the counter after.
//
// Usage (Chrome with --remote-debugging-port, like read.sh):
//   node proto-switch.mjs inject    # (re)inject HUD + probe
//   node proto-switch.mjs tally     # summary + misses
//   node proto-switch.mjs rows      # every row, raw
//   node proto-switch.mjs margin    # this turn's inequality, per foe, without mutating anything
//   node proto-switch.mjs weaken 0 0.15   # INJECTION: foe 0's HP to 15 % of max, to push it under the switch bar
//   node proto-switch.mjs counter 3       # INJECTION: set battle.enemySwitchCounter (the switch-spam brake)
//   node proto-switch.mjs repredict       # forget this turn's prediction (after an injection)
//   node proto-switch.mjs press ACTION    # drive the tab without the MCP server
//   node proto-switch.mjs stop
import { bundle } from "./hud-bundle.mjs";

const probe = String.raw`
// ---- PROTOTYPE #246 probe
{
  const H = globalThis.__hud;
  const { sandbox, sandboxBreachCount, awaitingDecision } = H["01-core"];
  const { readTurn } = H["25-turn"];
  const prev = window.__protoSwitch;
  const P = { rows: prev?.rows ?? [], byKey: new Map((prev?.rows ?? []).map(r => [r.key, r])) };
  const scene = () => { try { return Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game.scene.getScene("battle"); } catch { return null; } };
  const current = () => { const s = scene(); const b = s.currentBattle; return { s, b, key: b.waveIndex + ":" + b.turn }; };
  const activeFoes = s => s.getEnemyField().filter(e => e?.isActive?.(true));
  const named = p => p && { id: p.id, name: p.name, hp: p.hp, max: p.getMaxHp() };
  const moveName = (e, id) => { try { return e.getMoveset().find(m => m.moveId === id)?.getName() ?? "#" + id; } catch { return "#" + id; } };

  // EnemyCommandPhase.start's switch rule (§7), calling the game's own pieces. Field order, one shared counter.
  const replay = (s, b) => {
    const tr = b.trainer;
    const foes = [...activeFoes(s)].sort((x, y) => (x.getFieldIndex?.() ?? 0) - (y.getFieldIndex?.() ?? 0));
    const party = s.getEnemyParty();
    let counter = b.enemySwitchCounter ?? 0;
    return foes.map(e => {
      const out = { id: e.id, name: e.name, fieldIndex: e.getFieldIndex?.(), trainerSlot: e.trainerSlot, counterIn: counter };
      try {
        out.queue = e.getMoveQueue().map(q => moveName(e, q.move));
        out.trapped = !!e.isTrapped();
        if (!tr) { out.reason = "wild"; }
        else if (out.queue.length) { out.reason = "move queue"; }
        else if (out.trapped) { out.reason = "trapped"; }
        else {
          const scores = tr.getPartyMemberMatchupScores(e.trainerSlot, true);
          out.scores = scores.map(([i, v]) => [i, +v.toFixed(6), party[i]?.name]);
          if (!scores.length) { out.reason = "empty bench"; }
          else {
            const own = e.getOpponents().map(o => e.getMatchupScore(o));
            out.own = own.map(v => +v.toFixed(6));
            const avg = own.reduce((t, x) => t + x, 0) / own.length;
            const sorted = tr.getSortedPartyMemberMatchupScores(scores);
            const best = sorted[0][1];
            const mult = 1 - (counter ? 0.1 ** (1 / counter) : 0);
            const bar = avg * (tr.config.isBoss ? 2 : 3);
            out.avg = +avg.toFixed(6); out.best = +best.toFixed(6); out.mult = +mult.toFixed(6);
            out.isBoss = !!tr.config.isBoss; out.bar = +bar.toFixed(6);
            out.lhs = +(best * mult).toFixed(6); out.margin = +(best * mult - bar).toFixed(6);
            out.willSwitch = best * mult >= bar;
            // A tie among the top scores sends getNextSummonIndex through executeWithSeedOffset(turn << 2).
            out.topTie = scores.filter(pms => pms[1] === best).length;
            if (out.willSwitch) {
              const idx = tr.getNextSummonIndex(e.trainerSlot, scores);
              out.toIndex = idx; out.to = named(party[idx]);
            }
          }
        }
      } catch (err) { out.error = String(err); }
      counter = out.willSwitch ? counter + 1 : Math.max(counter - 1, 0);
      out.counterOut = counter;
      return out;
    });
  };

  // The scores the GAME computed at its own decision time, for the same turn.
  const wrapTrainer = (s, b) => {
    const tr = b.trainer;
    if (!tr || (Object.prototype.hasOwnProperty.call(tr, "getPartyMemberMatchupScores") && tr.getPartyMemberMatchupScores.__probe === P)) return;
    const orig = Object.getPrototypeOf(tr).getPartyMemberMatchupScores;
    tr.getPartyMemberMatchupScores = function (slot, forSwitch) {
      const r = orig.call(this, slot, forSwitch);
      try {
        const bb = s.currentBattle;
        const row = P.byKey.get(bb.waveIndex + ":" + bb.turn);
        if (row && forSwitch) (row.gameCalls ??= []).push({ slot, counter: bb.enemySwitchCounter ?? 0,
          phase: s.phaseManager.getCurrentPhase?.()?.phaseName,
          scores: r.map(([i, v]) => [i, +v.toFixed(6)]) });
      } catch {}
      return r;
    };
    tr.getPartyMemberMatchupScores.__probe = P;
  };

  const predict = (s, b, key) => {
    const breaches0 = sandboxBreachCount();
    const seed0 = b.battleSeedState, rnd0 = Phaser.Math.RND.state();
    const row = { key, wave: b.waveIndex, turn: b.turn, double: !!b.double, trainer: !!b.trainer,
      trainerName: b.trainer?.getName?.() ?? null, isBoss: !!b.trainer?.config?.isBoss,
      counterAtPrompt: b.enemySwitchCounter ?? 0,
      bench: s.getEnemyParty().slice(b.getBattlerCount()).map(p => ({ ...named(p), legal: !!p.isAllowedInBattle?.() })),
      mine: s.getPlayerField().filter(p => p?.isActive?.(true)).map(named) };
    row.foes = sandbox(s, () => replay(s, b));
    const again = sandbox(s, () => replay(s, b));
    row.repeatSame = JSON.stringify(again) === JSON.stringify(row.foes);
    row.streamUntouched = b.battleSeedState === seed0 && Phaser.Math.RND.state() === rnd0;
    row.breaches = sandboxBreachCount() - breaches0;
    // The HUD's own verdict, through the call the card renders from (its own sandbox, its own turn key).
    try {
      row.hud = readTurn(s, t => t.activeFoes().map(e => {
        const v = t.switches().get(e);
        return { name: e.name, to: v?.to?.name ?? null, sure: (v?.ratio ?? 0) >= 1 };
      }));
    } catch (err) { row.hud = String(err); }
    wrapTrainer(s, b);
    P.rows.push(row); P.byKey.set(key, row);
  };

  const poll = () => {
    const s = scene();
    const b = s?.currentBattle;
    if (!b || !s.phaseManager) return;
    const key = b.waveIndex + ":" + b.turn;
    const row = P.byKey.get(key);
    if (awaitingDecision(s) === "command") {
      if (!row) try { predict(s, b, key); } catch (err) { console.log("[proto246] predict failed", err); }
      return;
    }
    if (row && !row.commandRead && b.turnCommands) {
      const party = s.getEnemyParty();
      row.actual = row.foes.map((f, i) => {
        const c = b.turnCommands[2 + i];
        if (!c) return null;
        return c.command === 2
          ? { switched: true, toIndex: c.cursor, to: named(party[c.cursor]), skip: !!c.skip }
          : { switched: false, command: c.command, move: c.move ? moveName(party.find(x => x.id === f.id) ?? party[0], c.move.move) : null, skip: !!c.skip };
      });
      if (row.actual.every(a => a)) {
        row.commandRead = true;
        row.counterAfter = b.enemySwitchCounter ?? 0;
        row.phaseAtRead = s.phaseManager.getCurrentPhase?.()?.phaseName;
      }
    }
  };
  const timer = setInterval(poll, 50);

  window.__protoSwitch = {
    rows: P.rows,
    stop: () => clearInterval(timer),
    // This turn's inequality per foe, computed fresh, nothing mutated.
    margin: () => { const { s, b, key } = current(); return { key, trainer: b.trainer?.getName?.() ?? null, counter: b.enemySwitchCounter ?? 0, foes: sandbox(s, () => replay(s, b)) }; },
    repredict: () => {
      const { key } = current();
      const r = P.byKey.get(key);
      if (r) { P.rows.splice(P.rows.indexOf(r), 1); P.byKey.delete(key); }
      return { key, dropped: !!r };
    },
    // INJECTION: foe i HP to the given ratio of max, so its own matchup score drops under the switch bar. Both the
    // prediction and the game's own decision see the same state, so the comparison stays honest.
    weaken: (i = 0, ratio = 0.15) => {
      const { s, b } = current();
      const e = activeFoes(s)[i];
      e.hp = Math.max(1, Math.floor(e.getMaxHp() * ratio));
      return { foe: e.name, hp: e.hp, max: e.getMaxHp(), margin: sandbox(s, () => replay(s, b)) };
    },
    // INJECTION: the switch-spam brake. 0 = no brake (mult 1); n > 0 scales the best bench score by 1 − 0.1^(1/n).
    counter: n => { const { b, s } = current(); b.enemySwitchCounter = n; return { counter: b.enemySwitchCounter, margin: sandbox(s, () => replay(s, b)) }; },
    tally: () => {
      const judged = P.rows.filter(r => r.commandRead).flatMap(r => r.foes.map((f, i) => ({ r, f, a: r.actual[i] })).filter(x => x.a));
      const trainerTurns = judged.filter(x => x.r.trainer);
      const hit = x => !!x.f.willSwitch === !!x.a.switched && (!x.a.switched || x.f.toIndex === x.a.toIndex);
      return {
        rows: P.rows.length, judged: judged.length,
        trainerFoeTurns: trainerTurns.length,
        predictedSwitches: trainerTurns.filter(x => x.f.willSwitch).length,
        actualSwitches: trainerTurns.filter(x => x.a.switched).length,
        exact: trainerTurns.filter(hit).length,
        singles: { n: trainerTurns.filter(x => !x.r.double).length, hits: trainerTurns.filter(x => !x.r.double && hit(x)).length },
        doubles: { n: trainerTurns.filter(x => x.r.double).length, hits: trainerTurns.filter(x => x.r.double && hit(x)).length },
        ties: trainerTurns.filter(x => (x.f.topTie ?? 0) > 1).length,
        tiesExact: trainerTurns.filter(x => (x.f.topTie ?? 0) > 1 && hit(x)).length,
        // The margin band the tally actually covered: |margin| small means the bar was genuinely tested.
        marginsSeen: trainerTurns.map(x => x.f.margin).filter(v => typeof v === "number").sort((a, c) => a - c),
        repeatDiffers: P.rows.filter(r => !r.repeatSame).length,
        streamTouched: P.rows.filter(r => !r.streamUntouched).length,
        breaches: P.rows.reduce((t, r) => t + (r.breaches ?? 0), 0), hudBreachesTotal: sandboxBreachCount(),
        // A prompt-time score that differs from the score the game computed at its own decision time.
        scoreDrift: P.rows.filter(r => r.gameCalls?.length).map(r => ({ key: r.key,
          prompt: r.foes.map(f => f.scores?.map(x => x[1])), game: r.gameCalls.map(g => g.scores.map(x => x[1])),
          counters: [r.counterAtPrompt, ...r.gameCalls.map(g => g.counter)] }))
          .filter(d => JSON.stringify(d.prompt.filter(Boolean)) !== JSON.stringify(d.game)),
        hudDisagrees: P.rows.filter(r => r.commandRead && Array.isArray(r.hud)).flatMap(r => r.hud.map((h, i) => ({ key: r.key, foe: h.name, hud: h.to, replay: r.foes[i]?.to?.name ?? null, actual: r.actual[i]?.to?.name ?? null }))).filter(x => x.hud !== x.replay || x.hud !== x.actual),
        misses: trainerTurns.filter(x => !hit(x)).map(x => ({ key: x.r.key, foe: x.f.name, double: x.r.double,
          pred: x.f.willSwitch ? "switch → " + x.f.to?.name : "move (" + x.f.reason + " " + x.f.margin + ")",
          actual: x.a.switched ? "switch → " + x.a.to?.name : "move " + x.a.move,
          pieces: { avg: x.f.avg, best: x.f.best, mult: x.f.mult, bar: x.f.bar, counterIn: x.f.counterIn, topTie: x.f.topTie } })),
      };
    },
  };
  console.log("[proto246] probe on");
}
`;

const port = process.env.POKEROGUE_MCP_PORT ?? 9222;
const evaluate = async expression => {
  const tabs = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
  const t = tabs.find(x => x.url.includes("pokerogue.net"));
  if (!t) throw new Error("no pokerogue.net tab on debug port");
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
  const out = await new Promise(r => (ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) r(d); }));
  ws.close();
  return out.result?.result?.value ?? out;
};

const cmd = process.argv[2] ?? "tally";
if (cmd === "inject") {
  const src = bundle("hud", { expose: true }).replace(/\}\)\(\);\s*$/, probe + "\n})();\n");
  const wrapper = "(() => { window.__protoSwitch?.stop(); const e = document.createElement('script'); e.textContent = " + JSON.stringify(src) + "; document.documentElement.appendChild(e); e.remove(); return document.documentElement.dataset.mcpOut; })()";
  console.log(await evaluate(wrapper));
} else if (cmd === "tally") {
  console.log(await evaluate("JSON.stringify(window.__protoSwitch?.tally())"));
} else if (cmd === "rows") {
  console.log(await evaluate("JSON.stringify(window.__protoSwitch?.rows)"));
} else if (["margin", "repredict", "weaken", "counter"].includes(cmd)) {
  const args = process.argv.slice(3).join(",");
  console.log(await evaluate("JSON.stringify(window.__protoSwitch." + cmd + "(" + args + "))"));
} else if (cmd === "press" || cmd === "look") {
  const B = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, SUBMIT: 4, ACTION: 5, CANCEL: 6 };
  const buttons = cmd === "press" ? process.argv.slice(3).map(b => B[b]) : [];
  const look = `(async () => {
    const s = Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game.scene.getScene("battle");
    for (const b of ${JSON.stringify(buttons)}) { s.ui.processInput(b); await new Promise(r => setTimeout(r, 350)); }
    await new Promise(r => setTimeout(r, ${buttons.length ? 1500 : 0}));
    const h = s.ui.getHandler();
    const b = s.currentBattle;
    const mon = p => p && (p.name + " " + p.hp + "/" + p.getMaxHp() + (p.isActive(true) ? "" : " (out)"));
    return JSON.stringify({ wave: b?.waveIndex, turn: b?.turn, trainer: b?.trainer?.getName?.(), counter: b?.enemySwitchCounter,
      phase: s.phaseManager.getCurrentPhase()?.phaseName, mode: s.ui.getMode(), handler: h?.constructor?.name,
      cursor: h?.cursor ?? h?.getCursor?.(), text: s.ui.getMessageHandler?.()?.message?.text,
      player: s.getPlayerField().map(mon), enemy: s.getEnemyField().map(mon) });
  })()`;
  console.log(await evaluate(look));
} else if (cmd === "stop") {
  console.log(await evaluate("window.__protoSwitch?.stop(); window.__coachHud?.stop(); 'stopped'"));
}
