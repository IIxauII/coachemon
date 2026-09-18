import assert from "node:assert/strict";
import test from "node:test";
import { serverEnv } from "./server-env.ts";

const env = (o: Record<string, string | undefined>) => serverEnv(o as NodeJS.ProcessEnv);

test("the two variables that pick the transport and the port reach the server (§7.2, §12.1)", () => {
  const out = env({ COACHEMON_TRANSPORT: "hub", COACHEMON_DEV: "1", PATH: "/bin" });
  assert.equal(out.COACHEMON_TRANSPORT, "hub");
  assert.equal(out.COACHEMON_DEV, "1");
});

test("a server still gets what any process needs", () => {
  const out = env({ PATH: "/bin", HOME: "/Users/x", TERM: "xterm" });
  assert.deepEqual(out, { PATH: "/bin", HOME: "/Users/x", TERM: "xterm" });
});

test("nothing else crosses: a spawned server is not handed the whole environment", () => {
  const out = env({ AWS_SECRET_ACCESS_KEY: "sh", GITHUB_TOKEN: "gh", PATH: "/bin" });
  assert.deepEqual(Object.keys(out), ["PATH"]);
});

test("an exported shell function is skipped, as the SDK's own default skips it", () => {
  assert.deepEqual(env({ COACHEMON_DEV: "() { :; }" }), {});
});

test("an unset variable is absent rather than the string `undefined`", () => {
  assert.deepEqual(env({ COACHEMON_TRANSPORT: undefined, PATH: "/bin" }), { PATH: "/bin" });
});
