# agent-statusline plugin

This plugin adds `SessionStart`, `UserPromptSubmit` / `PreInvocation`, and `Stop` hooks for Claude Code, Codex CLI, and Antigravity CLI (`agy`). The hooks update neutral per-session activity state consumed by the Zig statusline renderer.

The plugin does not bundle the renderer binary. Build this repository (or install the release via `mise`), configure the statusline command to the resulting binary, and expose that same binary to hooks through `AGENT_STATUSLINE_BIN`, `PATH`, `~/.local/share/mise/shims/statusline`, or the local checkout layout.

The Claude/Codex activity hooks live in `hooks/activity-hooks.json`, which both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` name as `hooks`. Keep command-hook wiring there so both loaders see the same commands.

`hooks.json` at the plugin root is Antigravity's native hook manifest (paired with `.antigravity-plugin/plugin.json` and `hooks/agy-activity-hook.sh`), while `hooks/hooks.json` is Claude Code's alone: it names the `hooks/agent-row.ts` mod, which draws agent-panel rows with `statusline subagents` (repository SPEC REQ-SL-004C). Codex rejects unknown keys in a hooks file, so the activity hooks must not move back into `hooks/hooks.json` beside `modules`.
