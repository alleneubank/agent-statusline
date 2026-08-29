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
- The producers do not share a reserve model, so the payload shape picks the source, not a field-presence check. For Claude Code, exact `current_usage` token counts beat its `used_percentage` — that percentage divides by the raw model window with none of the reserve removed, so it under-reads by the whole buffer, and it is rounded to whole percent besides. For Codex, its own percentage wins: it already encodes Codex's reserve, and re-basing it onto the auto-compact ceiling corrupts it.
- *Ratified 2026-07-31 from the Codex fork's source, superseding the provisional entry:* Codex withholds a flat 12000-token baseline from both the window and the used count, and ships an authoritative `total_tokens` whose `input_tokens` already contains the cached read. Claude Code ships no total and disjoint components. `current_usage.total_tokens` therefore tells the shapes apart, and summing a Codex payload double-counts every cached token.
- *Provisional 2026-08-28:* a git root with `LOOP.md` may add one `missionctl statusline` subprocess. One root-file existence probe keeps repositories without a campaign on the prior process budget; the subprocess output is capped, fully drained, and fail-open. This is the canonical-projection exception to the Latency dimension, parallel to the existing delegated `rl statusline` segment.
- Producer shape is read from the producer's source, never inferred from a fixture. The hand-built `test/codex.json` asserted a shape nobody had checked and let a double-count ship; it is now derived from `token_usage_payload` and internally consistent.
- A quality floor cannot be met by matching a number the client also displays. `/context` reports its percentage against the resolved window and its threshold as an "Autocompact buffer" line; those are different denominators, and the gauge tracks the threshold. Any future claim about where the gauge should sit cites the client's own arithmetic, not another rendering of it.

## Boundary

Publishing marketplace changes, changing global user CLI settings, or installing into runtime plugin directories remains a human-owned step unless explicitly requested.
