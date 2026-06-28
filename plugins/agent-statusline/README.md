# agent-statusline plugin

This plugin adds `SessionStart`, `UserPromptSubmit`, and `Stop` hooks for Codex CLI and Claude Code. The hooks update neutral per-session activity state consumed by the Zig statusline renderer.

The plugin does not bundle the renderer binary. Build this repository, configure the statusline command to the resulting binary, and expose that same binary to hooks through `AGENT_STATUSLINE_BIN`, `PATH`, or the local checkout layout.

Hook manifests are mirrored for the two plugin loaders: Codex discovers `hooks/hooks.json`, while Claude Code uses the root `hooks.json` compatibility file. Keep the two files identical when changing hook wiring.
