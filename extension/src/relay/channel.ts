/**
 * A detail is always a JSON string, so Firefox Xray wrappers and `cloneInto` never come up (extension-distribution.md
 * §9.1). Only the relay imports the validators: only the upward direction is defended (§9.5).
 */
import type { CardGroup, EventKind } from "../../../src/protocol/wire.ts";

export const EVENT = {
  hello: "coachemon:hello",
  cmd: "coachemon:cmd",
  reply: "coachemon:reply",
  card: "coachemon:card",
  coachError: "coachemon:coach-error",
  wrongWorld: "coachemon:wrong-world",
} as const;

/** extension-distribution.md §9.7's `too-large`. */
export const MAX_DETAIL_BYTES = 1024 * 1024;

export type CardDetail = { build: string; kind: string; key: string; wave: number; verdict: string; groups: CardGroup[]; text: string };
export type CoachErrorDetail = { build: string; message: string };

/**
 * A hand-kept copy of `hud/60-card.js`'s `EVENT_KINDS`, since the panel is bundled rather than imported; `cardtest.mjs`
 * pins the two (extension-distribution.md §11.1).
 */
export const EVENT_KINDS = ["battle", "learn", "reward", "biome", "encounter"] as const;

/** Closed (#349). A hand-kept copy of `hud/90-render.js`'s `GROUP_IDS`, pinned by `grouptest.mjs`. */
export const GROUP_IDS = ["act", "foes", "catch", "plan", "options", "audit", "road", "notes"] as const;

export type Listener = (e: { detail?: unknown }) => void;

export type Channel = {
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
  dispatchEvent(event: unknown): unknown;
};

export type MakeEvent = (type: string, detail: string) => unknown;

export function encode(detail: unknown): string {
  return JSON.stringify(detail);
}

/** Like `decode`, but at any size: for a reply alone, whose ownership is checked before its size. */
export function decodeAny(detail: unknown): Record<string, unknown> | null {
  if (typeof detail !== "string") return null;
  try {
    const parsed = JSON.parse(detail);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function decode(detail: unknown): Record<string, unknown> | null {
  if (typeof detail !== "string" || detail.length > MAX_DETAIL_BYTES) return null;
  return decodeAny(detail);
}

const str = (v: unknown): v is string => typeof v === "string";

/**
 * The forgery defence (extension-distribution.md §9.5), and the card detail's version point: a field the panel sends
 * and this gate does not know is a card that never crosses, so the two change together (#361).
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

export const EVENT_BY_KIND: readonly [EventKind, string][] = [
  ["card", EVENT.card],
  ["coach-error", EVENT.coachError],
];

export function eventBody(kind: EventKind, d: Record<string, unknown>): Record<string, unknown> | null {
  return kind === "card" ? cardBody(d) : coachErrorBody(d);
}
