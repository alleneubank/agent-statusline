#!/bin/sh
# Antigravity (agy) lifecycle hook adapter for agent-statusline.
# Translates SessionStart / PreInvocation / Stop camelCase hook payloads into
# neutral per-session activity state and emits Antigravity's required JSON
# response (fail-open).
set -u

event="${1:-}"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd -P)" || script_dir=""
plugin_root="${PLUGIN_ROOT:-}"
if [ -z "$plugin_root" ] && [ -n "$script_dir" ]; then
  plugin_root="$(CDPATH= cd -- "$script_dir/.." 2>/dev/null && pwd -P)" || plugin_root=""
fi

reply() {
  if [ "$event" = "Stop" ]; then
    printf '{"decision":"allow"}\n'
  else
    printf '{}\n'
  fi
  exit 0
}

bin=""
for candidate in \
  "${AGENT_STATUSLINE_BIN:-}" \
  "${HOME:-}/.local/share/mise/shims/statusline" \
  "${plugin_root:+$plugin_root/../../zig-out/bin/statusline}"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    bin="$candidate"
    break
  fi
done

if [ -z "$bin" ] && command -v statusline >/dev/null 2>&1; then
  bin="statusline"
fi

if [ -n "$bin" ]; then
  "$bin" activity-hook "$event" >/dev/null 2>&1 || true
else
  cat >/dev/null 2>&1 || true
fi

reply
