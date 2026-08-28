#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mission_root="${1:?usage: check-missionctl-smoke.sh MISSION_ROOT}"
missionctl_bin="${MISSIONCTL_BIN:-missionctl}"
statusline_bin="${STATUSLINE_BIN:-$repo_root/zig-out/bin/statusline}"

if [[ ! -f "$mission_root/MISSION.md" || ! -f "$mission_root/LOOP.md" ]]; then
  echo "typed mission artifacts not found at $mission_root" >&2
  exit 1
fi

if [[ "$mission_root" == *['"'\\$'\n'$'\r']* ]]; then
  echo "mission root cannot be represented by this smoke fixture: $mission_root" >&2
  exit 1
fi

canonical="$($missionctl_bin statusline --root "$mission_root")"
if [[ -z "$canonical" || "$canonical" == *$'\n'* || "$canonical" == *$'\r'* ]]; then
  echo "missionctl returned an invalid compact projection" >&2
  exit 1
fi

if [[ ! -x "$statusline_bin" ]]; then
  echo "statusline binary not found at $statusline_bin; run 'zig build' first" >&2
  exit 1
fi

smoke_root="$(mktemp -d "${TMPDIR:-/tmp}/mission-statusline-smoke.XXXXXX")"
trap 'rm -rf "$smoke_root"' EXIT
cp -R "$mission_root/." "$smoke_root/"
git -C "$smoke_root" init -q

input="$(printf '{"workspace":{"current_dir":"%s","project_dir":"%s"}}' "$smoke_root" "$smoke_root")"
rendered="$(printf '%s\n' "$input" | "$statusline_bin")"

if [[ "$rendered" != *" $canonical" ]]; then
  echo "statusline does not end with the canonical mission projection" >&2
  echo "expected suffix:  $canonical" >&2
  echo "actual output: $rendered" >&2
  exit 1
fi

printf 'mission projection smoke passed: %s\n' "$canonical"
