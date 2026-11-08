/**
 * The key probe's box on pokerogue.net (#1018): one line per arrival of a candidate route, grouped into presses, drawn
 * where the owner can read it without devtools. MAIN world, beside the coach panel; it reads nothing of the game.
 *
 * Routes it logs (§5.0 of the note on `research/keyboard-routes`):
 * - `command:<name>` and `action`: the background's grab, through the relay.
 * - `page`: a capture `keydown` on `window`, with a log-only mode and a prevent mode.
 * - `accesskey`: a `<button accesskey="k">` (⌃⌥K).
 *
 * "Game heard" is a second, passive `keydown` listener on `window` in the bubble phase, where Phaser listens: a key
 * that gets there with `defaultPrevented` unset is a key the game read (Phaser bails on a prevented one).
 */
import { EVENT, decode } from "../relay/channel.ts";
import { PROBE_COMMANDS, UPDATE_TRY } from "./commands.ts";

/** The letters and the digit the probe's chords use, by `event.code`. L is the `commands.update()` target. */
const PROBE_CODES = new Set(["KeyK", "KeyJ", "KeyU", "KeyL", "Digit1"]);
const MODIFIERS: Record<string, string> = {
  ShiftLeft: "⇧", ShiftRight: "⇧", ControlLeft: "⌃", ControlRight: "⌃",
  AltLeft: "⌥", AltRight: "⌥", MetaLeft: "⌘", MetaRight: "⌘",
};
/** Arrivals closer than this belong to one press. The owner's script says to wait a second between presses. */
const PRESS_GAP_MS = 1200;
const MAX_PRESSES = 15;
const ASK_TIMEOUT_MS = 3000;

type Line = { at: number; text: string };
type Press = {
  n: number;
  wall: string;
  start: number;
  last: number;
  lines: Line[];
  grabs: number;
  repeats: number;
  heard: string[];
  blocked: string[];
};

const keyName = (code: string): string => MODIFIERS[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "");
const chordOf = (e: KeyboardEvent): string =>
  `${e.ctrlKey ? "⌃" : ""}${e.altKey ? "⌥" : ""}${e.shiftKey ? "⇧" : ""}${e.metaKey ? "⌘" : ""}${keyName(e.code)}`;
const yn = (b: boolean): string => (b ? "yes" : "no");

export function startKeyProbePanel(o: { build: string; target: string }): void {
  const presses: Press[] = [];
  let current: Press | null = null;
  let counter = 0;
  let prevent = false;
  // On Firefox the accesskey shares ⌃⌥K with `probe-ctrl-opt-k`, so it can be switched off to press the command alone.
  let accessOn = true;
  let hidden = false;
  let status: Record<string, unknown> | null = null;
  let statusError: string | null = null;
  let lastAction: string | null = null;

  // ---- asking the background, through the relay ----
  let askId = 0;
  const pending = new Map<number, (a: Record<string, unknown>) => void>();
  document.addEventListener(EVENT.probeAnswer, e => {
    const d = decode((e as CustomEvent).detail);
    if (!d || d.build !== o.build || typeof d.id !== "number") return;
    pending.get(d.id)?.(d.answer as Record<string, unknown>);
    pending.delete(d.id);
  });
  const ask = (what: string): Promise<Record<string, unknown>> => new Promise(res => {
    const id = ++askId;
    pending.set(id, res);
    setTimeout(() => {
      if (!pending.delete(id)) return;
      res({ ok: false, error: "no answer from the relay in 3 s (on Orion: open the game in a new tab, not a reloaded one)" });
    }, ASK_TIMEOUT_MS);
    document.dispatchEvent(new CustomEvent(EVENT.probeAsk, { detail: JSON.stringify({ build: o.build, id, ask: what }) }));
  });
  const refresh = async (): Promise<void> => {
    const a = await ask("status");
    if (a.ok) { status = a; statusError = null; } else statusError = String(a.error);
    draw();
  };
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshSoon = (): void => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refresh(), 400);
  };
  const tryAsk = async (what: string, label: string): Promise<void> => {
    const a = await ask(what);
    lastAction = `${label}: ${a.ok ? "ok" : `failed: ${String(a.error)}`}`;
    if (Array.isArray(a.commands) && status) status = { ...status, commands: a.commands };
    draw();
    refreshSoon();
  };

  // ---- presses ----
  const press = (now: number): Press => {
    if (!current || now - current.last > PRESS_GAP_MS) {
      current = { n: ++counter, wall: new Date().toISOString().slice(11, 19), start: now, last: now, lines: [], grabs: 0, repeats: 0, heard: [], blocked: [] };
      presses.unshift(current);
      if (presses.length > MAX_PRESSES) presses.pop();
    }
    return current;
  };
  const arrive = (text: string, grab: boolean): void => {
    const now = performance.now();
    const p = press(now);
    p.last = now;
    if (grab) p.grabs++;
    p.lines.push({ at: now - p.start, text: grab ? `${text}  ← grab ${p.grabs}` : text });
    draw();
  };

  // The page route: first in line on every engine, for any chord the browser does not take before the page.
  const onKey = (e: KeyboardEvent): void => {
    const modifier = MODIFIERS[e.code];
    if (!modifier && !PROBE_CODES.has(e.code)) return;
    const stop = prevent && !modifier;
    if (stop) e.preventDefault();
    if (e.repeat) {
      const p = press(performance.now());
      p.last = performance.now();
      if (e.type === "keydown") p.repeats++;
      draw();
      return;
    }
    if (modifier) {
      if (e.type === "keydown") arrive(`page keydown ${modifier} (modifier) trusted=${yn(e.isTrusted)}`, false);
      return;
    }
    const facts = `code=${e.code} key=${JSON.stringify(e.key)} keyCode=${e.keyCode} trusted=${yn(e.isTrusted)}`;
    arrive(`page ${e.type} ${chordOf(e)}  ${facts}${stop ? "  [probe prevented it]" : ""}`, e.type === "keydown");
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);

  // What the game heard: the bubble phase on `window`, where Phaser's listener is.
  window.addEventListener("keydown", e => {
    if (!current || performance.now() - current.last > PRESS_GAP_MS) return;
    const label = keyName(e.code);
    const list = e.defaultPrevented ? current.blocked : current.heard;
    if (!list.includes(label)) list.push(label);
    draw();
  }, false);

  // The browser-side routes, handed down by the relay.
  document.addEventListener(EVENT.grab, e => {
    const d = decode((e as CustomEvent).detail);
    if (!d || d.build !== o.build) return;
    const lag = typeof d.at === "number" ? `, background→page ${Date.now() - d.at} ms` : "";
    const route = d.route === "action" ? "action (toolbar or _execute_action)" : `command:${String(d.name)}`;
    arrive(`${route}  (tab from ${String(d.tabFrom)}${lag})`, true);
    refreshSoon();
  });

  // ---- the box ----
  const SKIN = { fill: "rgba(54, 45, 62, 0.96)", body: "#f8f8f8", rule: "#f8b050", warn: "#e13d3d", dim: "#b8b0c0" };
  const box = document.createElement("div");
  box.id = "coachemon-keyprobe";
  Object.assign(box.style, {
    position: "fixed", top: "8px", right: "8px", zIndex: "2147483647", boxSizing: "border-box",
    width: "min(480px, 48vw)", maxHeight: "calc(100vh - 16px)", overflow: "auto", padding: "6px 8px",
    background: SKIN.fill, color: SKIN.body, border: `1px solid ${SKIN.rule}`,
    font: "11px/1.35 ui-monospace, Menlo, monospace", userSelect: "text", whiteSpace: "normal",
  });
  // As the coach panel does: a click on the box is never a click on the game.
  for (const ev of ["click", "mousedown", "pointerdown", "touchstart", "mouseup", "pointerup"]) box.addEventListener(ev, e => e.stopPropagation());
  document.body.appendChild(box);

  const el = (tag: string, style: Partial<CSSStyleDeclaration>, ...kids: (Node | string | null)[]): HTMLElement => {
    const n = document.createElement(tag);
    Object.assign(n.style, style);
    n.append(...kids.filter((k): k is Node | string => k != null));
    return n;
  };
  const button = (label: string, title: string, fn: () => void): HTMLElement => {
    const b = el("button", {
      font: "inherit", color: SKIN.body, background: "transparent", border: `1px solid ${SKIN.rule}`,
      padding: "0 4px", margin: "0 4px 2px 0", cursor: "pointer",
    }, label) as HTMLButtonElement;
    b.title = title;
    b.tabIndex = -1;
    // Keeps focus where it was, so Enter or Space in the game never presses this button.
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("click", () => { b.blur(); fn(); });
    return b;
  };

  // The accesskey route. It stays in the box across redraws, so the browser keeps matching it.
  const access = el("button", {
    font: "inherit", color: SKIN.body, background: "transparent", border: `1px dashed ${SKIN.rule}`,
    padding: "0 4px", margin: "0 4px 2px 0",
  }, "accesskey K (⌃⌥K)") as HTMLButtonElement;
  access.accessKey = "k";
  access.title = "A <button accesskey=\"k\">: the browser clicks it on ⌃⌥K";
  access.addEventListener("click", e => {
    access.blur();
    // A key-made click has `detail` 0; a mouse click counts its clicks.
    const keyboard = e.detail === 0;
    arrive(`accesskey click  detail=${e.detail} trusted=${yn(e.isTrusted)}${keyboard ? "" : "  (a mouse click, not a key)"}`, keyboard);
  });

  const statusLines = (): HTMLElement => {
    if (!status) return el("div", { color: statusError ? SKIN.warn : SKIN.dim }, statusError ?? "asking the background…");
    const all = Array.isArray(status.commands) ? (status.commands as { name?: string; shortcut?: string }[]) : [];
    const bound = new Map(all.map(c => [c.name ?? "", c.shortcut ?? ""]));
    const field = o.target === "firefox" ? "firefox" : "chrome";
    const rows = PROBE_COMMANDS.filter(c => c[field] !== "absent").map(c => {
      const now = bound.has(c.name) ? bound.get(c.name) || "unassigned" : "not listed";
      return el("div", {}, `${c.name.padEnd(19)} ${c.chord.padEnd(4)} declared ${c[field].padEnd(9)} → ${now}`);
    });
    const api = (status.api ?? {}) as Record<string, boolean>;
    const bg = (status.background ?? {}) as Record<string, boolean>;
    const recent = Array.isArray(status.recent) ? (status.recent as { at: string; what: string }[]).slice(-8) : [];
    const kagi = typeof (window as unknown as { KAGI?: unknown }).KAGI;
    return el("div", {},
      el("div", {}, `browser: ${JSON.stringify(status.info)} · window.KAGI: ${kagi}`),
      el("div", { color: SKIN.dim }, navigator.userAgent),
      el("div", {}, `options page: ${String(status.optionsUrl)}`),
      el("div", {}, `commands.update ${yn(api.update)} · reset ${yn(api.reset)} · openShortcutSettings ${yn(api.openShortcutSettings)} · action ${yn(api.action)} · background document ${yn(bg.document)}, localStorage ${yn(bg.localStorage)}`),
      el("div", { color: SKIN.rule, marginTop: "4px" }, "commands.getAll(), as this browser registered them:"),
      el("pre", { margin: "0", font: "inherit", whiteSpace: "pre-wrap" }, ...rows),
      el("div", { color: SKIN.rule, marginTop: "4px" }, "background, latest last:"),
      el("pre", { margin: "0", font: "inherit", whiteSpace: "pre-wrap", color: SKIN.dim }, recent.map(r => `${r.at} ${r.what}`).join("\n") || "—"),
    );
  };

  const pressSummary = (p: Press): string =>
    `press ${p.n} · ${p.wall} · ${p.grabs} grab${p.grabs === 1 ? "" : "s"}` +
    `${p.repeats ? ` · ${p.repeats} repeats` : ""} · game heard: ${p.heard.join(" ") || "nothing"}` +
    `${p.blocked.length ? ` · prevented before the game: ${p.blocked.join(" ")}` : ""}`;
  const pressLines = (p: Press): string => p.lines.map(l => `  +${String(Math.round(l.at)).padStart(4)} ms  ${l.text}`).join("\n");
  const pressBlock = (p: Press): HTMLElement => el("div", { marginTop: "4px" },
    // Exactly one grab is the outcome the map is after; anything else is drawn in red.
    el("div", { color: p.grabs === 1 ? SKIN.rule : SKIN.warn, fontWeight: "bold" }, pressSummary(p)),
    el("pre", { margin: "0", font: "inherit", whiteSpace: "pre-wrap" }, pressLines(p)));

  const asText = (): string => {
    const head = `Coachemon key probe · build ${o.build} · ${o.target}-flavoured build · page listener ${prevent ? "PREVENT" : "log only"} · accesskey ${accessOn ? "on" : "off"}\n` +
      `browser: ${JSON.stringify(status?.info ?? null)} · ${navigator.userAgent}\n`;
    const all = Array.isArray(status?.commands) ? (status.commands as { name?: string; shortcut?: string }[]) : [];
    const cmds = all.map(c => `  ${c.name}: ${c.shortcut || "unassigned"}`).join("\n");
    const body = [...presses].reverse().map(p => `${pressSummary(p)}\n${pressLines(p)}`).join("\n");
    return `${head}commands:\n${cmds}\n\n${body}\n`;
  };

  function draw(): void {
    box.replaceChildren();
    const head = el("div", { display: "flex", justifyContent: "space-between", gap: "6px", fontWeight: "bold", color: SKIN.rule },
      el("span", {}, `🎯 key probe · ${o.target}-flavoured · ${o.build}`),
    );
    if (hidden) {
      box.append(head, button("show", "Show the probe", () => { hidden = false; draw(); }), access);
      return;
    }
    const mode = el("div", { color: prevent ? SKIN.warn : SKIN.body, fontWeight: "bold", margin: "2px 0" },
      `page listener: ${prevent ? "PREVENT (calls preventDefault on K J U L 1)" : "log only"} · accesskey ${accessOn ? "on" : "off"}`);
    const controls = el("div", {},
      button(prevent ? "switch to log only" : "switch to prevent", "The page listener's mode", () => { prevent = !prevent; draw(); }),
      access,
      button(accessOn ? "accesskey off" : "accesskey on", "Take the accesskey off ⌃⌥K, or put it back", () => {
        accessOn = !accessOn;
        access.accessKey = accessOn ? "k" : "";
        access.textContent = accessOn ? "accesskey K (⌃⌥K)" : "accesskey: off";
        draw();
      }),
      button("refresh", "Ask the background again", () => void refresh()),
      button("copy log", "Copy everything here as text", () => {
        void navigator.clipboard.writeText(asText()).then(() => { lastAction = "copied the log"; draw(); },
          e => { lastAction = `copy failed: ${String(e)}`; draw(); });
      }),
      button("clear", "Forget every press", () => { presses.length = 0; current = null; draw(); }),
      button("hide", "Fold the probe away", () => { hidden = true; draw(); }),
    );
    const tries = el("div", {},
      button(`commands.update ${UPDATE_TRY.name} → ${UPDATE_TRY.chord}`, "Firefox and Orion only", () => void tryAsk("update", "commands.update")),
      button("commands.reset", `Put ${UPDATE_TRY.name} back`, () => void tryAsk("reset", "commands.reset")),
      button("shortcuts page", "The browser's own page for extension shortcuts", () => void tryAsk("shortcuts", "shortcuts page")),
      button("openOptionsPage()", "runtime.openOptionsPage(), from the background", () => void tryAsk("options-open", "openOptionsPage")),
      button("options in a tab", "The options page as a plain tab", () => void tryAsk("options-tab", "options in a tab")),
    );
    box.append(head, mode, controls, tries,
      el("div", { color: SKIN.dim }, lastAction ?? ""),
      el("div", { color: SKIN.rule, marginTop: "4px" }, "presses, newest first:"),
      ...(presses.length ? presses.map(pressBlock) : [el("div", { color: SKIN.dim }, "none yet: click the game, then press a chord")]),
      el("div", { borderTop: `1px solid ${SKIN.rule}`, marginTop: "6px", paddingTop: "4px" }, statusLines()),
    );
  }

  draw();
  void refresh();
}
