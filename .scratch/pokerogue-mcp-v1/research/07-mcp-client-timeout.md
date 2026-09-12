# 07 — The MCP client's tool-call timeout and progress notifications

Ticket: [#20](https://github.com/IIxauII/pokerogue-mcp/issues/20). Question: is `CALL_BUDGET_MS = 30 000` really under the client's tool-call timeout, and do progress notifications (planned after `NO_PROGRESS_NOTICE_MS = 6 000` of no settle progress) buy extra time?

**Short answer.** Yes, 30 s is far below every default limit in Claude Code 2.1.269. Progress notifications do **not** extend Claude Code's hard per-call limit. They only reset a separate idle watchdog, which defaults to 30 min for stdio. At a 30 s budget, progress only changes the spinner text. The real risks are a user-set `MCP_TOOL_TIMEOUT` below 30 s, and the 120 s auto-background threshold if the budget ever grows. Both have cheap fixes (see the last section).

## Sources and tags

| Tag | Source |
|---|---|
| [spec] | MCP specification, spec repo `modelcontextprotocol/modelcontextprotocol` @ `aa8ce049`. Claude Code negotiates **`2025-11-25`** ([live] `initialize.params.protocolVersion`), so that revision governs: `docs/specification/2025-11-25/basic/lifecycle.mdx` §Timeouts (L246–261), `basic/utilities/progress.mdx`, `basic/utilities/cancellation.mdx`. The newest revision, `2026-07-28`, moves §Timeouts into `basic/patterns/cancellation.mdx` (L45–64) with the same MAY-reset / SHOULD-cap wording, and adds that on stdio the client **MUST** send `notifications/cancelled`. |
| [sdk@1.30.0] | `@modelcontextprotocol/sdk` 1.30.0 (npm gitHead `2d889f2b329e46680ec9bdd565de4616c497825a`), `src/shared/protocol.ts`: https://github.com/modelcontextprotocol/typescript-sdk/blob/2d889f2b329e46680ec9bdd565de4616c497825a/src/shared/protocol.ts |
| [docs] | https://code.claude.com/docs/en/mcp (fetched 2026-09-12), sections on tool timeouts, idle timeout, and automatic backgrounding. The env-vars page as fetched did not list the MCP timeout vars. |
| [bundle 2.1.269] | The installed client `/opt/homebrew/Caskroom/claude-code@latest/2.1.269/claude`, a Mach-O Bun single-file binary. Searched via `strings -n 8` plus `07-probes/bundle-ctx.py`. Snippets are minified; the binary contains two copies of the call path (`Jt`/`kr`/`mo` and `Lo`/`Gr`) with identical logic. The bundled MCP SDK is newer than 1.30.0 (its errors are named `SdkError`), but `request()`/`_setupTimeout`/`_onprogress` are the same code. |
| [live] | Headless `claude -p --model haiku --strict-mcp-config` driving `07-probes/probe-server.mjs` (SDK 1.30.0 server) via `07-probes/run-case.sh`. The server taps raw stdin and logs `_meta`, `notifications/cancelled`, and `extra.signal` aborts. Run on 2026-09-12, Claude Code 2.1.269, macOS. |

---

## 1. Default tool-call timeout and its knobs

**Facts**

- There are **three independent clocks** on a stdio tool call, plus a startup timeout that has nothing to do with tool calls:

  | Clock | Knob | Default (stdio) | Progress resets it? |
  |---|---|---|---|
  | **Hard wall-clock per call** | per-server `timeout` (ms, ≥1000) > `MCP_TOOL_TIMEOUT` > default | **1e8 ms ≈ 27.8 h**, clamped to [1000, 2^31−1] | **No** |
  | **Idle watchdog** (no response *and* no progress) | `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` (0 disables); floored by per-server `timeout` | **1 800 000 ms = 30 min** (remote: 5 min; IDE/SDK in-process: off) | **Yes** |
  | **Auto-background** (call leaves the blocking turn; nothing is cancelled) | `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` (0 disables) | **120 000 ms**, interactive main conversation only | n/a |
  | Server startup | `MCP_TIMEOUT` | 30 000 ms | n/a |

- Hard timeout resolution [bundle 2.1.269]:
  ```js
  var io=1e8, ...
  function kr(e){let n=(e?.timeout!==void 0&&e.timeout>=1000?e.timeout:void 0)??a.MCP_TOOL_TIMEOUT??io;return Math.min(Math.max(n,1000),Nh)}
  ... Nh=2147483647;
  ```
  [docs]: "Values below 1000 are ignored and fall through to `MCP_TOOL_TIMEOUT`, or to its default of about 28 hours when that variable is unset."
- **`MCP_TIMEOUT` is distinct**. It is the server startup/connect timeout [bundle 2.1.269]:
  `function dc(){let n=a.MCP_TIMEOUT;return n&&n>0?Math.min(n,2147483647):30000}` [docs]: "Configure MCP server startup timeout using the `MCP_TIMEOUT` environment variable". It only touches tool calls on HTTP/SSE, where the per-request fetch timer is `max(60 s, tool timeout, MCP_TIMEOUT)`. Stdio has no such timer [docs; bundle `jo`/`Fr`].
- **Per-server equivalent exists**: a `timeout` field (ms) on the server entry in `.mcp.json` / `--mcp-config` / user config. The schema allows it on `stdio`, `sse` and `http` [bundle 2.1.269]:
  > `TF="Per-server tool-call timeout in milliseconds. Overrides the MCP_TOOL_TIMEOUT environment variable for this server. Hard wall-clock limit per call; progress notifications do not extend it. Values below 1000ms are ignored (falls through to MCP_TOOL_TIMEOUT or the default)."` … `hle=f(()=>u({type:R("stdio").optional(),command:o(),args:…,env:…,timeout:xi(),…`

  `claude mcp add` has no `--timeout` flag. Use `claude mcp add-json` or edit the JSON [live `claude mcp add --help`]. Environment variables can also be set in settings.json `env` (standard Claude Code mechanism; not separately verified here).
- Idle window [bundle 2.1.269]:
  ```js
  var lo=300000,uo=1800000,po=new Set(["sse-ide","ws-ide","sdk"]);
  function mo(e){let r=e?.type??"stdio";if(po.has(r))return 0;let n=a.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT??(r==="stdio"?uo:lo);if(n<=0)return 0;let s=e?.timeout!==void 0&&e.timeout>=1000?e.timeout:0;return Math.min(Math.max(n,s,1000),kr(e))}
  ```
  It is checked by a `setInterval(…,30000)` watchdog. An idle abort therefore lands on the first 30 s tick after the window expires. [live D]: window 5 s, abort reported "for 30s".
- [live A, B, C, G] confirm the knobs: `MCP_TOOL_TIMEOUT=5000` → abort at 5.0 s. Per-server `"timeout": 5000` → abort at 5.0 s. Per-server `"timeout": 60000` beats `MCP_TOOL_TIMEOUT=5000` → a 10 s call succeeds. [live F]: with no knobs, a 35 s silent call succeeds.

## 2. Does `notifications/progress` reset the client's timeout?

**Spec** [spec 2025-11-25 lifecycle §Timeouts L257–261]: "Implementations **MAY** choose to reset the timeout clock when receiving a progress notification … However, implementations **SHOULD** always enforce a maximum timeout, regardless of progress notifications". This is per implementation.

**SDK** [sdk@1.30.0]: resetting is opt-in. `RequestOptions.resetTimeoutOnProgress?: boolean` (L136) defaults to false (`options?.resetTimeoutOnProgress ?? false`, `_setupTimeout` call L1218). `maxTotalTimeout?: number` (L143) is only consulted inside `_resetTimeout` (L576). `_onprogress` (L856) resets only `if (timeoutInfo && responseHandler && timeoutInfo.resetTimeoutOnProgress)`. With no `timeout` option, the SDK uses `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000` (L106). Claude Code always passes `timeout`, so that default never applies.

**Claude Code** [bundle 2.1.269]: it calls the SDK **without** `resetTimeoutOnProgress` or `maxTotalTimeout`. It also races the SDK call against its **own** `setTimeout` for the same duration:
```js
let pe=kr(n),oe,se=new Promise((me,ie)=>{oe=setTimeout((V,Ee,we,Z)=>{V(Object.assign(new k(`MCP server "${Ee}" tool "${we}" timed out after ${Math.floor(Z/1000)}s`,"MCP tool timeout"),…))},pe,ie,r,d,pe)}),
…,R=await Promise.race([ae.callTool({name:d,arguments:u,_meta:m},aU,{signal:C,timeout:pe,onprogress:(me)=>{if(w.armedAt=0,K=Date.now(),v)v({type:"mcp_progress",status:"progress",serverName:r,toolName:d,progress:me.progress,total:me.total,progressMessage:me.message})}}),se,z]).finally(Me);
```
`onprogress` does two things: it sets `K` (the idle watchdog's last-activity time) and it emits a UI `mcp_progress` event. It touches neither timer that enforces `pe`. The per-server `timeout` description, quoted above, states this outright, and [docs] repeats it: "progress notifications from the server don't extend it."

**Does Claude Code send a `progressToken`?** Yes, on every call. Passing `onprogress` makes the SDK inject `_meta.progressToken = messageId` (sdk@1.30.0 L1135–1144). [live, all cases] Each `tools/call` arrived with `"_meta":{"claudecode/toolUseId":"toolu_…","progressToken":2}`.

**[live]**

| Case | Config | Tool | Result the model saw | Wire |
|---|---|---|---|---|
| A | `MCP_TOOL_TIMEOUT=5000` | sleep 10 s, no progress | `is_error:true` · `MCP server "probe" tool "sleep" timed out after 5s` | `notifications/cancelled` at +5.016 s, reason `SdkError: Request timed out` |
| B | `MCP_TOOL_TIMEOUT=5000` | sleep 10 s, **progress every 1 s** (4 sent) | same error at 5 s. **Progress did not extend it.** | cancelled at +5.006 s |
| C | per-server `"timeout":5000` | sleep 10 s, progress every 1 s | same error at 5 s | cancelled at +5.007 s |
| D | `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=5000` | sleep 45 s, silent | `is_error:true` · `MCP server "probe" tool "sleep" sent no response or progress for 30s; aborting. If this server is configured in your MCP settings, set a per-server "timeout" (ms) to allow longer silent runs for just this server; otherwise set CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT (ms) globally (0 disables).` | **no `notifications/cancelled` sent** |
| E | `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=5000` | sleep 45 s, progress every 1 s | success `slept 45000ms, sent 44 progress notifications`. **Progress does reset the idle watchdog.** | — |
| F | defaults | sleep 35 s, silent | success | — |
| G | per-server `"timeout":60000` + `MCP_TOOL_TIMEOUT=5000` + idle 5000 | sleep 10 s, silent | success (per-server overrides env) | — |

## 3. Is there a maximum beyond which progress stops helping?

**Facts.** For the hard clock, progress never helps; the cap is simply the configured `timeout` (default ≈27.8 h, hard ceiling 2^31−1 ms ≈ 24.8 days) [bundle 2.1.269]. For the idle clock, progress helps indefinitely, up to the hard clock (`Math.min(…, kr(e))`). Claude Code does not use `maxTotalTimeout`. The spec's "SHOULD enforce a maximum" is met by the non-resettable hard timeout itself [inference].

A different limit matters before either one. In an **interactive** session's main conversation, a call still running after **120 s** is **auto-backgrounded** [bundle 2.1.269 `callMcpToolWithAutoBackground`; docs]. The call keeps running, and the model immediately gets this tool result:
> `MCP tool "<desc>" is still running after ${j}s. It was moved to the background as task ${r} and keeps running; you'll receive a notification with the result when it completes. You can keep working in the meantime. To stop it, use TaskStop with task_id "${r}". Note: it does not survive exiting this session.`

Exceptions: subagents, IDE servers, and non-interactive `-p` runs unless `CLAUDE_AUTO_BACKGROUND_TASKS=1`:
`function ue(e,{isNonInteractiveSession:n=!1}={}){…if(n&&!a.CLAUDE_AUTO_BACKGROUND_TASKS)return 0;let s=a.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS;if(s!==void 0)return Math.min(Math.max(0,s),Nh);return H("tengu_mcp_auto_background",!0)?V:0}` with `V=120000`. The default is gated by a feature flag that defaults to on. Progress does not delay backgrounding (the timer is `Q(x, …)` against settle only). For a game driver this is as bad as a timeout: the model is invited to keep pressing while the earlier press is still settling [inference].

## 4. Emitting progress from a tool handler (SDK)

**Facts** [sdk@1.30.0]:
- The handler receives `extra: RequestHandlerExtra` with `signal: AbortSignal` (L241), `_meta` (the request's `params._meta`, so `extra._meta?.progressToken`), `requestId`, and `sendNotification` (L738).
- Emit:
  ```ts
  const token = extra._meta?.progressToken;
  if (token !== undefined) {
    await extra.sendNotification({ method: "notifications/progress",
      params: { progressToken: token, progress: n, total, message } });
  }
  ```
  `sendNotification` sets `relatedRequestId: request.id` and is a silent no-op once `extra.signal` has aborted (`if (abortController.signal.aborted) return;`, L739). [live B/C] shows calls after the cancel logged `aborted:true` and nothing was written.
- **No token → do not send.** [spec progress]: notifications "**MUST** only reference tokens that were provided in an active request". The SDK does not guard this. If a client gets an unknown token, its SDK `_onprogress` calls `_onerror("Received a progress notification for an unknown token")` and drops it (sdk@1.30.0 L856–862). Claude Code always sends a token, so the guard exists for other clients.
- `progress` **MUST** increase on each notification; `total` and `message` are optional; both sides **SHOULD** rate-limit; notifications **MUST** stop after completion [spec progress].
- **Cost**: one JSON-RPC line on stdout per notification. On the Claude Code side, each one runs `onprogress`: it resets the idle timestamp and emits a UI `mcp_progress` event that updates the spinner/progress message [bundle 2.1.269]. It never enters the model's context [inference from code path: the event goes to the UI callback `v`, not the tool result]. It is negligible at ≤1 Hz.

## 5. What happens on timeout

**Hard timeout** (facts: [bundle 2.1.269], [sdk@1.30.0], [live A/B/C])
- Claude Code's own race timer and the SDK's request timer fire at the same `pe`. The race rejects with Claude Code's error. The SDK timer runs `cancel()` (L1165–1185), which **sends `notifications/cancelled`** `{requestId, reason: "SdkError: Request timed out"}` and deletes the response/progress handlers. A late response is ignored.
- **The model sees** a tool_result with `is_error: true` and the content `MCP server "<server>" tool "<tool>" timed out after <N>s`. That is clearly a timeout, not a tool error. It says nothing about whether the tool's side effect happened.
- **Server side**: the SDK's `_oncancel` (L550) aborts the per-request `AbortController`, so **`extra.signal` fires** with the reason string ([live A/B/C] `abort_signal` at +1–2 ms after the cancel arrived). The SDK then suppresses the handler's result/error response (`if (abortController.signal.aborted) return;`, L788/L815). **The handler itself keeps running** unless it watches `extra.signal`. [live B/C]: the loop kept going after the abort. Cancellation is cooperative ([spec]: servers "SHOULD stop processing", "MAY ignore … if the request cannot be cancelled").

**Idle timeout** (facts: [bundle 2.1.269], [live D])
- Claude Code rejects its race with the "sent no response or progress" error, and **no `notifications/cancelled` is sent**. The SDK request stays pending under its own ≈27.8 h timer. `extra.signal` does **not** fire. The server finishes, sends a response, and the SDK resolves a promise nobody awaits, so the result is silently dropped [inference from code; in D the `-p` process exited before the handler ended].

**User interrupt (Esc) / session abort** (source only, not live-tested): the tool-use `AbortSignal` is passed as `signal` to `callTool`. The SDK's abort listener runs `cancel(signal.reason)`, which sends `notifications/cancelled` [sdk@1.30.0 L1211–1213; bundle].

**Transport loss**: a separate watchdog aborts 90 s after a transport error with `MCP server "<s>" transport dropped mid-call; response for tool "<t>" was lost` [bundle 2.1.269].

**Server lifetime**: when the Claude Code process exits it sends SIGINT, then SIGTERM, then SIGKILL to the stdio server [bundle strings "Sending SIGINT to MCP server process" / "SIGINT failed, sending SIGTERM"]. [live A–D]: our server was killed before logging `handler_end` whenever `-p` exited mid-call.

---

## Facts vs. inference: what contradicts the ticket's framing

1. **There is no single "client timeout" for progress to reset.** Claude Code has a hard clock that progress never extends and an idle clock that progress does reset. The plan "start progress after 6 s so the client keeps waiting" rests on a reset the hard clock does not do (fact). It also isn't needed, because the defaults are 27.8 h and 30 min (fact).
2. **A client-side timeout is not literally indistinguishable from a failed press.** The model gets a distinctive `timed out after Ns` error (fact). The ticket's underlying worry still holds: the error says nothing about whether the press landed, and re-issuing would double-apply (inference, consistent with the design).
3. **Cancellation does not stop the server's work.** On a hard timeout the server gets `notifications/cancelled` and `extra.signal`, but the handler keeps running and its result is thrown away. On an **idle** timeout the server is not told at all (fact). Any timeout-shaped outcome must leave the game in a state the next call can read honestly. The existing "waiting is resumable via a call that presses nothing" design already fits.
4. **A limit the ticket didn't consider: auto-backgrounding at 120 s** in interactive sessions (fact). It is harmless at 30 s. It would matter if the budget were raised past about 110 s.
5. The installed client negotiates spec **2025-11-25**, not the newest `2026-07-28` (fact).

## What this changes for CALL_BUDGET_MS / NO_PROGRESS_NOTICE_MS / packaging

**CALL_BUDGET_MS = 30 000: keep it.** It is under every default limit with a large margin: hard 27.8 h, idle 30 min, auto-background 120 s, and 30 s startup (which doesn't apply to calls). Record the constraint it must satisfy: `CALL_BUDGET_MS + response overhead < min(effective tool timeout, 120 000 auto-background)`. The only realistic way to break it is a user- or org-set `MCP_TOOL_TIMEOUT` below about 35 s.

**Packaging: pin a per-server `timeout` in the documented install config.** Recommend `"timeout": 60000` in the `.mcp.json` / `claude mcp add-json` snippet. It is at least 2× the budget and well below the 120 s auto-background threshold.
- It **overrides** any global `MCP_TOOL_TIMEOUT` a user set lower, for this server only ([live G]).
- It **floors the idle watchdog** at 60 s, so even an aggressive global `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` can't abort a silent 30 s settle.
- It lowers our hard cap from ≈27.8 h to 60 s. That is harmless because the server self-bounds at 30 s, and useful: a wedged server fails in a minute instead of hanging a session.
- The server cannot read the per-server `timeout` field. It can read `MCP_TOOL_TIMEOUT` from its environment when that value was inherited (fact: [live G] shows the variable reached the server because it was in the launching process's env; whether settings.json `env` reaches it was not tested). Optional defence: at boot, if `MCP_TOOL_TIMEOUT` is set and ≤ `CALL_BUDGET_MS + 5 000`, clamp the budget or log a warning. This is low priority once the config pins `timeout`.

**NO_PROGRESS_NOTICE_MS = 6 000: demote from load-bearing to a UI nicety.** Progress does not buy time against the hard clock (fact). Against the idle clock (30 min default, or a ≥60 s floor with the pinned `timeout`), a 30 s call never needs it. If kept, it only updates Claude Code's spinner message ("settling… 12 s, no progress"), which costs almost nothing and helps a watching human. If kept: guard on `extra._meta?.progressToken !== undefined`, make `progress` strictly increasing (e.g. elapsed ms), send at most about 1 Hz, and stop before returning. Dropping it entirely loses nothing functional.

**Handler behaviour on cancel (new, follows from §5):**
- Watch `extra.signal` in the settle loop and stop *waiting* when it aborts. A press already delivered cannot be undone, and the next call reads the settled state honestly.
- Don't rely on cancellation arriving: idle aborts send none, and exits kill the process.
- Optionally remember "request N was cancelled mid-settle after press X" so the next (press-nothing) call can say so. The model's view is then `timed out after Ns` → resumable wait → the truth.

## Probes

`07-probes/`:
- `probe-server.mjs`: SDK 1.30.0 stdio server with one tool, `sleep({ms, progress_every_ms})`. It logs raw stdin, `_meta`, abort, progress and handler end to `$PROBE_LOG`, and deliberately ignores cancellation.
- `run-case.sh <name> <ms> <every> <per-server-timeout|-> [ENV=VAL…]`: one bounded headless `claude -p --model haiku --strict-mcp-config --output-format stream-json` run. It extracts the exact model-visible `tool_result`.
- `smoke.sh`: drives the probe server by hand (no Claude Code) with a mid-flight `notifications/cancelled`.
- `bundle-ctx.py`: de-duplicated context around a literal in the `strings` dump of the Claude Code binary.
- `fetch-spec.sh`: pulls the cited spec pages at a pinned spec-repo commit. `sdk-lines.sh`: line refs into SDK `protocol.ts` at the 1.30.0 gitHead.

Setup assumed by the scripts: `npm i @modelcontextprotocol/sdk@1.30.0 zod` in `/tmp/cc7/run` (not added to the repo), plus `strings -n 8 <claude binary> > /tmp/cc7/s.txt`.
