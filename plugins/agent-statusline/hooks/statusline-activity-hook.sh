#!/bin/sh
set -u

event="${1:-}"
plugin_root="${CODEX_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}"

run_hook() {
  bin="$1"
  if [ -x "$bin" ] || command -v "$bin" >/dev/null 2>&1; then
    exec "$bin" activity-hook "$event"
  fi
}

if [ "${AGENT_STATUSLINE_BIN:-}" ]; then
  run_hook "$AGENT_STATUSLINE_BIN"
fi

run_hook statusline

if [ "$plugin_root" ]; then
  run_hook "$plugin_root/../../zig-out/bin/statusline"
fi

cat >/dev/null
printf '{}\n'
exit 0
