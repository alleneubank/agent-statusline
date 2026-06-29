---
name: setup
description: Install, configure, or debug the agent-statusline renderer and its Codex CLI / Claude Code activity hooks. Use when a user asks to set up the shared statusline, install the plugin, wire statusLine/custom_status_line, or verify prompt/idle activity markers.
---

# Setup Agent Statusline

Use this skill to set up the Zig renderer plus the activity hooks that keep prompt and idle timestamps accurate without changing Codex CLI or Claude Code.

## Workflow

1. Locate the repository and build the binary:

```bash
zig build -Doptimize=ReleaseFast
```

2. Resolve the absolute renderer path:

```bash
pwd
ls -l zig-out/bin/statusline
```

3. Configure the CLI statusline command to that absolute binary.

Claude Code:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/absolute/path/to/zig-out/bin/statusline"
  }
}
```

Codex CLI:

```toml
[tui.custom_status_line]
type = "command"
command = "/absolute/path/to/zig-out/bin/statusline"
```

4. Install or enable the `agent-statusline` plugin for the target CLI. The plugin must be able to run the same binary through one of these routes:

- `AGENT_STATUSLINE_BIN=/absolute/path/to/zig-out/bin/statusline`
- `statusline` available on `PATH`
- local checkout layout where `plugins/agent-statusline` can reach `../../zig-out/bin/statusline`

5. Verify the hook path with deterministic fixture input:

```bash
printf '{"session_id":"setup-check","hook_event_name":"UserPromptSubmit"}' \
  | AGENT_STATUSLINE_BIN=/absolute/path/to/zig-out/bin/statusline \
    sh plugins/agent-statusline/hooks/statusline-activity-hook.sh UserPromptSubmit

printf '{"session_id":"setup-check","workspace":{"current_dir":"."},"model":{"display_name":"Codex"}}' \
  | /absolute/path/to/zig-out/bin/statusline

printf '{"session_id":"setup-check","hook_event_name":"Stop"}' \
  | AGENT_STATUSLINE_BIN=/absolute/path/to/zig-out/bin/statusline \
    sh plugins/agent-statusline/hooks/statusline-activity-hook.sh Stop
```

The first render after `UserPromptSubmit` should show the prompt emoji. The render after `Stop` should show the sleep emoji.

## Updating Local Installs

`codex plugin list` shows the installed cache version. When the repo-local
plugin source changes, refresh the cache with:

```bash
codex plugin add agent-statusline@agent-statusline
```

If the old version remains installed, remove and reinstall:

```bash
codex plugin remove agent-statusline@agent-statusline
codex plugin add agent-statusline@agent-statusline
```

For local-only iteration, prefer a Codex cachebuster build suffix on the plugin
manifest version, such as `0.2.2+codex.local-YYYYMMDD-HHMMSS`, instead of
bumping the release semver for every edit.

## Debugging

- State lives under `STATUSLINE_STATE_DIR`, `XDG_STATE_HOME/agent-statusline`, or `~/.local/state/agent-statusline`.
- Hook failures must not break the producer. The wrapper prints `{}` and exits 0 when it cannot find the binary.
- Use `STATUSLINE_DEBUG=1` or `STATUSLINE_DEBUG_LOG=/absolute/path.log` only when inspecting renderer behavior.
- Use `STATUSLINE_HOOK_DEBUG=1` or `STATUSLINE_HOOK_DEBUG_LOG=/absolute/path.log` only when inspecting hook wrapper behavior.
