import { homedir } from "node:os";
import path from "node:path";

export function coachemonHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.COACHEMON_HOME ?? path.join(homedir(), ".coachemon");
}
