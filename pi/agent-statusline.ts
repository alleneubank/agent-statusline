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
 *   AGENT_STATUSLINE_BIN env, then this checkout's zig-out/bin/statusline.
 */

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const BIN_TIMEOUT_MS = 1500;
// pi's CompactionSettings.reserveTokens default; `shouldCompact` triggers at
// contextWindow - reserveTokens (packages/coding-agent compaction.ts).
const PI_COMPACTION_RESERVE_TOKENS = 16384;

function resolveBinary(): string | undefined {
  const env = process.env.AGENT_STATUSLINE_BIN;
  if (env) return env;
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

/** pi's auto-compaction enabled flag; fail open to the built-in default. */
function readCompactionEnabled(): boolean {
  try {
    const path = join(homedir(), ".pi", "settings.json");
    if (!existsSync(path)) return true;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      compaction?: { enabled?: boolean };
    };
    return parsed.compaction?.enabled ?? true;
  } catch {
    return true;
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

/** Run one best-effort `soxd attention` invocation; never throws, never blocks. */
function runAttention(args: string[]): void {
  const bin = resolveAttentionBin();
  if (!bin) return;
  const child = spawn(bin, ["attention", ...args], {
    stdio: "ignore",
    timeout: BIN_TIMEOUT_MS,
  });
  child.on("error", () => {
    // Broker missing or failed to spawn: attention stays absent, like the
    // hook's best-effort swallows.
  });
  const debugLog = process.env.SOX_ATTENTION_DEBUG;
  if (debugLog) {
    child.on("close", (code) => {
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
}

const submitAttentionState = (state: "working" | "done" | "blocked", reason?: string): void =>
  runAttention(reason ? ["--state", state, "--reason", reason.slice(0, 256)] : ["--state", state]);

const submitAttentionClear = (): void => runAttention(["--clear"]);

/** Synthesize the statusline payload from pi's current context. */
function buildPayload(ctx: ExtensionContext): unknown {
  const usage = ctx.getContextUsage();
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
      enabled: readCompactionEnabled(),
      window: usage ? usage.contextWindow - PI_COMPACTION_RESERVE_TOKENS : null,
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
    if (!BIN || ctx.mode !== "tui") return; // footer only exists in TUI mode
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

  pi.on("session_start", (_event, ctx) => {
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
    submitAttentionState("done");
    recordActivityThenRender("Stop", ctx);
  });
  pi.on("session_shutdown", () => submitAttentionClear());
}
