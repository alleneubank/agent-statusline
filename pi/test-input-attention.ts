import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock } from "bun:test";

mock.module("@earendil-works/pi-tui", () => ({ truncateToWidth: (text: string) => text }));

const work = mkdtempSync(join(tmpdir(), "pi-attention-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));
process.env.HOME = work;
process.env.AGENT_STATUSLINE_BIN = "";
const log = join(work, "calls");
const broker = join(work, "soxd");
writeFileSync(broker, `#!/bin/sh
printf '%s\\n' "$*" >> '${log}'
n=$(wc -l < '${log}' | tr -d ' ')
while [ ! -f '${work}/release-'"$n" ]; do sleep 0.01; done
`);
chmodSync(broker, 0o755);
process.env.SOX_ATTENTION_BIN = broker;
process.env.PATH = "/usr/bin:/bin";
delete process.env.SOX_ATTENTION_DEBUG;

const { default: extension } = await import("./agent-statusline.ts");

type Handler = (event: unknown, ctx: ReturnType<typeof context>) => void | Promise<void>;
const handlers = new Map<string, Handler>();
const busHandlers = new Map<string, (data: unknown) => void>();
const pi = {
  on(name: string, handler: Handler) {
    handlers.set(name, handler);
    return () => handlers.delete(name);
  },
  events: {
    on(name: string, handler: (data: unknown) => void) {
      busHandlers.set(name, handler);
      return () => busHandlers.delete(name);
    },
  },
};

let sessionId = "session-a";
function context() {
  return {
    mode: "print" as const,
    sessionManager: { getSessionId: () => sessionId },
  } as never;
}

extension(pi as never);
const emit = (name: string, event: unknown = {}) => handlers.get(name)?.(event, context());
const input = (data: unknown) => busHandlers.get("pi:user-input")?.(data);
const request = (type: "opened" | "closed", requestId: string, eventSession = sessionId) => ({
  type,
  requestId,
  sessionId: eventSession,
  toolName: "questionnaire",
  summary: "Questionnaire needs your input",
});
const states = () => {
  try {
    return readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => line.replace(/^attention /, ""));
  } catch {
    return [];
  }
};
async function waitForCount(count: number) {
  const deadline = Date.now() + 1000;
  while (states().length < count) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for invocation ${count}`);
    await Bun.sleep(5);
  }
}
async function release(number: number, nextCount?: number) {
  writeFileSync(join(work, `release-${number}`), "");
  if (nextCount) await waitForCount(nextCount);
}
function check(label: string, expected: string[]) {
  const actual = states();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
  console.log(`[ok] ${label}`);
}

emit("session_start");
emit("agent_start");
await waitForCount(1);
input(request("opened", "one"));
emit("tool_execution_start");
check("blocked waits behind an in-flight working write", ["--state working"]);
await release(1, 2);
check("blocked is submitted before coalesced heartbeats", ["--state working", "--state blocked --reason Input required"]);
await release(2);
check("tool heartbeat cannot replace blocked", ["--state working", "--state blocked --reason Input required"]);

input(request("opened", "one"));
input(request("closed", "missing"));
input(request("closed", "one", "old-session"));
check("duplicate, unmatched, and stale events are ignored", ["--state working", "--state blocked --reason Input required"]);

input(request("opened", "two"));
input(request("closed", "one"));
check("one close leaves the other request blocked", ["--state working", "--state blocked --reason Input required"]);
input(request("closed", "two"));
await waitForCount(3);
check("final matching close becomes working", ["--state working", "--state blocked --reason Input required", "--state working"]);
await release(3);

input(request("opened", "replace"));
await waitForCount(4);
check("new request blocks", ["--state working", "--state blocked --reason Input required", "--state working", "--state blocked --reason Input required"]);
const shutdown = emit("session_shutdown");
input(request("closed", "replace", "session-a"));
await release(4, 5);
check("shutdown clears and replacement ignores old-session close", [
  "--state working",
  "--state blocked --reason Input required",
  "--state working",
  "--state blocked --reason Input required",
  "--clear",
]);
await release(5);
await shutdown;
sessionId = "session-b";
emit("session_start");
input(request("closed", "replace", "session-a"));

input({ type: "opened", requestId: "bad", sessionId, toolName: "questionnaire" });
check("invalid payload is ignored", [
  "--state working",
  "--state blocked --reason Input required",
  "--state working",
  "--state blocked --reason Input required",
  "--clear",
]);

input(request("opened", "settle"));
await waitForCount(6);
emit("agent_settled");
await release(6, 7);
if (states().at(-1) !== "--state done") throw new Error("settled run retained a blocked request");
await release(7);
const finalShutdown = emit("session_shutdown");
await waitForCount(8);
await release(8);
await finalShutdown;

console.log("input attention: all assertions passed");
