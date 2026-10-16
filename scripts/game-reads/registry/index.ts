import type { Registry } from "../check.ts";
import { HARNESS } from "./harness.ts";
import { HUD } from "./hud.ts";
import { PAGE } from "./page.ts";
import { SERVER } from "./server.ts";
import { TEMPLATES } from "./templates.ts";

export const REGISTRY: Registry = { page: PAGE, server: SERVER, hud: HUD, harness: HARNESS, templates: TEMPLATES };

export const registryEntries = (registry: Registry): number =>
  Object.values(registry).reduce((n, a) => n + a.reads.length + (a.mirrors?.length ?? 0) + (a.sets?.length ?? 0), 0);
