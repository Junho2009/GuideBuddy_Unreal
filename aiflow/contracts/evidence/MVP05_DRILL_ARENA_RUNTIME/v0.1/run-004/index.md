# MVP05_DRILL_ARENA_RUNTIME run-004 evidence

- Baseline: `MVP05_DRILL_ARENA_RUNTIME@v0.1`
- Status: `verifier_passed`
- Run record: `aiflow/contracts/runs/MVP05_DRILL_ARENA_RUNTIME.run-004.yaml`

## PIE Exit Blueprint Error Fix

The training loop no longer periodically forces the nearest enemy into `State.Attack`.
Training now observes enemy Ability/State activation instead of directly driving the enemy combat Blueprint path.

Expected effect:

- Exiting PIE should no longer trigger enemy attack `CanPerformAbility` checks from the GuideBuddy training timer during world cleanup.
- Existing enemy AI remains responsible for attack cadence in the copied training map.

## Ordinary Attack Counting Fix

The dodge training classifier now builds its signal from:

- GameplayTag
- active Ability or State object name
- active Ability or State class name

This covers ordinary close-range attack assets whose gameplay tag is missing or too generic, including `BP_GS_EnemyCloseRangeAttackAbility`, while preserving the previous jump-slash-like attack counting path.

## Automated Checks

- TypeScript build: pass (`npm run build:guidebuddy`)
- Diff check: pass (`git diff --check`)
- Editor target build: pass (`TCF_SampleEditor Win64 Development`)
- Windows non-editor target build: pass (`TCF_Sample Win64 Development`)

## Remaining Human Smoke

- PIE run and exit should confirm the reported Blueprint runtime errors are gone.
- Dodging ordinary enemy close-range attacks should increment the consecutive success counter.
- Packaged run should still confirm normal mouse camera control and Alt-held UI clicking.
