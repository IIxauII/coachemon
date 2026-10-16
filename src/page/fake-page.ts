import { disc } from "./disc.ts";
import { dispatch } from "./dispatch.ts";
import { COMMAND_HANDLERS } from "./handlers.ts";
import { fine } from "./fine.ts";
import { locate } from "./locate.ts";
import { PAGE_MODES } from "./modes.ts";
import { STORE_COMMANDS, type Args, type CommandName } from "../protocol/commands.ts";

type Globals = { Phaser?: unknown; document?: unknown };

/** `phaser`: the rest of the page's `Phaser` global, beside the canvas pool the locator walks. */
export function onPage(t: { after: (fn: () => void) => void }, scene: Record<string, unknown>, game: Record<string, unknown> = {}, phaser: Record<string, unknown> = {}): void {
  const g = globalThis as Globals;
  const prev = { Phaser: g.Phaser, document: g.document };
  const theGame = { isBooted: true, isRunning: true, scene: { getScene: (key: string) => (key === "battle" ? scene : null) }, ...game };
  g.Phaser = { ...phaser, Display: { Canvas: { CanvasPool: { pool: [{ parent: { game: theGame } }] } } } };
  // A tab without the touch-controls element, which the probe reads for its DOM mode.
  g.document = { getElementById: () => null };
  t.after(() => {
    g.Phaser = prev.Phaser;
    g.document = prev.document;
  });
}

export function offPage(t: { after: (fn: () => void) => void }): void {
  const g = globalThis as Globals;
  const prev = { Phaser: g.Phaser, document: g.document };
  delete g.Phaser;
  g.document = { getElementById: () => null };
  t.after(() => {
    g.Phaser = prev.Phaser;
    g.document = prev.document;
  });
}

export function send<N extends CommandName>(name: N, args: Args<N>): any {
  return dispatch(locate, fine, disc, COMMAND_HANDLERS[name], name, STORE_COMMANDS[name].kind, PAGE_MODES, args);
}

/**
 * The 1.12.1.1 starter grid: 81 on-screen containers re-filled by `updateScroll` from `filteredStarterIds`, the cursor
 * an index into them. `setSpecies` looks the species up before it reads `props` and then adds a sprite, the game's
 * order (`src/ui/containers/starter-container.ts` in the clone); `sprites` counts what reached the scene.
 */
export function starterGrid(names: Record<number, string>, ids: number[], at: { cursor?: number; scrollCursor?: number; party?: number[] } = {}) {
  const sprites = { added: 0 };
  class StarterContainer {
    species: { name: string; speciesId: number } | undefined;
    icon: unknown;
    setSpecies(id: number, props: { shiny: boolean }) {
      this.species = { name: names[id], speciesId: id };
      const { shiny } = props;
      sprites.added++;
      this.icon = { shiny };
    }
  }
  const containers = Array.from({ length: 81 }, () => new StarterContainer());
  const shown = (visible: boolean) => ({ visible, setVisible(v: boolean) { this.visible = v; return this; } });
  const party = at.party ?? [];
  const h = {
    active: true,
    filterMode: false,
    cursor: at.cursor ?? 0,
    scrollCursor: at.scrollCursor ?? 0,
    filteredStarterIds: ids,
    starterContainers: containers,
    partyStarterIds: party,
    partyStarters: party.map(speciesId => ({ speciesId, passive: false, abilityIndex: 0, formIndex: 0 })),
    valueLimitLabel: { text: "3/10" },
    cursorObj: shown(true),
    partyCursorObj: shown(false),
    startCursorObj: shown(false),
    randomCursorObj: shown(false),
    isPartyValid: () => true,
    updateScroll() {
      containers.forEach((c, i) => {
        const id = ids[h.scrollCursor * 9 + i];
        if (id !== undefined) c.setSpecies(id, { shiny: false });
      });
    },
    setCursor(cursor: number) {
      h.cursor = Math.max(Math.min(containers.length - 1, cursor), 0);
      return true;
    },
  };
  h.updateScroll();
  sprites.added = 0;
  return { h, sprites };
}
