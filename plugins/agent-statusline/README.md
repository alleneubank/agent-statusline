# agent-statusline plugin

This plugin adds `SessionStart`, `UserPromptSubmit`, and `Stop` hooks for Codex CLI and Claude Code. The hooks update neutral per-session activity state consumed by the Zig statusline renderer.

The plugin does not bundle the renderer binary. Build this repository, configure the statusline command to the resulting binary, and expose that same binary to hooks through `AGENT_STATUSLINE_BIN`, `PATH`, or the local checkout layout.

The activity hooks live in `hooks/activity-hooks.json`, which both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` name as `hooks`. Keep command-hook wiring there so both loaders see the same commands.

`hooks/hooks.json` is Claude Code's alone: it names the `hooks/agent-row.ts` mod, which draws agent-panel rows with `statusline subagents` (repository SPEC REQ-SL-004C). Codex rejects unknown keys in a hooks file, so the activity hooks must not move back into `hooks/hooks.json` beside `modules`.
