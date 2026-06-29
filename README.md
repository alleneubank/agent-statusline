# agent-statusline

A fast, single-line status renderer for command-backed agent statusline payloads, written in Zig. It reads one JSON snapshot on stdin and prints one formatted status line on stdout.

## Behavior

- Reads statusline JSON from stdin and ignores unknown fields.
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
- Claude Code and Codex-style status payloads are supported. Claude models render with their existing glyphs; recommended Codex models render with model-specific glyphs (`gpt-5.5` 🧠, `gpt-5.4` 🔧, `gpt-5.4-mini` ⚡, `gpt-5.3-codex-spark` ✨), with `⌘` as the generic GPT/Codex fallback.
- Activity display is hook-owned: the `agent-statusline` plugin records `UserPromptSubmit` as `💬 MM/DD HH:MM` and `Stop` as `💤 MM/DD HH:MM` under `STATUSLINE_STATE_DIR`, `XDG_STATE_HOME/agent-statusline`, or `~/.local/state/agent-statusline`.

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

Install or enable the bundled plugin in `plugins/agent-statusline` so activity
hooks can update prompt/idle state. The hook wrapper must be able to find the
same binary through one of:

- `AGENT_STATUSLINE_BIN=/absolute/path/to/zig-out/bin/statusline`
- `statusline` on `PATH`
- this checkout's default `plugins/agent-statusline` to `../../zig-out/bin/statusline` layout

Claude marketplace metadata lives at
[`./.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json).

## Use with Codex

With a Codex build that supports command-backed custom status lines, configure the renderer as the command:

```toml
[tui.custom_status_line]
type = "command"
command = "/absolute/path/to/zig-out/bin/statusline"
```

Codex pipes a JSON snapshot to the command on stdin. Empty, failing, or timed-out renderer output is hidden by Codex.

The same `plugins/agent-statusline` plugin supports Codex hooks. A Codex
marketplace entry is provided in [`marketplace.json`](marketplace.json). The
plugin listens for `SessionStart`, `UserPromptSubmit`, and `Stop` and writes
neutral activity state consumed by the renderer; no Codex CLI changes are
required.

### Updating the local Codex plugin

`codex plugin list` reports the installed plugin cache version, not just the
source manifest version in this checkout. After changing the local plugin,
refresh the installed cache with:

```bash
codex plugin add agent-statusline@agent-statusline
```

If the cache still points at an older version, reinstall it explicitly:

```bash
codex plugin remove agent-statusline@agent-statusline
codex plugin add agent-statusline@agent-statusline
```

For rapid local iteration, use a semver build suffix such as
`0.2.2+codex.local-YYYYMMDD-HHMMSS` instead of bumping the release version for
every edit.

## Activity hook

The renderer also exposes a hook subcommand used by the plugin:

```bash
printf '{"session_id":"demo","hook_event_name":"UserPromptSubmit"}' \
  | ./zig-out/bin/statusline activity-hook UserPromptSubmit
```

Hook mode always prints `{}` and exits 0. It ignores unknown JSON fields, writes
only neutral per-session state, and fails open when state cannot be written.

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

For hook-level debugging, set `STATUSLINE_HOOK_DEBUG=1` to write metadata to
`/tmp/codex-statusline-captures/statusline-hook.log`, or set
`STATUSLINE_HOOK_DEBUG_LOG=/absolute/path.log` to choose the destination. Hook
debugging records event names, payload byte counts, session ids, selected
binaries, and exit codes without dumping the full hook payload.

## License

[Apache-2.0](LICENSE) © 2025 Allen Eubank (Big Boss).
