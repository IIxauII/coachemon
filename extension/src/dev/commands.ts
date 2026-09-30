/**
 * The dev-only command table (extension-distribution.md §10.6). Only a `--mode dev` build may import it: the guard fails
 * a store artifact that carries these names (§5.5).
 */
import type { ExtensionCmd } from "../../../src/protocol/wire.ts";
import type { RelayReply } from "../messages.ts";
import type { Handler } from "../page/register.ts";

/** Under the 1 MB frame cap with room for the envelope, since base64 needs no JSON escaping (extension-distribution.md §9.7). */
export const SCREENSHOT_CHUNK = 512 * 1024;

export type ScreenshotPart =
  | { ok: true; id: number; part: number; parts: number; png: string }
  | { ok: false; why: "expired" | "threw"; message?: string };

/** `null` means "not mine", and the transport forwards the command to the tab. */
export type LocalAnswer = (cmd: ExtensionCmd) => Promise<RelayReply> | null;

export type DevApi = {
  /** A `data:image/png;base64,…` URL. */
  capture: (tab: number) => Promise<string>;
  reload: () => void;
  /** Runs `fn` after this turn, so the reply is on the wire before the reload takes the socket it went out on. */
  soon: (fn: () => void) => void;
};

export function devCommands(api: DevApi): LocalAnswer {
  /** One capture at a time: a dev loop has one client. */
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
    // A replaced capture, or a part past its end: the caller starts again from part 0.
    if (held === null || (wanted !== null && wanted !== held.id) || part < 0 || part >= held.chunks.length) {
      return answer(cmd.id, { ok: false, why: "expired" } satisfies ScreenshotPart);
    }
    const png = held.chunks[part] as string;
    return answer(cmd.id, { ok: true, id: held.id, part, parts: held.chunks.length, png } satisfies ScreenshotPart);
  };

  return cmd => {
    if (cmd.name === "reload") {
      api.soon(() => api.reload());
      return Promise.resolve(answer(cmd.id, { ok: true }));
    }
    if (cmd.name === "screenshot") return capturePart(cmd);
    return null;
  };
}

/** A `read`, though it can act: off the game it refuses with the locator's reason like any other read (extension-distribution.md §10.1). */
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

function chunk(s: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out.length > 0 ? out : [""];
}
