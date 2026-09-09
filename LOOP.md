---
loop: 1
id: remove-loop-integrations-20260909
objective: Remove rl and missionctl renderer integrations while preserving unrelated output and Sox integration; prepare local commits and evidence for the rollout driver.
status: active
phase: PLAN
iteration: 1
iteration_budget: 6
updated_at: 2026-09-09T16:30:00Z
targets:
  spec: [REQ-SL-080, REQ-SL-096, REQ-SL-001, REQ-SL-015, REQ-SL-051, REQ-SL-057]
gates:
  - { id: build, run: zig build --summary all, green: Debug renderer builds, state: unknown }
  - { id: unit, run: zig build test --summary all, green: All retained unit tests pass, state: unknown }
  - { id: optimized, run: zig build -Doptimize=ReleaseFast --summary all, green: Optimized renderer builds, state: unknown }
  - { id: smoke, run: python3 test/renderer-smoke.py zig-out/bin/statusline, green: No provider calls and all preserved field and failure scenarios pass, state: unknown }
  - { id: contract-review, run: Fresh bounded contract specialist via native subagent, green: No unresolved P1 or P2 contract removal or preservation findings, state: unknown }
  - { id: bugbash, run: Fresh bounded renderer task exercise via native subagent, green: All charter tasks run with no P1 or P2 behavior findings, state: unknown }
units:
  - { id: U1, title: Inspect contracts and declare verifier and six-iteration plan, targets: [REQ-SL-080, REQ-SL-096], state: done }
  - { id: U2, title: Build baseline and observe provider non-invocation regression red, targets: [REQ-SL-080, REQ-SL-096], state: current }
  - { id: U3, title: Remove integrations and retire approved contracts with targeted green, targets: [REQ-SL-080, REQ-SL-096], state: pending }
  - { id: U4, title: Verify fixture preservation and required builds on candidate, targets: [REQ-SL-001, REQ-SL-015, REQ-SL-051, REQ-SL-057], state: pending }
  - { id: U5, title: Execute fresh bounded contract review and resolve findings, state: pending }
  - { id: U6, title: Execute fresh renderer bug bash and close local campaign with evidence, state: pending }
decisions:
  - { date: 2026-09-09, call: Operator approves outright removal of both provider integrations and contracts without toggles or replacements; native author session owns only this worktree and local commits., status: ratified }
blockers: []
boundary: [publish, push, PR, merge, tag, install, release, global-config, provider-repositories, shared-processes, rollout-order]
---

# Loop: remove provider statusline integrations

## State

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
