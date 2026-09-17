/**
 * The compile-time constants `wxt.config.ts` injects with `define` (§5.2). The hub URL is defined as the whole string
 * rather than built from a port, so a store artifact contains `ws://127.0.0.1:47147/` literally and never the dev
 * port at all — which is exactly what the guard checks (§5.5).
 */
declare const COACHEMON_BUILD: string;
declare const COACHEMON_HUB_URL: string;
declare const COACHEMON_TARGET: "chrome" | "firefox" | "safari";
declare const COACHEMON_FLAVOUR: "store" | "dev";
declare const COACHEMON_VERSION: string;
