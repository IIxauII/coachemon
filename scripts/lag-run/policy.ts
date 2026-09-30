/**
 * Autoplay's policy: act on the card's `act` group where it names a switch, a learn or a shop pick, and fall back to
 * the strongest move and the first reward where it does not. It serves the lag run, not play (#484).
 */
import { normalizeLabel } from "../../src/labels.ts";

export type Opt = { i: number | string; label: string | null; [k: string]: unknown };
export type Menu = { screen: string; wave: number | null; options: Opt[]; text?: string | null; extra?: Record<string, unknown> };
export type Group = { id: string; label: string; summary: string | null; rows: string[] };
export type Card = { kind: string | null; card_wave: number | null; groups: Group[] | null } | null;
export type Action = {
  tool: "select_option" | "press";
  args: Record<string, unknown>;
  by: "card" | "rule";
  /** The commit step of a moment the lag run is after (`moments.ts`). */
  intent?: "switch" | "replace" | "learn" | "shop";
};

/** What a decision leaves for the screens that finish it: the move after Fight, the mon after a pick, and so on. */
export type Memory = {
  move: { name: string; target: string | null } | null;
  switchTo: string | null;
  noSwitch: boolean;
  target: string | null;
  forget: string | null;
  tried: Set<string>;
  /** The pick `tried` last took, handed back by `refused` when the game refused it. */
  last: string | null;
  followed: boolean;
};
export const freshMemory = (): Memory => ({ move: null, switchTo: null, noSwitch: false, target: null, forget: null, tried: new Set(), last: null, followed: false });

const tried = (mem: Memory, key: string) => { mem.tried.add(key); mem.last = key; };
/** A refused pick never happened, so it may be picked again. */
export const refused = (mem: Memory) => { if (mem.last) mem.tried.delete(mem.last); mem.last = null; };

export const readsCard = (screen: string): boolean =>
  screen === "COMMAND" || screen === "CONFIRM" || screen === "MODIFIER_SELECT" || screen === "SUMMARY/LEARN_MOVE"
  || screen === "PARTY/FAINT_SWITCH" || screen === "PARTY/POST_BATTLE_SWITCH";

const act = (card: Card, kind: string): string | null =>
  card?.kind === kind ? card.groups?.find(g => g.id === "act")?.summary ?? null : null;

/** `Name Lv.7 20/24 FNT` → `Name`. */
const monName = (label: string): string => label.replace(/ Lv\.\d+.*$/, "");

// The act line is `slotText`'s, per slot (`60-card.js`).
type Slot = { text: string; target: string | null };
const slots = (summary: string): Slot[] => summary.split(" ; ").map(text => {
  const target = / → (.+?)(?:, then | · |$)/.exec(text)?.[1] ?? null;
  return { text, target: target === "both" ? null : target };
});
const forgetOf = (verdict: string | null) => /^Learn → forget (.+?)(?: · |$)/.exec(verdict ?? "")?.[1] ?? null;
const cancel: Action = { tool: "press", args: { button: "CANCEL" }, by: "rule" };
const startsWithMon = (text: string, name: string) => text.startsWith(`${name} `);
const moveOf = (slot: Slot, name: string): string | null => {
  const rest = slot.text.slice(name.length + 1);
  if (rest.startsWith("nothing it can")) return null;
  return rest.split(/ → |, then | · /)[0] || null;
};

/** The benched, standing option whose mon a slot plays; the longest name wins, so `Mr. Mime` beats `Mr`. */
const benchedFor = (options: Opt[], text: string): Opt | null => options
  .filter(o => o.label && o.synthetic !== true && o.fainted !== true && o.active !== true && startsWithMon(text, monName(o.label)))
  .sort((a, b) => monName(b.label!).length - monName(a.label!).length)[0] ?? null;

const pick = (label: string, by: Action["by"], intent?: Action["intent"]): Action =>
  ({ tool: "select_option", args: { label }, by, ...(intent ? { intent } : {}) });
const pickIndex = (i: number | string, by: Action["by"], intent?: Action["intent"]): Action =>
  ({ tool: "select_option", args: { index: i }, by, ...(intent ? { intent } : {}) });

export function decide(menu: Menu, card: Card, mem: Memory): Action {
  const screen = menu.screen;
  const options = menu.options ?? [];
  const labels = options.map(o => o.label ?? "");
  const has = (re: RegExp) => labels.find(l => re.test(normalizeLabel(l)));
  const first = labels.find(l => l !== "") ?? "";
  // A card a refresh behind the game is about the wave before.
  const live = card && card.card_wave === menu.wave ? card : null;

  if (screen === "COMMAND") {
    const active = /What will\s+(.+?) do\?/.exec(menu.text ?? "")?.[1] ?? null;
    const line = act(live, "battle");
    const all = line ? slots(line) : [];
    const mine = active ? all.find(s => startsWithMon(s.text, active)) : undefined;
    mem.move = null;
    if (mine && active) {
      const move = moveOf(mine, active);
      mem.move = move ? { name: move, target: mine.target } : null;
      mem.noSwitch = false;
      return pick(has(/^fight/) ?? first, move ? "card" : "rule");
    }
    if (all.length === 1 && !mem.noSwitch && has(/^pok/)) {
      mem.switchTo = all[0].text;
      return pick(has(/^pok/)!, "card");
    }
    mem.noSwitch = false;
    return pick(has(/^fight/) ?? first, "rule");
  }
  if (screen === "FIGHT") {
    const moves = (menu.extra?.moves as ({ pp: number; power: number } | null)[]) ?? [];
    const usable = (i: number) => labels[i] && labels[i] !== "-" && (moves[i]?.pp ?? 0) > 0;
    const planned = mem.move ? labels.findIndex((l, i) => usable(i) && normalizeLabel(l) === normalizeLabel(mem.move!.name)) : -1;
    if (planned >= 0) return pick(labels[planned], "card");
    let best = -1, at = -1;
    labels.forEach((_, i) => { if (usable(i) && moves[i]!.power > best) { best = moves[i]!.power; at = i; } });
    return pick(at >= 0 ? labels[at] : first, "rule");
  }
  if (screen === "TARGET_SELECT") {
    const want = mem.move?.target;
    const hit = want ? labels.find(l => l.startsWith(want)) : undefined;
    return pick(hit ?? first, hit ? "card" : "rule");
  }
  if (screen === "PARTY/SWITCH") {
    const to = mem.switchTo ? benchedFor(options, mem.switchTo) : null;
    mem.switchTo = null;
    if (to) { mem.followed = true; return pick(to.label!, "card"); }
    mem.noSwitch = true;
    return pick("Cancel", "rule");
  }
  if (screen === "PARTY/POST_BATTLE_SWITCH" || screen === "PARTY/FAINT_SWITCH") {
    const line = act(live, "battle");
    const to = line ? benchedFor(options, slots(line)[0].text) : null;
    mem.followed = !!to;
    if (to) return pick(to.label!, "card");
    if (screen === "PARTY/POST_BATTLE_SWITCH") return pick("Cancel", "rule");
    const standing = options.find(o => o.fainted === false && o.active !== true && o.synthetic !== true);
    return pick(standing?.label ?? "Cancel", "rule");
  }
  if (screen.startsWith("PARTY/") && screen.endsWith(":options")) {
    // A PP item's options are the mon's moves, with no verb among them.
    const label = has(/^(send out|apply|use|teach|switch|revive|select|pass baton)/)
      ?? (screen.startsWith("PARTY/MOVE_MODIFIER") ? labels.find(l => l && !/^cancel$/i.test(l)) : undefined) ?? "Cancel";
    const by = mem.followed ? "card" : "rule";
    mem.followed = false;
    if (screen.startsWith("PARTY/SWITCH") || screen.startsWith("PARTY/POST_BATTLE_SWITCH")) return pick(label, by, "switch");
    if (screen.startsWith("PARTY/FAINT_SWITCH")) return pick(label, by, "replace");
    return pick(label, by);
  }
  if (screen.startsWith("PARTY/")) {
    const want = mem.target;
    mem.target = null;
    // An item with no effect on a mon bounces back here, so each mon is tried once per screen and wave.
    const key = (o: Opt) => `${menu.wave}|${screen}|${o.label}`;
    const untried = (o: Opt) => !!o.label && o.fainted !== true && o.synthetic !== true && !mem.tried.has(key(o));
    const named = want ? options.find(o => untried(o) && monName(o.label!) === want) : undefined;
    const mon = named ?? options.find(o => untried(o) && o.fainted === false);
    if (!mon) return pick("Cancel", "rule");
    tried(mem, key(mon));
    mem.followed = !!named;
    return pick(mon.label!, named ? "card" : "rule");
  }
  if (screen === "CONFIRM") {
    const text = menu.text ?? "";
    if (/forgotten/i.test(text)) {
      const verdict = act(card, "learn");
      const forget = forgetOf(verdict);
      if (forget) mem.forget = forget;
      if (forget || mem.forget) return pick(has(/^yes/) ?? first, "card", "learn");
      return pick(has(/^no/) ?? first, verdict ? "card" : "rule");
    }
    if (/stop trying/i.test(text)) return pick(has(/^yes/) ?? first, "rule");
    if (/skip taking/i.test(text)) return pick(has(/^yes/) ?? first, "rule");
    // A yes the party screen cannot use is cancelled there.
    if (/will you switch/i.test(text)) {
      const line = act(live, "battle");
      return line && slots(line).length === 1 ? pick(has(/^yes/) ?? first, "card") : pick(has(/^no/) ?? first, "rule");
    }
    return pick(has(/^no/) ?? first, "rule");
  }
  if (screen === "SUMMARY/LEARN_MOVE") {
    const verdict = act(card, "learn");
    const forget = forgetOf(verdict) ?? mem.forget;
    mem.forget = null;
    const hit = forget ? options.find(o => o.new !== true && o.label && normalizeLabel(o.label) === normalizeLabel(forget)) : undefined;
    if (hit) return pick(hit.label!, "card", "learn");
    const decline = options.find(o => o.new === true);
    return decline?.label ? pick(decline.label, "rule") : cancel;
  }
  if (screen === "MODIFIER_SELECT") {
    const line = act(live, "reward") ?? "";
    const clauses = line.split(" · ");
    const buys = clauses.find(c => c.startsWith("buy "))?.slice(4).split(", ") ?? [];
    for (const name of buys) {
      const key = `${menu.wave}|${name}`;
      const o = options.find(x => x.kind === "shop" && x.label === name && typeof x.cost === "number" && x.cost > 0);
      if (!o || mem.tried.has(key)) continue;
      tried(mem, key);
      mem.target = null;
      return pickIndex(o.i, "card", "shop");
    }
    const take = /^take (.+?)(?: → (.+?)(?: \(forget (.+)\))?)?$/.exec(clauses.find(c => c.startsWith("take ")) ?? "");
    // A reward with no use for any mon is handed back, and the card names it again.
    const fresh = (o: Opt) => o.kind === "reward" && !mem.tried.has(`${menu.wave}|take|${o.i}`);
    const named = take ? options.find(x => fresh(x) && x.label === take[1]) : undefined;
    const reward = named ?? options.find(fresh);
    if (reward) {
      mem.target = named ? take![2] ?? null : null;
      mem.forget = named ? take![3] ?? null : null;
      tried(mem, `${menu.wave}|take|${reward.i}`);
      return pickIndex(reward.i, named ? "card" : "rule", "shop");
    }
    const cont = options.find(o => o.kind === "buttons" && o.col === 4);
    return cont ? pick(cont.label!, "rule") : cancel;
  }
  if (screen === "OPTION_SELECT" || screen === "MENU_OPTION_SELECT") return pick(first, "rule");
  if (screen.startsWith("MYSTERY_ENCOUNTER") && first) return pick(first, "rule");
  if (screen === "SUMMARY" || screen.startsWith("SUMMARY/")) return cancel;
  return { tool: "press", args: { button: "ACTION" }, by: "rule" };
}
