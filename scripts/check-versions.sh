#!/usr/bin/env bash
# Assert every version-bearing file agrees with build.zig.zon.
#
# v0.3.6 and v0.3.7 both shipped skewed: build.zig.zon advanced while
# plugins/agent-statusline/.{claude,codex}-plugin/plugin.json stayed at 0.3.5
# and .claude-plugin/marketplace.json lagged a release behind. Consumers read
# different files — mise reads the release tag, Claude and Codex read the
# plugin manifests, the marketplace listing reads marketplace.json — so a skew
# ships a release where the binary and the plugins disagree about what they are.
#
# build.zig.zon is the source of truth because the release tag is cut from it.
#
# Usage:
#   scripts/check-versions.sh                 all files agree with build.zig.zon
#   scripts/check-versions.sh --expect 0.3.8  ...and build.zig.zon is that version
#
# The release workflow passes --expect "${GITHUB_REF_NAME#v}". Asset filenames
# are built from the tag while the binary reports build.zig.zon, so a tag that
# disagrees with the source ships statusline-<tag>.tar.gz containing a binary
# that calls itself something else.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

want=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --expect)
            want="${2-}"
            [[ -n "$want" ]] || { echo "FAIL: --expect needs a version" >&2; exit 1; }
            shift 2
            ;;
        *)
            echo "FAIL: unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

# Every file that must carry the release version, and how to read it out.
# Keep this list exhaustive: a version-bearing file missing here is a file that
# can silently drift, which is the whole defect this guards.
read_zon_version() {
    sed -n 's/^[[:space:]]*\.version = "\([^"]*\)".*/\1/p' "$ROOT/build.zig.zon" | head -1
}

read_json_version() {
    python3 -c "
import json, sys
with open(sys.argv[1]) as handle:
    print(json.load(handle)['version'])
" "$1"
}

read_marketplace_version() {
    python3 -c "
import json, sys
with open(sys.argv[1]) as handle:
    plugins = json.load(handle)['plugins']
match = [p['version'] for p in plugins if p.get('name') == 'agent-statusline']
if not match:
    raise SystemExit('no agent-statusline entry in ' + sys.argv[1])
print(match[0])
" "$1"
}

expected="$(read_zon_version)"
if [[ -z "$expected" ]]; then
    echo "FAIL: could not read .version from build.zig.zon" >&2
    exit 1
fi

status=0
check() {
    local label="$1" actual="$2"
    if [[ "$actual" != "$expected" ]]; then
        printf 'FAIL  %-52s %s (expected %s)\n' "$label" "$actual" "$expected" >&2
        status=1
    else
        printf 'ok    %-52s %s\n' "$label" "$actual"
    fi
}

if [[ -n "$want" && "$want" != "$expected" ]]; then
    echo "FAIL: build.zig.zon is $expected but the release tag says $want." >&2
    echo "The tag names the assets; build.zig.zon names the binary inside them." >&2
    exit 1
fi

printf 'ok    %-52s %s (source of truth)\n' "build.zig.zon" "$expected"
check "plugins/agent-statusline/.claude-plugin/plugin.json" \
    "$(read_json_version "$ROOT/plugins/agent-statusline/.claude-plugin/plugin.json")"
check "plugins/agent-statusline/.codex-plugin/plugin.json" \
    "$(read_json_version "$ROOT/plugins/agent-statusline/.codex-plugin/plugin.json")"
check ".claude-plugin/marketplace.json" \
    "$(read_marketplace_version "$ROOT/.claude-plugin/marketplace.json")"

if [[ "$status" -ne 0 ]]; then
    echo >&2
    echo "Version skew: bump every file above together. This is what shipped in" >&2
    echo "v0.3.6 and v0.3.7." >&2
fi
exit "$status"
