"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSoulslikeControls = void 0;
const defaultOptions = {
    moveDeadZone: 0.2,
    lateralPriorityRatio: 0.65,
    actionPrimeWindowSeconds: 0.28,
    lockFacingEnabled: true,
    manageDodgeInput: true,
    manageAttackInput: true,
    manageTargetInput: true
};
function createSoulslikeControls(combatControlBridge, options = {}) {
    const resolvedOptions = {
        ...defaultOptions,
        ...options
    };
    let lastSnapshot = {};
    if (combatControlBridge) {
        combatControlBridge.ConfigureSoulslikeControls(resolvedOptions.moveDeadZone, resolvedOptions.lateralPriorityRatio, resolvedOptions.actionPrimeWindowSeconds, resolvedOptions.lockFacingEnabled, resolvedOptions.manageDodgeInput, resolvedOptions.manageAttackInput, resolvedOptions.manageTargetInput);
        combatControlBridge.SetSoulslikeControlsEnabled(true);
        lastSnapshot = parseSnapshot(combatControlBridge.GetCombatControlSnapshotJson());
        console.log("[GuideBuddy] Soulslike controls enabled.");
    }
    else {
        console.warn("[GuideBuddy] CombatControlBridge is unavailable; soulslike controls are disabled.");
    }
    return {
        handleTelemetrySignal(signal) {
            if (!combatControlBridge || signal.signal_type !== "player_input") {
                return;
            }
            const payload = signal.payload || {};
            const inputName = String(payload.input_name || "");
            const triggerEvent = String(payload.trigger_event || "");
            const watchListTag = String(payload.watchlist_tag || "");
            if (!isManagedInput(inputName)) {
                return;
            }
            lastSnapshot = parseSnapshot(combatControlBridge.HandlePlayerInput(inputName, triggerEvent, watchListTag));
        },
        getLastSnapshot() {
            return lastSnapshot;
        }
    };
}
exports.createSoulslikeControls = createSoulslikeControls;
function isManagedInput(inputName) {
    return inputName === "Dodge_Input" || inputName === "Attack_Input" || inputName === "Target_Input";
}
function parseSnapshot(snapshotJson) {
    if (!snapshotJson) {
        return {};
    }
    try {
        return JSON.parse(snapshotJson);
    }
    catch (error) {
        return {
            parse_error: error instanceof Error ? error.message : String(error),
            raw: snapshotJson
        };
    }
}
