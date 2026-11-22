# agent-statusline

A fast, single-line status renderer for command-backed agent statusline payloads, written in Zig. It reads one JSON snapshot on stdin and prints one formatted status line on stdout.

## Behavior

- Reads statusline JSON from stdin and ignores unknown fields.
- Crash-free by design: any error in a segment degrades to hiding that segment, falling back to `~` in the worst case. A return code of `0` is always produced.
- Empty segments emit zero bytes (no stray separators).
- Renders host/working-directory and git segments from the current workspace.
- `--debug` or `STATUSLINE_DEBUG=1` appends diagnostics to `/tmp/statusline-debug.log`
  and shows the numeric context percentage inline.
- `STATUSLINE_DEBUG_LOG=/absolute/path.log` appends diagnostics to that file
  without changing visible output.
- `STATUSLINE_CAPTURE_DIR=/absolute/dir` writes replay artifacts for every render:
  `statusline-*.input.json` and `statusline-*.output.ansi`.
- Claude Code, Codex, Antigravity CLI (`agy`), Kimi Code, Pi, and Grok Build status payloads are supported. Claude models render with their existing glyphs, and Mythos (`Mythos 5.2`, `claude-mythos-5-2`) renders as 🔱. GPT model names with the Sol or Astra tier use the same glyph across versions. Sol renders as 🌞 and Astra renders as 🌠, the shooting star Astra chose. The bare `gpt-6.1` alias also renders as 🌞. GPT-6 Luna (`gpt-6-luna`) renders as 🌕. GPT-5.6 uses its original glyphs (`gpt-5.6-sol` ☀️, `gpt-5.6-terra` 🌍, `gpt-5.6-luna` 🌙); pi's adapter uses the stable model id when its display label is formatted like `GPT-6.1 Sol`, `GPT-6 Luna`, or `GPT-5.6 Luna`. Previous-generation Codex glyphs remain supported, with `⌘` as the generic GPT/Codex fallback. Kimi models (`kimi-code/*`, `k3[1m]`, `Kimi K2`) render as 🌑. Grok models (`Grok 4.5`, `Grok Build`, `grok-4`) render as 🌌. DeepSeek models render with the whale brand mark: the Flash tier (`deepseek-flash` ids, `DeepSeek-*Flash*` display names) renders as 🐬, while Pro (`deepseek-v4-pro`, `DeepSeek V4 Pro`) and untiered legacy ids (`deepseek-chat`, `deepseek-reasoner`) render as 🐳. GLM models (`glm-4.6`, `glm-4.5-air`, `zai/glm-4.6` producer paths, legacy `ChatGLM` names) render as 🔮. Qwen models (`Qwen3.8` display names, `qwen3.8` ids) render as 🐉. Gemini 4 Neon (`Gemini 4 Neon`, `gemini-4-neon`) renders as 💡, and Gemini 4 Carbon (`Gemini 4 Carbon`, `gemini-4-carbon`, `gemini-4-carbon-high`) renders as 💎. An `(auto)` tag renders after the context gauge when the payload declares auto-compaction enabled (`auto_compact.enabled`, sent by the pi adapter); Antigravity CLI (`product: "antigravity"`) and percentage-only context payloads (`used_percentage` without token buckets) trust the producer's percentage verbatim.
- Codex goal payloads render active goal attention as `🎯`; when `tokens_used` and `token_budget` are present, the segment renders compact progress such as `🎯12.5k/50k`.
- Reasoning effort renders as an emoji dot dial after the model glyph, graded by compute burn: ⚫ minimal, ⚪ low, 🔵 medium, 🟡 high, 🟠 xhigh, 🔴 max, 🟣 ultra. An emoji badge aligns with the emoji model glyph beside it (partial-height block glyphs read as floating next to baseline-bound text). Claude Code's structured `effort.level` field is preferred, followed by Antigravity CLI's `model.effort`, then Codex's model-with-reasoning display name (`gpt-5.6-sol xhigh`). Unset (`none`/`default`) or unknown effort hides the badge. Codex Fast mode adds `🚀` after the effort dial when the structured `service_tier` is `priority` or `fast`; payloads from older Codex versions fall back to an exact service-tier token in `model.display_name`. Other models and tiers remain unmarked.
- Activity display is hook-owned: the `agent-statusline` plugin records `UserPromptSubmit` (and Antigravity's `PreInvocation`) as `💬 MM/DD HH:MM` and `Stop` as `💤 MM/DD HH:MM` under `STATUSLINE_STATE_DIR`, `XDG_STATE_HOME/agent-statusline`, or `~/.local/state/agent-statusline`.

See [`SPEC.md`](SPEC.md) for the full contract (requirements, invariants, segment rules).

## Build

Requires Zig `0.16.0`+ (the renderer uses the 0.16 `std.Io` API). The project has no external dependencies.

```bash
zig build                          # build -> zig-out/bin/statusline
zig build run                      # run (reads JSON from stdin)
zig build run -- --debug           # run with debug diagnostics
zig build test                     # run unit tests
zig build -Doptimize=ReleaseFast   # optimized build
python3 test/renderer-smoke.py zig-out/bin/statusline  # isolated renderer smoke (Git + Python 3)
```

Quick check:

```bash
zig build && ./zig-out/bin/statusline < test/opus.json
zig build && ./zig-out/bin/statusline < test/codex.json
zig build && ./zig-out/bin/statusline < test/codex-goal.json
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

### Subagent rows

The main `statusLine` payload carries only the session's model. To show each
subagent's own model in the agent panel, enable the bundled plugin in Claude
Code: its `hooks/agent-row.ts` mod draws each agent-panel row with the
`subagents` subcommand, finding the binary the same way the activity hooks do
(below). No setting is needed.

Claude Code deprecated the `subagentStatusLine` setting in favor of mods; remove
it once the plugin is enabled, or both draw the row and the mod wins.

The mod sends one row at a time as a one-task `tasks` payload (the older setting
sent every visible row at once); the renderer answers with one `{"id": ..., "content": ...}` JSON line per row.
A row reads like the main line's model segment, followed by who the subagent is
and what it is doing:

```text
█▏    🍃🔵 Explore · Reading src/main.zig
⋯ general-purpose · Plan migration
```

The gauge is the subagent's `tokenCount` against its auto-compact ceiling, the
glyph is the subagent's resolved model (same table as the main line), and the
dot is its configured effort. `⋯` holds the glyph slot until Claude Code
resolves the subagent's model. A task the renderer cannot read keeps Claude
Code's default row, and an unparseable payload prints nothing.

```bash
printf '{"tasks":[{"id":"a1","agentType":"Explore","label":"Find config","model":"claude-haiku-4-5"}]}' \
  | ./zig-out/bin/statusline subagents
```

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

When the payload includes a `goal` object with `status = "active"`, the
renderer shows an active-goal marker. The Codex fork payload shape is:

```json
{
  "goal": {
    "objective": "...",
    "status": "active",
    "token_budget": 50000,
    "tokens_used": 12500,
    "time_used_seconds": 120
  }
}
```

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

## Use with pi

pi has no command-backed statusline contract; the footer is driven by the
extension API. The adapter in [`pi/agent-statusline.ts`](pi/agent-statusline.ts)
replaces pi's built-in footer with a custom footer whose single line is this
renderer's output, so location, git, model glyph, effort, context gauge, and
💬/💤 activity fit on one line:

```bash
pi -e /absolute/path/to/agent-statusline/pi/agent-statusline.ts
```

The adapter synthesizes a Codex/Claude-style payload from pi events: the model
name (DeepSeek models resolve their glyph), pi's own `used_percentage`
(percentage-only, trusted verbatim), and `auto_compact` derived from
`~/.pi/settings.json` (`compaction.enabled`, default true) with a window of
`contextWindow − 16384` — pi's own auto-compact trigger — so the `(auto)` tag
matches pi's footer and no host `~/.claude` settings leak into the gauge. It
tracks the same activity state as the CLI plugins via the renderer's
`activity-hook`, and resolves the binary through `AGENT_STATUSLINE_BIN`, then
the checkout's `zig-out/bin/statusline`. To persist, copy the file to
`~/.pi/agent/extensions/agent-statusline.ts`.

The same extension doubles as the sox attention emitter for pi sessions. Sox
the command center is entirely submit-driven — a surface gets an envelope only
when something emits — and pi has no hook system, so the extension submits
what sox's claude-code plugin hook submits: `working` on `agent_start` (plus a
heartbeat on every `tool_execution_start` so a tool-churning agent never ages
into stale), `done` on `agent_settled`, and `--clear` on shutdown. The broker
resolves from `SOX_ATTENTION_BIN` (absolute path only; the `sox` user CLI does
not broker attention). Unset `SOX_ATTENTION_BIN` is a silent no-op, not
misconfiguration. Debug via `SOX_ATTENTION_DEBUG=/abs/path.log`.

## Use with Antigravity CLI (`agy`)

Point `statusLine` in `~/.gemini/antigravity-cli/settings.json` at the renderer (or run `/statusline /absolute/path/to/statusline` inside `agy`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "/absolute/path/to/zig-out/bin/statusline"
  }
}
```

Antigravity CLI pipes its session JSON (`product: "antigravity"`, `model.{id,display_name,effort}`, `context_window.used_percentage`, `cycle_mode`, `cost.total_usd`) on stdin. The renderer trusts Antigravity's `used_percentage` verbatim without inheriting Claude Code's `autoCompactWindow` or reserve, renders `model.effort` on the effort dial, maps `cycle_mode` (`accept-edits`, `auto`, `plan`) onto the permission shield, and reads `cost.total_usd`.

For prompt/idle (`💬`/`💤`) timestamps in `agy`, load `plugins/agent-statusline` (which ships `.antigravity-plugin/plugin.json` and a root `hooks.json` adapter over `SessionStart`, `PreInvocation`, and `Stop`) or wire `statusline activity-hook` into `~/.gemini/config/hooks.json`. Replay fixtures: `test/gemini-neon.json` and `test/gemini-carbon.json`.

## Use with Kimi Code

Kimi Code (0.35+) has a Claude-Code-style command statusline. Point
`status_line.command` in `~/.kimi-code/tui.toml` at the renderer:

```toml
[status_line]
command = "/absolute/path/to/zig-out/bin/statusline"
```

Kimi pipes a flat JSON snapshot on stdin (`model`, `cwd`, `gitBranch`,
`permissionMode`, `planMode`, `contextTokens`, `maxContextTokens`,
`sessionId`, `version`), marks the child with `KIMI_CODE_STATUS_LINE=1`, and
replaces its first footer line with the command's first stdout line. The
renderer detects the kimi shape (env mark or the `maxContextTokens` field) and
translates it natively — no wrapper script. The context gauge trusts kimi's
own token accounting verbatim (`contextTokens / maxContextTokens`, no Claude
auto-compact reserve), `planMode` renders the green `🛡plan` badge, and
`gitBranch` is ignored in favor of a live git read. Replay fixture:
`test/kimi.json`.

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
