# claude-statusline

A fast, single-line status renderer for [Claude Code](https://github.com/anthropics/claude-code), written in Zig. It reads Claude Code's `StatuslineInput` JSON on stdin and prints one formatted status line on stdout.

## Behavior

- Reads `StatuslineInput` JSON from stdin and ignores unknown fields.
- Crash-free by design: any error in a segment degrades to hiding that segment, falling back to `~` in the worst case. A return code of `0` is always produced.
- Empty segments emit zero bytes (no stray separators).
- Renders host/working-directory and git segments from the current workspace, plus an rl loop segment.
- The rl loop segment is delegated to `rl statusline` (a `PATH` dependency); the statusline does not read `.rl/` state directly.
- `--debug` or `STATUSLINE_DEBUG=1` appends diagnostics to `/tmp/statusline-debug.log`
  and shows the numeric context percentage inline.
- `STATUSLINE_DEBUG_LOG=/absolute/path.log` appends diagnostics to that file
  without changing visible output.
- `STATUSLINE_CAPTURE_DIR=/absolute/dir` writes replay artifacts for every render:
  `statusline-*.input.json` and `statusline-*.output.ansi`.
- Codex status payloads are supported: GPT/Codex models render with `⌘`, and
  `context_window.used_percentage` is preferred when present.

See [`SPEC.md`](SPEC.md) for the full contract (requirements, invariants, segment rules).

## Build

Requires Zig `0.16.0`+ (the renderer uses the 0.16 `std.Io` API). The project has no external dependencies.

```bash
zig build                          # build -> zig-out/bin/statusline
zig build run                      # run (reads JSON from stdin)
zig build run -- --debug           # run with debug diagnostics
zig build test                     # run unit tests
zig build -Doptimize=ReleaseFast   # optimized build
```

Quick check:

```bash
zig build && ./zig-out/bin/statusline < test/opus.json
zig build && ./zig-out/bin/statusline < test/codex.json
```

## Use with Claude Code

Build a release binary and point your Claude Code `statusLine` setting at it (`~/.claude/settings.json`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "/absolute/path/to/zig-out/bin/statusline"
  }
}
```

Claude Code pipes the status JSON to the command on stdin and renders its stdout.

## Debug capture

For live session debugging, set capture env on the statusline command. The
directory must already exist and must be absolute:

```bash
mkdir -p /tmp/statusline-captures
STATUSLINE_CAPTURE_DIR=/tmp/statusline-captures \
STATUSLINE_DEBUG_LOG=/tmp/statusline-captures/statusline.log \
  ./zig-out/bin/statusline < test/codex.json
```

Use the captured `*.input.json` files as replay fixtures while fixing parser or
rendering drift. Capture failures are best-effort and never affect stdout.

## License

[Apache-2.0](LICENSE) © 2025 Allen Eubank (Big Boss).
