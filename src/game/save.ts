import { createDecipheriv, createHash } from "node:crypto";

/** The game's own JSON, as its save holds it (game-code.md §29). */
export type Save = Record<string, unknown>;

/** A pin bump that moves it leaves every copy unopened, so the wave-start save reads as missing (game-code.md §29). */
// @mirrors save-key
const SAVE_KEY = Buffer.from("x0i2O7WRiANTqPmZ");
// @mirrors salted
const SALTED = Buffer.from("Salted__");

export function waveStartSave(stored: readonly string[], live: { seed: unknown; wave: number }): Save | null {
  const ours = stored.map(decrypt).filter(s => s !== null && s.seed === live.seed) as Save[];
  return ours.find(s => s.waveIndex === live.wave) ?? ours[0] ?? null;
}

/** The game's `encrypt`, reversed (game-code.md §29). Null for anything else, a `bypassLogin` build's `btoa` copy included. */
function decrypt(stored: string): Save | null {
  const raw = Buffer.from(stored, "base64");
  if (raw.length <= 16 || !raw.subarray(0, 8).equals(SALTED)) return null;
  const salt = raw.subarray(8, 16);
  const blocks: Buffer[] = [];
  let prev = Buffer.alloc(0);
  while (blocks.length < 3) blocks.push((prev = createHash("md5").update(Buffer.concat([prev, SAVE_KEY, salt])).digest()));
  const keyIv = Buffer.concat(blocks);
  try {
    const d = createDecipheriv("aes-256-cbc", keyIv.subarray(0, 32), keyIv.subarray(32, 48));
    const save: unknown = JSON.parse(Buffer.concat([d.update(raw.subarray(16)), d.final()]).toString("utf8"));
    return typeof save === "object" && save !== null && !Array.isArray(save) ? (save as Save) : null;
  } catch {
    return null;
  }
}
