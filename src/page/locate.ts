import type { Discriminators } from "./disc.ts";
import type { PageModes } from "./modes.ts";

/** A game object from the page: untyped, every path guarded where it is read. */
export type Page = any;

export type LocatorWhy = "no-phaser" | "empty-pool" | "no-game-in-pool" | "not-booted" | "no-battle-scene";

export type Scene = { ready: true; game: Page; scene: Page; ui: Page };
export type Unlocated = { ready: false; why: LocatorWhy };

export type Located = Scene & PageModes & { fine: () => string; disc: (h: Page) => Discriminators };

/**
 * Never `pool[0]`, never `scenes[0]`, never cached: rediscovered on every command (#9, v1-tool-surface.md §1). The HUD
 * keeps its own copy, and a change lands in both (extension-distribution.md §10.5). Self-contained (§10.5).
 */
export function locate(): Scene | Unlocated {
  const P = (globalThis as Page).Phaser;
  if (!P || !P.Display || !P.Display.Canvas || !P.Display.Canvas.CanvasPool) return { ready: false, why: "no-phaser" };
  const pool = P.Display.Canvas.CanvasPool.pool;
  if (!Array.isArray(pool) || pool.length === 0) return { ready: false, why: "empty-pool" };
  let game = null;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i] && pool[i].parent;
    if (p && p.game && p.game.scene) { game = p.game; break; }
  }
  if (!game) return { ready: false, why: "no-game-in-pool" };
  if (!game.isBooted || !game.isRunning) return { ready: false, why: "not-booted" };
  const scene = game.scene.getScene("battle");
  if (!scene || !scene.ui) return { ready: false, why: "no-battle-scene" };
  return { ready: true, game, scene, ui: scene.ui };
}
