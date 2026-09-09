---
loop: 1
id: remove-loop-integrations-20260909
objective: Remove rl and missionctl renderer integrations while preserving unrelated output and Sox integration; prepare local commits and evidence for the rollout driver.
status: done
phase: BOUNDARY
iteration: 6
iteration_budget: 6
updated_at: 2026-09-09T16:44:08Z
targets:
  spec: [REQ-SL-100, REQ-SL-001, REQ-SL-015, REQ-SL-051, REQ-SL-057]
gates:
  - { id: build, run: zig build --summary all, green: Debug renderer builds, state: green }
  - { id: unit, run: zig build test --summary all, green: All retained unit tests pass, state: green }
  - { id: optimized, run: zig build -Doptimize=ReleaseFast --summary all, green: Optimized renderer builds, state: green }
  - { id: smoke, run: python3 test/renderer-smoke.py zig-out/bin/statusline, green: No provider calls and all preserved field and failure scenarios pass, state: green }
  - { id: contract-review, run: Fresh bounded contract specialist via native subagent, green: No unresolved P1 or P2 contract removal or preservation findings, state: green }
  - { id: bugbash, run: Fresh bounded renderer task exercise via native subagent, green: All charter tasks run with no P1 or P2 behavior findings, state: green }
units:
  - { id: U1, title: Inspect contracts and declare verifier and six-iteration plan, targets: [REQ-SL-080, REQ-SL-096], state: done }
  - { id: U2, title: Build baseline and observe provider non-invocation regression red, targets: [REQ-SL-080, REQ-SL-096], state: done }
  - { id: U3, title: Remove integrations and retire approved contracts with targeted green, targets: [REQ-SL-080, REQ-SL-096], state: done }
  - { id: U4, title: Verify fixture preservation and required builds on candidate, targets: [REQ-SL-001, REQ-SL-015, REQ-SL-051, REQ-SL-057], state: done }
  - { id: U5, title: Execute fresh bounded contract review and resolve findings, state: done }
  - { id: U6, title: Execute fresh renderer bug bash and close local campaign with evidence, state: done }
decisions:
  - { date: 2026-09-09, call: Operator approves outright removal of both provider integrations and contracts without toggles or replacements; native author session owns only this worktree and local commits., status: ratified }
blockers: []
boundary: [publish, push, PR, merge, tag, install, release, global-config, provider-repositories, shared-processes, rollout-order]
---

# Loop: remove provider statusline integrations

## State

- Iteration 6: fresh `/root/renderer_bugbash` terminal green, 6/6 tasks, 39 renders and 8 hook calls, no P1/P2 findings. `bugbash/bugbash.md` links exact commands, outputs, recorder controls, lifecycle snapshots and cleanup. All reviewed file and binary hashes match; only this terminal metadata/acceptance checkbox changes afterward. Source remains the deletion-only implementation. Private fixtures are removed. All six gates are green; local delivery is ready for missionctl closure and final identity binding.
- Two nonblocking, preserved P3 observations remain outside the removal scope: first unstaged Git change can display +1 because leading porcelain whitespace is trimmed, and REQ-SL-092 three-bucket wording is ambiguous when output_tokens is supplied. Candidate/base controls are byte-identical (`bugbash/commands/reproduction-git-{candidate,base}.json` and `reproduction-context-{candidate,base}.json`). No P1/P2 preservation failure or missing gate is deferred.

- Iteration 5: fresh native specialist `/root/contract_specialist` reports green, no P1/P2 findings, one initial pass; `contract-review.md` records reachability, complete contract retirement, ID integrity, preserved code/fixtures/Sox, and verifier fidelity. All candidate hashes match; builds/smoke were inspected rather than rerun by this participant. The independent task exercise is the remaining gate, chartered in `bugbash-charter.md` for six public CLI tasks on the unchanged ReleaseFast binary.

- Iteration 4: `release-build.log` passes ReleaseFast; `green-release-smoke.log` passes all documented fixtures and failure/lifecycle cases, zero trapped provider calls, and byte-for-byte baseline comparison. `versions.log` confirms unchanged 0.3.14 manifest alignment. `git diff BASE --numstat -- src/main.zig pi plugins test/*.json` shows only 0 additions / 335 deletions in the renderer; pi, plugin/hooks and fixture bytes are unchanged. Candidate identity is recorded in `candidate-identity.json`. Independent gates remain pending.

- Iteration 3: removed 335 Zig lines (two delegates, exclusive root/HEAD and pipe/output helpers, loop probe, three dedicated tests), obsolete smoke, and active/historical integration claims. Existing permission REQ-SL-060 had collided with a historical loop ID; only its loop use is retired. Debug build and 88/88 retained tests pass; `green-debug-smoke.log` records zero provider calls and byte-identical outputs against the base with providers absent. The new smoke is wired into the existing CI fixture step.

- Iteration 2: baseline Debug build green and 91/91 unit tests green (`base-build.log`, `base-unit.log`). `red-smoke.log` passes preservation scenarios then raises `Renderer invoked removed providers`, recording both rl and missionctl from root and nested cwd. Baseline renderer SHA256 `565d018dac5b90c0fb6499a68a3149db30482db2fa0796eed4304fd790313ca1`; source is unchanged from assigned base. Harness setup fixed before claiming red: explicit `sh` on isolated PATH, Git ceiling prevents parent-repo inheritance, malformed-state task recreates state after SessionStart clears it.

- Assigned branch `lane/remove-loop-integrations-20260909`; base `8090c9d6f0c6b920a6c1879396740c9d29201764`. Initial tree clean; Zig 0.16.0 available. No `.envrc` in this worktree.
- Evidence directory: `/Users/allen/.handoffs/statusline-assignments-20260909/agent-statusline/worker-evidence` (launcher-owned files are excluded).
- Reachability inspection: `getGitRoot`, `getGitHead`, both buffered-reader helpers, loop probe, and output validators have no callers outside the two removed integrations. Branch/status helpers remain live. Sox attention lives in the untouched pi adapter; no tracked Sox delegate wrapper exists in this checkout.
- Six substantive iterations are the budget: U1 contracts/QA; U2 baseline/red; U3 deletion/green; U4 full verification; U5 specialist; U6 assembled tasks/closure. Structural non-convergence stops early with evidence and a proposed path.

## Plan and QA design

| Risk or contract | Impact | Faithful evidence |
| --- | --- | --- |
| Removed providers still execute, including with artifacts present | Provider removals break rendering or retain hidden behavior | Public renderer with recording fake executables on an isolated PATH, real Git root plus nested cwd, `.rl/state.json`, `LOOP.md`, and optional mission artifact; assert zero invocations; observe red before deletion |
| Shared helper deletion loses unrelated output | Path/git, native goal, permission, model/context or activity regression | Retained Zig tests plus built fixture smoke with literal field assertions for Codex/Claude and absent/malformed inputs; compare base and candidate with providers absent |
| Approved public contract removal is incomplete | Documentation or implementation promises obsolete feature | Fresh specialist, one contract risk, blocking P1/P2, one initial round plus one targeted finding confirmation; objective gates precede review |
| Assembled CLI and hooks differ from unit behavior | Operator sees missing fields or broken activity lifecycle | Fresh task runner receives canonical bug-bash charter and built artifact only; six tasks, P1/P2 blocking, terminal green/findings/blocked/budget-exhausted |

- Files: remove integration-only code/tests from `src/main.zig`; delete `scripts/check-missionctl-smoke.sh`; amend `SPEC.md`, `BRIEF.md`, `README.md`, and `CLAUDE.md` (the `AGENTS.md` symlink resolves here); add reusable `test/renderer-smoke.py`. No fixture snapshots change.
- Risk class: approved public contract removal; bounded specialist required. Local read-only hot path loses up to four subprocesses plus one loop-file probe; output buffer remains 1 KiB; no new runtime resources or dependencies.
- First declare the smoke, build the base, prove the invocation recorder catches both providers, then remove code and run the same oracle green. Baseline build and unit output is retained. U4 runs Debug build, unit tests, ReleaseFast build, fixture smoke and base comparison. U5 runs after objective green. U6 runs on the unchanged optimized artifact after specialist completion.
- Independent participants may only write their named evidence files and private fixtures. No installs, shared daemon access, provider repo edits, or global configuration changes. No implementation delegation or shared rl runtime loop.

## Terminal contract

- `done`: six iterations completed, all declared gates green on the candidate identity, local conventional commits and self-contained evidence prepared; then close via `missionctl close`. This does not authorize rollout.
- `blocked`: missing required gate or external boundary, with observed failure and exact proposed driver action; retain committed LOOP.md.
- `budget-exhausted`: budget reached with required work incomplete, or three consecutive iterations without progress; retain committed LOOP.md and evidence.
- `superseded`: operator explicitly replaces the campaign; close only with proper dispositions.
- Driver next action after local success: review/cherry-pick the local commits and install this renderer before installing either provider command removal. Driver owns all integration/release boundaries.
