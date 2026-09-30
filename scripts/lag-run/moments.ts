/** The moments a lag-run comparison is taken per (#484), read off one hub action and the messages it crossed. */
import type { Action } from "./policy.ts";

export const MOMENTS = ["switch", "levelup", "shop", "faint"] as const;
export type Moment = (typeof MOMENTS)[number];

export const MOMENT_NAMES: Record<Moment, string> = {
  switch: "trainer fight + switch-out",
  levelup: "wave end + level-up/learn",
  shop: "shop pick",
  faint: "faint + replacement",
};

export function momentsOf(x: { intent?: Action["intent"]; messages: string[]; trainer: boolean }): Moment[] {
  const said = (re: RegExp) => x.messages.some(m => re.test(m));
  const out: Moment[] = [];
  if (x.trainer && (x.intent === "switch" || said(/withdrew/i))) out.push("switch");
  if (x.intent === "learn" || said(/grew to/i) || said(/learned/i)) out.push("levelup");
  if (x.intent === "shop") out.push("shop");
  if (x.intent === "replace" || x.messages.some(m => /fainted!/.test(m) && !/^(Wild|Foe) /.test(m))) out.push("faint");
  return out;
}
