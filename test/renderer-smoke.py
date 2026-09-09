#!/usr/bin/env python3
"""Exercise the built renderer with isolated Git, provider traps, and hook state.

Requires Python 3 and Git for verification only. The renderer has no new runtime
dependency. An optional baseline binary checks byte-for-byte field preservation
with the removed providers absent.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


REPO = Path(__file__).resolve().parents[1]
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def run(argv: list[str], cwd: Path, env: dict[str, str], data: str = "") -> str:
    result = subprocess.run(
        argv, input=data, text=True, capture_output=True, cwd=cwd, env=env,
        timeout=10, check=False,
    )
    if result.returncode != 0 or result.stderr:
        raise AssertionError(f"{argv}: exit={result.returncode}, stderr={result.stderr!r}")
    return result.stdout


def require_tokens(name: str, output: str, tokens: tuple[str, ...]) -> None:
    plain = ANSI.sub("", output)
    for token in tokens:
        if token not in plain:
            raise AssertionError(f"{name}: missing {token!r} in {plain!r}")
    print(f"PASS {name}: {plain.rstrip()}")


def exercise(binary: Path, baseline: Path | None, root: Path) -> None:
    git = shutil.which("git")
    if git is None:
        raise RuntimeError("Git is required for the renderer smoke")
    bin_dir = root / "bin"
    bin_dir.mkdir()
    (bin_dir / "git").symlink_to(Path(git).resolve())
    (bin_dir / "sh").symlink_to("/bin/sh")
    workspace = root / "workspace"
    workspace.mkdir()
    state = root / "activity"
    env = {
        "PATH": str(bin_dir), "HOME": str(root), "LC_ALL": "C", "TZ": "UTC",
        "STATUSLINE_STATE_DIR": str(state), "ZMX_SESSION": "smoke-session",
        "STATUSLINE_DEBUG_LOG": str(root / "debug.log"),
        "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CEILING_DIRECTORIES": str(root.parent),
    }
    run([git, "init", "-q", "-b", "topic"], workspace, env)
    for name in ("modified", "deleted"):
        (workspace / name).write_text("base\n")
    run([git, "add", "modified", "deleted"], workspace, env)
    run([git, "-c", "user.name=Smoke", "-c", "user.email=smoke@example.invalid",
         "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"], workspace, env)
    (workspace / "modified").write_text("changed\n")
    (workspace / "deleted").unlink()
    (workspace / "added").write_text("added\n")
    run([git, "add", "added"], workspace, env)
    (workspace / "untracked").write_text("untracked\n")
    (workspace / ".git" / "info" / "exclude").write_text(".rl/\n.mission/\nLOOP.md\n")
    (workspace / ".rl").mkdir()
    (workspace / ".rl" / "state.json").write_text('{"active":true,"iteration":2}')
    (workspace / "LOOP.md").write_text("---\nloop: 1\nstatus: active\n---\n")
    (workspace / ".mission").mkdir()
    (workspace / ".mission" / "mission.yaml").write_text("mission: 1\nid: smoke\n")
    nested = workspace / "nested"
    nested.mkdir()

    def render(payload: dict | str, *, render_env: dict[str, str] | None = None) -> str:
        data = payload if isinstance(payload, str) else json.dumps(payload)
        selected_env = env if render_env is None else render_env
        output = run([str(binary), "--debug"], root, selected_env, data)
        if not output.endswith("\n") or output.count("\n") != 1:
            raise AssertionError(f"Expected one terminal line: {output!r}")
        if baseline is not None:
            previous = run([str(baseline), "--debug"], root, selected_env, data)
            if output != previous:
                raise AssertionError(f"Preservation failed: base={previous!r}, candidate={output!r}")
        return output

    # Compare unchanged fields before placing traps on PATH; the baseline is
    # intentionally allowed to lack the removed provider commands here.
    fixture_tokens = {
        "codex.json": ("☀️", "🟠", "🚀", "26.0%", "🛡ask/work", "<1m"),
        "codex-goal.json": ("🌍", "🔵", "🎯12.5k/50k"),
        "opus.json": ("🎭", "🟡"),
        "sonnet.json": ("📜",),
        "pi.json": ("🐳", "(auto)"),
        "kimi.json": ("🌑", "25.0%", "🛡auto"),
        "grok.json": ("🌌",),
        "minimal.json": (),
    }
    fixtures = sorted((REPO / "test").glob("*.json"))
    if {path.name for path in fixtures} != set(fixture_tokens):
        raise AssertionError("Every documented fixture needs explicit smoke expectations")
    for fixture in fixtures:
        payload = json.loads(fixture.read_text())
        if "maxContextTokens" in payload:
            payload["cwd"] = str(workspace)
        else:
            payload["workspace"] = {"current_dir": str(workspace)}
        payload["transcript_path"] = str(root / "absent-transcript")
        output = render(payload)
        require_tokens(fixture.name, output, fixture_tokens[fixture.name] +
                       ("/smoke-session@", "workspace", "[topic", "+1", "~1", "-1", "?1"))

    claude = json.loads((REPO / "test" / "opus.json").read_text())
    claude.update({
        "workspace": {"current_dir": str(nested)},
        "transcript_path": str(root / "absent-transcript"),
        "permission_mode": "plan",
        "context_window": {"context_window_size": 200000, "used_percentage": 1,
                           "current_usage": {"input_tokens": 40000,
                                             "cache_creation_input_tokens": 10000,
                                             "cache_read_input_tokens": 10000}},
        "cost": {"total_cost_usd": 1.25, "total_duration_ms": 120000,
                 "total_lines_added": 17, "total_lines_removed": 3},
        "future_unknown_field": {"ignored": True},
    })
    require_tokens("Claude exact context/cost/lines", render(claude),
                   ("nested", "[topic", "35.9%", "🎭", "🟡", "🛡plan", "2m", "$1.3", "+17", "-3"))
    codex = json.loads((REPO / "test" / "codex.json").read_text())
    codex["workspace"] = {"current_dir": str(workspace)}
    codex["permissions"] = {"mode": "auto", "next_turn": {"mode": "full-access"}}
    require_tokens("Codex queued permissions", render(codex), ("🛡auto→full next", "26.0%"))

    for name, payload in (("empty", {}), ("null fields", {"model": None, "goal": None}),
                          ("invalid JSON", "{"), ("wrong field type", {"model": 7})):
        output = render(payload)
        require_tokens(name, output, ("~",))
        if any(token in output for token in ("🎯", "🛡", "💬", "💤")):
            raise AssertionError(f"{name}: absent fields leaked a segment: {output!r}")
    no_git = render({"workspace": {"current_dir": str(root)}})
    require_tokens("no Git", no_git, ("/smoke-session@",))
    if "[" in ANSI.sub("", no_git):
        raise AssertionError(f"Non-repository inherited a Git segment: {no_git!r}")
    inactive = {"goal": {"status": "complete", "tokens_used": 99}}
    if "🎯" in render(inactive):
        raise AssertionError("Completed goal remained visible")
    print("PASS inactive native goal hidden")

    for event, marker in (("SessionStart", None), ("UserPromptSubmit", "💬"),
                          ("Stop", "💤"), ("SessionStart", None)):
        hook = json.dumps({"session_id": "smoke-activity", "hook_event_name": event})
        if run([str(binary), "activity-hook", event], root, env, hook) != "{}\n":
            raise AssertionError(f"Hook {event} did not acknowledge with empty JSON")
        output = render({"session_id": "smoke-activity"})
        if marker is None:
            if "💬" in output or "💤" in output:
                raise AssertionError(f"{event}: stale activity: {output!r}")
        else:
            require_tokens(event, output, (marker,))
        print(f"PASS activity lifecycle {event}")
    run([str(binary), "activity-hook", "UserPromptSubmit"], root, env,
        json.dumps({"session_id": "smoke-activity"}))
    activity_files = list(state.glob("*"))
    if not activity_files:
        raise AssertionError("Hook did not create private activity state")
    for path in activity_files:
        path.write_text("malformed")
    output = render({"session_id": "smoke-activity"})
    if "💬" in output or "💤" in output:
        raise AssertionError("Malformed activity was not hidden")
    print("PASS malformed activity hidden")

    # These are invocation traps, not simulations of either provider contract.
    # Even a provider exiting unsuccessfully must never be reached.
    calls = root / "provider-calls"
    trap_env = dict(env, PROVIDER_CALLS=str(calls))
    for provider in ("rl", "missionctl"):
        path = bin_dir / provider
        path.write_text('#!/bin/sh\nprintf "%s\\n" "$0 $*" >> "$PROVIDER_CALLS"\nexit 23\n')
        path.chmod(0o755)
    for directory in (workspace, nested):
        data = json.dumps({"workspace": {"current_dir": str(directory)},
                           "model": {"display_name": "Opus"}})
        output = run([str(binary)], root, trap_env, data)
        require_tokens(f"provider traps from {directory.name}", output, ("🎭", "[topic"))
    if calls.exists():
        raise AssertionError(f"Renderer invoked removed providers:\n{calls.read_text()}")
    print("PASS zero rl/missionctl invocations with artifacts and executables present")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", type=Path)
    parser.add_argument("--baseline", type=Path)
    args = parser.parse_args()
    binary = args.binary.resolve(strict=True)
    baseline = args.baseline.resolve(strict=True) if args.baseline else None
    print(f"artifact={binary} sha256={hashlib.sha256(binary.read_bytes()).hexdigest()}")
    if baseline is not None:
        print(f"baseline={baseline} sha256={hashlib.sha256(baseline.read_bytes()).hexdigest()}")
    cache = REPO / ".zig-cache"
    cache.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="renderer-smoke-", dir=cache) as directory:
        exercise(binary, baseline, Path(directory))
    print("Renderer smoke: green")


if __name__ == "__main__":
    main()
