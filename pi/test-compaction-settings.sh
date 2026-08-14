#!/usr/bin/env bash
# Behavioral floor for the pi extension's compaction-settings read.
#
# The extension shipped reading ~/.pi/settings.json, a path pi has never
# written — pi resolves settings through getAgentDir(): $PI_CODING_AGENT_DIR
# when set, else ~/.pi/agent. The file therefore never existed, every read fell
# through to the defaults, and a host with compaction.enabled=false still
# rendered as auto-compacting. The reserve was hard-coded at 16384 while pi
# treats compaction.reserveTokens as configurable.
#
# agent-statusline.ts is a single-file extension by contract (the dotfiles
# fleet symlinks exactly one file into ~/.pi/agent/extensions/), so the
# functions cannot be split into an importable module and the file cannot be
# imported whole without pi's packages installed. This extracts the two pure
# functions and exercises them directly — hacky, but it tests real behavior
# rather than asserting on source text.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/pi/agent-statusline.ts"

command -v bun >/dev/null 2>&1 || {
    echo "FAIL: bun is required to run this test" >&2
    exit 1
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Extract the constant and the two pure functions verbatim from the extension.
# An extraction that comes back short means the functions were renamed or
# restructured — fail rather than silently testing nothing.
{
    echo 'import { existsSync, readFileSync } from "node:fs";'
    echo 'import { homedir } from "node:os";'
    echo 'import { join } from "node:path";'
    sed -n '/^const PI_COMPACTION_RESERVE_TOKENS_DEFAULT/p' "$SRC"
    sed -n '/^function piSettingsPath/,/^}/p' "$SRC"
    sed -n '/^function readCompactionSettings/,/^}/p' "$SRC"
    echo 'export { piSettingsPath, readCompactionSettings };'
} > "$WORK/subject.ts"

# Match the exact declaration, not a substring: renaming piSettingsPath to
# piSettingsPathRenamed still satisfies a bare `grep piSettingsPath`, and the
# failure then surfaces as an opaque module-resolution error instead of this.
for decl in \
    'const PI_COMPACTION_RESERVE_TOKENS_DEFAULT =' \
    'function piSettingsPath(' \
    'function readCompactionSettings('; do
    grep -qF "$decl" "$WORK/subject.ts" \
        || { echo "FAIL: could not extract '$decl' from $SRC" >&2; exit 1; }
done

bun -e "
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const m = await import('$WORK/subject.ts');

let fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(\`\${ok ? '[ok]  ' : '[FAIL]'} \${label}: got \${JSON.stringify(got)}\${ok ? '' : ' want ' + JSON.stringify(want)}\`);
};

const dir = () => mkdtempSync(join(tmpdir(), 'pi-'));
const withSettings = (obj) => {
  const d = dir();
  writeFileSync(join(d, 'settings.json'), JSON.stringify(obj));
  return d;
};

const DEFAULTS = { enabled: true, reserveTokens: 16384 };

process.env.PI_CODING_AGENT_DIR = dir();
check('absent settings -> pi defaults', m.readCompactionSettings(), DEFAULTS);

// The regression itself: this returned enabled=true before the path fix.
process.env.PI_CODING_AGENT_DIR = withSettings({ compaction: { enabled: false } });
check('enabled=false honored', m.readCompactionSettings(), { enabled: false, reserveTokens: 16384 });

process.env.PI_CODING_AGENT_DIR = withSettings({ compaction: { reserveTokens: 8192 } });
check('reserveTokens honored', m.readCompactionSettings(), { enabled: true, reserveTokens: 8192 });

process.env.PI_CODING_AGENT_DIR = withSettings({ compaction: { enabled: false, reserveTokens: 32768 } });
check('both honored', m.readCompactionSettings(), { enabled: false, reserveTokens: 32768 });

process.env.PI_CODING_AGENT_DIR = withSettings({ packages: ['git:x'], theme: 'dark' });
check('no compaction block -> defaults', m.readCompactionSettings(), DEFAULTS);

{
  const d = dir();
  writeFileSync(join(d, 'settings.json'), '{not json');
  process.env.PI_CODING_AGENT_DIR = d;
}
check('malformed json -> fail open', m.readCompactionSettings(), DEFAULTS);

process.env.PI_CODING_AGENT_DIR = '~/.pi/agent';
check('tilde expanded', m.piSettingsPath(), join(process.env.HOME, '.pi/agent/settings.json'));

delete process.env.PI_CODING_AGENT_DIR;
check('default is pi getAgentDir(), not ~/.pi/settings.json',
  m.piSettingsPath(), join(process.env.HOME, '.pi', 'agent', 'settings.json'));

if (fail > 0) {
  console.error(\`\n\${fail} assertion(s) failed\`);
  process.exit(1);
}
console.log('\ncompaction settings: all assertions passed');
"
