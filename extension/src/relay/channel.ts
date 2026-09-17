/**
 * The relay channel (§9.1): `CustomEvent`s on `document`, detail always a JSON string, so Firefox Xray wrappers and
 * `cloneInto` never come up. Both worlds share this module's names; only the relay ever imports the validators, because
 * only the upward direction is defended (§9.5).
 */
import type { EventKind } from "../../../src/protocol/wire.ts";

/** Every event name is prefixed, so nothing on the page collides with us. */
export const EVENT = {
  hello: "coachemon:hello",
  cmd: "coachemon:cmd",
  reply: "coachemon:reply",
  card: "coachemon:card",
  coachError: "coachemon:coach-error",
  wrongWorld: "coachemon:wrong-world",
} as const;

/** A reply or event over this is dropped at the relay, `too-large` (§9.7). The background caps the hub frame again. */
export const MAX_DETAIL_BYTES = 1024 * 1024;

/** The two shapes the relay has to recognise to forward them; every other detail is built inline where it is sent. */
export type CardDetail = { build: string; kind: string; key: string; wave: number; verdict: string; text: string };
export type CoachErrorDetail = { build: string; message: string };

/** The kinds the HUD pushes (§11.1); the HUD model's `shop` arrives as `reward`. */
export const CARD_KINDS = ["battle", "learn", "reward", "biome", "encounter"] as const;

/** The DOM surface the relay and the page script need, so both are testable against a plain `EventTarget`. */
export type Listener = (e: { detail?: unknown }) => void;

export type Channel = {
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
  dispatchEvent(event: unknown): unknown;
};

/** How a side builds an event; the entrypoints pass `new CustomEvent(type, { detail })`. */
export type MakeEvent = (type: string, detail: string) => unknown;

export function encode(detail: unknown): string {
  return JSON.stringify(detail);
}

/**
 * Like `decode`, but at any size. A reply has to be identified before it can be refused for being too large: the
 * ownership checks come first, or any MAIN-world code could poison an in-flight command with one oversized reply
 * (§9.5). Everything else uses the bounded `decode`.
 */
export function decodeAny(detail: unknown): Record<string, unknown> | null {
  if (typeof detail !== "string") return null;
  try {
    const parsed = JSON.parse(detail);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A detail that is not a JSON object, or is over the cap, is not ours: dropped without a word (§9.5). */
export function decode(detail: unknown): Record<string, unknown> | null {
  if (typeof detail !== "string" || detail.length > MAX_DETAIL_BYTES) return null;
  return decodeAny(detail);
}

const str = (v: unknown): v is string => typeof v === "string";

/**
 * The forgery defence, by structure (§9.5): a card event forwards upward only with exactly the declared keys and types.
 * Page code can forge a well-shaped card, which it could read from the game anyway; a mis-shaped one never crosses.
 */
export function cardBody(d: Record<string, unknown>): Omit<CardDetail, "build"> | null {
  const keys = Object.keys(d).sort().join(",");
  if (keys !== "build,key,kind,text,verdict,wave") return null;
  if (!str(d.kind) || !(CARD_KINDS as readonly string[]).includes(d.kind)) return null;
  if (!str(d.key) || !str(d.verdict) || !str(d.text) || typeof d.wave !== "number" || !Number.isFinite(d.wave)) return null;
  return { kind: d.kind, key: d.key, wave: d.wave, verdict: d.verdict, text: d.text };
}

export function coachErrorBody(d: Record<string, unknown>): Omit<CoachErrorDetail, "build"> | null {
  const keys = Object.keys(d).sort().join(",");
  if (keys !== "build,message" || !str(d.message)) return null;
  return { message: d.message };
}

/** Each HUD event kind with the event that carries it and the shape it must have, so nothing re-decides it elsewhere. */
export const EVENT_BY_KIND: readonly [EventKind, string][] = [
  ["card", EVENT.card],
  ["coach-error", EVENT.coachError],
];

export function eventBody(kind: EventKind, d: Record<string, unknown>): Record<string, unknown> | null {
  return kind === "card" ? cardBody(d) : coachErrorBody(d);
}
