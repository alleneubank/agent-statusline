#!/bin/sh
set -u

event="${1:-}"
plugin_root="${CODEX_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-}}"
debug_enabled="${STATUSLINE_HOOK_DEBUG:-}"
debug_log="${STATUSLINE_HOOK_DEBUG_LOG:-}"

if [ -n "$debug_log" ]; then
  debug_enabled=1
elif [ "$debug_enabled" = "1" ]; then
  debug_log="/tmp/codex-statusline-captures/statusline-hook.log"
fi

hook_debug() {
  [ "$debug_enabled" = "1" ] || return 0
  if [ -n "$debug_log" ]; then
    mkdir -p "$(dirname "$debug_log")" 2>/dev/null || true
  fi
  printf '%s event=%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$event" "$*" >>"$debug_log" 2>/dev/null || true
}

if [ "$debug_enabled" = "1" ]; then
  payload="$(cat)" || payload=""
  payload_bytes="$(printf '%s' "$payload" | wc -c | tr -d ' ')"
  session_id="$(printf '%s' "$payload" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  if [ -n "$session_id" ]; then
    hook_debug "payload_bytes=$payload_bytes session_id=$session_id"
  else
    hook_debug "payload_bytes=$payload_bytes session_id=<missing>"
  fi
fi

run_hook() {
  bin="$1"
  if [ -x "$bin" ] || command -v "$bin" >/dev/null 2>&1; then
    if [ "$debug_enabled" = "1" ]; then
      hook_debug "running bin=$bin"
      printf '%s' "$payload" | "$bin" activity-hook "$event"
      rc=$?
      hook_debug "completed bin=$bin rc=$rc"
      exit "$rc"
    fi
    exec "$bin" activity-hook "$event"
  fi
  hook_debug "missing bin=$bin"
}

if [ "${AGENT_STATUSLINE_BIN:-}" ]; then
  run_hook "$AGENT_STATUSLINE_BIN"
fi

run_hook statusline

if [ "$plugin_root" ]; then
  run_hook "$plugin_root/../../zig-out/bin/statusline"
fi

if [ "$debug_enabled" = "1" ]; then
  hook_debug "fallback no-binary"
else
  cat >/dev/null
fi
printf '{}\n'
exit 0
