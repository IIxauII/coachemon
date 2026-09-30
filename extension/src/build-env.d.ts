declare const COACHEMON_BUILD: string;
/**
 * The whole URL, never built from a port: the guard wants `ws://127.0.0.1:47147/` literally in a store artifact and the
 * dev port nowhere (extension-distribution.md §5.5).
 */
declare const COACHEMON_HUB_URL: string;
declare const COACHEMON_TARGET: "chrome" | "firefox" | "safari";
declare const COACHEMON_FLAVOUR: "store" | "dev";
declare const COACHEMON_VERSION: string;
