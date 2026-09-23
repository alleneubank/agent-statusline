/**
 * agent-statusline extension for pi
 *
 * pi has no command-backed statusline contract (Claude Code `statusLine` /
 * Codex `custom_status_line`): the footer is driven by the extension API.
 * This adapter:
 *   1. Replaces pi's built-in footer (pwd + token stats lines) with a custom
 *      footer via `ctx.ui.setFooter()` whose single render line is the
 *      agent-statusline binary's output — location, git, model glyph, effort,
 *      context gauge, and 💬/💤 activity all on ONE line.
 *   2. Synthesizes a Codex/Claude-style statusline JSON payload from pi
 *      events, pipes it to the binary on stdin, and caches the rendered line
 *      for the footer.
 *
 * The Zig renderer owns the glyphs, effort badge, context gauge, auto-compact
 * tag, and git/location segments; this extension owns payload synthesis and
 * render timing instead of the host piped-in snapshot.
 *
 * Install (global):
 *   cp agent-statusline.ts ~/.pi/agent/extensions/agent-statusline.ts
 * Run once:
 *   pi -e /path/to/agent-statusline.ts
 *
 * The binary resolves the same way as the Claude/Codex plugin:
 *   AGENT_STATUSLINE_BIN env, then `statusline` on PATH (the released mise
 *   shim in the dotfiles fleet), then this checkout's zig-out/bin/statusline.
 */

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const BIN_TIMEOUT_MS = 1500;
// pi's CompactionSettings.reserveTokens default; `shouldCompact` triggers at
// contextWindow - reserveTokens (packages/coding-agent compaction.ts). Only a
// fallback — readCompactionSettings prefers the configured value.
const PI_COMPACTION_RESERVE_TOKENS_DEFAULT = 16384;

function resolveBinary(): string | undefined {
  const env = process.env.AGENT_STATUSLINE_BIN;
  if (env) return env;
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, "statusline");
    if (existsSync(candidate)) return candidate;
  }
  const fallback = join(
    homedir(),
    "0xbigboss",
    "agent-statusline",
    "zig-out",
    "bin",
    "statusline",
  );
  return existsSync(fallback) ? fallback : undefined;
}

const BIN = resolveBinary();

/**
 * pi's settings file, resolved the way pi's own `getAgentDir()` does:
 * $PI_CODING_AGENT_DIR (tilde-expanded) when set, else ~/.pi/agent.
 *
 * This previously read ~/.pi/settings.json, which pi has never written — so
 * the file never existed, every read fell through to the defaults, and a host
 * with compaction.enabled=false still rendered as auto-compacting.
 */
function piSettingsPath(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir) {
    const expanded = envDir.startsWith("~")
      ? join(homedir(), envDir.slice(1))
      : envDir;
    return join(expanded, "settings.json");
  }
  return join(homedir(), ".pi", "agent", "settings.json");
}

/** pi's auto-compaction settings; fail open to pi's built-in defaults. */
function readCompactionSettings(): { enabled: boolean; reserveTokens: number } {
  const defaults = {
    enabled: true,
    reserveTokens: PI_COMPACTION_RESERVE_TOKENS_DEFAULT,
  };
  try {
    const path = piSettingsPath();
    if (!existsSync(path)) return defaults;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      compaction?: { enabled?: boolean; reserveTokens?: number };
    };
    return {
      enabled: parsed.compaction?.enabled ?? defaults.enabled,
      reserveTokens:
        parsed.compaction?.reserveTokens ?? defaults.reserveTokens,
    };
  } catch {
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// Sox attention bridge
// ---------------------------------------------------------------------------
// pi has no hook system, so the sox command center only ever sees a pi surface
// if this extension is the emitter — sox attention is entirely submit-driven
// ("no cached envelope yet — it appears once the plugin emits"). This mirrors
// sox's claude-code plugin hook: broker resolution from SOX_ATTENTION_BIN with
// no PATH probing (never exec a wrong binary), state mapping working / done /
// clear, heartbeat on every tool boundary so a busy agent never ages into
// stale, and best-effort diagnostics under SOX_ATTENTION_DEBUG. Absence of sox
// on the host (unset var) is a silent no-op, not misconfiguration.

/** Resolve the soxd broker binary; `sox` (the user CLI) does NOT broker attention. */
function resolveAttentionBin(): string | undefined {
  const bin = process.env.SOX_ATTENTION_BIN;
  if (bin && bin.startsWith("/") && existsSync(bin)) return bin;
  return undefined;
}

type AttentionState = "working" | "done" | "blocked";
type AttentionCommand =
  | { kind: "state"; state: AttentionState; reason?: "Input required" }
  | { kind: "clear" };

type InputRequestEvent = {
  type: "opened" | "closed";
  requestId: string;
  sessionId: string;
  toolName: string;
  summary: string;
};

const INPUT_EVENT_STRING_MAX = 256;
const ACTIVE_INPUT_REQUESTS_MAX = 64;

function isInputRequestEvent(data: unknown): data is InputRequestEvent {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  const value = data as Record<string, unknown>;
  if (value.type !== "opened" && value.type !== "closed") return false;
  for (const field of ["requestId", "sessionId", "toolName", "summary"] as const) {
    const text = value[field];
    if (typeof text !== "string" || text.length === 0 || text.length > INPUT_EVENT_STRING_MAX) return false;
  }
  return true;
}

function attentionArgs(command: AttentionCommand): string[] {
  if (command.kind === "clear") return ["--clear"];
  return command.reason
    ? ["--state", command.state, "--reason", command.reason]
    : ["--state", command.state];
}

/** Run one best-effort `soxd attention` invocation; never throws, never blocks. */
function runAttention(command: AttentionCommand, onFinish: () => void): void {
  const bin = resolveAttentionBin();
  if (!bin) {
    onFinish();
    return;
  }
  const args = attentionArgs(command);
  let child;
  try {
    child = spawn(bin, ["attention", ...args], {
      stdio: "ignore",
      timeout: BIN_TIMEOUT_MS,
    });
  } catch {
    onFinish();
    return;
  }
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    onFinish();
  };
  child.on("error", finish);
  child.on("close", (code) => {
    finish();
    const debugLog = process.env.SOX_ATTENTION_DEBUG;
    if (!debugLog) return;
    try {
      appendFileSync(
        debugLog,
        `${new Date().toISOString()} [pid ${process.pid}] soxd attention ${args.join(" ")} rc=${code}\n`,
      );
    } catch {
      // Debug file unwritable: stay quiet.
    }
  });
}

/** Synthesize the statusline payload from pi's current context. */
function buildPayload(ctx: ExtensionContext): unknown {
  const usage = ctx.getContextUsage();
  const compaction = readCompactionSettings();
  return {
    hook_event_name: "Status",
    session_id: ctx.sessionManager.getSessionId() ?? "pi",
    version: "0.0.0",
    workspace: { current_dir: ctx.cwd, project_dir: ctx.cwd },
    model: ctx.model
      ? { id: ctx.model.id, display_name: ctx.model.name || ctx.model.id }
      : { id: "unknown", display_name: "unknown" },
    // Percentage-only context: the renderer then uses pi's own "how full am
    // I" answer verbatim (no reserve/ceiling re-basing, and no leak of
    // ~/.claude autoCompactWindow from a Claude Code install).
    context_window: usage
      ? {
          context_window_size: usage.contextWindow,
          used_percentage: usage.percent ?? 0,
        }
      : undefined,
    // pi has no autoCompactWindow concept; window mirrors pi's own
    // shouldCompact trigger so totals-shaped payloads (future producers)
    // position against the same ceiling pi compacts at.
    auto_compact: {
      enabled: compaction.enabled,
      window: usage ? usage.contextWindow - compaction.reserveTokens : null,
    },
    cost: { total_cost_usd: null, total_duration_ms: null },
    // pi has no goal concept; field kept for schema parity with Codex.
    goal: undefined,
    // pi thinking levels map 1:1 to the statusline effort tiers.
    effort: ctx.thinkingLevel ? { level: ctx.thinkingLevel } : undefined,
  };
}

export default function (pi: ExtensionAPI): void {
  /** Latest statusline line rendered by the binary; consumed by the footer. */
  let latestLine = "";
  /** Requests a TUI re-render once a fresh statusline line is cached. */
  let requestRender: (() => void) | undefined = undefined;
  let footerInstalled = false;
  let currentSessionId: string | undefined;
  const activeInputRequests = new Set<string>();
  let attentionInFlight = false;
  let pendingBlocked = false;
  let pendingAttention: AttentionCommand | undefined;
  let attentionIdle: Promise<void> | undefined;
  let resolveAttentionIdle: (() => void) | undefined;

  const submitAttention = (command: AttentionCommand): void => {
    if (attentionInFlight) {
      if (command.kind === "clear") {
        pendingBlocked = false;
      } else if (command.state === "blocked") {
        pendingBlocked = true;
      }
      pendingAttention = command;
      return;
    }

    attentionInFlight = true;
    runAttention(command, () => {
      attentionInFlight = false;
      let next: AttentionCommand | undefined;
      if (pendingBlocked) {
        next = { kind: "state", state: "blocked", reason: "Input required" };
        pendingBlocked = false;
        if (pendingAttention?.kind === "state" && pendingAttention.state === "blocked") {
          pendingAttention = undefined;
        }
      } else {
        next = pendingAttention;
        pendingAttention = undefined;
      }
      if (next) submitAttention(next);
      else {
        resolveAttentionIdle?.();
        attentionIdle = undefined;
        resolveAttentionIdle = undefined;
      }
    });
  };

  const submitAttentionState = (state: AttentionState): void => {
    if (activeInputRequests.size > 0) {
      submitAttention({ kind: "state", state: "blocked", reason: "Input required" });
      return;
    }
    submitAttention({ kind: "state", state });
  };

  /** Record prompt/idle activity into the binary's state dir (💬/💤 timestamps),
   * then render once the write has landed so the first frame of a turn shows
   * the new state instead of the stale one. The state file is written before
   * the hook process exits; spawn error or timeout still renders (fail open).
   * No-op without the renderer binary — attention still works independently. */
  const recordActivityThenRender = (event: "UserPromptSubmit" | "Stop", ctx: ExtensionContext): void => {
    if (!BIN) return;
    const child = spawn(BIN, ["activity-hook", event], {
      stdio: ["pipe", "ignore", "ignore"],
      timeout: BIN_TIMEOUT_MS,
    });
    const sessionId = ctx.sessionManager.getSessionId() ?? "pi";
    child.stdin?.end(JSON.stringify({ hook_event_name: event, session_id: sessionId }));
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      renderStatus(ctx);
    };
    child.on("close", finish);
    child.on("error", finish);
  };

  /** Spawn the binary with the current payload; cache its line for the footer. */
  const renderStatus = (ctx: ExtensionContext): void => {
    if (!BIN) return;
    // The ctx captured by an async callback (the activity-hook child's close)
    // goes stale once pi replaces or reloads the session; touching any ctx
    // getter then throws. A stale ctx means the session that wanted this
    // render is gone, so there is nothing to update — drop the render.
    let mode: ExtensionContext["mode"];
    try {
      mode = ctx.mode;
    } catch {
      return;
    }
    if (mode !== "tui") return; // footer only exists in TUI mode
    const child = spawn(BIN, [], {
      stdio: ["pipe", "pipe", "ignore"],
      timeout: BIN_TIMEOUT_MS,
    });
    let out = "";
    child.stdout?.on("data", (chunk) => (out += chunk.toString()));
    child.on("error", () => {
      // Binary missing or failed to spawn: keep the last good line.
    });
    child.on("close", () => {
      const line = out.trim();
      if (!line) return;
      latestLine = line;
      requestRender?.();
    });
    child.stdin?.end(JSON.stringify(buildPayload(ctx)));
  };

  pi.events.on("pi:user-input", (data) => {
    if (!isInputRequestEvent(data) || data.sessionId !== currentSessionId) return;
    if (data.type === "opened") {
      if (activeInputRequests.has(data.requestId) || activeInputRequests.size >= ACTIVE_INPUT_REQUESTS_MAX) return;
      const wasUnblocked = activeInputRequests.size === 0;
      activeInputRequests.add(data.requestId);
      if (wasUnblocked) submitAttentionState("blocked");
      return;
    }
    if (!activeInputRequests.delete(data.requestId)) return;
    if (activeInputRequests.size === 0) submitAttentionState("working");
  });

  pi.on("session_start", (_event, ctx) => {
    activeInputRequests.clear();
    currentSessionId = ctx.sessionManager.getSessionId();
    if (ctx.mode !== "tui") return;
    if (!footerInstalled) {
      footerInstalled = true;
      // Replace the built-in footer (pwd + token stats + statuses, three
      // lines) with a single-line footer carrying the agent-statusline.
      ctx.ui.setFooter((tui, theme) => {
        requestRender = () => tui.requestRender();
        return {
          invalidate() {},
          render(width: number): string[] {
            if (!latestLine) return [""];
            return [truncateToWidth(latestLine, width, theme.fg("dim", "…"))];
          },
        };
      });
    }
    renderStatus(ctx);
  });

  pi.on("model_select", (_event, ctx) => renderStatus(ctx));
  pi.on("thinking_level_select", (_event, ctx) => renderStatus(ctx));
  pi.on("turn_end", (_event, ctx) => renderStatus(ctx));
  pi.on("agent_start", (_event, ctx) => {
    submitAttentionState("working");
    recordActivityThenRender("UserPromptSubmit", ctx);
  });
  // Heartbeat on every tool boundary so a tool-churning agent never ages into
  // stale while the command center waits. Mirrors PreToolUse | PostToolUse.
  pi.on("tool_execution_start", () => submitAttentionState("working"));
  pi.on("agent_settled", (_event, ctx) => {
    activeInputRequests.clear();
    pendingBlocked = false;
    submitAttentionState("done");
    recordActivityThenRender("Stop", ctx);
  });
  pi.on("session_shutdown", async () => {
    activeInputRequests.clear();
    currentSessionId = undefined;
    submitAttention({ kind: "clear" });
    // Runtime replacement must wait for this emitter's last clear to finish.
    if (attentionInFlight) {
      attentionIdle ??= new Promise<void>((resolve) => { resolveAttentionIdle = resolve; });
      await attentionIdle;
    }
  });
}
