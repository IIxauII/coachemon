import type { Registry } from "../check.ts";
import { HARNESS } from "./harness.ts";
import { HUD } from "./hud.ts";
import { PAGE } from "./page.ts";
import { SERVER } from "./server.ts";

export const REGISTRY: Registry = { page: PAGE, server: SERVER, hud: HUD, harness: HARNESS };
