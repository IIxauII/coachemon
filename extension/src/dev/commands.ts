/**
 * The dev-only command table (§10.6): `eval` in the page, `screenshot` and `reload` in the background. Imported only
 * by a `--mode dev` build — a store build must not carry these names at all, and the guard fails an artifact that
 * does (§5.5).
 *
 * Everything here is dependency-injected and free of `wxt/browser`, so the tests drive it with no browser; the live
 * wiring is `live.ts`, the one file a store build never bundles.
 *
 * Dev commands sit outside the protocol integer: a dev build always pairs with a server from the same checkout, and
 * the hub routes them to a `flavour: "dev"` extension and to nothing else (§10.6).
 */
import type { ExtensionCmd } from "../../../src/protocol/wire.ts";
import type { RelayReply } from "../messages.ts";
import type { Handler } from "../page/register.ts";

/**
 * How much base64 one `screenshot` reply carries. A game tab's PNG runs to several MB of base64 and every frame is
 * capped at 1 MB in two places (§8.3, §9.7), so a capture crosses in parts the caller asks for one at a time. Base64
 * needs no JSON escaping, so a frame is this plus its envelope and nothing more.
 */
export const SCREENSHOT_CHUNK = 512 * 1024;

/** What one `screenshot` call answers: one part of a capture, or the refusal that the capture it named is gone. */
export type ScreenshotPart =
  | { ok: true; id: number; part: number; parts: number; png: string }
  | { ok: false; why: "expired" | "threw"; message?: string };

/**
 * What the background answers by itself, if anything: `null` means "not mine", and the transport forwards the command
 * to the tab as usual. The store build has no such answerer at all.
 */
export type LocalAnswer = (cmd: ExtensionCmd) => Promise<RelayReply> | null;

export type DevApi = {
  /** `tabs.captureVisibleTab` over the window the game tab is in: a `data:image/png;base64,…` URL. */
  capture: (tab: number) => Promise<string>;
  /** `runtime.reload`. */
  reload: () => void;
  /** Runs `fn` after this turn, so the reply is on the wire before the reload takes the socket it went out on. */
  soon: (fn: () => void) => void;
};

/**
 * The background's half of the dev table. It answers the two commands the page cannot — one needs the browser's
 * capture API, the other ends the extension — and returns `null` for every other name, which is the transport's cue
 * to forward it to the tab as usual.
 */
export function devCommands(api: DevApi): LocalAnswer {
  /** The capture the parts are read from. One at a time: a dev loop has one client. */
  let held: { id: number; chunks: string[] } | null = null;
  let captures = 0;

  const answer = (id: number, result: unknown): RelayReply => ({ t: "reply", id, ok: true, result });

  const capturePart = async (cmd: ExtensionCmd): Promise<RelayReply> => {
    const part = typeof cmd.args.part === "number" ? cmd.args.part : 0;
    const wanted = typeof cmd.args.id === "number" ? cmd.args.id : null;
    if (part === 0) {
      try {
        const url = await api.capture(cmd.tab);
        held = { id: ++captures, chunks: chunk(url.slice(url.indexOf(",") + 1), SCREENSHOT_CHUNK) };
      } catch (e) {
        return answer(cmd.id, { ok: false, why: "threw", message: message(e) } satisfies ScreenshotPart);
      }
    }
    // A part of a capture that has since been replaced, or one past its end: the caller starts again from part 0.
    if (held === null || (wanted !== null && wanted !== held.id) || part < 0 || part >= held.chunks.length) {
      return answer(cmd.id, { ok: false, why: "expired" } satisfies ScreenshotPart);
    }
    const png = held.chunks[part] as string;
    return answer(cmd.id, { ok: true, id: held.id, part, parts: held.chunks.length, png } satisfies ScreenshotPart);
  };

  return cmd => {
    if (cmd.name === "reload") {
      // Answered first and reloaded after: `runtime.reload()` takes the socket this reply goes out on (§5.4).
      api.soon(() => api.reload());
      return Promise.resolve(answer(cmd.id, { ok: true }));
    }
    if (cmd.name === "screenshot") return capturePart(cmd);
    return null;
  };
}

/**
 * `eval` (§10.6): a function body run after the scene locator, with `L`, `scene`, `ui` and `game` in scope, exactly as
 * `scripts/eval.ts` has always evaluated one. A `read` in the dispatch table, so off the game it refuses with the
 * locator's reason like any other read (§10.1).
 */
export const DEV_PAGE_HANDLERS: Record<string, Handler> = { eval: { kind: "read", run: evaluate } };

function evaluate(L: any, args: { source?: unknown }): unknown {
  const source = typeof args.source === "string" ? args.source : "";
  try {
    const value = new Function("L", "scene", "ui", "game", source)(L, L.scene, L.ui, L.game);
    // The reply crosses as JSON: a live Phaser object refuses here, by name, rather than as an opaque relay `threw`.
    return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as unknown);
  } catch (e) {
    return { ok: false, why: "threw", message: message(e) };
  }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** A string in pieces of at most `size`; an empty string is one empty piece, never no pieces. */
function chunk(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out.length > 0 ? out : [""];
}
