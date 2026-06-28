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

## Boundary

Publishing marketplace changes, changing global user CLI settings, or installing into runtime plugin directories remains a human-owned step unless explicitly requested.
