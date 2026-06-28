# CLAUDE.md

Guidance for the standalone Zig agent-statusline repo.

## Purpose

Build a fast single-line status renderer for command-backed agent statusline payloads. Input comes from JSON on stdin; output is one formatted status line on stdout.

## Build and Test

```bash
# From the repo root
zig build
zig build run
zig build run -- --debug
zig build test

# Optimized build
zig build -Doptimize=ReleaseFast
```

## Runtime Contract

- Reads statusline JSON from stdin.
- Ignores unknown JSON fields (`ignore_unknown_fields = true`).
- On parse failure, prints minimal fallback (`~`) instead of crashing.
- Optional debug mode appends diagnostics to `/tmp/statusline-debug.log`.

## Data Sources

- Git metadata is read from the current workspace directory.
- Review/loop state is rendered by `rl statusline` (PATH dependency); the statusline does not read `.rl/state.json` directly.
- Prompt/idle activity time is tracked by the bundled plugin hooks in neutral per-session state; render mode only reads that state.

## Guardrails

- Preserve low-latency behavior; avoid expensive shell/process work.
- Keep graceful-degradation behavior: missing data should hide segments, not fail the whole line.
- Update or add tests in `src/main.zig` when changing parsing/formatting behavior.

## Environment

- Minimum Zig version: `0.16.0`
- No external runtime dependencies beyond POSIX shell tooling already used by the code.
