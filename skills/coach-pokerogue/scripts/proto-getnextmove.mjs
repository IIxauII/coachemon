// PROTOTYPE for #158, throwaway: never merge. Does a sandboxed call to the game's own EnemyPokemon.getNextMove() at the
// command prompt return the move the enemy actually picks this turn?
//
// Injects the coach HUD bundle with a probe appended inside its IIFE, so the probe can use the HUD's own `sandbox`,
// `sandboxBreaches`, `awaitingDecision` and `enemyMoveDistribution`. Every 50 ms the probe:
//   1. at a command prompt it hasn't seen (wave:turn), runs the prototype's getNextMove() for every active foe in field
//      order inside ONE sandbox (so a second foe's call sees the first foe's draws, as EnemyCommandPhase would), with
//      each foe's summonData.moveQueue saved and restored, and records the battle-stream state before each call and
//      the HUD's distribution for comparison;
//   2. wraps each foe's getNextMove as an own property that records the real call's result and the stream state it
//      started from, then calls through unchanged;
//   3. once the turn has moved past EnemyCommandPhase, reads the real turnCommands (FIGHT move or POKEMON switch);
//   4. at the next prompt, reads the move the foe actually used from its move history.
//
// Usage (Chrome with --remote-debugging-port, like read.sh):
//   node proto-getnextmove.mjs inject   # (re)inject HUD + probe
//   node proto-getnextmove.mjs tally    # summary + every row
//   node proto-getnextmove.mjs stop
import { bundle } from "./hud-bundle.mjs";

const probe = String.raw`
// ---- PROTOTYPE #158 probe
{
  const prev = window.__protoNextMove;
  const P = { rows: prev?.rows ?? [], byKey: new Map((prev?.rows ?? []).map(r => [r.key, r])) };
  const moveName = (e, id) => { try { return e.getMoveset().find(m => m.moveId === id)?.getName() ?? (id === 165 ? "Struggle" : "#" + id); } catch { return "#" + id; } };
  const scene = () => { try { return Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game.scene.getScene("battle"); } catch { return null; } };
  const turnMove = (e, tm) => tm && { id: tm.move, name: moveName(e, tm.move), targets: [...(tm.targets ?? [])], useMode: tm.useMode };
  const protoNext = e => Object.getPrototypeOf(e).getNextMove;

  const wrap = (s, e) => {
    // A wrapper left by an earlier injection writes into that probe's rows: replace it.
    if (Object.prototype.hasOwnProperty.call(e, "getNextMove") && e.getNextMove.__probe === P) return;
    e.getNextMove = function () {
      const b = s.currentBattle;
      const key = b.waveIndex + ":" + b.turn;
      const seed = b.battleSeedState;
      const r = protoNext(this).call(this);
      const row = P.byKey.get(key);
      const slot = row?.foes.find(f => f.id === this.id);
      if (slot) { slot.actualPick = turnMove(this, r); slot.realSeed = seed; slot.seedMatch = seed === slot.predSeed; }
      else console.log("[proto158] real getNextMove with no prediction", key, this.name);
      return r;
    };
    e.getNextMove.__probe = P;
  };

  const predict = (s, b, key) => {
    const foes = s.getEnemyField().filter(e => e?.isActive?.(true));
    const breaches0 = sandboxBreaches;
    const seed0 = b.battleSeedState, rnd0 = Phaser.Math.RND.state();
    const row = { key, wave: b.waveIndex, turn: b.turn, double: !!b.double, trainer: !!b.trainer, boss: foes.some(e => e.isBoss?.()),
      foes: foes.map(e => ({ id: e.id, name: e.name, aiType: e.aiType, queue: e.getMoveQueue().map(q => moveName(e, q.move)),
        hudSwitch: (() => { try { const a = enemyAction(s, e); return a.kind === "switch" ? a.to?.name ?? true : false; } catch (err) { return String(err); } })(),
        hud: (() => { try { return enemyMoveDistribution(s, e).slice(0, 4).map(d => ({ name: d.name, p: +d.p.toFixed(3), targets: d.targets })); } catch (err) { return String(err); } })() })) };
    const saved = foes.map(e => [e, e.summonData.moveQueue, [...e.summonData.moveQueue]]);
    try {
      sandbox(s, () => foes.forEach((e, i) => {
        row.foes[i].predSeed = b.battleSeedState;
        try { row.foes[i].pred = turnMove(e, protoNext(e).call(e)); } catch (err) { row.foes[i].pred = { error: String(err) }; }
      }));
    } finally {
      for (const [e, arr, items] of saved) { arr.splice(0, arr.length, ...items); e.summonData.moveQueue = arr; }
    }
    // Same call again from the restored state: must agree (determinism) and leave the stream untouched.
    const again = sandbox(s, () => { try { return turnMove(foes[0], protoNext(foes[0]).call(foes[0])); } catch { return null; } });
    for (const [e, arr, items] of saved) { arr.splice(0, arr.length, ...items); e.summonData.moveQueue = arr; }
    row.repeatSame = JSON.stringify(again) === JSON.stringify(row.foes[0]?.pred);
    row.streamUntouched = b.battleSeedState === seed0 && Phaser.Math.RND.state() === rnd0;
    row.breaches = sandboxBreaches - breaches0;
    row.queuesRestored = saved.every(([e, arr, items]) => e.summonData.moveQueue === arr && arr.length === items.length);
    for (const e of foes) wrap(s, e);
    P.rows.push(row); P.byKey.set(key, row);
  };

  const poll = () => {
    const s = scene();
    const b = s?.currentBattle;
    if (!b || !s.phaseManager) return;
    const key = b.waveIndex + ":" + b.turn;
    const phase = s.phaseManager.getCurrentPhase?.()?.phaseName;
    // Earlier rows: what the foe actually used, read at a later prompt.
    for (const r of P.rows) if (r.key !== key && !r.usedRead && awaitingDecision(s) === "command") {
      r.usedRead = true;
      for (const f of r.foes) {
        const e = s.getEnemyParty().find(x => x.id === f.id);
        const h = e?.getMoveHistory?.() ?? [];
        f.lastUsed = h.length ? { ...turnMove(e, h[h.length - 1]), result: h[h.length - 1].result } : null;
        f.historyLen = h.length;
      }
    }
    const row = P.byKey.get(key);
    // The order moves actually run in: one entry per MovePhase object seen.
    const cur = s.phaseManager.getCurrentPhase?.();
    // MovePhase can start and end between polls; its MoveEffectPhase carries the animation, so either counts.
    if (row && (cur?.phaseName === "MovePhase" || cur?.phaseName === "MoveEffectPhase") && cur !== P.lastMovePhase) {
      P.lastMovePhase = cur;
      let user;
      try { user = cur.phaseName === "MovePhase" ? cur.pokemon : cur.getUserPokemon(); } catch {}
      const tag = user ? user.name + ":" + user.getBattlerIndex() : "?";
      row.moveOrder ??= [];
      if (row.moveOrder.at(-1) !== tag) row.moveOrder.push(tag);
    }
    if (awaitingDecision(s) === "command") {
      if (!row) try { predict(s, b, key); } catch (err) { console.log("[proto158] predict failed", err); }
      return;
    }
    if (row && !row.commandRead && b.turnCommands) {
      row.foes.forEach((f, i) => {
        const c = b.turnCommands[2 + i];
        if (c && !f.command) f.command = c.command === 0 ? { fight: turnMove(s.getEnemyParty().find(x => x.id === f.id), c.move), skip: !!c.skip } : { command: c.command, cursor: c.cursor };
      });
      if (row.foes.every(f => f.command)) { row.commandRead = true; row.phaseAtRead = phase; }
    }
  };
  const timer = setInterval(poll, 50);
  const same = (a, b) => !!a && !!b && a.id === b.id && JSON.stringify(a.targets) === JSON.stringify(b.targets);
  const current = () => { const s = scene(); const b = s.currentBattle; return { s, b, key: b.waveIndex + ":" + b.turn }; };
  window.__protoNextMove = {
    rows: P.rows,
    stop: () => clearInterval(timer),
    // Forget this turn's prediction so the next poll predicts again (after an injection).
    repredict: () => {
      const { key } = current();
      const row = P.byKey.get(key);
      if (row) { P.rows.splice(P.rows.indexOf(row), 1); P.byKey.delete(key); }
      return { key, dropped: !!row };
    },
    // INJECTION: foe i's queue becomes [a move it doesn't know (skipped: not virtual, no moveset entry), its
    // least-likely move per the HUD]. getNextMove must skip the first, splice it off and return the second.
    queue: (i = 0) => {
      const { s } = current();
      const e = s.getEnemyField().filter(x => x?.isActive?.(true))[i];
      const dist = enemyMoveDistribution(s, e);
      const known = new Set(e.getMoveset().map(m => m.moveId));
      const pick = e.getMoveset().find(m => m.moveId === dist[dist.length - 1]?.id) ?? e.getMoveset().at(-1);
      const unknown = [33, 1, 10, 45].find(id => !known.has(id));
      const target = e.getOpponents()[0].getBattlerIndex();
      e.summonData.moveQueue = [{ move: unknown, targets: [target], useMode: 1 }, { move: pick.moveId, targets: [target], useMode: 1 }];
      return { foe: e.name, queue: e.summonData.moveQueue.map(q => moveName(e, q.move)), hudLeast: dist.at(-1)?.name };
    },
    // INJECTION: foe i's effective Speed reads as our slot-0 mon's, so the two tie. Returns the tied value.
    tie: (i = 0) => {
      const { s } = current();
      const e = s.getEnemyField().filter(x => x?.isActive?.(true))[i];
      const me = s.getPlayerField().filter(x => x?.isActive?.(true))[0];
      if (!Object.prototype.hasOwnProperty.call(e, "getEffectiveStat")) {
        const orig = Object.getPrototypeOf(e).getEffectiveStat;
        e.getEffectiveStat = function (stat, ...rest) { return stat === 5 ? me.getEffectiveStat(5) : orig.call(this, stat, ...rest); };
      }
      return { foe: e.name, me: me.name, spd: [me.getEffectiveStat(5), e.getEffectiveStat(5)] };
    },
    // The game's own sortInSpeedOrder (found by name among the loaded chunks) over the mons that will move, in
    // TurnStartPhase's command order; stored on this turn's row as speedPred.
    speedOrder: async () => {
      if (!P.sortInSpeedOrder) {
        const urls = [...new Set(performance.getEntriesByType("resource").filter(x => x.name.startsWith(location.origin) && /\/assets\/[\w.-]+-[\w-]{8}\.js$/.test(x.name)).map(x => x.name))];
        for (const u of urls) {
          try { const ns = await import(u); for (const k of Object.keys(ns)) { try { if (typeof ns[k] === "function" && ns[k].name === "sortInSpeedOrder") P.sortInSpeedOrder = ns[k]; } catch {} } } catch {}
        }
      }
      if (!P.sortInSpeedOrder) return { error: "sortInSpeedOrder not found" };
      const { s, key } = current();
      const mons = [...s.getPlayerField(), ...s.getEnemyField()].filter(x => x?.isActive?.(true));
      const order = sandbox(s, () => P.sortInSpeedOrder(mons)).map(p => p.name + ":" + p.getBattlerIndex());
      const row = P.byKey.get(key);
      if (row) row.speedPred = order;
      return { key, order, spd: mons.map(p => p.name + " " + p.getEffectiveStat(5)) };
    },
    tally: () => {
      const foes = P.rows.flatMap(r => r.foes.map(f => ({ r, f })));
      const judged = foes.filter(({ f }) => f.command);
      const fights = judged.filter(({ f }) => f.command.fight);
      return {
        rows: P.rows.length, foesJudged: judged.length, switchedInstead: judged.length - fights.length,
        singles: { fights: fights.filter(x => !x.r.double).length, hits: fights.filter(x => !x.r.double && same(x.f.pred, x.f.command.fight)).length },
        doubles: { fights: fights.filter(x => x.r.double).length, hits: fights.filter(x => x.r.double && same(x.f.pred, x.f.command.fight)).length },
        seedMismatches: foes.filter(({ f }) => f.seedMatch === false).length,
        breaches: P.rows.reduce((t, r) => t + r.breaches, 0), repeatDiffers: P.rows.filter(r => !r.repeatSame).length,
        streamTouched: P.rows.filter(r => !r.streamUntouched).length, hudBreachesTotal: sandboxBreaches,
        switchCalls: judged.filter(({ f }) => f.hudSwitch !== undefined).map(({ r, f }) => ({ key: r.key, foe: f.name, hud: f.hudSwitch, switched: !f.command.fight })).filter(x => x.hud || x.switched),
        misses: fights.filter(x => !same(x.f.pred, x.f.command.fight)).map(x => ({ key: x.r.key, double: x.r.double, foe: x.f.name, pred: x.f.pred, actual: x.f.command.fight, seedMatch: x.f.seedMatch })),
      };
    },
  };
  console.log("[proto158] probe on");
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
  const src = bundle("hud").replace(/\}\)\(\);\s*$/, probe + "\n})();\n");
  // Script tag, as read.sh does, so it runs in the page world.
  const wrapper = "(() => { window.__protoNextMove?.stop(); const e = document.createElement('script'); e.textContent = " + JSON.stringify(src) + "; document.documentElement.appendChild(e); e.remove(); return document.documentElement.dataset.mcpOut; })()";
  console.log(await evaluate(wrapper));
} else if (cmd === "tally") {
  console.log(JSON.stringify(await evaluate("JSON.stringify({ tally: window.__protoNextMove?.tally(), rows: window.__protoNextMove?.rows })"), null, 0));
} else if (["repredict", "queue", "tie", "speedOrder"].includes(cmd)) {
  // INJECTION helpers: node proto-getnextmove.mjs queue [foeIndex] | tie [foeIndex] | speedOrder | repredict
  const arg = process.argv[3] ?? "";
  console.log(JSON.stringify(await evaluate("(async () => JSON.stringify(await window.__protoNextMove." + cmd + "(" + arg + ")))()")));
} else if (cmd === "press" || cmd === "look") {
  // Drive the game without the MCP server: node proto-getnextmove.mjs press UP|DOWN|LEFT|RIGHT|ACTION|CANCEL [...]
  const B = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, SUBMIT: 4, ACTION: 5, CANCEL: 6 };
  const buttons = cmd === "press" ? process.argv.slice(3).map(b => B[b]) : [];
  const look = `(async () => {
    const s = Phaser.Display.Canvas.CanvasPool.pool.map(p => p.parent).find(p => p && p.game).game.scene.getScene("battle");
    for (const b of ${JSON.stringify(buttons)}) { s.ui.processInput(b); await new Promise(r => setTimeout(r, 350)); }
    await new Promise(r => setTimeout(r, ${buttons.length ? 1500 : 0}));
    const h = s.ui.getHandler();
    const b = s.currentBattle;
    const mon = p => p && (p.name + " " + p.hp + "/" + p.getMaxHp() + (p.isActive(true) ? "" : " (out)"));
    return JSON.stringify({ wave: b?.waveIndex, turn: b?.turn, phase: s.phaseManager.getCurrentPhase()?.phaseName, mode: s.ui.getMode(),
      handler: h?.constructor?.name, cursor: h?.cursor ?? h?.getCursor?.(), fieldIndex: h?.fieldIndex,
      text: s.ui.getMessageHandler?.()?.message?.text,
      player: s.getPlayerField().map(mon), enemy: s.getEnemyField().map(mon) });
  })()`;
  console.log(await evaluate(look));
} else if (cmd === "stop") {
  console.log(await evaluate("window.__protoNextMove?.stop(); window.__coachHud?.stop(); 'stopped'"));
}
