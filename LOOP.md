---
loop: 1
id: loop-only-gate
objective: Gate the delegated missionctl segment on a root LOOP.md alone, so a campaign without a mission file renders and invalid or legacy loops degrade visibly instead of disappearing.
status: done
phase: BOUNDARY
iteration: 1
iteration_budget: 4
updated_at: 2026-08-29T16:05:00Z
mission:
  id: mission-control-arc
  source:
    repository: https://github.com/alleneubank/missionctl.git
    ref: feat/typed-mission-control
    path: .mission/mission.yaml
targets:
  spec: [REQ-SL-096, REQ-SL-097, REQ-SL-098]
  mission: [CONSUMERS-001]
gates:
  - id: unit
    run: zig build test
    green: every unit test passes
    state: green
  - id: smoke
    run: MISSIONCTL_BIN=<missionctl dist> ./scripts/check-missionctl-smoke.sh <loop root>
    green: rendered line ends with the canonical missionctl projection for a LOOP.md-only root and for a legacy root
    state: green
units:
  - id: U1
    title: loopArtifactPresent probes LOOP.md only; smoke fixture, SPEC, BRIEF, README follow
    targets: [REQ-SL-096, REQ-SL-097]
    state: done
  - id: U2
    title: Smoke compares the statusline against the same missionctl binary it resolves on PATH
    targets: [REQ-SL-098]
    state: done
decisions:
  - date: 2026-08-29
    call: The smoke script prepends the MISSIONCTL_BIN directory to PATH for the statusline run, because the renderer resolves missionctl from PATH and a mismatched binary produced a false red.
    status: provisional
blockers: []
boundary:
  - publish
  - merge-tracked-ref
---

# Loop: LOOP.md-only gate — `feat/typed-mission-statusline`

## State

- Observed red: new smoke script against the 2026-08-28 binary and `tests/fixtures/standalone` (LOOP.md only) — segment absent. Green after rebuild: `active TDD · unit U2 · gates 1 red · 3/8`; legacy fixture renders `loop legacy-untyped · missionctl inspect`.
- The fleet `missionctl` shim resolves no version here; gates ran with the missionctl `9443b08` dist build on PATH.
