/**
 * The relay channel (§9.1): `CustomEvent`s on `document`, detail always a JSON string, so Firefox Xray wrappers and
 * `cloneInto` never come up. Both worlds share this module's names; only the relay ever imports the validators, because
 * only the upward direction is defended (§9.5).
 */
import type { CardGroup, EventKind } from "../../../src/protocol/wire.ts";

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

/**
 * The two shapes the relay has to recognise to forward them; every other detail is built inline where it is sent.
 * A card's `groups` are `CardGroup`s, the shape the protocol declares: `text` is the projection of that list, so an
 * agent reading the stream reads a group by name instead of parsing lines.
 */
export type CardDetail = { build: string; kind: string; key: string; wave: number; verdict: string; groups: CardGroup[]; text: string };
export type CoachErrorDetail = { build: string; message: string };

/**
 * The kinds the HUD pushes (§11.1); the HUD model's `rewards` arrives as `reward`. Named for the card event and not
 * for the card, because two card kinds — `starters` and `fusion` — never stream. The HUD's own list is
 * `hud/60-card.js`'s `EVENT_KINDS`, derived there from its card table and kept here by hand: the panel is one source
 * the extension bundles rather than imports. `cardtest.mjs` pins this copy to that one.
 */
export const EVENT_KINDS = ["battle", "learn", "reward", "biome", "encounter"] as const;

/**
 * The eight group ids, closed (#349 §1). The HUD's own list is `hud/90-render.js`'s `GROUP_IDS`, kept here by hand
 * for the same reason `EVENT_KINDS` is: the panel is one source the extension bundles rather than imports.
 */
export const GROUP_IDS = ["act", "foes", "catch", "plan", "options", "audit", "road", "notes"] as const;

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
 *
 * **This gate is the card detail's version point** (#361): a field the panel sends and the gate does not know is a
 * card that never crosses, so the two are only ever changed together. That costs no `PROTOCOL` bump — the panel and
 * the relay judging it ship in one build and are paired by build id, so a tab on an older build is out of play
 * rather than half understood — while the `card` command's result, which the hub carries opaquely, only gains a
 * field (§10.7).
 */
export function cardBody(d: Record<string, unknown>): Omit<CardDetail, "build"> | null {
  const keys = Object.keys(d).sort().join(",");
  if (keys !== "build,groups,key,kind,text,verdict,wave") return null;
  if (!str(d.kind) || !(EVENT_KINDS as readonly string[]).includes(d.kind)) return null;
  if (!str(d.key) || !str(d.verdict) || !str(d.text) || typeof d.wave !== "number" || !Number.isFinite(d.wave)) return null;
  const groups = cardGroups(d.groups);
  if (groups === null) return null;
  return { kind: d.kind, key: d.key, wave: d.wave, verdict: d.verdict, groups, text: d.text };
}

/**
 * `groups`, checked the way the detail around it is: exact keys, a closed id, and rows that are strings — a group
 * is data the agent reads by name, so a mis-shaped one never crosses (§9.5). An empty list needs no rule of its own:
 * a card with nothing drawn has no `text` either, and the HUD pushes no card without one.
 */
function cardGroups(v: unknown): CardGroup[] | null {
  if (!Array.isArray(v)) return null;
  const out: CardGroup[] = [];
  for (const g of v) {
    if (!g || typeof g !== "object" || Array.isArray(g)) return null;
    const d = g as Record<string, unknown>;
    if (Object.keys(d).sort().join(",") !== "id,label,rows,summary") return null;
    if (!str(d.id) || !(GROUP_IDS as readonly string[]).includes(d.id)) return null;
    if (!str(d.label)) return null;
    if (d.summary !== null && !str(d.summary)) return null;
    if (!Array.isArray(d.rows) || !d.rows.every(str)) return null;
    out.push({ id: d.id, label: d.label, summary: d.summary as string | null, rows: d.rows as string[] });
  }
  return out;
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
