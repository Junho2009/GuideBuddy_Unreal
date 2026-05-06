export {};

type JsonRecord = Record<string, unknown>;

interface TelemetrySignalLike {
  signal_type: string;
  payload: JsonRecord;
}

interface SoulslikeControlsOptions {
  moveDeadZone: number;
  lateralPriorityRatio: number;
  actionPrimeWindowSeconds: number;
  lockFacingEnabled: boolean;
  manageDodgeInput: boolean;
  manageAttackInput: boolean;
  manageTargetInput: boolean;
}

const defaultOptions: SoulslikeControlsOptions = {
  moveDeadZone: 0.2,
  lateralPriorityRatio: 0.65,
  actionPrimeWindowSeconds: 0.28,
  lockFacingEnabled: true,
  manageDodgeInput: true,
  manageAttackInput: true,
  manageTargetInput: true
};

export interface SoulslikeControls {
  handleTelemetrySignal(signal: TelemetrySignalLike): void;
  getLastSnapshot(): JsonRecord;
}

export function createSoulslikeControls(
  combatControlBridge: CombatControlBridge | undefined,
  options: Partial<SoulslikeControlsOptions> = {}
): SoulslikeControls {
  const resolvedOptions: SoulslikeControlsOptions = {
    ...defaultOptions,
    ...options
  };
  let lastSnapshot: JsonRecord = {};

  if (combatControlBridge) {
    combatControlBridge.ConfigureSoulslikeControls(
      resolvedOptions.moveDeadZone,
      resolvedOptions.lateralPriorityRatio,
      resolvedOptions.actionPrimeWindowSeconds,
      resolvedOptions.lockFacingEnabled,
      resolvedOptions.manageDodgeInput,
      resolvedOptions.manageAttackInput,
      resolvedOptions.manageTargetInput
    );
    combatControlBridge.SetSoulslikeControlsEnabled(true);
    lastSnapshot = parseSnapshot(combatControlBridge.GetCombatControlSnapshotJson());
    console.log("[GuideBuddy] Soulslike controls enabled.");
  } else {
    console.warn("[GuideBuddy] CombatControlBridge is unavailable; soulslike controls are disabled.");
  }

  return {
    handleTelemetrySignal(signal: TelemetrySignalLike): void {
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
    getLastSnapshot(): JsonRecord {
      return lastSnapshot;
    }
  };
}

function isManagedInput(inputName: string): boolean {
  return inputName === "Dodge_Input" || inputName === "Attack_Input" || inputName === "Target_Input";
}

function parseSnapshot(snapshotJson: string): JsonRecord {
  if (!snapshotJson) {
    return {};
  }

  try {
    return JSON.parse(snapshotJson) as JsonRecord;
  } catch (error) {
    return {
      parse_error: error instanceof Error ? error.message : String(error),
      raw: snapshotJson
    };
  }
}
