# agent-statusline plugin

This plugin adds `SessionStart`, `UserPromptSubmit`, and `Stop` hooks for Codex CLI and Claude Code. The hooks update neutral per-session activity state consumed by the Zig statusline renderer.

The plugin does not bundle the renderer binary. Build this repository, configure the statusline command to the resulting binary, and expose that same binary to hooks through `AGENT_STATUSLINE_BIN`, `PATH`, or the local checkout layout.

Codex CLI and Claude Code discover plugin hook wiring from `hooks/hooks.json`. Keep hook wiring changes in that file so both plugin loaders see the same commands.
