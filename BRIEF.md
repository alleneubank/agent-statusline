# Statusline Brief

## Bar

Shippable means the statusline is accurate, low-latency, and fail-open across Claude Code and Codex CLI without requiring producer changes.

## Dimensions

- Activity correctness: prompt and idle markers reflect lifecycle hooks, not incidental render payload changes.
- Cross-CLI portability: shared code handles Claude Code and Codex CLI hook payloads with ignored unknown fields.
- Latency: render mode stays process-per-render and avoids new subprocesses or scans beyond existing segments.
- Operability: setup instructions let an agent install, verify, and debug the statusline without asking for hidden context.

## Floors

- `zig build test` passes after every runtime change.
- Hook mode accepts `SessionStart`, `UserPromptSubmit`, and `Stop` JSON payloads and exits 0 with `{}` on stdout.
- Render mode hides activity when state is missing or malformed.
- Documentation states how to configure both CLIs and where activity state lives.

## Oracle

Unit tests are the objective oracle for parser and formatter behavior. A local smoke using `activity-hook` followed by a render is the integration oracle because it exercises the same sidecar state the CLIs use.

## Never

- Never infer idle from statusline render churn.
- Never require changes to Codex CLI or Claude Code.
- Never let hook failure break the producer session.
- Never write activity state outside the configured neutral state directory.

## Decisions

- `UserPromptSubmit` writes `working` with `last_prompt_at`.
- `Stop` writes `idle` with `idle_since` and preserves the previous prompt timestamp when available.
- `SessionStart` clears state for the session to avoid showing stale activity after reopening a session.
- Working state does not time out in render mode; long autonomous turns remain working until `Stop`, and `updated_at` is kept for debugging.
- The plugin locates the renderer through `AGENT_STATUSLINE_BIN`, `PATH`, or the repo-local build path.
- Permission badges prefer explicit Codex nested `permissions.mode` when present; legacy top-level approval/sandbox and nested approval/profile derivation remain fallbacks. Top-level `permission_mode` is only a best-effort fallback for Claude-like payloads and is not treated as a documented Claude statusline contract.
- The context gauge's ceiling is the token count at which the client auto-compacts: the resolved window minus a max-output allowance capped at 20k minus a flat 13k. Both reserves are constants read out of the client, not a share of the window, so a bigger window buys usable context rather than a bigger buffer. The resolved window follows the client's own precedence — `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, then `autoCompactWindow` in the generated settings file — clamped to the model's window as the client clamps it.
- *Ratified 2026-07-29:* resolving that window costs one small settings-file read per render when the env var is unset. This is an accepted exception to the Latency dimension's "no scans beyond existing segments" wording — the read is bounded, read-only, skipped entirely when the env var is set, and far cheaper than the transcript scan already on the same path. Setting the env var avoids it outright.
- Exact `current_usage` token counts always beat a producer's `used_percentage`. That percentage is measured against the raw model window with none of the reserve removed, so it under-reads the true position by the whole buffer, and it is rounded to whole percent besides. A percentage-only producer is trusted verbatim instead — it has no reserve to account for, and re-basing it onto this ceiling would only corrupt it.
- *Provisional 2026-07-31, needs a captured Codex payload to ratify:* the reserve was read out of the Claude Code client, but the Codex fork emits the same three context fields, so it takes the token path and inherits Claude's 33k reserve. `test/codex.json` cannot settle this — it is hand-built and internally inconsistent, so it only proves the code matches the code. If Codex reserves nothing, source selection needs a producer discriminator rather than a field-presence check.
- A quality floor cannot be met by matching a number the client also displays. `/context` reports its percentage against the resolved window and its threshold as an "Autocompact buffer" line; those are different denominators, and the gauge tracks the threshold. Any future claim about where the gauge should sit cites the client's own arithmetic, not another rendering of it.

## Boundary

Publishing marketplace changes, changing global user CLI settings, or installing into runtime plugin directories remains a human-owned step unless explicitly requested.
