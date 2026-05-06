# MVP05_DRILL_ARENA_RUNTIME run-003 evidence

- Baseline: `MVP05_DRILL_ARENA_RUNTIME@v0.1`
- Status: `verifier_passed`
- Run record: `aiflow/contracts/runs/MVP05_DRILL_ARENA_RUNTIME.run-003.yaml`

## Input Mode Fix

The main-scene entry UI now uses a packaged-safe input pattern:

- Default: gameplay mouse capture, cursor hidden, camera control normal.
- Hold Alt: temporary UI pointer mode for clicking GuideBuddy overlay buttons.
- Release Alt: restore gameplay mouse capture.
- Full dialogs, such as training complete, still intentionally take UI focus until the player clicks the return button.

## Automated Checks

- TypeScript build: pass (`npm run build:guidebuddy`)
- Diff check: pass (`git diff --check`)
- Editor target build: pass (`TCF_SampleEditor Win64 Development`)
- Windows non-editor target build: pass (`TCF_Sample Win64 Development`)

## Remaining Human Smoke

- PIE or packaged run should confirm camera rotation remains normal in gameplay mode.
- Holding Alt should show the cursor and allow clicking `进入训练场`.
- Training completion dialog should allow clicking `返回正式场景`, then restore gameplay input.
